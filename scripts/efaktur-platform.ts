/**
 * Ekspor e-Faktur untuk TAGIHAN PLATFORM (issue #141) — faktur keluaran KAMI
 * atas langganan pelanggan, memakai mesin yang SAMA dengan modul pajak
 * pelanggan (`src/lib/efaktur.ts` — murni, jadi bisa diimpor tsx): klasifikasi
 * lokal, validasi NPWP wajib, kolom & CSV satu sumber. Ironi §10 ditunaikan:
 * mesin e-Faktur yang kita bangun untuk pelanggan kini menagihkan kita.
 *
 *   bun run efaktur:platform -- --from 2026-08-01 --to 2026-08-31 [--out f.csv]
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
import { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { buatAdapter, type AdapterBasisData } from "@sai/db/adapter";
import { platformEfaktur } from "@sai/platform/billing/platform-efaktur";

function clientFor<T>(Ctor: new (args: { adapter: AdapterBasisData }) => T, rawUrl: string): T {
  const url = new URL(rawUrl);
  return new Ctor({
    adapter: buatAdapter(url.toString(), { batasKoneksi: 1 }),
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

  const platform = clientFor(PlatformClient, platformUrl);
  const control = clientFor(ControlClient, controlUrl);

  /* Logikanya di `src/lib/billing/platform-efaktur.ts` — sama dengan unduhan
     konsol operator (`/operator/efaktur`). */
  const result = await platformEfaktur({ platform, control }, { from, to });
  const csv = result.csv;

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
    console.log(`✓ ${result.rowCount} baris → ${out}`);
  } else {
    console.log(csv);
    console.error(`\n✓ ${result.rowCount} baris (stdout). Simpan: --out berkas.csv`);
  }

  await platform.$disconnect();
  await control.$disconnect();
  process.exit(result.problems.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Ekspor e-Faktur platform gagal:", error);
  process.exit(1);
});
