/**
 * PARITAS ISI LEMBAR SEBAR LAPORAN STOK — TypeScript ⇄ Go, terhadap buku
 * sungguhan (tahap 1d).
 *
 *   TZ=Asia/Jakarta bun run parity:stock-value-xlsx          # semua PT aktif
 *   bun run parity:stock-movement-xlsx -- --company pt-a --period 2026-01-01..2026-03-31
 *   bun run parity:stock-value-xlsx -- --cols "|code|closingQty,closingValue"
 *   bun run parity:opname-history-xlsx -- --go-bin ./parity
 *
 * Setiap (PT × periode × pilihan kolom). `--cols` memisahkan VARIAN dengan `|`
 * (koma milik nilai `?cols=` itu sendiri); varian kosong = kolom bawaan.
 * Riwayat Hitung Ulang Stok tanpa pilihan kolom.
 *
 * Lembar TS dirakit PERSIS seperti jalur berkas TS (`buildReportPayload` →
 * `buildReportSheet` → `buildWorkbookBuffer` dengan `getCompanyIdentity()`) di
 * dalam transaksi `READ ONLY`, dengan parameter yang dikirim halaman (`from`,
 * `to`, `cols`); lembar Go oleh `cmd/parity <laporan>-xlsx`
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
import { stockColumnVariants, stockKind, stockPeriods } from "./lib/parity-stock";

async function main() {
  requireBusinessTimeZone();
  const kind = stockKind();
  const def = reportById(kind);
  if (!def || !isExportable(def)) throw new Error(`${kind} hilang dari katalog`);
  console.log(`${kind} (lembar sebar) · pemilik jalur berkas: ${reportEngine(def.id)} (src/lib/report-engine.ts)`);
  const companies = await loadCompanies();
  const ranges = stockPeriods(kind, arg("--period"));
  const variants = stockColumnVariants(kind, arg("--cols"));

  const kerja = await mkdtemp(join(tmpdir(), `parity-${kind}-xlsx-`));
  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  let n = 0;
  try {
    for (const c of companies) {
      for (const r of ranges) for (const cols of variants) {
        const label = `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO} · kolom ${cols || "bawaan"}`;
        try {
          const params: Record<string, string> = {
            from: r.fromISO,
            to: r.toISO,
            ...(cols ? { cols } : {}),
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
              "-from", muatan.fromInstant!,
              "-to", muatan.toInstant!,
              "-from-date", muatan.params.from!,
              "-to-date", muatan.params.to!,
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
  finish(companies.length, ranges.length * variants.length, "periode × kolom", tally);
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
