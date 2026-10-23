/**
 * PARITAS LAPORAN PERUBAHAN EKUITAS — TypeScript ⇄ Go, terhadap buku
 * sungguhan (tahap 1d).
 *
 *   bun run parity:equity-changes                                   # semua PT aktif, 3 periode bawaan
 *   bun run parity:equity-changes -- --company pt-a,pt-b
 *   bun run parity:equity-changes -- --period 2026-01-01..2026-10-23
 *   bun run parity:equity-changes -- --go-bin ./parity
 *
 * Untuk setiap (PT × periode): `getEquityStatement()` TS di dalam
 * `runWithCompany()` DAN transaksi `READ ONLY`, perkakas Go (`cmd/parity
 * equity-changes`) atas basis data dan instan `from`/`to` yang SAMA
 * (`resolvePeriod` — fungsi halaman), dibandingkan oleh
 * `src/lib/equity-statement-parity.ts`: setiap komponen (kode, urutan, nama,
 * awal, tambah, kurang, akhir), laba belum ditutup (awal, gerak, arah gerak,
 * akhir), dan kedua total — pada sen kontrak.
 *
 * Angka SAJA: laporan ini tidak punya berkas di TS (katalog tanpa
 * `payloadKind`), jadi tidak ada `-xlsx`. Periode bawaan sama dengan Laba
 * Rugi — termasuk tahun lalu penuh, yang melewati jurnal penutup #555 (mutasi
 * Laba Ditahan) bila tahun itu sudah ditutup.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY`. Go: `READ ONLY`.
 */
import "dotenv/config";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getEquityStatement } from "../src/lib/reports";
import { reportEngine } from "../src/lib/report-engine";
import { controlDb } from "@sai/core/control-db";
import { compareEquityStatement, type GoEquityStatement } from "../src/lib/equity-statement-parity";
import {
  arg,
  defaultInstanceOnly,
  failed,
  finish,
  incomePeriods,
  loadCompanies,
  readOnlyBook,
  report,
  runGo,
  type Tally,
} from "./lib/parity";

async function main() {
  console.log(
    `Laporan Perubahan Ekuitas · mesin: ${reportEngine("equity-changes")} (src/lib/report-engine.ts; tanpa berkas)`
  );
  const companies = await loadCompanies();
  const ranges = incomePeriods(arg("--period"));

  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  for (const c of companies) {
    for (const r of ranges) {
      const label = `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO}`;
      try {
        const context = defaultInstanceOnly(companyContextOf(c));
        const ts = await runWithCompany(context, () =>
          readOnlyBook((tx) => getEquityStatement(r.from, r.to, tx as never))
        );
        const go = JSON.parse(
          await runGo([
            "equity-changes",
            "-database", c.databaseName,
            "-from", r.from.toISOString(),
            "-to", r.to.toISOString(),
          ])
        ) as GoEquityStatement;
        if (go.unknownTypes.length > 0) {
          console.warn(`  ⚠ ${label}: akun bergerak bertipe di luar kontrak: ${go.unknownTypes.join(", ")}`);
        }
        report(
          label,
          compareEquityStatement(ts, go),
          `${ts.components.length} komponen · ekuitas akhir ${go.totalClosing}`,
          tally
        );
      } catch (error) {
        failed(label, error, tally);
      }
    }
  }
  finish(companies.length, ranges.length, "periode", tally);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllCompanyClients();
    await controlDb.$disconnect();
  });
