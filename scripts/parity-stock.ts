/**
 * PARITAS LAPORAN STOK — TypeScript ⇄ Go, terhadap buku sungguhan (tahap 1d).
 *
 *   bun run parity:stock-value                                  # semua PT aktif, 3 periode bawaan
 *   bun run parity:stock-movement -- --company pt-a,pt-b
 *   bun run parity:opname-history -- --period 2026-01-01..2026-10-23,2025-07-01..2026-06-30
 *   bun run parity:stock-value -- --go-bin ./parity
 *   bun run parity:stock-value -- --include-inactive
 *
 * Untuk setiap (PT × periode): pembaca TS (`getStockValuePeriodReport` /
 * `getStockMovementReport` / `getOpnameHistory`) dijalankan di dalam
 * `runWithCompany()` DAN transaksi `READ ONLY`, perkakas Go (`cmd/parity
 * <laporan>`) terhadap basis data dan instan `from`/`to` yang SAMA (penentu
 * periode laporannya — `resolvePeriod` / `resolveStockPeriod`, fungsi layar
 * dan penerbit Go), lalu keduanya dibandingkan `src/lib/stock-report-parity.ts`
 * — EKSAK: Go meniru float TS dalam urutan operasi yang sama, jadi selisih di
 * digit terakhir pun adalah selisih. Keluar bukan-nol pada SATU selisih atau
 * satu buku yang gagal dibaca.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY` (`scripts/lib/parity.ts`). Go:
 * transaksi `READ ONLY` (`internal/ledgerread`), buku dibuka lewat registry
 * kendali (instans sungguhan PT-nya). Aman terhadap produksi.
 */
import "dotenv/config";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getOpnameHistory, getStockMovementReport, getStockValuePeriodReport } from "../src/lib/stock-report";
import { reportEngine } from "../src/lib/report-engine";
import { controlDb } from "@sai/core/control-db";
import {
  compareOpnameHistory,
  compareStockMovement,
  compareStockValue,
  type GoOpnameHistory,
  type GoStockMovement,
  type GoStockValue,
} from "../src/lib/stock-report-parity";
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
import { stockKind, stockPeriods } from "./lib/parity-stock";

async function main() {
  requireBusinessTimeZone();
  const kind = stockKind();
  console.log(`${kind} · pemilik jalur berkas hari ini: ${reportEngine(kind)} (src/lib/report-engine.ts)`);
  const companies = await loadCompanies();
  const ranges = stockPeriods(kind, arg("--period"));

  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  for (const c of companies) {
    for (const r of ranges) {
      const label = `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO}`;
      try {
        const go = JSON.parse(
          await runGo([kind, "-database", c.databaseName, "-from", r.from.toISOString(), "-to", r.to.toISOString()])
        ) as unknown;
        const context = companyContextOf(c);
        if (kind === "stock-value") {
          const ts = await runWithCompany(context, () =>
            readOnlyBook((tx) => getStockValuePeriodReport(r.from, r.to, tx as never))
          );
          const g = go as GoStockValue;
          report(
            label,
            compareStockValue(ts, g),
            `${g.rows.length} barang · nilai akhir ${g.totalClosingValue} · tanpa dasar biaya ${g.uncostedCount}`,
            tally
          );
        } else if (kind === "stock-movement") {
          const ts = await runWithCompany(context, () =>
            readOnlyBook((tx) => getStockMovementReport(r.from, r.to, tx as never))
          );
          const g = go as GoStockMovement;
          report(
            label,
            compareStockMovement(ts, g),
            `${g.rows.length} barang · ${g.dormantCount} diam${g.hasProcess ? " · ada mutasi olah" : ""}`,
            tally
          );
        } else {
          const ts = await runWithCompany(context, () =>
            readOnlyBook((tx) => getOpnameHistory(r.from, r.to, tx as never))
          );
          const g = go as GoOpnameHistory;
          report(
            label,
            compareOpnameHistory(ts, g),
            `${g.sessionCount} sesi · ${g.adjustmentCount} penyesuaian · bersih ${g.netVariance}`,
            tally
          );
        }
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
