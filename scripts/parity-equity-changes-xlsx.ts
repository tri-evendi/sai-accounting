/**
 * PARITAS ISI LEMBAR SEBAR LAPORAN PERUBAHAN EKUITAS — TypeScript ⇄ Go,
 * terhadap buku sungguhan (tahap 1d; berkas sejak keputusan pemilik 23 Okt
 * 2026).
 *
 *   bun run parity:equity-changes-xlsx                         # semua PT aktif, 3 periode bawaan
 *   bun run parity:equity-changes-xlsx -- --company pt-a --period 2026-01-01..2026-10-23
 *   bun run parity:equity-changes-xlsx -- --go-bin ./parity
 *
 * Lembar TS dirakit PERSIS seperti jalur berkas TS (`buildReportPayload` →
 * `buildReportSheet` → `buildWorkbookBuffer` dengan `getCompanyIdentity()`),
 * di dalam transaksi `READ ONLY`; lembar Go dirakit `cmd/parity
 * equity-changes-xlsx` — kode `internal/document` yang SAMA dengan pelari jalur
 * `interactive` — dari parameter yang diturunkan `goExportPayloadShape`,
 * PENERBIT yang sama dengan rute ekspor. Keduanya dibandingkan ISI-nya oleh
 * `src/lib/xlsx-content-parity.ts`. Paritas ANGKA: `parity:equity-changes`.
 *
 * Satu bentuk lembar saja: laporan ini tidak punya kolom pembanding. Periode
 * bawaan sama dengan Laba Rugi — termasuk tahun lalu penuh, yang melewati
 * jurnal penutup #555 bila tahun itu sudah ditutup.
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
import { goExportPayloadShape } from "../src/lib/report-export-go";
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
  requireBusinessTimeZone,
  runGo,
  type Tally,
} from "./lib/parity";

async function main() {
  /* Bentuk baris "Dicetak" dan tanggal label mengikuti zona proses di TS —
     zona produksi, seperti skrip lembar sebar lain. */
  requireBusinessTimeZone();
  const def = reportById("equity-changes");
  if (!def || !isExportable(def)) throw new Error("equity-changes hilang dari katalog (atau tanpa payloadKind)");
  console.log(
    `Laporan Perubahan Ekuitas (lembar sebar) · pemilik jalur berkas: ${reportEngine(def.id)} (src/lib/report-engine.ts)`
  );
  const companies = await loadCompanies();
  const ranges = incomePeriods(arg("--period"));

  const kerja = await mkdtemp(join(tmpdir(), "parity-eq-xlsx-"));
  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  try {
    for (const c of companies) {
      for (const r of ranges) {
        const label = `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO}`;
        try {
          const context = defaultInstanceOnly(companyContextOf(c));
          const params = { from: r.fromISO, to: r.toISO };
          const ts = await runWithCompany(context, () =>
            readOnlyBook(async (tx) => {
              const payload = await buildReportPayload(def, params, tx as never);
              const buf = await buildWorkbookBuffer([buildReportSheet(payload)], await getCompanyIdentity(tx));
              return new Uint8Array(buf);
            })
          );
          const muatan = goExportPayloadShape(def, params);
          const out = join(kerja, `${c.id}-${r.fromISO}-${r.toISO}.xlsx`);
          await runGo(
            [
              "equity-changes-xlsx",
              "-database", c.databaseName,
              "-from", muatan.fromInstant!,
              "-to", muatan.toInstant!,
              "-from-date", muatan.params.from!,
              "-to-date", muatan.params.to!,
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
