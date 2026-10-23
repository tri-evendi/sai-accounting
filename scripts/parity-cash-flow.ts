/**
 * PARITAS ARUS KAS — TypeScript ⇄ Go, terhadap buku sungguhan (tahap 1d).
 *
 *   bun run parity:cash-flow                                   # semua PT aktif, 3 periode bawaan
 *   bun run parity:cash-flow -- --company pt-a,pt-b
 *   bun run parity:cash-flow -- --period 2026-01-01..2026-10-23,2025-07-01..2026-06-30
 *   bun run parity:cash-flow -- --go-bin ./parity
 *   bun run parity:cash-flow -- --include-inactive
 *
 * Untuk setiap (PT × periode): `getCashFlow()` TS dijalankan di dalam
 * `runWithCompany()` DAN transaksi `READ ONLY`, perkakas Go (`cmd/parity
 * cash-flow`) terhadap basis data dan instan `from`/`to` yang SAMA
 * (`resolvePeriod` — fungsi layar dan penerbit Go), lalu keduanya dibandingkan
 * oleh `src/lib/cash-flow-parity.ts`: kelompok & urutannya, setiap baris akun
 * lawan (masuk, keluar, bersih), jumlah per kelompok, total, kas awal &
 * akhir, rincian per akun kas, vonis rekonsiliasi, dan hitungan valas berkurs
 * 1 — pada sen kontrak. Keluar bukan-nol pada SATU selisih atau satu buku yang
 * gagal dibaca.
 *
 * Periode bawaan (tanpa `--period`) sama dengan Laba Rugi: tahun berjalan s.d.
 * hari ini, tahun lalu penuh (melewati jurnal penutup #555), dan Juli tahun
 * lalu – Juni tahun ini. Arus Kas tidak punya penyaring pusat biaya maupun
 * kolom pembanding — halamannya tidak membaca keduanya.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY` (`scripts/lib/parity.ts`). Go:
 * transaksi `READ ONLY` (`internal/ledgerread`). Aman terhadap produksi.
 */
import "dotenv/config";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getCashFlow } from "../src/lib/reports";
import { reportEngine } from "../src/lib/report-engine";
import { controlDb } from "@sai/core/control-db";
import { compareCashFlow, type GoCashFlow } from "../src/lib/cash-flow-parity";
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
  console.log(`Arus Kas · pemilik jalur berkas hari ini: ${reportEngine("cash-flow")} (src/lib/report-engine.ts)`);
  const companies = await loadCompanies();
  const ranges = incomePeriods(arg("--period"));

  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  for (const c of companies) {
    for (const r of ranges) {
      const label = `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO}`;
      try {
        const context = defaultInstanceOnly(companyContextOf(c));
        const ts = await runWithCompany(context, () =>
          readOnlyBook((tx) => getCashFlow(r.from, r.to, tx as never))
        );
        const go = JSON.parse(
          await runGo([
            "cash-flow",
            "-database", c.databaseName,
            "-from", r.from.toISOString(),
            "-to", r.to.toISOString(),
          ])
        ) as GoCashFlow;
        if (go.unknownTypes.length > 0) {
          console.warn(`  ⚠ ${label}: akun lawan kas bertipe di luar kontrak: ${go.unknownTypes.join(", ")}`);
        }
        const lines = ts.groups.reduce((n, g) => n + g.lines.length, 0);
        report(
          label,
          compareCashFlow(ts, go),
          `${lines} baris · perubahan kas ${go.netChange} · ${go.reconciled ? "cocok" : "TIDAK cocok"} dengan buku besar`,
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
