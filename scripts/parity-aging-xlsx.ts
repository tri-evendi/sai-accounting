/**
 * PARITAS ISI LEMBAR SEBAR UMUR PIUTANG / UMUR UTANG — TypeScript ⇄ Go,
 * terhadap buku sungguhan (tahap 1d).
 *
 *   TZ=Asia/Jakarta bun run parity:receivables-xlsx      # semua PT aktif
 *   bun run parity:payables-xlsx -- --company pt-a --as-of 2025-12-31
 *   bun run parity:receivables-xlsx -- --overdue only
 *   bun run parity:receivables-xlsx -- --cols "|party|documentNo,age,outstanding"
 *   bun run parity:payables-xlsx -- --go-bin ./parity
 *
 * Setiap (PT × tanggal × saringan jatuh tempo × pilihan kolom). `--cols`
 * memisahkan VARIAN dengan `|` (koma milik nilai `?cols=` itu sendiri); varian
 * kosong = kolom bawaan. Bawaannya tiga: semua kolom, `party` saja (tepi:
 * ringkasan ember kehilangan kolom nilainya), dan sebagian kolom.
 *
 * Lembar TS dirakit PERSIS seperti jalur berkas TS (`buildReportPayload` →
 * `buildReportSheet` → `buildWorkbookBuffer` dengan `getCompanyIdentity()`) di
 * dalam transaksi `READ ONLY`, dengan parameter yang SAMA dengan halaman
 * (`asOf`, `cols`, `overdue`); lembar Go oleh `cmd/parity <laporan>-xlsx`
 * (`internal/document`, kode pelari jalur `interactive`) dari instan yang
 * dihitung PENERBIT (`goExportPayloadShape`). ISI keduanya dibandingkan
 * `src/lib/xlsx-content-parity.ts`.
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
  agingAsOfDates,
  agingKind,
  arg,
  columnVariants,
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
  const def = reportById(kind);
  if (!def || !isExportable(def)) throw new Error(`${kind} hilang dari katalog`);
  console.log(`${kind} (lembar sebar) · pemilik jalur berkas: ${reportEngine(def.id)} (src/lib/report-engine.ts)`);
  const companies = await loadCompanies();
  const asOfs = agingAsOfDates(arg("--as-of"));
  const modes = overdueModes(arg("--overdue"));
  const variants = columnVariants(arg("--cols"));

  const kerja = await mkdtemp(join(tmpdir(), `parity-${kind}-xlsx-`));
  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  let n = 0;
  try {
    for (const c of companies) {
      for (const { asOfISO } of asOfs) for (const overdueOnly of modes) for (const cols of variants) {
        const label =
          `${c.slug} (${c.databaseName}) per ${asOfISO}` +
          (overdueOnly ? " · hanya jatuh tempo" : "") +
          ` · kolom ${cols || "bawaan"}`;
        try {
          const params: Record<string, string> = {
            asOf: asOfISO,
            ...(cols ? { cols } : {}),
            ...(overdueOnly ? { overdue: "1" } : {}),
          };
          const ts = await runWithCompany(companyContextOf(c), () =>
            readOnlyBook(async (tx) => {
              const payload = await buildReportPayload(def, params, tx as never);
              const buf = await buildWorkbookBuffer([buildReportSheet(payload)], await getCompanyIdentity(tx));
              return new Uint8Array(buf);
            })
          );
          const muatan = goExportPayloadShape(def, params);
          n += 1;
          const out = join(kerja, `${c.id}-${n}.xlsx`);
          await runGo(
            [
              `${kind}-xlsx`,
              "-database", c.databaseName,
              "-as-of", muatan.asOfInstant!,
              "-as-of-date", muatan.params.asOf!,
              ...(muatan.params.overdue === "1" ? ["-overdue"] : []),
              ...(muatan.params.cols ? ["-cols", muatan.params.cols] : []),
              "-registry-name", c.name,
              "-out", out,
            ],
            16 * 1024 * 1024
          );
          const go = new Uint8Array(await readFile(out));
          report(label, await compareWorkbookContent(ts, go), `isi setara (TS ${ts.length} B · Go ${go.length} B)`, tally);
        } catch (error) {
          failed(label, error, tally);
        }
      }
    }
  } finally {
    await rm(kerja, { recursive: true, force: true });
  }
  finish(
    companies.length,
    asOfs.length * modes.length * variants.length,
    "tanggal × saringan × kolom",
    tally
  );
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
