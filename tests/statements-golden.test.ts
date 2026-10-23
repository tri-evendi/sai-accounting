/**
 * PARITAS Laba Rugi & Neraca, TS ⇄ Go — ANGKA dan ISI LEMBAR SEBAR — di
 * gerbang yang tak pernah dilewati (`bun run verify`), tanpa toolchain Go.
 *
 * Keduanya `engine: "go-parity"` (`src/lib/report-engine.ts`): Go menghitung
 * (`services/integrator/internal/ledgerread/statements.go`) dan menulis lembar
 * sebarnya (`internal/document/statements.go`), berkas masih TS sampai paritas
 * produksi. Di sini satu buku fixture BERSAMA
 * (`services/integrator/internal/ledgerread/testdata/statement_books.json`)
 * dijalankan di kedua bahasa:
 *
 *   • Go menulis berkas emas angka (`go test ./internal/ledgerread -update`) dan
 *     lembar sebar (`go test ./internal/document -update`);
 *   • sisi ini menjalankan `getIncomeStatement` / `getBalanceSheet` atas klien
 *     palsu berisi buku yang sama, membandingkannya dengan berkas emas angka
 *     memakai pembanding paritas PRODUKSI (`src/lib/statement-parity.ts`), lalu
 *     merakit lembar sebar lewat jalur berkas TS (`buildReportPayload` →
 *     `buildReportSheet` → ExcelJS) dan membandingkan ISI-nya dengan berkas emas
 *     Go (`compareWorkbookContent`).
 *
 * Tepian yang dimuat fixture: buku kosong, buku timpang satu sen, buku
 * bergerak dengan valas (rupiah dasar ≠ nominal asal), retur bersaldo
 * abnormal, kontra-aset, akun bertipe asing, akun bergerak-lalu-nol, jurnal
 * penutup tahunan, periode melintasi akhir tahun, jurnal tepat di batas hari
 * Jakarta, tahun buku April dengan laba tahun lalu yang belum ditutup (saldo
 * negatif), dan penyaring pusat biaya (belum ditetapkan / aktif / nonaktif /
 * hilang).
 *
 * KOLOM PEMBANDING (#557): `incomeComparisons` / `balanceComparisons` di buku
 * fixture yang sama. Go menulis kedua periode beserta instan pembandingnya
 * (`*.golden.json`) dan lembar sebar EMPAT kolom; sisi ini memeriksa bahwa
 * instan itu sama dengan `comparisonRange`/`comparisonDate` TS DAN dengan
 * muatan penerbit Go (`goExportPayloadShape`), angka kedua periode setara, dan
 * lembar jalur berkas TS (`buildReportPayload` dengan `compare`) setara ISI-nya
 * — juga sesudah melewati skema rute ekspor sinkron, yang sampai 22 Okt 2026
 * diam-diam membuang kolom pembandingnya. Buku "buku-banding" memuat jebakan
 * float pecahan ekuitas (tahun lalu ditutup, sen nol, `!!1.4e-14` benar) dan
 * kode akun yang urutan `localeCompare`-nya bukan urutan byte.
 *
 * Kamus TIDAK dipalsukan: `getT()` dipaksa MELEMPAR, seperti di pekerja tanpa
 * permintaan HTTP — jalur berkas, termasuk penyaring pusat biaya "belum
 * ditetapkan", wajib bisa dirakit tanpanya (#702, jebakan 4).
 *
 * ⚠ ZONA PROSES DIPAKU ke Asia/Jakarta di berkas ini: `fiscalYearBounds()` TS
 * memakai zona PROSES (produksi `TZ=Asia/Jakarta`), sementara host pengembang
 * Asia/Shanghai dan CI UTC. Buku "tahun buku April" sengaja punya jurnal
 * 31 Maret 17.30 UTC (= 1 April WIB) — di UTC tes ini MERAH, dan memang harus.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@sai/platform/i18n/server", async (importOriginal) => {
  const asli = await importOriginal<typeof import("@sai/platform/i18n/server")>();
  /* Pekerja tidak punya permintaan HTTP: `getT()` → `cookies()` MELEMPAR di
     sana. Dipalsukan melempar di sini juga, supaya jalur berkas yang masih
     meminta kamus MERAH di gerbang ini, bukan di antrean produksi. */
  return {
    ...asli,
    getT: async () => {
      throw new Error("getT() di luar permintaan HTTP — jalur berkas tidak boleh meminta kamus");
    },
  };
});

