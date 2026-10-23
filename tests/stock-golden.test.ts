/**
 * PARITAS laporan stok, TS ⇄ Go — ANGKA (eksak) dan ISI LEMBAR SEBAR — di
 * gerbang yang tak pernah dilewati (`bun run verify`), tanpa toolchain Go.
 *
 * Nilai Persediaan, Riwayat Stok (Kartu Stok), dan Riwayat Hitung Ulang Stok
 * — ketiganya `engine: "go-parity"` (`src/lib/report-engine.ts`). Pola Arus
 * Kas, dengan buku fixture SENDIRI
 * (`services/integrator/internal/ledgerread/testdata/stock_books.json`):
 *
 *   • Go menulis berkas emas angka (`go test ./internal/ledgerread -update`) dan
 *     lembar sebar (`go test ./internal/document -update`);
 *   • sisi ini menjalankan pembaca TS (`stock-report.ts`) atas klien palsu
 *     berisi buku yang sama (`tests/stock-books.ts`) dan membandingkannya
 *     memakai pembanding paritas PRODUKSI (`stock-report-parity.ts`) — EKSAK;
 *     lalu merakit lembar lewat jalur berkas TS (`buildReportPayload` →
 *     `buildReportSheet` → ExcelJS) dan membandingkan ISI-nya dengan Go;
 *   • instan periode Go = penentu periode TS (`resolvePeriod` untuk Nilai
 *     Persediaan, `resolveStockPeriod` untuk dua lainnya) = muatan penerbit Go.
 *
 * Tepian fixture: kuantitas berpecahan (0,001; 3,333; 12,345), saldo NOL dari
 * mutasi (masuk = keluar), saldo NEGATIF, sisa float 0,1 + 0,2 − 0,3 tanpa dan
 * dengan dasar biaya, rata-rata tepat setengah sen (1,005 → 1,00), barang
 * bernama kembar (kode beda), barang tanpa satuan / satuan kosong, barang diam,
 * masuk tanpa biaya (data lama) dan berkuantitas nol, biaya impor
 * (`cost_adjust`) sebelum keluar berikutnya dan TEPAT sesudah ujung periode,
 * hasil produksi (masuk) dan bahan produksi (keluar), mutasi olah, gerakan
 * tepat di `T16:59:59.999Z` / `T17:00:00.000Z` (batas hari Jakarta) di kedua
 * ujung periode, gerakan lama ber-id besar, opname di dua hari Jakarta yang
 * berbeda tetapi satu hari UTC, catatan opname yang TIDAK persis (dikeluarkan),
 * `process` bercatatan opname (dilewati), seri |selisih| yang diurutkan
 * `localeCompare` (≠ urutan byte), buku tanpa barang.
 */
import { describe, expect, it } from "vitest";

import { getOpnameHistory, getStockMovementReport, getStockValuePeriodReport } from "@/lib/stock-report";
import { isExportable, reportById, resolvePeriod, type ExportableReport } from "@/lib/report-catalog";
import { resolveStockPeriod } from "@/lib/stock-period";
import { goExportPayloadShape } from "@/lib/report-export-go";
import { buildReportPayload } from "@/lib/report-payload";
import { buildReportSheet } from "@/lib/report-export";
import { buildWorkbookBuffer } from "@/lib/xlsx";
import { compareWorkbookContent } from "@/lib/xlsx-content-parity";
import { statementPayloadSchema } from "@/lib/validations/report-export";
import {
  compareOpnameHistory,
  compareStockMovement,
  compareStockValue,
  type GoOpnameHistory,
  type GoStockMovement,
  type GoStockValue,
} from "@/lib/stock-report-parity";
import { STOCK_BOOKS, goNumbers, goSheet, stockClient, type StockCase } from "./stock-books";

function exportable(id: "stock-value" | "stock-movement" | "opname-history"): ExportableReport {
  const def = reportById(id);
  if (!def || !isExportable(def)) throw new Error(`${id} tak dapat diekspor?`);
  return def;
}
const VALUE = exportable("stock-value");
const MOVEMENT = exportable("stock-movement");
const OPNAME = exportable("opname-history");

