/**
 * Arus Kas (issue #18).
 *
 * Two things are worth testing here and they are different in kind:
 *
 *  1. The **categorisation rule** — a policy decision (which counter-account type
 *     means operating / investing / financing). Tested by example, one journal
 *     shape per category, plus the guarantee that no *known* account type ever
 *     falls into the visible "uncategorised" bucket by accident.
 *
 *  2. The **reconciliation invariant** — not a policy but an accounting identity:
 *     the net cash flow reported for a period must equal the change in the cash
 *     accounts' balances across that same period. This is issue #18's acceptance
 *     criterion "semua angka konsisten dengan Buku Besar", and it is checked here
 *     against `getTrialBalance` and `getAccountLedger` rather than against
 *     getCashFlow's own arithmetic — a report that only agrees with itself proves
 *     nothing.
 */
import { describe, it, expect } from "vitest";
import { createFakeReportClient, type FakeSeedJournal } from "./fake-client";
import { getCashFlow, cashFlowCategoryFor, getTrialBalance } from "@/lib/reports";
import { getAccountLedger } from "@/lib/ledger";
import { ACCOUNT_TYPES } from "@/lib/accounting";

// ─── A small but realistic chart of accounts ────────────────────────────────

const KAS = 1;
const BANK = 2;
const PIUTANG = 3;
const PERSEDIAAN = 4;
const PERALATAN = 5;
const HUTANG_USAHA = 6;
const HUTANG_BANK = 7;
const MODAL = 8;
const PENJUALAN = 9;
const BEBAN_GAJI = 10;
const AKUN_ASING = 11;

const ACCOUNTS = [
  { id: KAS, code: "1101", name: "Kas", type: "cash_bank", normalBalance: "debit" },
  { id: BANK, code: "1102", name: "Bank BCA", type: "cash_bank", normalBalance: "debit" },
  { id: PIUTANG, code: "1201", name: "Piutang Usaha", type: "account_receivable", normalBalance: "debit" },
  { id: PERSEDIAAN, code: "1301", name: "Persediaan", type: "inventory", normalBalance: "debit" },
  { id: PERALATAN, code: "1501", name: "Peralatan", type: "fixed_asset", normalBalance: "debit" },
  { id: HUTANG_USAHA, code: "2101", name: "Hutang Usaha", type: "account_payable", normalBalance: "credit" },
  { id: HUTANG_BANK, code: "2201", name: "Hutang Bank", type: "long_term_liability", normalBalance: "credit" },
  { id: MODAL, code: "3101", name: "Modal Pemilik", type: "equity", normalBalance: "credit" },
  { id: PENJUALAN, code: "4101", name: "Penjualan", type: "revenue", normalBalance: "credit" },
  { id: BEBAN_GAJI, code: "6101", name: "Beban Gaji", type: "expense", normalBalance: "debit" },
  // Deliberately not a member of ACCOUNT_TYPES — stands in for a type added to
  // the COA later without anyone updating the cash-flow map.
  { id: AKUN_ASING, code: "9999", name: "Akun Tak Dikenal", type: "mystery_type", normalBalance: "debit" },
];

const D = (s: string) => new Date(`${s}T10:00:00`);
const client = (journals: FakeSeedJournal[]) =>
  createFakeReportClient({ accounts: ACCOUNTS, journals });

/** Pull one category group out of the report. */
const group = (r: Awaited<ReturnType<typeof getCashFlow>>, c: string) =>
  r.groups.find((g) => g.category === c)!;

// ─── 1. The categorisation rule ─────────────────────────────────────────────

