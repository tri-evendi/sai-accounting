/**
 * PARITAS LABA RUGI — TypeScript ⇄ Go, terhadap buku sungguhan (tahap 1d).
 *
 *   bun run parity:income-statement                                   # semua PT aktif, 3 periode bawaan
 *   bun run parity:income-statement -- --company pt-a,pt-b
 *   bun run parity:income-statement -- --period 2026-01-01..2026-10-22,2025-07-01..2026-06-30
 *   bun run parity:income-statement -- --cost-center ,unassigned,3   # "" = tanpa penyaring
 *   bun run parity:income-statement -- --go-bin ./parity
 *   bun run parity:income-statement -- --include-inactive
 *
 * Untuk setiap (PT × periode × penyaring pusat biaya): `getIncomeStatement()`
 * TS dijalankan di dalam `runWithCompany()` DAN transaksi `READ ONLY`,
 * perkakas Go (`cmd/parity income-statement`) terhadap basis data dan instan
 * `from`/`to` yang SAMA (`resolvePeriod` — fungsi layar), lalu keduanya
 * dibandingkan oleh `src/lib/statement-parity.ts`: setiap baris di setiap band,
 * setiap subtotal & anak tangga, tampilan datar, dan arah hasil. Keluar
 * bukan-nol pada SATU selisih atau satu buku yang gagal dibaca.
 *
 * Periode bawaan (tanpa `--period`): tahun berjalan s.d. hari ini, tahun lalu
 * penuh (melewati jurnal penutup #555 bila tahun itu sudah ditutup), dan
 * Juli tahun lalu – Juni tahun ini (melintasi akhir tahun). Penyaring bawaan:
 * tanpa penyaring dan `unassigned` (jalur `IS NULL`); id pusat biaya bersifat
 * per buku, jadi hanya lewat `--cost-center`.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY` (`scripts/lib/parity.ts`). Go:
 * transaksi `READ ONLY` (`internal/ledgerread`). Aman terhadap produksi.
 */
import "dotenv/config";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getIncomeStatement } from "../src/lib/reports";
import { reportEngine } from "../src/lib/report-engine";
import { parseCostCenterFilter } from "../src/lib/cost-centers";
import { controlDb } from "@sai/core/control-db";
import { compareIncomeStatement, type GoIncomeStatement } from "../src/lib/statement-parity";
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
    `Laba Rugi · pemilik jalur berkas hari ini: ${reportEngine("income-statement")} (src/lib/report-engine.ts)`
  );
  const companies = await loadCompanies();
  const ranges = incomePeriods(arg("--period"));
  const ccArg = arg("--cost-center");
  const costCenters = ccArg === undefined ? ["", "unassigned"] : ccArg.split(",").map((s) => s.trim());

  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  for (const c of companies) {
    for (const r of ranges) {
      for (const cc of costCenters) {
        const label =
          `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO}` + (cc ? ` · pusat biaya ${cc}` : "");
        try {
          const context = defaultInstanceOnly(companyContextOf(c));
          const ts = await runWithCompany(context, () =>
            readOnlyBook((tx) => getIncomeStatement(r.from, r.to, tx as never, parseCostCenterFilter(cc)))
          );
          const go = JSON.parse(
            await runGo([
              "income-statement",
              "-database", c.databaseName,
              "-from", r.from.toISOString(),
              "-to", r.to.toISOString(),
              "-cost-center", cc,
            ])
          ) as GoIncomeStatement;
          if (go.unknownTypes.length > 0) {
            console.warn(`  ⚠ ${label}: akun bergerak bertipe di luar kontrak: ${go.unknownTypes.join(", ")}`);
          }
          report(
            label,
            compareIncomeStatement(ts, go),
            `${ts.revenue.length + ts.expense.length} baris · laba bersih ${go.netIncome}`,
            tally
          );
        } catch (error) {
          failed(label, error, tally);
        }
      }
    }
  }
  finish(companies.length, ranges.length * costCenters.length, "periode/penyaring", tally);
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
