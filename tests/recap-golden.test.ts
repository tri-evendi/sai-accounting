/**
 * PARITAS Rekap per Pihak, Laporan Kas & Bank, dan Realisasi vs Anggaran,
 * TS ⇄ Go — ANGKA dan ISI LEMBAR SEBAR — di gerbang yang tak pernah dilewati
 * (`bun run verify`), tanpa toolchain Go (tahap 1d, gelombang A, 23 Okt 2026).
 *
 * Keempatnya `engine: "go-parity"` (`src/lib/report-engine.ts`). Pola yang sama
 * dengan `tests/cash-flow-equity-golden.test.ts`:
 *
 *   • Go menulis berkas emas angka (`go test ./internal/ledgerread -update`,
 *     `recap_test.go`) dan lembar sebarnya (`go test ./internal/document
 *     -update`) dari fixture `ledgerread/testdata/recap_books.json` (anggaran
 *     memakai jurnal `statement_books.json`; Kas & Bank memakai kasus Arus
 *     Kas-nya);
 *   • sisi ini menjalankan pembaca TS atas klien palsu berisi fixture yang SAMA
 *     dan membandingkannya memakai pembanding paritas PRODUKSI
 *     (`src/lib/recap-parity.ts`), lalu merakit lembarnya lewat jalur berkas TS
 *     (`buildReportPayload` → `buildReportSheet` → ExcelJS) dan membandingkan
 *     ISI-nya dengan berkas emas Go;
 *   • instan periode yang ditulis Go = muatan penerbit Go
 *     (`goExportPayloadShape`, termasuk `period_month` anggaran).
 *
 * Tepian fixture: valas ber-`base_amount`, valas berkurs tanpa base, valas
 * TANPA kurs dan berkurs 0 (tanpa nilai IDR), mata uang kosong (= IDR),
 * faktur & retur dibatalkan, transaksi `payment` (bukan pembelian), retur
 * pembelian tanpa pemasok (jatuh ke pemasok pembelian asal), faktur tanpa
 * pelanggan, dokumen tepat di batas hari Jakarta di kedua sisi, retur melebihi
 * penjualan (bersih negatif), seri bersih (urut nama), periode kosong;
 * anggaran: akun neraca & tipe asing diabaikan, anggaran nol, satu akun di
 * beberapa bulan (dijumlah setahun), realisasi nol, jurnal di batas bulan
 * Jakarta, setahun penuh,
 * jurnal penutup dikecualikan, target penjualan (pendapatan lain-lain
 * dikecualikan), tahun tanpa anggaran, buku tanpa jurnal.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getCashFlow } from "@/lib/reports";
import { getPurchasesBySupplier, getSalesByCustomer } from "@/lib/party-recap";
import { getBudgetReport, getSalesTargetRealization } from "@/lib/budget-report";
import { DEFAULT_VARIANCE_THRESHOLD_PCT } from "@/lib/budget";
import { isExportable, reportById, resolvePeriod } from "@/lib/report-catalog";
import { goExportPayloadShape } from "@/lib/report-export-go";
import { buildReportPayload, cashBankPayload } from "@/lib/report-payload";
import { buildReportSheet } from "@/lib/report-export";
import { buildWorkbookBuffer } from "@/lib/xlsx";
import { compareWorkbookContent } from "@/lib/xlsx-content-parity";
import { statementPayloadSchema } from "@/lib/validations/report-export";
import {
  compareBudget,
  compareCashBank,
  comparePartyRecap,
  type GoBudgetRealization,
  type GoCashBank,
  type GoPartyRecap,
} from "@/lib/recap-parity";
import { AKAR_REPO } from "./akar-sumber";
import { BOOKS, client, goNumbers, goSheet } from "./statement-books";

const def = (id: string) => {
  const r = reportById(id as never);
  if (!r || !isExportable(r)) throw new Error(`${id} tak dapat diekspor?`);
  return r;
};
const CASH_BANK = def("cash-bank");
const BUDGET = def("budget-realization");

/** Instan yang sama? Go menulis RFC3339 tanpa milidetik nol, JS selalu `.000Z`. */
const sameInstant = (a: string | Date | undefined, b: string | null) =>
  a !== undefined && b !== null && new Date(a).getTime() === new Date(b).getTime();

/* Varian `?cols=` Kas & Bank — sama dengan `cashBankColsCase` di
   `internal/document/recap_test.go`. */