describe("cashFlowCategoryFor — the categorisation rule", () => {
  it("files trading-cycle accounts under operating", () => {
    for (const t of ["revenue", "other_income", "cogs", "expense", "other_expense"]) {
      expect(cashFlowCategoryFor(t)).toBe("operating");
    }
  });

  it("files working capital under operating — it is the timing of the trading cycle", () => {
    for (const t of [
      "account_receivable",
      "account_payable",
      "inventory",
      "tax_payable",
      "other_current_asset",
      "other_current_liability",
    ]) {
      expect(cashFlowCategoryFor(t)).toBe("operating");
    }
  });

  it("files non-current assets under investing", () => {
    for (const t of ["fixed_asset", "accumulated_depreciation", "other_asset"]) {
      expect(cashFlowCategoryFor(t)).toBe("investing");
    }
  });

  it("files funding sources under financing", () => {
    for (const t of ["equity", "long_term_liability"]) {
      expect(cashFlowCategoryFor(t)).toBe("financing");
    }
  });

  it("sends an unknown type to uncategorised, never to operating", () => {
    expect(cashFlowCategoryFor("mystery_type")).toBe("uncategorised");
    expect(cashFlowCategoryFor("")).toBe("uncategorised");
  });

  it("categorises every account type the COA actually defines", () => {
    // cash_bank is the boundary itself, never a counter-account category.
    const counterTypes = ACCOUNT_TYPES.map((t) => t.value).filter((v) => v !== "cash_bank");
    const missed = counterTypes.filter((t) => cashFlowCategoryFor(t) === "uncategorised");
    expect(missed).toEqual([]);
  });
});

// ─── 2. Turning journals into cash flow ─────────────────────────────────────

