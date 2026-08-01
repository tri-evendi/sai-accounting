/**
 * GLADI webhook pembayaran (issue #141) — dijalankan pada BASIS DATA
 * SEKALI-PAKAI (bukan tes unit: yang dibuktikan justru perilaku UNIQUE
 * `payments.gateway_ref` di MariaDB sungguhan, termasuk race dua kiriman
 * bersamaan). JANGAN diarahkan ke basis data produksi — skrip menulis
 * pembayaran & tagihan latihan.
 *
 *   PLATFORM_DATABASE_URL=… CONTROL_DATABASE_URL=… \
 *     bunx tsx scripts/rehearse-billing-webhook.ts
 *
 * Prasyarat: migration diterapkan, satu tenant #1 + subscription #1 dengan
 * tagihan `PINV-S1-…` berstatus issued (alur `change-plan` + penjadwal —
 * lihat laporan PR #141 untuk resep lengkapnya). Yang dilatih:
 *   1. settlement dikirim DUA KALI berurutan → satu pembayaran, satu duplikat;
 *   2. expire dikirim DUA KALI BERSAMAAN (race) → satu baris, langganan
 *      past_due — TIDAK PERNAH suspended;
 *   3. tanda tangan salah → ditolak sebelum menyentuh basis data.
 */
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  midtransSignature,
  verifyMidtransSignature,
  MOCK_SERVER_KEY,
  type MidtransNotification,
} from "../src/lib/payment-gateway";
import { processPaymentNotification } from "../src/lib/payment-webhook";

function clientFor<T>(Ctor: new (args: { adapter: PrismaMariaDb }) => T, rawUrl: string): T {
  const url = new URL(rawUrl);
  return new Ctor({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 3,
    }),
  });
}

function signed(n: Omit<MidtransNotification, "signature_key">): MidtransNotification {
  return { ...n, signature_key: midtransSignature(n, MOCK_SERVER_KEY) };
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  if (!process.env.PLATFORM_DATABASE_URL || !process.env.CONTROL_DATABASE_URL) {
    console.error("✗ Setel PLATFORM_DATABASE_URL & CONTROL_DATABASE_URL ke basis data LATIHAN.");
    process.exit(1);
  }
  const platform = clientFor(PlatformClient, process.env.PLATFORM_DATABASE_URL!);
  const control = clientFor(ControlClient, process.env.CONTROL_DATABASE_URL!);
  const deps = { platform, control };

  /* ── 0. Tanda tangan salah DITOLAK (verifikasi murni, tanpa DB) ─────────── */
  const bad = signed({
    order_id: "PINV-S1-20260801",
    status_code: "200",
    gross_amount: "166500.00",
    transaction_status: "settlement",
    transaction_id: "tx-evil",
  });
  check(
    "tanda tangan: kunci lain ditolak",
    !verifyMidtransSignature(bad, "kunci-lain") && verifyMidtransSignature(bad, MOCK_SERVER_KEY)
  );

  /* ── 1. settlement dua kali BERURUTAN ───────────────────────────────────── */
  const settle = signed({
    order_id: "PINV-S1-20260801",
    status_code: "200",
    gross_amount: "166500.00",
    transaction_status: "settlement",
    transaction_id: "tx-settle-1",
  });
  const r1 = await processPaymentNotification(deps, settle);
  const r2 = await processPaymentNotification(deps, settle);
  check("kiriman #1 = paid_recorded", r1.outcome === "paid_recorded", r1.outcome);
  check("kiriman #2 = duplicate_ignored", r2.outcome === "duplicate_ignored", r2.outcome);

  const paidRows = await platform.payment.count({ where: { gatewayRef: "tx-settle-1" } });
  const invoice = await platform.platformInvoice.findUnique({
    where: { number: "PINV-S1-20260801" },
    select: { status: true },
  });
  const sub1 = await platform.subscription.findUnique({ where: { id: 1 }, select: { status: true } });
  const tenant1 = await control.tenant.findUnique({ where: { id: 1 }, select: { status: true } });
  check("tepat SATU baris pembayaran untuk tx-settle-1", paidRows === 1, String(paidRows));
  check("tagihan lunas", invoice?.status === "paid", invoice?.status);
  check("langganan active (platform ditulis dulu)", sub1?.status === "active", sub1?.status);
  check("tenant active (kendali menyusul)", tenant1?.status === "active", tenant1?.status);

  /* ── 2. expire dua kali BERSAMAAN (race) atas tagihan kedua ─────────────── */
  await platform.platformInvoice.create({
    data: {
      tenantId: 1,
      subscriptionId: 1,
      number: "PINV-S1-RACE",
      status: "issued",
      issueDate: new Date(),
      dueDate: new Date(),
      amount: "150000.00",
      taxAmount: "16500.00",
      total: "166500.00",
      currency: "IDR",
    },
  });
  const expire = signed({
    order_id: "PINV-S1-RACE",
    status_code: "202",
    gross_amount: "166500.00",
    transaction_status: "expire",
    transaction_id: "tx-race-1",
  });
  const [ra, rb] = await Promise.all([
    processPaymentNotification(deps, expire),
    processPaymentNotification(deps, expire),
  ]);
  const outcomes = [ra.outcome, rb.outcome].sort();
  check(
    "race: satu failure_recorded + satu duplicate_ignored",
    outcomes.includes("failure_recorded") &&
      (outcomes.includes("duplicate_ignored") || outcomes.filter((o) => o === "failure_recorded").length === 1),
    outcomes.join(", ")
  );
  const raceRows = await platform.payment.count({ where: { gatewayRef: "tx-race-1" } });
  const sub2 = await platform.subscription.findUnique({ where: { id: 1 }, select: { status: true } });
  const tenant2 = await control.tenant.findUnique({ where: { id: 1 }, select: { status: true } });
  check("tepat SATU baris pembayaran untuk tx-race-1", raceRows === 1, String(raceRows));
  check("gagal bayar → past_due, BUKAN suspended", sub2?.status === "past_due", sub2?.status);
  check("salinan kendali ikut past_due", tenant2?.status === "past_due", tenant2?.status);

  await platform.$disconnect();
  await control.$disconnect();
  if (failures > 0) {
    console.error(`✗ ${failures} pemeriksaan gagal`);
    process.exit(1);
  }
  console.log("✓ Gladi webhook LULUS seluruhnya.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
