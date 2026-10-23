/**
 * PARITAS UMUR PIUTANG / UMUR UTANG — TypeScript ⇄ Go, terhadap buku
 * sungguhan (tahap 1d).
 *
 *   TZ=Asia/Jakarta bun run parity:receivables          # semua PT aktif, 3 tanggal × 2 saringan
 *   bun run parity:payables -- --company pt-a,pt-b
 *   bun run parity:receivables -- --as-of 2025-12-31,2026-06-30
 *   bun run parity:receivables -- --overdue all          # all | only | all,only (bawaan)
 *   bun run parity:payables -- --go-bin ./parity
 *   bun run parity:receivables -- --include-inactive
 *
 * Untuk setiap (PT × tanggal × saringan jatuh tempo): `getReceivables()` /
 * `getPayables()` TS dijalankan di dalam `runWithCompany()` DAN transaksi
 * `REPEATABLE READ, READ ONLY`, perkakas Go (`cmd/parity receivables|payables`)
 * terhadap basis data dan instan `asOf` yang SAMA (`resolveAsOf`), lalu
 * dibandingkan `src/lib/aging-parity.ts`: himpunan & urutan dokumen, setiap
 * kolom per dokumen (sisa & dibayar pada SEN), ember, total, dokumen tanpa
 * nilai IDR.
 *
 * Bawaan tanggalnya TIGA, bukan satu: umur bergantung pada tanggal laporan,
 * dan potret historis (pelunasan sesudah asOf belum melunasi apa pun) adalah
 * aturan yang hanya teruji pada tanggal lampau — hari ini, 30 Juni, dan
 * 31 Desember tahun lalu.
 *
 * ══ INSTANS ════════════════════════════════════════════════════════════════
 * Perkakas Go menyelesaikan instans buku dari registry kendali (`openBook`),
 * sama dengan sisi TS (`companyContextOf`) — PT di instans lain DIBANDINGKAN,
 * tidak ditolak.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY`. Go: transaksi `READ ONLY`.
 */
import "dotenv/config";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getPayables, getReceivables } from "../src/lib/receivables";
import { reportEngine } from "../src/lib/report-engine";
import { compareAging, type GoAgingReport, type TsAgingResult } from "../src/lib/aging-parity";
import { controlDb } from "@sai/core/control-db";
import {
  agingAsOfDates,
  agingKind,
  arg,
  failed,
  finish,
  loadCompanies,
  overdueModes,
  readOnlyBook,
  report,
  requireBusinessTimeZone,
  runGo,
  type Tally,
} from "./lib/parity";

async function main() {
  requireBusinessTimeZone();
  const kind = agingKind();
  console.log(`${kind} · pemilik jalur berkas hari ini: ${reportEngine(kind)} (src/lib/report-engine.ts)`);
  const companies = await loadCompanies();
  const asOfs = agingAsOfDates(arg("--as-of"));
  const modes = overdueModes(arg("--overdue"));

  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  for (const c of companies) {
    for (const { asOf, asOfISO } of asOfs) for (const overdueOnly of modes) {
      const label = `${c.slug} (${c.databaseName}) per ${asOfISO}${overdueOnly ? " · hanya jatuh tempo" : ""}`;
      try {
        const ts = (await runWithCompany(companyContextOf(c), () =>
          readOnlyBook(async (tx): Promise<unknown> =>
            kind === "receivables"
              ? getReceivables({ asOf, overdueOnly }, tx as never)
              : getPayables({ asOf, overdueOnly }, tx as never)
          )
        )) as unknown as TsAgingResult;
        const go = JSON.parse(
          await runGo([
            kind,
            "-database", c.databaseName,
            "-as-of", asOf.toISOString(),
            ...(overdueOnly ? ["-overdue"] : []),
          ])
        ) as GoAgingReport;
        report(
          label,
          compareAging(ts, go),
          `${go.rows.length} dokumen · sisa ${go.total} · ${go.unresolved} tanpa kurs · ${go.overdueCount} jatuh tempo`,
          tally
        );
      } catch (error) {
        failed(label, error, tally);
      }
    }
  }
  finish(companies.length, asOfs.length * modes.length, "tanggal × saringan", tally);
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