describe("getCashFlow — classifying real journals", () => {
  it("reports a cash sale as an operating inflow", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-10"), lines: [
          { accountId: KAS, debit: 5_000_000 },
          { accountId: PENJUALAN, credit: 5_000_000 },
        ] },
      ])
    );

    const op = group(r, "operating");
    expect(op.inflow).toBe(5_000_000);
    expect(op.outflow).toBe(0);
    expect(op.lines).toHaveLength(1);
    expect(op.lines[0]).toMatchObject({ code: "4101", inflow: 5_000_000, net: 5_000_000 });
    expect(r.netChange).toBe(5_000_000);
  });

  it("reports collecting a receivable as operating, not as no-flow", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-12"), lines: [
          { accountId: BANK, debit: 3_000_000 },
          { accountId: PIUTANG, credit: 3_000_000 },
        ] },
      ])
    );
    expect(group(r, "operating").inflow).toBe(3_000_000);
    expect(group(r, "operating").lines[0].code).toBe("1201");
  });

  it("reports paying salaries as an operating outflow", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-25"), lines: [
          { accountId: BEBAN_GAJI, debit: 1_200_000 },
          { accountId: KAS, credit: 1_200_000 },
        ] },
      ])
    );
    const op = group(r, "operating");
    expect(op.outflow).toBe(1_200_000);
    expect(op.inflow).toBe(0);
    expect(op.net).toBe(-1_200_000);
    expect(r.netChange).toBe(-1_200_000);
  });

  it("reports buying equipment as an investing outflow", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-05"), lines: [
          { accountId: PERALATAN, debit: 20_000_000 },
          { accountId: BANK, credit: 20_000_000 },
        ] },
      ])
    );
    expect(group(r, "investing").outflow).toBe(20_000_000);
    expect(group(r, "operating").net).toBe(0);
  });

  it("reports owner capital and a long-term loan as financing inflows", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-02"), lines: [
          { accountId: BANK, debit: 100_000_000 },
          { accountId: MODAL, credit: 100_000_000 },
        ] },
        { date: D("2026-01-03"), lines: [
          { accountId: BANK, debit: 50_000_000 },
          { accountId: HUTANG_BANK, credit: 50_000_000 },
        ] },
      ])
    );
    const fin = group(r, "financing");
    expect(fin.inflow).toBe(150_000_000);
    expect(fin.lines.map((l) => l.code)).toEqual(["2201", "3101"]); // code order
  });

  it("treats a transfer between two cash accounts as no cash flow at all", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-15"), lines: [
          { accountId: KAS, debit: 2_000_000 },
          { accountId: BANK, credit: 2_000_000 },
        ] },
      ])
    );
    expect(r.totalInflow).toBe(0);
    expect(r.totalOutflow).toBe(0);
    expect(r.netChange).toBe(0);
    expect(r.groups.every((g) => g.lines.length === 0)).toBe(true);
  });

  it("still reports the fee when a cash-to-cash transfer costs something", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-15"), lines: [
          { accountId: KAS, debit: 2_000_000 },
          { accountId: BEBAN_GAJI, debit: 6_500 }, // stands in for a bank charge
          { accountId: BANK, credit: 2_006_500 },
        ] },
      ])
    );
    expect(r.netChange).toBe(-6_500);
    expect(group(r, "operating").outflow).toBe(6_500);
  });

  it("splits one journal across categories using each counter-line's own amount", async () => {
    // One bank payment settling a supplier bill and buying equipment at once.
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-20"), lines: [
          { accountId: HUTANG_USAHA, debit: 4_000_000 },
          { accountId: PERALATAN, debit: 6_000_000 },
          { accountId: BANK, credit: 10_000_000 },
        ] },
      ])
    );
    expect(group(r, "operating").outflow).toBe(4_000_000);
    expect(group(r, "investing").outflow).toBe(6_000_000);
    expect(r.totalOutflow).toBe(10_000_000);
    expect(r.netChange).toBe(-10_000_000);
  });

  it("surfaces an unknown counter-account type instead of hiding it in operating", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-18"), lines: [
          { accountId: AKUN_ASING, debit: 750_000 },
          { accountId: KAS, credit: 750_000 },
        ] },
      ])
    );
    const unc = group(r, "uncategorised");
    expect(unc.outflow).toBe(750_000);
    expect(unc.lines[0]).toMatchObject({ code: "9999", name: "Akun Tak Dikenal" });
    // The whole point: it is NOT quietly counted as operating …
    expect(group(r, "operating").net).toBe(0);
    // … and it is NOT dropped either — the period total still includes it.
    expect(r.netChange).toBe(-750_000);
    expect(r.reconciled).toBe(true);
  });

  it("ignores a journal that moved no cash at all", async () => {
    // A credit sale, a depreciation charge and an accrual are all real journals
    // that never touch cash. If the "did any cash move?" gate were dropped, their
    // counter-lines would be reported as cash flow and the statement would be
    // pure fiction — so this is checked directly, not just via the totals.
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-07"), lines: [
          { accountId: PIUTANG, debit: 9_000_000 },
          { accountId: PENJUALAN, credit: 9_000_000 },
        ] },
        { date: D("2026-01-09"), lines: [
          { accountId: PERSEDIAAN, debit: 1_500_000 },
          { accountId: HUTANG_USAHA, credit: 1_500_000 },
        ] },
      ])
    );
    expect(r.totalInflow).toBe(0);
    expect(r.totalOutflow).toBe(0);
    expect(r.netChange).toBe(0);
    expect(r.groups.flatMap((g) => g.lines)).toEqual([]);
    expect(r.reconciled).toBe(true);
  });

  it("reports only the cash part when a credit sale is partly paid up front", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-13"), lines: [
          { accountId: KAS, debit: 2_000_000 },
          { accountId: PIUTANG, debit: 8_000_000 },
          { accountId: PENJUALAN, credit: 10_000_000 },
        ] },
      ])
    );
    // Cash in is 2m; the receivable is the un-collected remainder, so the two
    // counter-lines net to exactly the cash that moved.
    expect(r.netChange).toBe(2_000_000);
    const op = group(r, "operating");
    expect(op.net).toBe(2_000_000);
    expect(op.lines.find((l) => l.code === "4101")!.inflow).toBe(10_000_000);
    expect(op.lines.find((l) => l.code === "1201")!.outflow).toBe(8_000_000);
  });

  it("ignores journals outside the requested period", async () => {
    const journals: FakeSeedJournal[] = [
      { date: D("2025-12-31"), lines: [
        { accountId: KAS, debit: 1_000_000 },
        { accountId: PENJUALAN, credit: 1_000_000 },
      ] },
      { date: D("2026-01-10"), lines: [
        { accountId: KAS, debit: 7_000_000 },
        { accountId: PENJUALAN, credit: 7_000_000 },
      ] },
      { date: D("2026-02-01"), lines: [
        { accountId: KAS, debit: 9_000_000 },
        { accountId: PENJUALAN, credit: 9_000_000 },
      ] },
    ];
    const r = await getCashFlow(D("2026-01-01"), D("2026-01-31"), client(journals));
    expect(r.netChange).toBe(7_000_000);
    // Opening cash carries the December sale; closing excludes February.
    expect(r.openingCash).toBe(1_000_000);
    expect(r.closingCash).toBe(8_000_000);
    expect(r.reconciled).toBe(true);
  });

  it("returns empty groups and a clean reconciliation when nothing happened", async () => {
    const r = await getCashFlow(D("2026-03-01"), D("2026-03-31"), client([]));
    expect(r.netChange).toBe(0);
    expect(r.cashAccounts).toEqual([]);
    expect(r.reconciled).toBe(true);
    expect(r.groups).toHaveLength(4); // every category is always present
  });
});

