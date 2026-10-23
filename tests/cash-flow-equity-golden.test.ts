/**
 * PARITAS Arus Kas & Laporan Perubahan Ekuitas, TS ⇄ Go — ANGKA, dan ISI
 * LEMBAR SEBAR keduanya (Perubahan Ekuitas berberkas sejak keputusan pemilik
 * 23 Okt 2026) — di gerbang yang tak pernah dilewati (`bun run verify`), tanpa
 * toolchain Go.
 *
 * Keduanya `engine: "go-parity"` (`src/lib/report-engine.ts`, 23 Okt 2026). Pola
 * yang sama dengan `tests/statements-golden.test.ts` dan buku fixture yang
 * SAMA (`services/integrator/internal/ledgerread/testdata/statement_books.json`,
 * kunci `cashFlows` / `equityStatements`):
 *
 *   • Go menulis berkas emas angka (`go test ./internal/ledgerread -update`) dan
 *     lembar sebar keduanya (`go test ./internal/document -update`);
 *   • sisi ini menjalankan `getCashFlow` / `getEquityStatement` atas klien
 *     palsu berisi buku yang sama dan membandingkannya memakai pembanding
 *     paritas PRODUKSI (`cash-flow-parity.ts`, `equity-statement-parity.ts`),
 *     lalu merakit lembar keduanya lewat jalur berkas TS (`buildReportPayload`
 *     → `buildReportSheet` → ExcelJS) dan membandingkan ISI-nya dengan berkas
 *     emas Go;
 *   • instan periode yang ditulis Go = `resolvePeriod` TS = muatan penerbit Go
 *     (`goExportPayloadShape`) — muatan yang akan diterima pelarinya.
 *
 * Tepian fixture: pindah kas antarakun kas (bukan arus), satu akun masuk DAN
 * keluar, akun netral dua arah, baris lawan bernilai nol, valas ber-`base_*`,
 * valas berkurs 1 di jurnal tanpa kas (dihitung), tipe akun asing (kelompok
 * cadangan yang terlihat), jurnal tepat di batas hari Jakarta di kedua ujung,
 * jurnal penutup tahunan (tak menyentuh kas; IKUT mutasi Laba Ditahan), buku
 * kosong, buku timpang satu sen (TIDAK terekonsiliasi), setoran + prive pada
 * periode yang sama, akun ekuitas diam.
 */
import { describe, expect, it } from "vitest";

import { getCashFlow, getEquityStatement } from "@/lib/reports";
import { isExportable, reportById, resolvePeriod } from "@/lib/report-catalog";
import { goExportPayloadShape } from "@/lib/report-export-go";
import { buildReportPayload } from "@/lib/report-payload";
import { buildReportSheet } from "@/lib/report-export";
import { buildWorkbookBuffer } from "@/lib/xlsx";
import { compareWorkbookContent } from "@/lib/xlsx-content-parity";
import { statementPayloadSchema } from "@/lib/validations/report-export";
import { compareCashFlow, type GoCashFlow } from "@/lib/cash-flow-parity";
import { compareEquityStatement, type GoEquityStatement } from "@/lib/equity-statement-parity";
import { BOOKS, client, goNumbers, goSheet } from "./statement-books";

const CASH_FLOW = reportById("cash-flow")!;
if (!isExportable(CASH_FLOW)) throw new Error("Arus Kas tak dapat diekspor?");
const EQUITY = reportById("equity-changes")!;
if (!isExportable(EQUITY)) throw new Error("Laporan Perubahan Ekuitas tak dapat diekspor?");

/** Instan yang sama? Go menulis RFC3339 tanpa milidetik nol, JS selalu `.000Z`. */
const sameInstant = (a: string | Date | undefined, b: string | null) =>
  a !== undefined && b !== null && new Date(a).getTime() === new Date(b).getTime();

describe("fixture bersama memuat tepian Arus Kas & Ekuitas yang dijanjikan", () => {
  it("setiap buku punya kasus, dan buku-arus-kas ada", () => {
    expect(BOOKS.map((b) => b.name)).toContain("buku-arus-kas");
    expect(BOOKS.filter((b) => (b.cashFlows ?? []).length > 0).length).toBeGreaterThanOrEqual(5);
    expect(BOOKS.filter((b) => (b.equityStatements ?? []).length > 0).length).toBeGreaterThanOrEqual(5);
  });
});

