/**
 * PARITAS KESESUAIAN DATA — Node ⇄ Go, terhadap buku sungguhan (09 §3.3).
 *
 *   bun run parity:conformance                              # semua PT aktif, ambang bawaan
 *   bun run parity:conformance -- --company pt-a,pt-b       # PT tertentu (slug)
 *   bun run parity:conformance -- --ambang-penampung 5,0.5  # beberapa ambang (persen)
 *   bun run parity:conformance -- --go-bin ./parity         # biner Go yang sudah dibangun
 *   bun run parity:conformance -- --include-inactive        # ikut PT nonaktif (sapuan memeriksanya)
 *
 * Untuk setiap (PT × ambang): sebelas pemeriksaan `scripts/check-data-conformance.ts`
 * (`runChecks` — kode yang SAMA dengan sapuan Node, diimpor, bukan disalin)
 * dijalankan di dalam `runWithCompany()`, perkakas Go (`cmd/parity
 * conformance`, kode yang SAMA dengan jalur `tenant`) dijalankan terhadap buku
 * yang SAMA, lalu keduanya dibandingkan: pemeriksaan mana yang berbunyi dan
 * dalam urutan apa, `judul`-nya, JUMLAH barisnya, dan setiap kalimat temuan
 * pada posisinya — termasuk kalimat pagar materialitas yang dihitung
 * (nominal `id-ID`, persen `toFixed`). Keluar bukan-nol pada SATU selisih
 * atau satu buku yang gagal dibaca.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * Sisi TS di transaksi `REPEATABLE READ, READ ONLY` (`readOnlyBook`), sisi Go
 * `READ ONLY` (`ledgerread`). Tidak ada jejak putaran yang ditulis di sisi
 * mana pun: paritas bukan putaran. Aman diarahkan ke buku produksi.
 *
 * Lulus di produksi adalah SYARAT `runner: go` untuk `tenant.conformance` di
 * `contract/kinds.yaml` (PRODUCTION.md §Pelaksana kesesuaian data).
 */
import "dotenv/config";

import { runWithCompany, companyContextOf } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { controlDb } from "@sai/core/control-db";
import { KIND_RUNNERS } from "@sai/core/generated/job-kinds";
import { compareConformance, type CheckResult } from "../src/lib/conformance-parity";
import { ambangDari, runChecks } from "./check-data-conformance";
import { arg, failed, finish, list, loadCompanies, readOnlyBook, report, runGo, type Tally } from "./lib/parity";

interface GoConformance {
  threshold: number;
  checks: CheckResult[];
}

async function main() {
  console.log(
    `Kesesuaian data · pelaksana hari ini: ${KIND_RUNNERS["tenant.conformance"]} (contract/kinds.yaml → runner)`
  );
  const companies = await loadCompanies();
  /* `undefined` = ambang bawaan kontrak, persis seperti sapuan tanpa argumen. */
  const ambangMentah: (string | undefined)[] = list(arg("--ambang-penampung"));
  if (ambangMentah.length === 0) ambangMentah.push(undefined);

  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  for (const c of companies) {
    for (const mentah of ambangMentah) {
      const ambang = ambangDari(mentah);
      const label = `${c.slug} (${c.databaseName}) · ambang ${(ambang * 100).toString()}%`;
      try {
        const ts = await runWithCompany(companyContextOf(c), () =>
          readOnlyBook((tx) => runChecks(tx, ambang))
        );
        const argv = ["conformance", "-database", c.databaseName];
        if (mentah !== undefined) argv.push("-ambang-penampung", mentah);
        const go = JSON.parse(await runGo(argv)) as GoConformance;
        const diffs = compareConformance(ts, go.checks);
        if (go.threshold !== ambang) diffs.unshift(`ambang TS ${ambang} ≠ Go ${go.threshold}`);
        const total = ts.reduce((n, x) => n + x.labels.length, 0);
        report(
          label,
          diffs,
          total === 0
            ? "bersih di kedua sisi"
            : `${total} temuan dalam ${ts.length} pemeriksaan (${ts.map((x) => `${x.key}:${x.labels.length}`).join(" ")})`,
          tally
        );
      } catch (error) {
        failed(label, error, tally);
      }
    }
  }
  finish(companies.length, ambangMentah.length, "ambang", tally);
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