// ─── 3. Foreign currency ────────────────────────────────────────────────────

describe("getCashFlow — currency handling", () => {
  it("consolidates in IDR base, never in the line's own currency", async () => {
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-08"), lines: [
          { accountId: BANK, debit: 1_000, currency: "USD", rate: 16_000 },
          { accountId: PENJUALAN, credit: 1_000, currency: "USD", rate: 16_000 },
        ] },
      ])
    );
    expect(r.netChange).toBe(16_000_000); // 1,000 USD × 16,000 — not 1,000
    expect(r.suspectUnrated).toBe(0);
  });

  it("counts a foreign line left at rate = 1 as suspect without dropping it", async () => {
    // Dropping it would put the report at odds with the ledger, which has already
    // booked this base amount. Report the smell; fix it at posting time.
    const r = await getCashFlow(
      D("2026-01-01"),
      D("2026-01-31"),
      client([
        { date: D("2026-01-09"), lines: [
          { accountId: BANK, debit: 500, currency: "USD", rate: 1 },
          { accountId: PENJUALAN, credit: 500, currency: "USD", rate: 1 },
        ] },
      ])
    );
    expect(r.suspectUnrated).toBe(2);
    expect(r.netChange).toBe(500);
    expect(r.reconciled).toBe(true); // still agrees with the books, as it must
  });
});

// ─── 4. The reconciliation invariant ────────────────────────────────────────