for (const book of BOOKS) {
  const flows = book.cashFlows ?? [];
  const equities = book.equityStatements ?? [];
  if (flows.length + equities.length === 0) continue;

  describe(`${book.name}: Arus Kas TS = Go`, () => {
    for (const c of flows) {
      it(`${c.case}: instan periode Go = resolvePeriod TS = penerbit Go`, () => {
        const g = goNumbers<GoCashFlow>(c.case);
        const r = resolvePeriod(c.from, c.to);
        expect(sameInstant(r.from, g.from), `${r.from.toISOString()} ⇄ ${g.from}`).toBe(true);
        expect(sameInstant(r.to, g.to), `${r.to.toISOString()} ⇄ ${g.to}`).toBe(true);
        const muatan = goExportPayloadShape(CASH_FLOW, { from: c.from, to: c.to });
        expect(sameInstant(muatan.fromInstant, g.from)).toBe(true);
        expect(sameInstant(muatan.toInstant, g.to)).toBe(true);
        expect(muatan.params).toEqual({ from: c.from, to: c.to });
      });

      it(`${c.case}: angka setara`, async () => {
        const { from, to } = resolvePeriod(c.from, c.to);
        const ts = await getCashFlow(from, to, client(book) as never);
        expect(compareCashFlow(ts, goNumbers<GoCashFlow>(c.case)), "selisih angka").toEqual([]);
      });

      it(`${c.case}: isi lembar sebar setara — jalur berkas DAN jalur sinkron`, async () => {
        const payload = await buildReportPayload(CASH_FLOW as never, { from: c.from, to: c.to }, client(book) as never);
        const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
        expect(await compareWorkbookContent(new Uint8Array(ts), goSheet(c.case)), "berkas ⇄ Go").toEqual([]);
        /* Jalur sinkron halaman: muatan yang SAMA melewati skema rute ekspor. */
        const sinkron = statementPayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
        expect(buildReportSheet(sinkron)).toEqual(buildReportSheet(payload));
      });
    }
  });

  describe(`${book.name}: Laporan Perubahan Ekuitas TS = Go`, () => {
    for (const c of equities) {
      it(`${c.case}: angka setara`, async () => {
        const g = goNumbers<GoEquityStatement>(c.case);
        const { from, to } = resolvePeriod(c.from, c.to);
        expect(sameInstant(from, g.from) && sameInstant(to, g.to), "instan periode").toBe(true);
        const ts = await getEquityStatement(from, to, client(book) as never);
        expect(compareEquityStatement(ts, g), "selisih angka").toEqual([]);
      });

      it(`${c.case}: instan periode Go = penerbit Go`, () => {
        const g = goNumbers<GoEquityStatement>(c.case);
        const muatan = goExportPayloadShape(EQUITY, { from: c.from, to: c.to });
        expect(sameInstant(muatan.fromInstant, g.from)).toBe(true);
        expect(sameInstant(muatan.toInstant, g.to)).toBe(true);
        expect(muatan.params).toEqual({ from: c.from, to: c.to });
      });

      it(`${c.case}: isi lembar sebar setara — jalur berkas DAN jalur sinkron`, async () => {
        const payload = await buildReportPayload(EQUITY as never, { from: c.from, to: c.to }, client(book) as never);
        const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
        expect(await compareWorkbookContent(new Uint8Array(ts), goSheet(c.case)), "berkas ⇄ Go").toEqual([]);
        /* Jalur sinkron halaman: muatan yang SAMA melewati skema rute ekspor. */
        const sinkron = statementPayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
        expect(buildReportSheet(sinkron)).toEqual(buildReportSheet(payload));
      });
    }
  });
}

describe("pembanding Arus Kas & Ekuitas MELIHAT selisih — bukan selalu hijau", () => {
  const book = BOOKS.find((b) => b.name === "buku-arus-kas")!;
  const { from, to } = resolvePeriod("2026-01-01", "2026-03-31");

  it("satu sen di satu baris akun lawan", async () => {
    const ts = await getCashFlow(from, to, client(book) as never);
    ts.groups[0]!.lines[0]!.inflow += 0.01;
    expect(compareCashFlow(ts, goNumbers<GoCashFlow>("arus-kas-q1-2026")).join("\n")).toMatch(/operating 1201 inflow/);
  });

  it("vonis rekonsiliasi dan hitungan valas berkurs 1", async () => {
    const ts = await getCashFlow(from, to, client(book) as never);
    expect(ts.reconciled).toBe(true);
    expect(ts.suspectUnrated).toBe(2);
    const beda = compareCashFlow(
      { ...ts, reconciled: false, suspectUnrated: 0 },
      goNumbers<GoCashFlow>("arus-kas-q1-2026")
    ).join("\n");
    expect(beda).toMatch(/vonis rekonsiliasi/);
    expect(beda).toMatch(/valas berkurs 1/);
  });

  it("buku timpang satu sen TIDAK terekonsiliasi di kedua sisi", async () => {
    const timpang = BOOKS.find((b) => b.name === "buku-timpang")!;
    const r = resolvePeriod("2025-12-01", "2025-12-31");
    const ts = await getCashFlow(r.from, r.to, client(timpang) as never);
    expect(ts.reconciled).toBe(false);
    expect(goNumbers<GoCashFlow>("arus-kas-timpang").reconciled).toBe(false);
  });

  it("Ekuitas: lembar sebar yang berbeda satu sen TERTANGKAP pembanding isi", async () => {
    const r = { from: "2025-12-01", to: "2026-03-31" };
    const payload = await buildReportPayload(EQUITY as never, r, client(book) as never);
    if (payload.kind !== "equity-changes") throw new Error(payload.kind);
    payload.components[0]!.closing += 0.01;
    const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
    expect((await compareWorkbookContent(new Uint8Array(ts), goSheet("ekuitas-lintas-tutup"))).length).toBeGreaterThan(0);
  });

  it("Ekuitas: setoran dan prive tidak saling meniadakan; penutup ikut", async () => {
    const r = resolvePeriod("2025-12-01", "2026-03-31");
    const ts = await getEquityStatement(r.from, r.to, client(book) as never);
    const prive = ts.components.find((x) => x.code === "3103")!;
    expect(prive.reductions).toBe(10_000);
    expect(ts.components.find((x) => x.code === "3102")!.additions).toBe(5_000.05);
    const g = goNumbers<GoEquityStatement>("ekuitas-lintas-tutup");
    const ubah = { ...ts, components: ts.components.map((x) => (x.code === "3103" ? { ...x, reductions: 0 } : x)) };
    expect(compareEquityStatement(ubah, g).join("\n")).toMatch(/komponen 3103 reductions/);
  });
});