const CASH_BANK_COLS = { case: "arus-kas-q1-2026", cols: "closing" };

type Money = { currency: string; rate?: string | null; baseAmount?: string | null };
interface RecapFixture {
  budgets: {
    book: string;
    budgets: { accountId: number; year: number; month: number; amount: string }[];
    salesTargets: { year: number; month: number; amount: string }[];
    cases: { case: string; year: number; month: number }[];
  }[];
  partyRecaps: {
    name: string;
    companyName: string;
    customers: { id: number; name: string }[];
    suppliers: { id: number; name: string }[];
    invoices: (Money & {
      id: number;
      date: string;
      status: string;
      customerId: number | null;
      taxAmount: string;
      items: { quantity: string; price: string }[];
    })[];
    salesReturns: (Money & { id: number; date: string; status: string; customerId: number | null; subtotal: string; taxAmount: string })[];
    purchases: (Money & { id: number; date: string; type: string; supplierId: number; amount: string; taxAmount: string })[];
    purchaseReturns: (Money & {
      id: number;
      date: string;
      status: string;
      purchaseId: number;
      supplierId: number | null;
      subtotal: string;
      taxAmount: string;
    })[];
    cases: { case: string; kind: "sales-by-customer" | "purchases-by-supplier"; from: string; to: string; cols?: string }[];
  }[];
}

const FIXTURE = JSON.parse(
  readFileSync(join(AKAR_REPO, "services", "integrator", "internal", "ledgerread", "testdata", "recap_books.json"), "utf8")
) as RecapFixture;

type DateWhere = { gte?: Date; lte?: Date };
const inRange = (d: string, w?: DateWhere) => {
  const t = new Date(d).getTime();
  return (!w?.gte || t >= w.gte.getTime()) && (!w?.lte || t <= w.lte.getTime());
};
const notStatus = (s: string, w?: { not?: string }) => w?.not === undefined || s !== w.not;
const money = (m: Money) => ({ currency: m.currency, rate: m.rate ?? null, baseAmount: m.baseAmount ?? null });

/** Klien palsu dokumen sumber rekap pihak — hanya irisan yang dibaca `party-recap.ts`. */
function partyClient(fx: RecapFixture["partyRecaps"][number]) {
  const customer = (id: number | null) => (id == null ? null : fx.customers.find((c) => c.id === id) ?? null);
  const supplier = (id: number | null) => (id == null ? null : fx.suppliers.find((s) => s.id === id) ?? null);
  type W = { where: { date?: DateWhere; status?: { not?: string }; type?: string } };
  return {
    invoice: {
      findMany: async ({ where }: W) =>
        fx.invoices
          .filter((i) => inRange(i.date, where.date) && notStatus(i.status, where.status))
          .map((i) => ({ ...money(i), customerId: i.customerId, taxAmount: i.taxAmount, items: i.items, customer: customer(i.customerId) })),
    },
    salesReturn: {
      findMany: async ({ where }: W) =>
        fx.salesReturns
          .filter((r) => inRange(r.date, where.date) && notStatus(r.status, where.status))
          .map((r) => ({ ...money(r), customerId: r.customerId, subtotal: r.subtotal, taxAmount: r.taxAmount, customer: customer(r.customerId) })),
    },
    supplierTransaction: {
      findMany: async ({ where }: W) =>
        fx.purchases
          .filter((p) => inRange(p.date, where.date) && (where.type === undefined || p.type === where.type))
          .map((p) => ({ ...money(p), supplierId: p.supplierId, amount: p.amount, taxAmount: p.taxAmount, supplier: supplier(p.supplierId)! })),
    },
    purchaseReturn: {
      findMany: async ({ where }: W) =>
        fx.purchaseReturns
          .filter((r) => inRange(r.date, where.date) && notStatus(r.status, where.status))
          .map((r) => {
            const origin = fx.purchases.find((p) => p.id === r.purchaseId)!;
            return {
              ...money(r),
              supplierId: r.supplierId,
              subtotal: r.subtotal,
              taxAmount: r.taxAmount,
              supplier: supplier(r.supplierId),
              purchase: { supplierId: origin.supplierId, supplier: { name: supplier(origin.supplierId)!.name } },
            };
          }),
    },
  } as never;
}