/** A month of mixed activity, exercising every category at once. */
const MIXED: FakeSeedJournal[] = [
  // Opening balances, before the reporting period.
  { date: D("2025-12-20"), lines: [
    { accountId: BANK, debit: 40_000_000 },
    { accountId: MODAL, credit: 40_000_000 },
  ] },
  { date: D("2025-12-22"), lines: [
    { accountId: KAS, debit: 2_500_000 },
    { accountId: MODAL, credit: 2_500_000 },
  ] },
  // The period itself.
  // A credit sale and a purchase on account: real journals that move no cash and
  // must therefore contribute nothing to any category, while still landing in the
  // trial balance the invariant is checked against.
  { date: D("2026-01-02"), lines: [
    { accountId: PIUTANG, debit: 15_500_000 },
    { accountId: PENJUALAN, credit: 15_500_000 },
  ] },
  { date: D("2026-01-03"), lines: [
    { accountId: PERSEDIAAN, debit: 7_777_000 },
    { accountId: HUTANG_USAHA, credit: 7_777_000 },
  ] },
  // Dated at the exact instant the period opens. Journal dates arrive from Prisma
  // at midnight, and the pages build `from` as `<date>T00:00:00`, so this row sits
  // precisely on the boundary: it belongs to the period's flows and must NOT also
  // be counted in the opening balance.
  { date: new Date("2026-01-01T00:00:00"), lines: [
    { accountId: KAS, debit: 1_111_000 },
    { accountId: PENJUALAN, credit: 1_111_000 },
  ] },
  { date: D("2026-01-04"), lines: [
    { accountId: KAS, debit: 8_400_000 },
    { accountId: PENJUALAN, credit: 8_400_000 },
  ] },
  { date: D("2026-01-06"), lines: [
    { accountId: PERSEDIAAN, debit: 5_250_000 },
    { accountId: BANK, credit: 5_250_000 },
  ] },
  { date: D("2026-01-11"), lines: [
    { accountId: BANK, debit: 1_000 , currency: "USD", rate: 15_500 },
    { accountId: PIUTANG, credit: 1_000, currency: "USD", rate: 15_500 },
  ] },
  { date: D("2026-01-14"), lines: [
    { accountId: KAS, debit: 3_000_000 },
    { accountId: BANK, credit: 3_000_000 }, // pure transfer — no flow
  ] },
  { date: D("2026-01-17"), lines: [
    { accountId: PERALATAN, debit: 12_000_000 },
    { accountId: BANK, credit: 12_000_000 },
  ] },
  { date: D("2026-01-21"), lines: [
    { accountId: HUTANG_BANK, debit: 2_000_000 },
    { accountId: BANK, credit: 2_000_000 },
  ] },
  { date: D("2026-01-26"), lines: [
    { accountId: BEBAN_GAJI, debit: 4_750_500 },
    { accountId: KAS, credit: 4_750_500 },
  ] },
  { date: D("2026-01-28"), lines: [
    { accountId: AKUN_ASING, debit: 333_333 },
    { accountId: KAS, credit: 333_333 },
  ] },
  // After the period — must not leak in.
  { date: D("2026-02-03"), lines: [
    { accountId: KAS, debit: 6_000_000 },
    { accountId: PENJUALAN, credit: 6_000_000 },
  ] },
];

// The same shape the report pages build: midnight-to-last-millisecond.
const FROM = new Date("2026-01-01T00:00:00");
const TO = new Date("2026-01-31T23:59:59.999");