/** Instan yang sama? Go menulis RFC3339 tanpa milidetik nol, JS selalu `.000Z`. */
const sameInstant = (a: string | Date | undefined, b: string) =>
  a !== undefined && new Date(a).getTime() === new Date(b).getTime();

const paramsOf = (c: StockCase): Record<string, string> => ({
  from: c.from,
  to: c.to,
  ...(c.cols ? { cols: c.cols } : {}),
});

describe("fixture laporan stok memuat kasus yang dijanjikan", () => {
  it("ketiga laporan punya kasus, dan buku tanpa barang ada", () => {
    expect(STOCK_BOOKS.flatMap((b) => b.stockValues).length).toBeGreaterThanOrEqual(6);
    expect(STOCK_BOOKS.flatMap((b) => b.stockMovements).length).toBeGreaterThanOrEqual(6);
    expect(STOCK_BOOKS.flatMap((b) => b.opnameHistories).length).toBeGreaterThanOrEqual(4);
    expect(STOCK_BOOKS.some((b) => b.items.length === 0)).toBe(true);
  });
});

/** Rakit lembar jalur berkas TS dan bandingkan ISI-nya dengan Go — juga lewat skema rute sinkron. */
async function sheetParity(def: ExportableReport, c: StockCase, companyName: string, client: unknown) {
  const payload = await buildReportPayload(def as never, paramsOf(c), client as never);
  const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: companyName });
  expect(await compareWorkbookContent(new Uint8Array(ts), goSheet(c.case)), "berkas ⇄ Go").toEqual([]);
  const sinkron = statementPayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
  expect(buildReportSheet(sinkron)).toEqual(buildReportSheet(payload));
}

for (const book of STOCK_BOOKS) {
  const client = stockClient(book);

  describe(`${book.name}: Nilai Persediaan TS = Go`, () => {
    for (const c of book.stockValues) {
      it(`${c.case}: instan periode Go = resolvePeriod TS = penerbit Go`, () => {
        const g = goNumbers<GoStockValue>(c.case);
        const r = resolvePeriod(c.from, c.to);
        expect(sameInstant(r.from, g.from) && sameInstant(r.to, g.to), "instan periode").toBe(true);
        const muatan = goExportPayloadShape(VALUE, paramsOf(c));
        expect(sameInstant(muatan.fromInstant, g.from) && sameInstant(muatan.toInstant, g.to)).toBe(true);
        expect(muatan.params).toEqual(paramsOf(c));
      });

      it(`${c.case}: angka setara (eksak)`, async () => {
        const { from, to } = resolvePeriod(c.from, c.to);
        const ts = await getStockValuePeriodReport(from, to, client as never);
        expect(compareStockValue(ts, goNumbers<GoStockValue>(c.case)), "selisih angka").toEqual([]);
      });

      it(`${c.case}: isi lembar sebar setara — jalur berkas DAN jalur sinkron`, async () => {
        await sheetParity(VALUE, c, book.companyName, client);
      });
    }
  });

  describe(`${book.name}: Riwayat Stok TS = Go`, () => {
    for (const c of book.stockMovements) {
      it(`${c.case}: instan periode Go = resolveStockPeriod TS = penerbit Go`, () => {
        const g = goNumbers<GoStockMovement>(c.case);
        const r = resolveStockPeriod(undefined, undefined, c.from, c.to);
        expect(sameInstant(r.from, g.from) && sameInstant(r.to, g.to), "instan periode").toBe(true);
        const muatan = goExportPayloadShape(MOVEMENT, paramsOf(c));
        expect(sameInstant(muatan.fromInstant, g.from) && sameInstant(muatan.toInstant, g.to)).toBe(true);
        expect(muatan.params).toEqual(paramsOf(c));
      });

      it(`${c.case}: angka setara (eksak)`, async () => {
        const { from, to } = resolveStockPeriod(undefined, undefined, c.from, c.to);
        const ts = await getStockMovementReport(from, to, client as never);
        expect(compareStockMovement(ts, goNumbers<GoStockMovement>(c.case)), "selisih angka").toEqual([]);
      });

      it(`${c.case}: isi lembar sebar setara — jalur berkas DAN jalur sinkron`, async () => {
        await sheetParity(MOVEMENT, c, book.companyName, client);
      });
    }
  });

  describe(`${book.name}: Riwayat Hitung Ulang Stok TS = Go`, () => {
    for (const c of book.opnameHistories) {
      it(`${c.case}: instan periode Go = resolveStockPeriod TS = penerbit Go`, () => {
        const g = goNumbers<GoOpnameHistory>(c.case);
        const r = resolveStockPeriod(undefined, undefined, c.from, c.to);
        expect(sameInstant(r.from, g.from) && sameInstant(r.to, g.to), "instan periode").toBe(true);
        const muatan = goExportPayloadShape(OPNAME, paramsOf(c));
        expect(sameInstant(muatan.fromInstant, g.from) && sameInstant(muatan.toInstant, g.to)).toBe(true);
      });

      it(`${c.case}: angka setara (eksak)`, async () => {
        const { from, to } = resolveStockPeriod(undefined, undefined, c.from, c.to);
        const ts = await getOpnameHistory(from, to, client as never);
        expect(compareOpnameHistory(ts, goNumbers<GoOpnameHistory>(c.case)), "selisih angka").toEqual([]);
      });

      it(`${c.case}: isi lembar sebar setara — jalur berkas DAN jalur sinkron`, async () => {
        await sheetParity(OPNAME, c, book.companyName, client);
      });
    }
  });
}