/** Klien buku fixture + baris anggaran & target — irisan yang dibaca `budget-report.ts`. */
function budgetClient(fx: RecapFixture["budgets"][number]) {
  const book = BOOKS.find((b) => b.name === fx.book)!;
  const base = client(book) as unknown as Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>;
  const periodFilter = (w: { year: number; month?: number }) => (r: { year: number; month: number }) =>
    r.year === w.year && (w.month === undefined || r.month === w.month);
  const accounts = base.account!.findMany!.bind(base.account);
  return {
    ...base,
    account: {
      ...base.account,
      findMany: async (args: { where?: { id?: { in: number[] }; type?: string } } = {}) => {
        const ids = args.where?.id?.in;
        const rows = (await accounts({ where: { type: args.where?.type } })) as { id: number }[];
        return ids ? rows.filter((a) => ids.includes(a.id)) : rows;
      },
    },
    budget: {
      findMany: async ({ where }: { where: { year: number; month?: number } }) =>
        fx.budgets.filter(periodFilter(where)).map((b, i) => ({ id: i + 1, ...b })),
    },
    salesTarget: {
      findMany: async ({ where }: { where: { year: number; month?: number } }) =>
        fx.salesTargets.filter(periodFilter(where)).map((t, i) => ({ id: i + 1, ...t })),
    },
  } as never;
}

describe("fixture rekap memuat tepian yang dijanjikan", () => {
  it("setiap jenis punya kasus", () => {
    expect(FIXTURE.budgets.flatMap((b) => b.cases).length).toBeGreaterThanOrEqual(8);
    const kinds = FIXTURE.partyRecaps.flatMap((p) => p.cases.map((c) => c.kind));
    expect(kinds).toContain("sales-by-customer");
    expect(kinds).toContain("purchases-by-supplier");
    expect(BOOKS.flatMap((b) => b.cashFlows ?? []).map((c) => c.case)).toContain(CASH_BANK_COLS.case);
  });
});

for (const fx of FIXTURE.partyRecaps) {
  describe(`${fx.name}: Rekap per Pihak TS = Go`, () => {
    for (const c of fx.cases) {
      const DEF = def(c.kind);
      it(`${c.case}: angka setara, instan = penerbit Go`, async () => {
        const g = goNumbers<GoPartyRecap>(c.case);
        const { from, to } = resolvePeriod(c.from, c.to);
        const muatan = goExportPayloadShape(DEF, { from: c.from, to: c.to, ...(c.cols ? { cols: c.cols } : {}) });
        expect(sameInstant(muatan.fromInstant, g.from) && sameInstant(muatan.toInstant, g.to), "instan periode").toBe(true);
        expect(muatan.params.cols).toBe(c.cols);
        const ts =
          c.kind === "sales-by-customer"
            ? await getSalesByCustomer(from, to, partyClient(fx))
            : await getPurchasesBySupplier(from, to, partyClient(fx));
        expect(comparePartyRecap(ts, g), "selisih angka").toEqual([]);
      });

      it(`${c.case}: isi lembar sebar setara — jalur berkas DAN jalur sinkron`, async () => {
        const params = { from: c.from, to: c.to, ...(c.cols ? { cols: c.cols } : {}) };
        const payload = await buildReportPayload(DEF, params, partyClient(fx));
        const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: fx.companyName });
        expect(await compareWorkbookContent(new Uint8Array(ts), goSheet(c.case)), "berkas ⇄ Go").toEqual([]);
        const sinkron = statementPayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
        expect(buildReportSheet(sinkron)).toEqual(buildReportSheet(payload));
      });
    }
  });
}

for (const book of BOOKS) {
  const flows = book.cashFlows ?? [];
  if (flows.length === 0) continue;
  describe(`${book.name}: Laporan Kas & Bank TS = Go`, () => {
    for (const c of flows) {
      it(`${c.case}: angka setara`, async () => {
        const g = goNumbers<GoCashBank>(`kas-bank-${c.case}`);
        const { from, to } = resolvePeriod(c.from, c.to);
        const ts = cashBankPayload(CASH_BANK, from, to, await getCashFlow(from, to, client(book) as never));
        expect(compareCashBank(ts, g), "selisih angka").toEqual([]);
        const muatan = goExportPayloadShape(CASH_BANK, { from: c.from, to: c.to });
        expect(sameInstant(muatan.fromInstant, g.from) && sameInstant(muatan.toInstant, g.to)).toBe(true);
      });

      const variants = c.case === CASH_BANK_COLS.case ? ["", CASH_BANK_COLS.cols] : [""];
      for (const cols of variants) {
        it(`${c.case}: isi lembar sebar setara (kolom ${cols || "bawaan"})`, async () => {
          const payload = await buildReportPayload(
            CASH_BANK,
            { from: c.from, to: c.to, ...(cols ? { cols } : {}) },
            client(book) as never
          );
          const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
          const name = `kas-bank-${c.case}${cols ? `-kolom-${cols}` : ""}`;
          expect(await compareWorkbookContent(new Uint8Array(ts), goSheet(name)), "berkas ⇄ Go").toEqual([]);
        });
      }
    }
  });
}