import { getBalanceSheet, getIncomeStatement } from "@/lib/reports";
import { isExportable, reportById, resolveAsOf, resolvePeriod } from "@/lib/report-catalog";
import { comparisonDate, comparisonRange, parseComparison } from "@/lib/statement-compare";
import { goExportPayloadShape } from "@/lib/report-export-go";
import { statementPayloadSchema } from "@/lib/validations/report-export";
import { buildReportPayload } from "@/lib/report-payload";
import { buildReportSheet } from "@/lib/report-export";
import { buildWorkbookBuffer } from "@/lib/xlsx";
import { compareWorkbookContent } from "@/lib/xlsx-content-parity";
import { parseCostCenterFilter } from "@/lib/cost-centers";
import {
  compareBalanceSheet,
  compareIncomeStatement,
  type GoBalanceSheet,
  type GoIncomeStatement,
} from "@/lib/statement-parity";
import { BOOKS, client, goNumbers, goSheet } from "./statement-books";

/** Berkas emas angka komparatif — `IncomeComparisonGolden` / `BalanceComparisonGolden` Go. */
interface GoIncomeComparison {
  current: GoIncomeStatement;
  prior: GoIncomeStatement;
  priorFrom: string;
  priorTo: string;
}
interface GoBalanceComparison {
  current: GoBalanceSheet;
  prior: GoBalanceSheet;
  priorAsOf: string;
}

const INCOME = reportById("income-statement")!;
const BALANCE = reportById("balance-sheet")!;
if (!isExportable(INCOME) || !isExportable(BALANCE)) throw new Error("laporan keuangan tak dapat diekspor?");

let tzAsli: string | undefined;
beforeAll(() => {
  tzAsli = process.env.TZ;
  process.env.TZ = "Asia/Jakarta";
});
afterAll(() => {
  if (tzAsli === undefined) delete process.env.TZ;
  else process.env.TZ = tzAsli;
});

describe("fixture bersama memuat tepian yang dijanjikan", () => {
  it("zona proses benar-benar Asia/Jakarta di berkas ini", () => {
    expect(new Date("2025-03-31T17:30:00.000Z").getDate()).toBe(1);
  });

  it("buku kosong, timpang, bergerak, valas, penutup, lintas tahun, tahun buku April", () => {
    const names = BOOKS.map((b) => b.name);
    expect(names).toEqual(
      expect.arrayContaining(["buku-dagang", "buku-kosong", "buku-timpang", "buku-tahun-buku-april"])
    );
    expect(BOOKS.some((b) => b.journals.length === 0)).toBe(true);
    const lines = BOOKS.flatMap((b) => b.journals.flatMap((j) => j.lines));
    expect(lines.some((l) => l.currency && l.currency !== "IDR" && l.baseDebit !== l.debit)).toBe(true);
    expect(BOOKS.some((b) => b.journals.some((j) => j.type === "closing"))).toBe(true);
    expect(
      BOOKS.some((b) => b.incomeStatements.some((c) => c.from.slice(0, 4) !== c.to.slice(0, 4)))
    ).toBe(true);
  });
});

for (const book of BOOKS) {
  /* Buku yang hanya dipakai Arus Kas & Ekuitas (`buku-arus-kas`) tidak punya
     kasus di sini — `describe` kosong adalah galat vitest, bukan kelulusan. */
  if (book.incomeStatements.length + book.balanceSheets.length === 0) continue;

  describe(`${book.name}: Laba Rugi TS = Go`, () => {
    for (const c of book.incomeStatements) {
      it(`${c.case}: angka setara`, async () => {
        const { from, to } = resolvePeriod(c.from, c.to);
        const ts = await getIncomeStatement(from, to, client(book) as never, parseCostCenterFilter(c.costCenter));
        expect(compareIncomeStatement(ts, goNumbers<GoIncomeStatement>(c.case)), "selisih angka").toEqual([]);
      });

      it(`${c.case}: isi lembar sebar setara`, async () => {
        const params = { from: c.from, to: c.to, ...(c.costCenter ? { costCenter: c.costCenter } : {}) };
        const payload = await buildReportPayload(INCOME as never, params, client(book) as never);
        const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
        const beda = await compareWorkbookContent(new Uint8Array(ts), goSheet(c.case));
        expect(beda, "selisih isi TS ⇄ Go").toEqual([]);
      });
    }
  });

  describe(`${book.name}: Neraca TS = Go`, () => {
    for (const c of book.balanceSheets) {
      it(`${c.case}: angka setara`, async () => {
        const ts = await getBalanceSheet(resolveAsOf(c.asOf).asOf, client(book) as never);
        expect(compareBalanceSheet(ts, goNumbers<GoBalanceSheet>(c.case)), "selisih angka").toEqual([]);
      });

      it(`${c.case}: isi lembar sebar setara`, async () => {
        const payload = await buildReportPayload(BALANCE as never, { asOf: c.asOf }, client(book) as never);
        const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
        const beda = await compareWorkbookContent(new Uint8Array(ts), goSheet(c.case));
        expect(beda, "selisih isi TS ⇄ Go").toEqual([]);
      });
    }
  });
}

