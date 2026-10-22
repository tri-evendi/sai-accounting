/**
 * PARITAS ISI LEMBAR SEBAR LABA RUGI — TypeScript ⇄ Go, terhadap buku
 * sungguhan (tahap 1d).
 *
 *   bun run parity:income-statement-xlsx                  # semua PT aktif, 3 periode bawaan
 *   bun run parity:income-statement-xlsx -- --company pt-a --period 2026-01-01..2026-10-22
 *   bun run parity:income-statement-xlsx -- --cost-center 3   # id pusat biaya (per buku)
 *   bun run parity:income-statement-xlsx -- --go-bin ./parity
 *
 * Lembar TS dirakit PERSIS seperti jalur berkas TS (`buildReportPayload` →
 * `buildReportSheet` → `buildWorkbookBuffer` dengan `getCompanyIdentity()`),
 * di dalam transaksi `READ ONLY`; lembar Go dirakit `cmd/parity
 * income-statement-xlsx` — kode `internal/document` yang SAMA dengan pelari
 * jalur `interactive` — dan keduanya dibandingkan ISI-nya oleh
 * `src/lib/xlsx-content-parity.ts`. Paritas ANGKA: `parity:income-statement`.
 *
 * ⚠ `--cost-center` di sini memanggil `costCenterFilterLabel()`, yang meminta
 * `getT()` — dan `getT()` membaca cookie permintaan HTTP. Di luar permintaan ia
 * MELEMPAR, jadi Laba Rugi bersaring pusat biaya TIDAK BISA dirakit jalur TS di
 * luar halaman (pekerja `report.export` pun sama). Skrip ini karena itu tanpa
 * penyaring secara bawaan; kasus ber-penyaring dibuktikan berkas emas
 * (`tests/statements-golden.test.ts`, kamus id dipalsukan) dan angkanya oleh
 * `parity:income-statement --cost-center`.
 *
 * ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
 * TS: transaksi `REPEATABLE READ, READ ONLY`. Go: `READ ONLY`. Berkas keduanya
 * ditulis ke direktori sementara dan dibuang.
 */
import "dotenv/config";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { disconnectAllCompanyClients } from "../src/lib/company-clients";
import { getCompanyIdentity } from "../src/lib/company-identity";
import { isExportable, reportById } from "../src/lib/report-catalog";
import { reportEngine } from "../src/lib/report-engine";
import { buildReportPayload } from "../src/lib/report-payload";
import { buildReportSheet } from "../src/lib/report-export";
import { buildWorkbookBuffer } from "../src/lib/xlsx";
import { compareWorkbookContent } from "../src/lib/xlsx-content-parity";
import { controlDb } from "@sai/core/control-db";
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
  const def = reportById("income-statement");
  if (!def || !isExportable(def)) throw new Error("income-statement hilang dari katalog");
  console.log(
    `Laba Rugi (lembar sebar) · pemilik jalur berkas: ${reportEngine(def.id)} (src/lib/report-engine.ts)`
  );
  const companies = await loadCompanies();
  const ranges = incomePeriods(arg("--period"));
  const cc = arg("--cost-center") ?? "";

  const kerja = await mkdtemp(join(tmpdir(), "parity-is-xlsx-"));
  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  try {
    for (const c of companies) {
      for (const r of ranges) {
        const label = `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO}` + (cc ? ` · pusat biaya ${cc}` : "");
        try {
          const context = defaultInstanceOnly(companyContextOf(c));
          const params = { from: r.fromISO, to: r.toISO, ...(cc ? { costCenter: cc } : {}) };
          const ts = await runWithCompany(context, () =>
            readOnlyBook(async (tx) => {
              const payload = await buildReportPayload(def, params, tx as never);
              const buf = await buildWorkbookBuffer([buildReportSheet(payload)], await getCompanyIdentity(tx));
              return new Uint8Array(buf);
            })
          );
          const out = join(kerja, `${c.id}-${r.fromISO}-${r.toISO}.xlsx`);
          await runGo(
            [
              "income-statement-xlsx",
              "-database", c.databaseName,
              "-from", r.from.toISOString(),
              "-to", r.to.toISOString(),
              "-from-date", r.fromISO,
              "-to-date", r.toISO,
              "-cost-center", cc,
              "-registry-name", c.name,
              "-out", out,
            ],
            16 * 1024 * 1024
          );
          const go = new Uint8Array(await readFile(out));
          report(
            label,
            await compareWorkbookContent(ts, go),
            `isi setara (TS ${ts.length} B · Go ${go.length} B)`,
            tally
          );
        } catch (error) {
          failed(label, error, tally);
        }
      }
    }
  } finally {
    await rm(kerja, { recursive: true, force: true });
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