for (const fx of FIXTURE.budgets) {
  const book = BOOKS.find((b) => b.name === fx.book)!;
  describe(`${fx.book}: Realisasi vs Anggaran TS = Go`, () => {
    for (const c of fx.cases) {
      const params = { year: String(c.year), month: String(c.month) };
      it(`${c.case}: angka setara, muatan penerbit = instan Go`, async () => {
        const g = goNumbers<GoBudgetRealization>(c.case);
        const month = c.month === 0 ? undefined : c.month;
        const db = budgetClient(fx);
        const { report } = await getBudgetReport(c.year, month, DEFAULT_VARIANCE_THRESHOLD_PCT, db);
        const sales = await getSalesTargetRealization(c.year, month, DEFAULT_VARIANCE_THRESHOLD_PCT, db);
        expect(compareBudget({ report, sales }, g), "selisih angka").toEqual([]);
        const muatan = goExportPayloadShape(BUDGET, params);
        expect(muatan.params).toEqual(params);
        expect(sameInstant(muatan.fromInstant, g.from) && sameInstant(muatan.toInstant, g.to), "instan").toBe(true);
      });

      it(`${c.case}: isi lembar sebar setara — jalur berkas DAN jalur sinkron`, async () => {
        const payload = await buildReportPayload(BUDGET, params, budgetClient(fx));
        const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
        expect(await compareWorkbookContent(new Uint8Array(ts), goSheet(c.case)), "berkas ⇄ Go").toEqual([]);
        const sinkron = statementPayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
        expect(buildReportSheet(sinkron)).toEqual(buildReportSheet(payload));
      });
    }
  });
}

describe("pembanding rekap MELIHAT selisih — bukan selalu hijau", () => {
  const fx = FIXTURE.partyRecaps[0]!;
  const { from, to } = resolvePeriod("2026-01-01", "2026-01-31");

  it("satu sen di bersih satu pihak, dan urutan", async () => {
    const ts = await getSalesByCustomer(from, to, partyClient(fx));
    const g = goNumbers<GoPartyRecap>("rekap-penjualan-januari");
    ts.rows[0]!.netBase += 0.01;
    expect(comparePartyRecap(ts, g).join("\n")).toMatch(/netBase/);
    const dibalik = { ...ts, rows: [...ts.rows].reverse() };
    expect(comparePartyRecap(dibalik, g).join("\n")).toMatch(/urutan/);
  });

  it("persen selisih anggaran dibandingkan PERSIS", async () => {
    const b = FIXTURE.budgets[0]!;
    const db = budgetClient(b);
    const { report } = await getBudgetReport(2026, undefined, DEFAULT_VARIANCE_THRESHOLD_PCT, db);
    const sales = await getSalesTargetRealization(2026, undefined, DEFAULT_VARIANCE_THRESHOLD_PCT, db);
    const i = report.rows.findIndex((r) => r.variancePct !== null && r.variancePct !== 0);
    report.rows[i] = { ...report.rows[i]!, variancePct: report.rows[i]!.variancePct! + 0.01 };
    expect(compareBudget({ report, sales }, goNumbers("anggaran-dagang-2026")).join("\n")).toMatch(/persen/);
  });

  it("lembar Kas & Bank yang berbeda satu sen TERTANGKAP pembanding isi", async () => {
    const book = BOOKS.find((b) => b.name === "buku-arus-kas")!;
    const payload = await buildReportPayload(CASH_BANK, { from: "2026-01-01", to: "2026-03-31" }, client(book) as never);
    if (payload.kind !== "cash-bank") throw new Error(payload.kind);
    payload.closingCash += 0.01;
    const ts = await buildWorkbookBuffer([buildReportSheet(payload)], { name: book.companyName });
    expect((await compareWorkbookContent(new Uint8Array(ts), goSheet("kas-bank-arus-kas-q1-2026"))).length).toBeGreaterThan(0);
  });
});