describe("pembanding laporan stok MELIHAT selisih — bukan selalu hijau", () => {
  const book = STOCK_BOOKS.find((b) => b.name === "buku-stok")!;
  const client = stockClient(book);
  const { from, to } = resolvePeriod("2026-01-01", "2026-03-31");

  it("sisa float 5,55e-17 bukan nol — eksak, tanpa toleransi sen", async () => {
    const ts = await getStockValuePeriodReport(from, to, client as never);
    const lada = ts.rows.find((r) => r.code === "B006")!;
    /* Temuan tentang TS: 0,1 + 0,2 − 0,3 "bersaldo", dan karena tanpa dasar
       biaya ia ikut `uncostedCount`. Go meniru — itulah paritasnya. */
    expect(lada.closingQty).toBeGreaterThan(0);
    expect(lada.closingQty).toBeLessThan(1e-15);
    lada.closingQty = 0;
    expect(compareStockValue(ts, goNumbers<GoStockValue>("stok-nilai-q1-2026")).join("\n")).toMatch(
      /barang B006 closingQty/
    );
  });

  it("urutan barang bernama kembar dan nilai tanpa dasar biaya (null ≠ 0)", async () => {
    const ts = await getStockMovementReport(from, to, client as never);
    const kembar = ts.rows.filter((r) => r.name === "Kopi Arabika").map((r) => r.id);
    expect(kembar).toEqual([1, 4]);
    [ts.rows[3], ts.rows[4]] = [ts.rows[4]!, ts.rows[3]!];
    expect(compareStockMovement(ts, goNumbers<GoStockMovement>("kartu-stok-q1-2026")).join("\n")).toMatch(
      /urutan berbeda/
    );
    const sv = await getStockValuePeriodReport(from, to, client as never);
    sv.rows.find((r) => r.code === "B013")!.closingValue = 0;
    expect(compareStockValue(sv, goNumbers<GoStockValue>("stok-nilai-q1-2026")).join("\n")).toMatch(
      /B013 closingValue: TS 0 ⇄ Go null/
    );
  });

  it("urutan penyesuaian opname (localeCompare) dan batas hari Jakarta", async () => {
    const h = await getOpnameHistory(from, to, client as never);
    const maret = h.sessions.find((s) => s.dateISO === "2026-03-15")!;
    expect(maret.adjustments.map((a) => a.itemName)).toEqual(["Kopi Arabika", "kopi Robusta", "Kopi-Luwak"]);
    expect(h.sessions.map((s) => s.dateISO)).toContain("2026-01-31");
    expect(h.sessions.map((s) => s.dateISO)).toContain("2026-02-01");
    maret.adjustments.reverse();
    expect(compareOpnameHistory(h, goNumbers<GoOpnameHistory>("opname-q1-2026")).join("\n")).toMatch(
      /sesi 2026-03-15 #1 itemName/
    );
  });
});
