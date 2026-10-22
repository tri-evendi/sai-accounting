/**
 * PARITAS ISI LEMBAR SEBAR NERACA — TypeScript ⇄ Go, terhadap buku sungguhan
 * (tahap 1d).
 *
 *   TZ=Asia/Jakarta bun run parity:balance-sheet-xlsx           # semua PT aktif, per hari ini
 *   bun run parity:balance-sheet-xlsx -- --company pt-a,pt-b --as-of 2025-12-31,2026-06-30
 *   bun run parity:balance-sheet-xlsx -- --compare none,previous_year   # bawaan: none,preceding,previous_year
 *   bun run parity:balance-sheet-xlsx -- --go-bin ./parity
 *
 * KOLOM PEMBANDING (#557): setiap tanggal diperiksa dalam setiap mode
 * `--compare` — satu kolom, dan empat kolom per mode. Parameter Go diturunkan
 * lewat `goExportPayloadShape`, PENERBIT yang sama dengan rute ekspor, jadi
 * tanggal pembanding yang diterima Go adalah yang akan diterima pelarinya.
 *
 * Lembar TS dirakit PERSIS seperti jalur berkas TS (`buildReportPayload` →
 * `buildReportSheet` → `buildWorkbookBuffer` dengan `getCompanyIdentity()`) di
 * dalam transaksi `READ ONLY`; lembar Go oleh `cmd/parity balance-sheet-xlsx`
 * (`internal/document`, kode pelari jalur `interactive`); ISI keduanya
 * dibandingkan `src/lib/xlsx-content-parity.ts`. Paritas ANGKA, termasuk
 * pecahan laba tahun berjalan yang TIDAK tercetak di berkas (muatan ekspor TS
 * tidak membawanya): `parity:balance-sheet`.
 *
 * Zona proses wajib Asia/Jakarta — alasan di `parity-balance-sheet.ts`.
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
  asOfDates,
  compareModes,
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
  const def = reportById("balance-sheet");
  if (!def || !isExportable(def)) throw new Error("balance-sheet hilang dari katalog");
  console.log(
    `Neraca (lembar sebar) · pemilik jalur berkas: ${reportEngine(def.id)} (src/lib/report-engine.ts)`
  );
  const companies = await loadCompanies();
  const asOfs = asOfDates(arg("--as-of"));
  const modes = compareModes(arg("--compare"));

  const kerja = await mkdtemp(join(tmpdir(), "parity-bs-xlsx-"));
  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  try {
    for (const c of companies) {
      for (const { asOfISO } of asOfs) for (const mode of modes) {
        const label = `${c.slug} (${c.databaseName}) per ${asOfISO}` + (mode ? ` · banding ${mode}` : "");
        try {
          const context = defaultInstanceOnly(companyContextOf(c));
          const params = { asOf: asOfISO, ...(mode ? { compare: mode } : {}) };
          const ts = await runWithCompany(context, () =>
            readOnlyBook(async (tx) => {
              const payload = await buildReportPayload(def, params, tx as never);
              const buf = await buildWorkbookBuffer([buildReportSheet(payload)], await getCompanyIdentity(tx));
              return new Uint8Array(buf);
            })
          );
          const muatan = goExportPayloadShape(def, params);
          const out = join(kerja, `${c.id}-${asOfISO}-${mode || "satu"}.xlsx`);
          await runGo(
            [
              "balance-sheet-xlsx",
              "-database", c.databaseName,
              "-as-of", muatan.asOfInstant!,
              "-as-of-date", muatan.params.asOf!,
              ...(mode ? ["-compare", mode, "-prior-as-of", muatan.priorAsOfInstant!] : []),
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
  finish(companies.length, asOfs.length * modes.length, "tanggal × mode pembanding", tally);
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