describe("getCashFlow — reconciles with the ledger (issue #18 acceptance criterion)", () => {
  it("net change in cash equals the change in cash-account balances", async () => {
    const c = client(MIXED);
    const cf = await getCashFlow(FROM, TO, c);

    // The report's own opening/closing come from an aggregate that never looks at
    // the per-journal categorisation walk, so this is a genuine cross-check.
    expect(cf.netChange).toBe(cf.closingCash - cf.openingCash);
    expect(cf.reconciled).toBe(true);
  });

  it("agrees with getAccountLedger, account by account and in total", async () => {
    const c = client(MIXED);
    const cf = await getCashFlow(FROM, TO, c);

    let ledgerOpening = 0;
    let ledgerClosing = 0;
    for (const id of [KAS, BANK]) {
      const led = await getAccountLedger(id, FROM, TO, c);
      expect(led).not.toBeNull();
      ledgerOpening += led!.opening;
      ledgerClosing += led!.closing;

      // Per-account: the cash-flow movement panel must match the Buku Besar.
      const acct = ACCOUNTS.find((a) => a.id === id)!;
      const row = cf.cashAccounts.find((m) => m.code === acct.code)!;
      expect(row.opening).toBeCloseTo(led!.opening, 2);
      expect(row.closing).toBeCloseTo(led!.closing, 2);
      expect(row.net).toBeCloseTo(led!.closing - led!.opening, 2);
    }

    expect(cf.openingCash).toBeCloseTo(ledgerOpening, 2);
    expect(cf.closingCash).toBeCloseTo(ledgerClosing, 2);
    // The headline identity, stated against the ledger rather than against itself.
    expect(cf.netChange).toBeCloseTo(ledgerClosing - ledgerOpening, 2);
  });

  it("agrees with getTrialBalance at both ends of the period", async () => {
    const c = client(MIXED);
    const cf = await getCashFlow(FROM, TO, c);

    const cashCodes = ACCOUNTS.filter((a) => a.type === "cash_bank").map((a) => a.code);
    const cashPerTrialBalance = async (asOf: Date) => {
      const tb = await getTrialBalance(asOf, c);
      expect(tb.balanced).toBe(true); // the books themselves must be sane
      return tb.rows
        .filter((r) => cashCodes.includes(r.code))
        .reduce((s, r) => s + r.debit - r.credit, 0);
    };

    const before = await cashPerTrialBalance(new Date(FROM.getTime() - 1));
    const after = await cashPerTrialBalance(TO);

    expect(cf.openingCash).toBeCloseTo(before, 2);
    expect(cf.closingCash).toBeCloseTo(after, 2);
    expect(cf.netChange).toBeCloseTo(after - before, 2);
  });

  it("keeps the identity when the period has an uncategorised movement in it", async () => {
    const c = client(MIXED);
    const cf = await getCashFlow(FROM, TO, c);

    // MIXED deliberately contains a mystery_type payment; it must be visible …
    const unc = cf.groups.find((g) => g.category === "uncategorised")!;
    expect(unc.outflow).toBe(333_333);
    // … and counted, or the identity below would not hold.
    const summed = cf.groups.reduce((s, g) => s + g.net, 0);
    expect(summed).toBeCloseTo(cf.closingCash - cf.openingCash, 2);
  });

  it("excludes the cash-to-cash transfer from flows but not from balances", async () => {
    const c = client(MIXED);
    const cf = await getCashFlow(FROM, TO, c);

    const kas = cf.cashAccounts.find((m) => m.code === "1101")!;
    const bank = cf.cashAccounts.find((m) => m.code === "1102")!;
    // Each side of the transfer shows in the individual account balances …
    expect(kas.net + bank.net).toBeCloseTo(cf.netChange, 2);
    // … while the transfer itself contributes nothing to any category.
    expect(cf.groups.flatMap((g) => g.lines).some((l) => l.type === "cash_bank")).toBe(false);
  });

  it("counts a journal dated exactly at the period start as flow, not as opening", async () => {
    // Off-by-one here (opening computed with <= from instead of < from) would
    // double-count the boundary journal and silently break the identity.
    const c = client(MIXED);
    const cf = await getCashFlow(FROM, TO, c);

    const before = await getCashFlow(D("2025-12-01"), new Date(FROM.getTime() - 1), c);
    expect(cf.openingCash).toBeCloseTo(before.closingCash, 2);

    // The 1,111,000 sale dated 2026-01-01T00:00:00 is inside the period's flows …
    const sales = cf.groups
      .find((g) => g.category === "operating")!
      .lines.find((l) => l.code === "4101")!;
    expect(sales.inflow).toBe(1_111_000 + 8_400_000);
    // … and absent from the opening balance.
    expect(cf.openingCash).toBe(42_500_000);
  });

  it("holds for a period boundary that splits the data differently", async () => {
    // Same books, a different window — the invariant is not an artefact of one range.
    const c = client(MIXED);
    for (const [from, to] of [
      [D("2025-12-01"), new Date("2025-12-31T23:59:59.999")],
      [D("2026-01-15"), new Date("2026-01-31T23:59:59.999")],
      [D("2025-12-01"), new Date("2026-02-28T23:59:59.999")],
    ] as const) {
      const cf = await getCashFlow(from, to, c);
      expect(cf.reconciled).toBe(true);
      expect(cf.netChange).toBeCloseTo(cf.closingCash - cf.openingCash, 2);
    }
  });
});
