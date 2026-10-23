/**
 * PARITAS ISI LEMBAR SEBAR PENJUALAN PER PELANGGAN / PEMBELIAN PER PEMASOK /
 * LAPORAN KAS & BANK — TypeScript ⇄ Go, terhadap buku sungguhan (tahap 1d,
 * gelombang A). Ketiganya laporan BERPERIODE dengan pilihan kolom.
 *
 *   bun run parity:sales-by-customer-xlsx                # semua PT aktif
 *   bun run parity:purchases-by-supplier-xlsx -- --company pt-a --period 2025-01-01..2025-12-31
 *   bun run parity:sales-by-customer-xlsx -- --cols "|party|gross,net"
 *   bun run parity:cash-bank-xlsx -- --go-bin ./parity
 *
 * Setiap (PT × periode × pilihan kolom). `--cols` memisahkan VARIAN dengan `|`
 * (koma milik nilai `?cols=` itu sendiri); varian kosong = kolom bawaan.
 * Bawaannya tiga: semua kolom, kolom pertama saja (yang selalu tampil), dan
 * sebagian kolom.
 *
 * Lembar TS dirakit PERSIS seperti jalur berkas TS (`buildReportPayload` →
 * `buildReportSheet` → `buildWorkbookBuffer` dengan `getCompanyIdentity()`) di
 * dalam transaksi `READ ONLY`, dengan parameter yang SAMA dengan halaman
 * (`from`, `to`, `cols`); lembar Go oleh `cmd/parity <laporan>-xlsx`
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
  incomePeriods,
  loadCompanies,
  readOnlyBook,
  report,
  requireBusinessTimeZone,
  runGo,
  type Tally,
} from "./lib/parity";
import { recapColumnVariants } from "./lib/parity-recap";

/** Laporan yang diminta — argumen posisi pertama (`package.json`) — beserta varian kolom bawaannya. */
const LAPORAN = {
  "sales-by-customer": ["", "party", "gross,net"],
  "purchases-by-supplier": ["", "party", "gross,net"],
  "cash-bank": ["", "account", "closing"],
} as const;

function recapKind(): keyof typeof LAPORAN {
  const k = process.argv[2];
  if (!k || !(k in LAPORAN)) {
    console.error(`argumen pertama harus ${Object.keys(LAPORAN).join("|")}, bukan ${String(k)}`);
    process.exit(2);
  }
  return k as keyof typeof LAPORAN;
}

async function main() {
  requireBusinessTimeZone();
  const kind = recapKind();
  const def = reportById(kind);
  if (!def || !isExportable(def)) throw new Error(`${kind} hilang dari katalog`);
  console.log(`${kind} (lembar sebar) · pemilik jalur berkas: ${reportEngine(def.id)} (src/lib/report-engine.ts)`);
  const companies = await loadCompanies();
  const ranges = incomePeriods(arg("--period"));
  const variants = recapColumnVariants(arg("--cols"), [...LAPORAN[kind]]);

  const kerja = await mkdtemp(join(tmpdir(), `parity-${kind}-xlsx-`));
  const tally: Tally = { setara: 0, berselisih: 0, gagal: 0 };
  let n = 0;
  try {
    for (const c of companies) {
      for (const r of ranges) for (const cols of variants) {
        const label = `${c.slug} (${c.databaseName}) ${r.fromISO}..${r.toISO} · kolom ${cols || "bawaan"}`;
        try {
          const params: Record<string, string> = { from: r.fromISO, to: r.toISO, ...(cols ? { cols } : {}) };
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
