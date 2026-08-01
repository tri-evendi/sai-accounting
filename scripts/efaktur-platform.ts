/**
 * Ekspor e-Faktur untuk TAGIHAN PLATFORM (issue #141) — faktur keluaran KAMI
 * atas langganan pelanggan, memakai mesin yang SAMA dengan modul pajak
 * pelanggan (`src/lib/efaktur.ts` — murni, jadi bisa diimpor tsx): klasifikasi
 * lokal, validasi NPWP wajib, kolom & CSV satu sumber. Ironi §10 ditunaikan:
 * mesin e-Faktur yang kita bangun untuk pelanggan kini menagihkan kita.
 *
 *   npm run efaktur:platform -- --from 2026-08-01 --to 2026-08-31 [--out f.csv]
 *
 * Identitas PENJUAL dari env (PLATFORM_SELLER_NPWP / PLATFORM_SELLER_NAME) —
 * identitas bisnis KAMI, bukan CompanySetting milik buku pelanggan mana pun.
 * Identitas PEMBELI dari `tenant_billing_profiles` (NPWP diisi pelanggan di
 * /tenant). Tagihan tanpa NPWP pembeli dilaporkan sebagai MASALAH oleh
 * `buildEfaktur` — tidak pernah dikeluarkan kosong.
 *
 * Yang diekspor: tagihan LUNAS (status `paid`) pada periode itu — faktur atas
 * pembayaran yang benar-benar terjadi. `void` tidak pernah; `issued` belum.
 *
 * ⚠ Kewajiban PPN/e-Faktur atas langganan SaaS + skema impor DJP terkini harus
 * dikonfirmasi penasihat pajak SEBELUM CSV ini difailkan (catatan kejujuran
 * format ada di kepala `src/lib/efaktur.ts`). Skrip ini mekanismenya.
 */

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildEfaktur, efakturToCsv, type EfakturInvoiceInput } from "../src/lib/efaktur";

function clientFor<T>(Ctor: new (args: { adapter: PrismaMariaDb }) => T, rawUrl: string): T {
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

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main() {
  const platformUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();
  if (!platformUrl || !controlUrl) {
    console.error("✗ PLATFORM_DATABASE_URL dan CONTROL_DATABASE_URL wajib diset.");
    process.exit(1);
  }

  const from = argValue("--from");
  const to = argValue("--to");
  const out = argValue("--out");

  const seller = {
    npwp: process.env.PLATFORM_SELLER_NPWP ?? null,
    name: process.env.PLATFORM_SELLER_NAME ?? null,
  };

  const platform = clientFor(PlatformClient, platformUrl);
  const control = clientFor(ControlClient, controlUrl);

  const invoices = await platform.platformInvoice.findMany({
    where: {
      status: "paid",
      ...(from ? { issueDate: { gte: new Date(from) } } : {}),
    },
    orderBy: { id: "asc" },
    select: {
      number: true,
      issueDate: true,
      amount: true,
      taxAmount: true,
      total: true,
      currency: true,
      tenantId: true,
    },
  });

  const profiles = await platform.tenantBillingProfile.findMany({
    select: { tenantId: true, npwp: true, name: true, address: true },
  });
  const profileByTenant = new Map(profiles.map((p) => [p.tenantId, p]));
  const tenants = await control.tenant.findMany({ select: { id: true, name: true } });
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const inputs: EfakturInvoiceInput[] = invoices.map((inv) => {
    const profile = profileByTenant.get(inv.tenantId);
    const dpp = Number(inv.amount);
    const taxAmount = Number(inv.taxAmount);
    return {
      invoiceNo: inv.number,
      date: inv.issueDate,
      currency: inv.currency, // IDR ⇒ lokal (faktur keluaran)
      rate: 1,
      dpp,
      taxAmount,
      /* Tarif efektif DIBACA dari angka tersimpan (PPN ÷ DPP), bukan diketik
       * ulang — tagihan lama yang terbit pada tarif lama tetap jujur. */
      taxRate: dpp > 0 ? Math.round((taxAmount / dpp) * 10000) / 100 : null,
      buyerName: profile?.name ?? tenantById.get(inv.tenantId)?.name ?? null,
      buyerNpwp: profile?.npwp ?? null,
      buyerAddress: profile?.address ?? null,
      pebNumber: null,
      pebDate: null,
      exportNote: null,
    };
  });

  const result = buildEfaktur(seller, inputs, { from, to });
  const csv = efakturToCsv(result.rows);

  if (result.problems.length > 0) {
    console.error(`⚠ ${result.problems.length} tagihan TIDAK ikut (kolom wajib kosong):`);
    for (const p of result.problems) {
      console.error(`  - ${p.invoiceNo}: ${p.missing.join(", ")}`);
    }
    console.error(
      "  NPWP pembeli diisi pelanggan di /tenant (Profil Pajak); NPWP penjual " +
        "lewat env PLATFORM_SELLER_NPWP."
    );
  }

  if (out) {
    /* UTF-8 + BOM, konvensi route e-Faktur pelanggan (ramah Excel/DJP). */
    writeFileSync(out, "﻿" + csv, "utf8");
    console.log(`✓ ${result.rows.length} baris → ${out}`);
  } else {
    console.log(csv);
    console.error(`\n✓ ${result.rows.length} baris (stdout). Simpan: --out berkas.csv`);
  }

  await platform.$disconnect();
  await control.$disconnect();
  process.exit(result.problems.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Ekspor e-Faktur platform gagal:", error);
  process.exit(1);
});