/** Instan yang sama? Go menulis RFC3339 tanpa milidetik nol, JS selalu `.000Z`. */
const sameInstant = (a: string | Date | undefined, b: string) =>
  a !== undefined && new Date(a).getTime() === new Date(b).getTime();

for (const book of BOOKS) {
  const ic = book.incomeComparisons ?? [];
  const bc = book.balanceComparisons ?? [];
  if (ic.length + bc.length === 0) continue;

  describe(`${book.name}: kolom pembanding TS = Go (#557)`, () => {
    for (const c of ic) {
      const compare = parseComparison(c.compare)!;
      const params = {
        from: c.from,
        to: c.to,
        compare: c.compare,
        ...(c.costCenter ? { costCenter: c.costCenter } : {}),
      };

      it(`${c.case}: instan pembanding Go = comparisonRange TS = penerbit Go`, () => {
        const g = goNumbers<GoIncomeComparison>(c.case);
        const { from, to } = resolvePeriod(c.from, c.to);
        const r = comparisonRange(from, to, compare);
        expect(sameInstant(r.from, g.priorFrom), `${r.from.toISOString()} ⇄ ${g.priorFrom}`).toBe(true);
        expect(sameInstant(r.to, g.priorTo), `${r.to.toISOString()} ⇄ ${g.priorTo}`).toBe(true);
        const muatan = goExportPayloadShape(INCOME, params);
        expect(muatan.params.compare).toBe(c.compare);
        expect(sameInstant(muatan.priorFromInstant, g.priorFrom)).toBe(true);
        expect(sameInstant(muatan.priorToInstant, g.priorTo)).toBe(true);
      });

      it(`${c.case}: angka kedua periode setara`, async () => {
        const g = goNumbers<GoIncomeComparison>(c.case);
        const { from, to } = resolvePeriod(c.from, c.to);
        const r = comparisonRange(from, to, compare);
        const cc = parseCostCenterFilter(c.costCenter);
        const cur = await getIncomeStatement(from, to, client(book) as never, cc);
        const pri = await getIncomeStatement(r.from, r.to, client(book) as never, cc);
        expect(compareIncomeStatement(cur, g.current), "berjalan").toEqual([]);
        expect(compareIncomeStatement(pri, g.prior), "pembanding").toEqual([]);
      });

      it(`${c.case}: isi lembar sebar setara — jalur berkas DAN jalur sinkron`, async () => {
        const payload = await buildReportPayload(INCOME as never, params, client(book) as never);
        expect(payload.kind === "income-statement" && payload.prior !== undefined, "muatan tanpa pembanding").toBe(true);
        const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
        expect(await compareWorkbookContent(new Uint8Array(ts), goSheet(c.case)), "berkas ⇄ Go").toEqual([]);
        /* Jalur sinkron: muatan yang SAMA melewati skema rute ekspor dulu. */
        const sinkron = statementPayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
        expect(buildReportSheet(sinkron)).toEqual(buildReportSheet(payload));
      });
    }

    for (const c of bc) {
      const compare = parseComparison(c.compare)!;
      const params = { asOf: c.asOf, compare: c.compare };

      it(`${c.case}: tanggal pembanding Go = comparisonDate TS = penerbit Go`, () => {
        const g = goNumbers<GoBalanceComparison>(c.case);
        const prior = comparisonDate(resolveAsOf(c.asOf).asOf, compare);
        expect(sameInstant(prior, g.priorAsOf), `${prior.toISOString()} ⇄ ${g.priorAsOf}`).toBe(true);
        const muatan = goExportPayloadShape(BALANCE, params);
        expect(muatan.params.compare).toBe(c.compare);
        expect(sameInstant(muatan.priorAsOfInstant, g.priorAsOf)).toBe(true);
      });

      it(`${c.case}: angka kedua tanggal setara, termasuk pecahan ekuitas float`, async () => {
        const g = goNumbers<GoBalanceComparison>(c.case);
        const asOf = resolveAsOf(c.asOf).asOf;
        const cur = await getBalanceSheet(asOf, client(book) as never);
        const pri = await getBalanceSheet(comparisonDate(asOf, compare), client(book) as never);
        expect(compareBalanceSheet(cur, g.current), "berjalan").toEqual([]);
        expect(compareBalanceSheet(pri, g.prior), "pembanding").toEqual([]);
        expect(g.prior.equitySplitJS, "berkas emas tanpa equitySplitJS").toBeDefined();
      });

      it(`${c.case}: isi lembar sebar setara — jalur berkas DAN jalur sinkron`, async () => {
        const payload = await buildReportPayload(BALANCE as never, params, client(book) as never);
        expect(payload.kind === "balance-sheet" && payload.prior !== undefined, "muatan tanpa pembanding").toBe(true);
        const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
        expect(await compareWorkbookContent(new Uint8Array(ts), goSheet(c.case)), "berkas ⇄ Go").toEqual([]);
        const sinkron = statementPayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
        expect(buildReportSheet(sinkron)).toEqual(buildReportSheet(payload));
      });
    }
  });
}

