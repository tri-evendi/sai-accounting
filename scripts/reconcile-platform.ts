/**
 * REKONSILIASI platform ↔ kendali (issue #137) — KERANGKA.
 *
 *   npm run reconcile:platform
 *
 * ══ KENAPA PEKERJAAN INI ADA ═══════════════════════════════════════════════
 * FK dan transaksi tidak menyeberangi basis data (docs/MULTI-TENANT.md §4A).
 * Konsistensi platform↔kendali karena itu ditegakkan URUTAN TULIS:
 *
 *     Tulis di `sai_platform` DULU, baru tandai di `sai_control`.
 *
 * Urutan itu memilih arah kegagalannya: crash di tengah meninggalkan catatan
 * platform tanpa jejak di kendali (yatim yang BISA ditemukan), tidak pernah
 * tenant yang naik kelas tanpa pembayaran (drift yang tanpa pemeriksaan ini
 * tidak akan pernah ketahuan). Skrip inilah pemeriksanya — ia MEMBACA kedua
 * sisi dan MELAPORKAN selisih; ia tidak memperbaiki apa pun sendiri, sebab
 * setiap perbaikan penagihan adalah keputusan uang yang harus diambil orang.
 *
 * ══ STATUS: KERANGKA ═══════════════════════════════════════════════════════
 * Penjadwal yang menjalankannya berkala datang di issue #140; sampai itu ada,
 * skrip ini dijalankan manual/cron. Pemeriksaan yang menunggu tabel/keputusan
 * issue lain ditandai TODO dengan nomor issuenya dan DILEWATI dengan jelas —
 * bukan pura-pura hijau.
 *
 * Exit code: 0 = tidak ada selisih (atau pemeriksaan dilewati dengan alasan
 * yang tercetak), 1 = ADA selisih yang menuntut tindakan orang.
 */

import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

function clientFor<T>(
  Ctor: new (args: { adapter: PrismaMariaDb }) => T,
  rawUrl: string
): T {
  const url = new URL(rawUrl);
  return new Ctor({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
    }),
  });
}

type Finding = { check: string; detail: string };

async function main() {
  const platformUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();

  if (!platformUrl) {
    console.warn(
      "⚠ PLATFORM_DATABASE_URL belum diset — pemasangan ini berjalan tanpa " +
        "penagihan, tidak ada yang direkonsiliasi. Selesai."
    );
    process.exit(0);
  }
  if (!controlUrl) {
    console.error("✗ CONTROL_DATABASE_URL belum diset — tidak tahu sisi kendalinya.");
    process.exit(1);
  }

  const platform = clientFor(PlatformClient, platformUrl);
  const control = clientFor(ControlClient, controlUrl);

  const findings: Finding[] = [];
  const skipped: string[] = [];

  // ── Sisi kendali: tabel `tenants` datang dari issue #134. Sebelum ia ada,
  //    pemeriksaan lintas-sisi dilewati DENGAN PENGUMUMAN — lewat raw SQL,
  //    sebab klien kendali yang di-generate belum tentu memuat modelnya.
  let tenants: Array<{ id: number; status: string }> | null = null;
  try {
    tenants = await control.$queryRaw<Array<{ id: number; status: string }>>`
      SELECT id, status FROM tenants`;
  } catch {
    skipped.push(
      "tabel `tenants` belum ada di basis data kendali (issue #134 belum " +
        "diterapkan) — pemeriksaan lintas-sisi dilewati"
    );
  }

  const subscriptions = await platform.subscription.findMany({
    select: { id: true, tenantId: true, status: true },
  });

  if (tenants !== null) {
    const tenantById = new Map(tenants.map((t) => [t.id, t]));
    const subsByTenant = new Map<number, (typeof subscriptions)[number][]>();
    for (const sub of subscriptions) {
      const list = subsByTenant.get(sub.tenantId) ?? [];
      list.push(sub);
      subsByTenant.set(sub.tenantId, list);
    }

    // 1. Langganan yatim: catatan platform yang tenantnya tidak ada di
    //    kendali. Inilah sisa yang DIRANCANG mungkin terjadi (tulis platform
    //    dulu, crash sebelum kendali) — temuan di sini normal dan bisa
    //    ditindaklanjuti: ulangi sisi kendalinya, atau batalkan langganannya.
    for (const sub of subscriptions) {
      if (!tenantById.has(sub.tenantId)) {
        findings.push({
          check: "langganan-yatim",
          detail: `subscription #${sub.id} menunjuk tenant #${sub.tenantId} yang tidak ada di kendali`,
        });
      }
    }

    // 2. Arah yang TIDAK BOLEH terjadi: tenant yang statusnya berbayar di
    //    kendali tanpa satu pun langganan di platform. Urutan tulis yang
    //    ditaati tidak akan pernah menghasilkan ini — kemunculannya berarti
    //    ada kode yang menulis kendali lebih dulu, dan itu bug yang harus
    //    dicari, bukan sekadar baris yang harus dibetulkan.
    const PAID_TENANT_STATUSES = new Set(["trialing", "active", "past_due", "suspended"]);
    for (const tenant of tenants) {
      if (PAID_TENANT_STATUSES.has(tenant.status) && !subsByTenant.has(tenant.id)) {
        findings.push({
          check: "tenant-tanpa-langganan",
          detail:
            `tenant #${tenant.id} berstatus \`${tenant.status}\` di kendali tanpa ` +
            "langganan apa pun di platform — arah drift yang seharusnya mustahil",
        });
      }
    }

    // 3. TODO(#140): kecocokan STATUS tenant ↔ langganan aktifnya (mis. tenant
    //    `active` yang langganannya `past_due`). Pemetaan sahnya milik mesin
    //    siklus hidup #140 — memeriksanya sekarang berarti menebak aturannya.
    skipped.push("kecocokan status tenant ↔ langganan — menunggu mesin siklus hidup #140");
  }

  // 4. TODO(#140): `usage_counters` vs jumlah sesungguhnya (registry perusahaan
  //    per tenant, keanggotaan per tenant) — menunggu kolom `tenant_id` di
  //    registry kendali (#134) dan pekerjaan sinkronisasi #140.
  skipped.push("usage_counters vs jumlah sesungguhnya — menunggu #134/#140");

  await platform.$disconnect();
  await control.$disconnect();

  console.log(`Rekonsiliasi platform ↔ kendali — ${subscriptions.length} langganan diperiksa.`);
  for (const item of skipped) console.log(`  ⏭  dilewati: ${item}`);
  if (findings.length === 0) {
    console.log("✓ Tidak ada selisih pada pemeriksaan yang berjalan.");
    process.exit(0);
  }
  console.error(`✗ ${findings.length} selisih ditemukan:`);
  for (const f of findings) console.error(`  [${f.check}] ${f.detail}`);
  process.exit(1);
}

main().catch((error) => {
  console.error("Rekonsiliasi gagal berjalan:", error);
  process.exit(1);
});
