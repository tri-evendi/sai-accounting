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
 * ⚠ ZONA PROSES DIPAKU ke Asia/Jakarta di berkas ini: `fiscalYearBounds()` TS
 * memakai zona PROSES (produksi `TZ=Asia/Jakarta`), sementara host pengembang
 * Asia/Shanghai dan CI UTC. Buku "tahun buku April" sengaja punya jurnal
 * 31 Maret 17.30 UTC (= 1 April WIB) — di UTC tes ini MERAH, dan memang harus.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import idDictionary from "@sai/core/i18n/dictionaries/id.json";

vi.mock("@sai/platform/i18n/server", async (importOriginal) => {
  const asli = await importOriginal<typeof import("@sai/platform/i18n/server")>();
  /* Pekerja tidak punya permintaan HTTP; lembar sebar berbahasa DOKUMEN CETAK
     (id, #278). Kamus id dibaca langsung — kunci yang hilang MELEMPAR. */
  const t = (key: string) => {
    const v = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], idDictionary);
    if (typeof v !== "string") throw new Error(`kunci kamus ${key} tidak ada`);
    return v;
  };
  return { ...asli, getT: async () => t };
});

import { getBalanceSheet, getIncomeStatement } from "@/lib/reports";
import { isExportable, reportById, resolveAsOf, resolvePeriod } from "@/lib/report-catalog";
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
import { createFakeReportClient } from "./fake-client";
import { AKAR_REPO } from "./akar-sumber";

const GO = join(AKAR_REPO, "services", "integrator", "internal");
const NUMBERS = join(GO, "ledgerread", "testdata");
const SHEETS = join(GO, "document", "testdata");

interface Line {
  accountId: number;
  debit?: string;
  credit?: string;
  currency?: string;
  rate?: string;
  baseDebit?: string;
  baseCredit?: string;
  costCenterId?: number | null;
}

interface Book {
  name: string;
  companyName: string;
  fiscalYearStart: string | null;
  costCenters: { id: number; code: string; name: string; isActive?: boolean }[];
  accounts: { id: number; code: string; name: string; type: string }[];
  journals: { date: string; type?: string; lines: Line[] }[];
  incomeStatements: { case: string; from: string; to: string; costCenter?: string }[];
  balanceSheets: { case: string; asOf: string }[];
}

const BOOKS = JSON.parse(readFileSync(join(NUMBERS, "statement_books.json"), "utf8")) as Book[];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Klien palsu satu buku. `groupBy` dibulatkan ke sen: `SUM` NUMERIC di
 * PostgreSQL TEPAT, sedangkan penjumlah palsu menjumlahkan float — tanpa ini
 * akun "bergerak lalu nol" bisa tersisa 1e-12 dan tampil di TS, yaitu temuan
 * tentang klien palsu, bukan tentang laporan.
 */
function client(book: Book) {
  const fake = createFakeReportClient({
    accounts: book.accounts,
    fiscalYearStart: book.fiscalYearStart ? new Date(book.fiscalYearStart) : undefined,
    costCenters: book.costCenters,
    journals: book.journals.map((j) => ({
      date: new Date(j.date),
      type: j.type,
      lines: j.lines.map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
        currency: l.currency,
        rate: l.rate === undefined ? undefined : Number(l.rate),
        /* Aturan yang SAMA dengan `base()` di statements_test.go. */
        baseDebit: Number(l.baseDebit ?? l.debit ?? 0),
        baseCredit: Number(l.baseCredit ?? l.credit ?? 0),
        costCenterId: l.costCenterId ?? null,
      })),
    })),
  });
  const groupBy = fake.journalLine.groupBy.bind(fake.journalLine) as unknown as (
    args: unknown
  ) => Promise<{ accountId: number; _sum: { baseDebit: number; baseCredit: number } }[]>;
  (fake.journalLine as unknown as { groupBy: unknown }).groupBy = async (args: unknown) =>
    (await groupBy(args)).map((g) => ({
      accountId: g.accountId,
      _sum: { baseDebit: round2(g._sum.baseDebit), baseCredit: round2(g._sum.baseCredit) },
    }));
  return fake;
}

const goNumbers = <T>(name: string): T =>
  JSON.parse(readFileSync(join(NUMBERS, `${name}.golden.json`), "utf8")) as T;
const goSheet = (name: string) => new Uint8Array(readFileSync(join(SHEETS, `${name}.golden.xlsx`)));

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