describe("kolom pembanding: jebakan yang DISALIN tertangkap fixture", () => {
  it("buku-banding: tahun lalu ditutup, sen nol, tetapi float TS memecah ekuitas pembanding", async () => {
    const book = BOOKS.find((b) => b.name === "buku-banding")!;
    const bs = await getBalanceSheet(resolveAsOf("2026-03-31").asOf, client(book) as never);
    expect(Math.round(bs.priorUnclosedIncome * 100)).toBe(0);
    expect(bs.priorUnclosedIncome).not.toBe(0);
    expect(goNumbers<GoBalanceSheet>("neraca-banding-2026-03-31").equitySplitJS).toBe(true);
  });

  it("muatan Neraca: pembanding membawa pecahan #555, berjalan tidak", async () => {
    const april = BOOKS.find((b) => b.name === "buku-tahun-buku-april")!;
    const payload = await buildReportPayload(
      BALANCE as never,
      { asOf: "2026-06-30", compare: "previous_year" },
      client(april) as never
    );
    if (payload.kind !== "balance-sheet") throw new Error(payload.kind);
    expect("priorUnclosedIncome" in payload).toBe(false);
    expect(payload.prior?.priorUnclosedIncome).toBe(-30_000_000);
  });

  it("compare yang tak dikenal diabaikan — satu kolom, seperti halaman", async () => {
    const book = BOOKS.find((b) => b.name === "buku-dagang")!;
    const payload = await buildReportPayload(
      INCOME as never,
      { from: "2026-01-01", to: "2026-06-30", compare: "bulan_lalu" },
      client(book) as never
    );
    expect("prior" in payload).toBe(false);
    expect(goExportPayloadShape(INCOME, { from: "2026-01-01", to: "2026-06-30", compare: "x" }).params).not.toHaveProperty("compare");
  });
});

describe("pembanding MELIHAT selisih — bukan selalu hijau", () => {
  const book = BOOKS.find((b) => b.name === "buku-dagang")!;

  it("Laba Rugi: satu sen di satu baris HPP", async () => {
    const c = book.incomeStatements.find((x) => x.case === "laba-rugi-dagang-ytd-2026")!;
    const { from, to } = resolvePeriod(c.from, c.to);
    const ts = await getIncomeStatement(from, to, client(book) as never);
    ts.cogs.lines[0]!.amount += 0.01;
    const beda = compareIncomeStatement(ts, goNumbers<GoIncomeStatement>(c.case));
    expect(beda.join("\n")).toMatch(/HPP 5101/);
  });

  it("Neraca: pecahan laba tahun berjalan", async () => {
    const april = BOOKS.find((b) => b.name === "buku-tahun-buku-april")!;
    const ts = await getBalanceSheet(resolveAsOf("2025-06-30").asOf, client(april) as never);
    expect(ts.priorUnclosedIncome).toBe(-30_000_000);
    const beda = compareBalanceSheet(
      { ...ts, currentYearIncome: ts.netIncome, priorUnclosedIncome: 0 },
      goNumbers<GoBalanceSheet>("neraca-april-2025-06-30")
    );
    expect(beda.join("\n")).toMatch(/laba tahun berjalan/);
  });

  it("Lembar sebar: Neraca tanpa pecahan, sama seperti muatan ekspor TS", async () => {
    /* Muatan ekspor TS TIDAK membawa `priorUnclosedIncome`, jadi berkasnya
       satu baris "Akumulasi Laba/Rugi" — Go meniru itu. Bila suatu hari muatan
       ekspor membawanya, berkas TS berubah dan perbandingan ini MERAH. */
    const april = BOOKS.find((b) => b.name === "buku-tahun-buku-april")!;
    const payload = await buildReportPayload(BALANCE as never, { asOf: "2025-06-30" }, client(april) as never);
    expect(payload.kind).toBe("balance-sheet");
    expect("priorUnclosedIncome" in payload).toBe(false);
  });
});
