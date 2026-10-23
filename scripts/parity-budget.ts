/**
 * PARITAS REALISASI VS ANGGARAN — TypeScript ⇄ Go, terhadap buku sungguhan
 * (tahap 1d, gelombang A). Angka (`parity:budget-realization`) DAN isi lembar
 * sebar (`parity:budget-realization-xlsx`, argumen `--xlsx`) — satu skrip,
 * sebab keduanya berjalan atas periode `?year=&month=` yang sama.
 *
 *   bun run parity:budget-realization                 # semua PT aktif, 5 periode
 *   bun run parity:budget-realization -- --company pt-a --budget-period 2026-0,2026-3
 *   bun run parity:budget-realization-xlsx -- --go-bin ./parity
 *
 * Periode bawaan: tahun berjalan penuh, bulan berjalan, Januari tahun berjalan,
 * tahun lalu penuh, Desember tahun lalu (`scripts/lib/parity-recap.ts`).
 *
 * Angka: `getBudgetReport()` + `getSalesTargetRealization()` TS di dalam
 * `runWithCompany()` DAN transaksi `REPEATABLE READ, READ ONLY`; perkakas Go
 * (`cmd/parity budget-realization`) dengan tahun/bulan dan instan Laba Rugi
 * yang dihitung PENERBIT (`goExportPayloadShape` → `resolveBudgetPeriod` +
 * `budgetPeriodRange`); dibandingkan `src/lib/recap-parity.ts`: akun
 * beranggaran (kode & URUTAN), nama, kategori, anggaran/realisasi/selisih pada
 * SEN, persen selisih PERSIS, status, total, jumlah akun di luar ambang, dan
 * target penjualan.
 *
 * Lembar: jalur berkas TS (`buildReportPayload` → `buildReportSheet` →
 * `buildWorkbookBuffer` dengan `getCompanyIdentity()`) ⇄ `cmd/parity
 * budget-realization-xlsx` (`internal/document`), ISI dibandingkan
 * `src/lib/xlsx-content-parity.ts`.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY`. Go: transaksi `READ ONLY`.
 */
import "dotenv/config";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getCompanyIdentity } from "../src/lib/company-identity";
import { getBudgetReport, getSalesTargetRealization } from "../src/lib/budget-report";
import { DEFAULT_VARIANCE_THRESHOLD_PCT } from "../src/lib/budget";
import { isExportable, reportById } from "../src/lib/report-catalog";
import { reportEngine } from "../src/lib/report-engine";
import { buildReportPayload, resolveBudgetPeriod } from "../src/lib/report-payload";
import { buildReportSheet } from "../src/lib/report-export";
import { buildWorkbookBuffer } from "../src/lib/xlsx";
import { goExportPayloadShape } from "../src/lib/report-export-go";
import { compareWorkbookContent } from "../src/lib/xlsx-content-parity";
import { compareBudget, type GoBudgetRealization } from "../src/lib/recap-parity";
import { controlDb } from "@sai/core/control-db";
import {
  arg,
  failed,
  finish,
  loadCompanies,
  readOnlyBook,
  report,
  requireBusinessTimeZone,
  runGo,
  type Tally,
} from "./lib/parity";
import { budgetPeriods } from "./lib/parity-recap";

async function main() {
  requireBusinessTimeZone();
  const xlsx = process.argv.includes("--xlsx");
  const def = reportById("budget-realization");
  if (!def || !isExportable(def)) throw new Error("budget-realization hilang dari katalog");
  console.log(
    `Realisasi vs Anggaran${xlsx ? " (lembar sebar)" : ""} · pemilik jalur berkas hari ini: ` +
      `${reportEngine("budget-realization")} (src/lib/report-engine.ts)`
  );
  const companies = await loadCompanies();
  const periods = budgetPeriods(arg("--budget-period"));

  const kerja = xlsx ? await mkdtemp(join(tmpdir(), "parity-budget-xlsx-")) : null;
  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  let n = 0;
  try {
    for (const c of companies) {
      for (const p of periods) {
        const label = `${c.slug} (${c.databaseName}) ${p.year}-${p.month === "0" ? "setahun" : p.month}`;
        try {
          const muatan = goExportPayloadShape(def, { year: p.year, month: p.month });
          const goArgs = [
            "-database", c.databaseName,
            "-year", muatan.params.year!,
            "-month", muatan.params.month!,
            "-from", muatan.fromInstant!,
            "-to", muatan.toInstant!,
          ];
          if (!xlsx) {
            const { year, month } = resolveBudgetPeriod(p.year, p.month);
            const ts = await runWithCompany(companyContextOf(c), () =>
              readOnlyBook(async (tx) => {
                const { report: budget } = await getBudgetReport(year, month, DEFAULT_VARIANCE_THRESHOLD_PCT, tx as never);
                const sales = await getSalesTargetRealization(year, month, DEFAULT_VARIANCE_THRESHOLD_PCT, tx as never);
                return { report: budget, sales };
              })
            );
            const go = JSON.parse(await runGo(["budget-realization", ...goArgs])) as GoBudgetRealization;
            if (go.unknownTypes.length > 0) {
              console.warn(`  ⚠ ${label}: akun bergerak bertipe di luar kontrak: ${go.unknownTypes.join(", ")}`);
            }
            report(
              label,
              compareBudget(ts, go),
              `${go.rows.length} akun · anggaran ${go.totals.budget} · realisasi ${go.totals.actual} · ` +
                `${go.totals.alertCount} di luar ambang · ${go.salesTarget.targetCount} target`,
              tally
            );
            continue;
          }
          const ts = await runWithCompany(companyContextOf(c), () =>
            readOnlyBook(async (tx) => {
              const payload = await buildReportPayload(def, { year: p.year, month: p.month }, tx as never);
              const buf = await buildWorkbookBuffer([buildReportSheet(payload)], await getCompanyIdentity(tx));
              return new Uint8Array(buf);
            })
          );
          n += 1;
          const out = join(kerja!, `${c.id}-${n}.xlsx`);
          await runGo(["budget-realization-xlsx", ...goArgs, "-registry-name", c.name, "-out", out], 16 * 1024 * 1024);
          const go = new Uint8Array(await readFile(out));
          report(label, await compareWorkbookContent(ts, go), `isi setara (TS ${ts.length} B · Go ${go.length} B)`, tally);
        } catch (error) {
          failed(label, error, tally);
        }
      }
    }
  } finally {
    if (kerja) await rm(kerja, { recursive: true, force: true });
  }
  finish(companies.length, periods.length, "periode", tally);
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
