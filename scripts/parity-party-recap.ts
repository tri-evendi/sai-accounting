/**
 * PARITAS PENJUALAN PER PELANGGAN / PEMBELIAN PER PEMASOK — TypeScript ⇄ Go,
 * terhadap buku sungguhan (tahap 1d, gelombang A).
 *
 *   bun run parity:sales-by-customer                  # semua PT aktif, 3 periode
 *   bun run parity:purchases-by-supplier -- --company pt-a,pt-b
 *   bun run parity:sales-by-customer -- --period 2026-01-01..2026-10-23
 *   bun run parity:purchases-by-supplier -- --go-bin ./parity
 *   bun run parity:sales-by-customer -- --include-inactive
 *
 * Untuk setiap (PT × periode): `getSalesByCustomer()` / `getPurchasesBySupplier()`
 * TS dijalankan di dalam `runWithCompany()` DAN transaksi `REPEATABLE READ,
 * READ ONLY`, perkakas Go (`cmd/parity sales-by-customer|purchases-by-supplier`)
 * terhadap basis data dan instan periode yang SAMA (`resolvePeriod`), lalu
 * dibandingkan `src/lib/recap-parity.ts`: himpunan & URUTAN pihak, nama,
 * jumlah dokumen/retur/tanpa kurs, kotor/retur/bersih pada SEN, dan total.
 *
 * Periode bawaan sama dengan Laba Rugi: tahun berjalan s.d. hari ini, tahun
 * lalu penuh, Juli tahun lalu – Juni tahun ini.
 *
 * ══ INSTANS ════════════════════════════════════════════════════════════════
 * Perkakas Go menyelesaikan instans buku dari registry kendali (`openBook`),
 * sama dengan sisi TS (`companyContextOf`).
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY`. Go: transaksi `READ ONLY`.
 */
import "dotenv/config";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getPurchasesBySupplier, getSalesByCustomer } from "../src/lib/party-recap";
import { reportEngine } from "../src/lib/report-engine";
import { comparePartyRecap, type GoPartyRecap } from "../src/lib/recap-parity";
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
import { partyRecapKind } from "./lib/parity-recap";

async function main() {
  requireBusinessTimeZone();
  const kind = partyRecapKind();
  console.log(`${kind} · pemilik jalur berkas hari ini: ${reportEngine(kind)} (src/lib/report-engine.ts)`);
  const companies = await loadCompanies();
  const ranges = incomePeriods(arg("--period"));

  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  for (const c of companies) {
    for (const r of ranges) {
      const label = `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO}`;
      try {
        const ts = await runWithCompany(companyContextOf(c), () =>
          readOnlyBook((tx) =>
            kind === "sales-by-customer"
              ? getSalesByCustomer(r.from, r.to, tx as never)
              : getPurchasesBySupplier(r.from, r.to, tx as never)
          )
        );
        const go = JSON.parse(
          await runGo([
            kind,
            "-database", c.databaseName,
            "-from", r.from.toISOString(),
            "-to", r.to.toISOString(),
          ])
        ) as GoPartyRecap;
        report(
          label,
          comparePartyRecap(ts, go),
          `${go.rows.length} pihak · ${go.totals.docCount} dokumen · bersih ${go.totals.netBase} · ` +
            `${go.totals.unratedCount} tanpa kurs`,
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
