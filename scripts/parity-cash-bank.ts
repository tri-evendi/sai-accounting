/**
 * PARITAS LAPORAN KAS & BANK — TypeScript ⇄ Go, terhadap buku sungguhan
 * (tahap 1d, gelombang A).
 *
 *   bun run parity:cash-bank                         # semua PT aktif, 3 periode
 *   bun run parity:cash-bank -- --company pt-a,pt-b
 *   bun run parity:cash-bank -- --period 2026-01-01..2026-10-23
 *   bun run parity:cash-bank -- --go-bin ./parity
 *
 * Untuk setiap (PT × periode): muatan TS yang SAMA dengan halaman & jalur
 * berkas (`cashBankPayload(getCashFlow(...))`) di dalam `runWithCompany()` DAN
 * transaksi `REPEATABLE READ, READ ONLY`, perkakas Go (`cmd/parity cash-bank`,
 * dari pembaca Arus Kas Go) terhadap instan periode yang SAMA, lalu
 * dibandingkan `src/lib/recap-parity.ts`: akun kas (kode & URUTAN), nama, saldo
 * awal/perubahan/akhir per akun, dan ketiga total — pada SEN.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY`. Go: transaksi `READ ONLY`.
 */
import "dotenv/config";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getCashFlow } from "../src/lib/reports";
import { isExportable, reportById } from "../src/lib/report-catalog";
import { reportEngine } from "../src/lib/report-engine";
import { cashBankPayload } from "../src/lib/report-payload";
import { compareCashBank, type GoCashBank } from "../src/lib/recap-parity";
import { controlDb } from "@sai/core/control-db";
import {
  arg,
  failed,
  finish,
  incomePeriods,
  loadCompanies,
  readOnlyBook,
  report,
  requireBusinessTimeZone,
  runGo,
  type Tally,
} from "./lib/parity";

async function main() {
  requireBusinessTimeZone();
  const def = reportById("cash-bank");
  if (!def || !isExportable(def)) throw new Error("cash-bank hilang dari katalog");
  console.log(`Kas & Bank · pemilik jalur berkas hari ini: ${reportEngine("cash-bank")} (src/lib/report-engine.ts)`);
  const companies = await loadCompanies();
  const ranges = incomePeriods(arg("--period"));

  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  for (const c of companies) {
    for (const r of ranges) {
      const label = `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO}`;
      try {
        const ts = await runWithCompany(companyContextOf(c), () =>
          readOnlyBook(async (tx) => cashBankPayload(def, r.from, r.to, await getCashFlow(r.from, r.to, tx as never)))
        );
        const go = JSON.parse(
          await runGo([
            "cash-bank",
            "-database", c.databaseName,
            "-from", r.from.toISOString(),
            "-to", r.to.toISOString(),
          ])
        ) as GoCashBank;
        report(
          label,
          compareCashBank(ts, go),
          `${go.rows.length} akun kas · awal ${go.openingCash} · akhir ${go.closingCash}`,
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
