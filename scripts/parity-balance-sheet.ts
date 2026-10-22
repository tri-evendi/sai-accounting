/**
 * PARITAS NERACA — TypeScript ⇄ Go, terhadap buku sungguhan (tahap 1d).
 *
 *   TZ=Asia/Jakarta bun run parity:balance-sheet                    # semua PT aktif, per hari ini
 *   bun run parity:balance-sheet -- --company pt-a,pt-b
 *   bun run parity:balance-sheet -- --as-of 2025-12-31,2026-06-30
 *   bun run parity:balance-sheet -- --go-bin ./parity
 *   bun run parity:balance-sheet -- --include-inactive
 *
 * Untuk setiap (PT × tanggal): `getBalanceSheet()` TS dijalankan di dalam
 * `runWithCompany()` DAN transaksi `READ ONLY`, perkakas Go
 * (`cmd/parity balance-sheet`) terhadap basis data dan instan `asOf` yang SAMA
 * (`resolveAsOf`), lalu dibandingkan oleh `src/lib/statement-parity.ts`: setiap
 * baris aset/liabilitas/ekuitas, setiap total, laba yang belum ditutup BESERTA
 * pecahannya (tahun berjalan / tahun lalu, #555), dan vonis seimbang.
 *
 * ══ ZONA PROSES WAJIB Asia/Jakarta ═════════════════════════════════════════
 * Pecahan laba tahun berjalan memakai batas tahun buku menurut zona PROSES di
 * TS (`fiscalYearBounds`), dan zona `Asia/Jakarta` eksplisit di Go. Skrip
 * menolak berjalan di zona lain — image produksi sudah `TZ=Asia/Jakarta`.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY`. Go: transaksi `READ ONLY`.
 */
import "dotenv/config";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getBalanceSheet } from "../src/lib/reports";
import { reportEngine } from "../src/lib/report-engine";
import { controlDb } from "@sai/core/control-db";
import { compareBalanceSheet, type GoBalanceSheet } from "../src/lib/statement-parity";
import {
  arg,
  asOfDates,
  defaultInstanceOnly,
  failed,
  finish,
  loadCompanies,
  readOnlyBook,
  report,
  requireBusinessTimeZone,
  runGo,
  type Tally,
} from "./lib/parity";

async function main() {
  requireBusinessTimeZone();
  console.log(
    `Neraca · pemilik jalur berkas hari ini: ${reportEngine("balance-sheet")} (src/lib/report-engine.ts)`
  );
  const companies = await loadCompanies();
  const asOfs = asOfDates(arg("--as-of"));

  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  for (const c of companies) {
    for (const { asOf, asOfISO } of asOfs) {
      const label = `${c.slug} (${c.databaseName}) per ${asOfISO}`;
      try {
        const context = defaultInstanceOnly(companyContextOf(c));
        const ts = await runWithCompany(context, () =>
          readOnlyBook((tx) => getBalanceSheet(asOf, tx as never))
        );
        const go = JSON.parse(
          await runGo(["balance-sheet", "-database", c.databaseName, "-as-of", asOf.toISOString()])
        ) as GoBalanceSheet;
        if (go.unknownTypes.length > 0) {
          console.warn(`  ⚠ ${label}: akun bertipe di luar kontrak: ${go.unknownTypes.join(", ")}`);
        }
        report(
          label,
          compareBalanceSheet(ts, go),
          `aset ${go.totalAssets} · laba belum ditutup ${go.netIncome} ` +
            `(berjalan ${go.currentYearIncome} · lalu ${go.priorUnclosedIncome}) · ` +
            `${go.balanced ? "seimbang" : "TIMPANG (sama di kedua sisi)"}`,
          tally
        );
      } catch (error) {
        failed(label, error, tally);
      }
    }
  }
  finish(companies.length, asOfs.length, "tanggal", tally);
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
