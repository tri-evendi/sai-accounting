/**
 * Uang Muka / advance payments (issue #26).
 *
 * SAI's export customers pay before the final invoice exists, so this is the
 * primary flow, not an edge case. Three properties carry the whole feature and
 * each is asserted directly rather than inferred:
 *
 *  1. **An advance is never revenue.** Receiving one touches cash and a
 *     balance-sheet account and nothing else. If a revenue account ever appeared
 *     here, the income statement would double-count the moment the invoice was
 *     raised — the single most expensive bug this feature could have.
 *  2. **Compensation moves value, it does not create it.** Uang Muka goes down,
 *     Piutang/Hutang goes down, no cash moves, no revenue moves.
 *  3. **Σ base debit = Σ base credit, in IDR, in every journal** — including
 *     when the advance's rate and the invoice's rate disagree, which is the
 *     normal case for a CNY down-payment and where issue #23's FX plug earns its
 *     keep. Asserted on every entry below via `expectBalanced`.
 */
import { describe, expect, it } from "vitest";
import {
  buildAdvanceLines,
  buildAdvanceCompensationLines,
  PostingRuleError,
} from "@/lib/posting/rules";
import { postForSource, MAPPING_KEYS } from "@/lib/posting";
import { advanceBalance, resolveApplicationLines, summarizeAdvances } from "@/lib/advances";
import { advancePaymentSchema, advanceApplicationsSchema } from "@/lib/validations/advance";
import { getReceivables } from "@/lib/receivables";
import { createFakeClient, type FakeJournal, type FakeLine } from "./fake-client";

const d = (s: string) => new Date(`${s}T00:00:00`);

/* ─────────────────────────────── Assertions ────────────────────────────────── */

const base = (l: { debit?: number; credit?: number; rate?: number }, side: "debit" | "credit") =>
  Math.round((l[side] ?? 0) * (l.rate ?? 1) * 100) / 100;

/**
 * The invariant the ledger enforces, restated here so a rule is proven balanced
 * *before* `assertBalanced` ever sees it. Uses the same rounding `prepareLines`
 * applies, so a rule that passes here cannot fail there.
 */
function expectBalanced(lines: { debit?: number; credit?: number; rate?: number }[]) {
  const debit = lines.reduce((s, l) => s + base(l, "debit"), 0);
  const credit = lines.reduce((s, l) => s + base(l, "credit"), 0);
  expect(Math.round(debit * 100)).toBe(Math.round(credit * 100));
  return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
}

function expectJournalBalanced(journal: FakeJournal) {
  const debit = journal.lines.reduce((s, l) => s + l.baseDebit, 0);
  const credit = journal.lines.reduce((s, l) => s + l.baseCredit, 0);
  expect(Math.round(debit * 100)).toBe(Math.round(credit * 100));
  return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
}

const lineFor = (journal: FakeJournal, accountId: number): FakeLine | undefined =>
  journal.lines.find((l) => l.accountId === accountId);

/* ───────────────────────────── Account fixtures ────────────────────────────── */

// Distinct ids so a line landing in the wrong account cannot pass unnoticed.
const ACC = {
  cash: 11,
  advanceSales: 21, // 2102 Uang Muka Penjualan — LIABILITY
  advancePurchase: 22, // 1103 Uang Muka Pembelian — ASSET
  ar: 31,
  ap: 32,
  fx: 41, // 7101 Laba/Rugi Selisih Kurs
  sales: 51, // must NEVER appear in an advance journal
  cogs: 52,
} as const;

const mappings = [
  { key: MAPPING_KEYS.CASH_DEFAULT, currency: "any", accountId: ACC.cash, isActive: true },
  { key: MAPPING_KEYS.ADVANCE_SALES, currency: "any", accountId: ACC.advanceSales, isActive: true },
  { key: MAPPING_KEYS.ADVANCE_PURCHASE, currency: "any", accountId: ACC.advancePurchase, isActive: true },
  { key: MAPPING_KEYS.AR_DEFAULT, currency: "any", accountId: ACC.ar, isActive: true },
  { key: MAPPING_KEYS.AP_DEFAULT, currency: "any", accountId: ACC.ap, isActive: true },
  { key: MAPPING_KEYS.FX_GAIN_LOSS, currency: "any", accountId: ACC.fx, isActive: true },
  { key: MAPPING_KEYS.SALES_DEFAULT, currency: "any", accountId: ACC.sales, isActive: true },
];

/* ══════════════════ 1. Receiving an advance recognises NO revenue ═══════════ */

describe("uang muka diterima — tidak ada pendapatan diakui", () => {
  it("books D: Kas/Bank, K: Uang Muka Penjualan and nothing else", () => {
    const lines = buildAdvanceLines({
      direction: "sales",
      cashAccountId: ACC.cash,
      advanceAccountId: ACC.advanceSales,
      amount: 100_000,
      currency: "CNY",
      rate: 2_200,
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountId: ACC.cash, debit: 100_000 });
    expect(lines[1]).toMatchObject({ accountId: ACC.advanceSales, credit: 100_000 });

    // The property that matters most: no revenue account anywhere.
    expect(lines.some((l) => l.accountId === ACC.sales)).toBe(false);
    expect(lines.some((l) => l.accountId === ACC.ar)).toBe(false);

    // 100.000 CNY × 2.200 = Rp 220.000.000 on both sides.
    expect(expectBalanced(lines).debit).toBe(220_000_000);
  });

  it("mirrors for a purchase advance: D: Uang Muka Pembelian, K: Kas/Bank — no expense", () => {
    const lines = buildAdvanceLines({
      direction: "purchase",
      cashAccountId: ACC.cash,
      advanceAccountId: ACC.advancePurchase,
      amount: 50_000,
      currency: "USD",
      rate: 16_000,
    });

    expect(lines[0]).toMatchObject({ accountId: ACC.advancePurchase, debit: 50_000 });
    expect(lines[1]).toMatchObject({ accountId: ACC.cash, credit: 50_000 });
    expect(expectBalanced(lines).debit).toBe(800_000_000);
  });

  it("posts through the engine without touching Penjualan", async () => {
    const client = createFakeClient({
      mappings,
      advancePayments: {
        1: {
          id: 1,
          advanceNo: "UMP.2026.07.00001",
          type: "sales",
          date: d("2026-07-05"),
          amount: 100_000,
          currency: "CNY",
          rate: 2_200,
          baseAmount: 220_000_000,
          status: "open",
        },
      },
    });

    const journal = await postForSource({
      sourceType: "advance_payment",
      sourceId: 1,
      tx: client,
    });

    expect(journal).not.toBeNull();
    const j = client._journals[0];
    expect(j.type).toBe("cash");
    expect(j.note).toContain("UMP.2026.07.00001");
    expect(lineFor(j, ACC.cash)?.baseDebit).toBe(220_000_000);
    expect(lineFor(j, ACC.advanceSales)?.baseCredit).toBe(220_000_000);
    expect(lineFor(j, ACC.sales)).toBeUndefined();
    expect(expectJournalBalanced(j).debit).toBe(220_000_000);
  });

  it("refuses a foreign advance with no rate rather than booking it 1:1", async () => {
    const client = createFakeClient({
      mappings,
      advancePayments: {
        1: {
          id: 1,
          advanceNo: "UMP.2026.07.00002",
          type: "sales",
          date: d("2026-07-05"),
          amount: 100_000,
          currency: "CNY",
          rate: null,
          baseAmount: null,
          status: "open",
        },
      },
    });

    await expect(
      postForSource({ sourceType: "advance_payment", sourceId: 1, tx: client })
    ).rejects.toThrow(PostingRuleError);
    expect(client._journals).toHaveLength(0);
  });

  it("posts nothing for a cancelled advance", async () => {
    const client = createFakeClient({
      mappings,
      advancePayments: {
        1: {
          id: 1,
          advanceNo: "UMP.2026.07.00003",
          type: "sales",
          date: d("2026-07-05"),
          amount: 1_000,
          currency: "IDR",
          rate: 1,
          baseAmount: 1_000,
          status: "canceled",
        },
      },
    });

    expect(await postForSource({ sourceType: "advance_payment", sourceId: 1, tx: client })).toBeNull();
    expect(client._journals).toHaveLength(0);
  });

  it("rejects a zero or negative advance", () => {
    expect(() =>
      buildAdvanceLines({
        direction: "sales",
        cashAccountId: ACC.cash,
        advanceAccountId: ACC.advanceSales,
        amount: 0,
        currency: "IDR",
        rate: 1,
      })
    ).toThrow(PostingRuleError);
  });
});

/* ════════════════ 2. Compensation when the invoice is issued ═══════════════ */

describe("kompensasi uang muka ke faktur", () => {
  it("moves the advance out of Uang Muka and against Piutang — no cash, no revenue", () => {
    const lines = buildAdvanceCompensationLines({
      direction: "sales",
      advanceAccountId: ACC.advanceSales,
      counterAccountId: ACC.ar,
      amount: 100_000,
      currency: "CNY",
      rate: 2_200,
      // Same rate on both sides: no FX difference to book.
      settles: [{ amount: 100_000, currency: "CNY", rate: 2_200 }],
      fxAccountId: ACC.fx,
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountId: ACC.advanceSales, debit: 100_000 });
    expect(lines[1]).toMatchObject({ accountId: ACC.ar, credit: 100_000 });
    expect(lines.some((l) => l.accountId === ACC.cash)).toBe(false);
    expect(lines.some((l) => l.accountId === ACC.sales)).toBe(false);
    expect(expectBalanced(lines).debit).toBe(220_000_000);
  });

  it("mirrors for a purchase advance: D: Hutang Usaha, K: Uang Muka Pembelian", () => {
    const lines = buildAdvanceCompensationLines({
      direction: "purchase",
      advanceAccountId: ACC.advancePurchase,
      counterAccountId: ACC.ap,
      amount: 50_000,
      currency: "USD",
      rate: 16_000,
      settles: [{ amount: 50_000, currency: "USD", rate: 16_000 }],
      fxAccountId: ACC.fx,
    });

    expect(lines[0]).toMatchObject({ accountId: ACC.ap, debit: 50_000 });
    expect(lines[1]).toMatchObject({ accountId: ACC.advancePurchase, credit: 50_000 });
    expect(expectBalanced(lines).debit).toBe(800_000_000);
  });

  it("posts through the engine against the invoice it names", async () => {
    const client = createFakeClient({
      mappings,
      advanceApplications: {
        7: {
          id: 7,
          advanceId: 1,
          invoiceId: 3,
          purchaseId: null,
          date: d("2026-07-20"),
          amount: 100_000,
          currency: "CNY",
          rate: 2_200,
          baseAmount: 220_000_000,
          advance: {
            id: 1,
            advanceNo: "UMP.2026.07.00001",
            type: "sales",
            currency: "CNY",
            rate: 2_200,
            status: "open",
          },
          invoice: { id: 3, invoiceNo: "INV-001", currency: "CNY", rate: 2_200 },
          purchase: null,
        },
      },
    });

    await postForSource({ sourceType: "advance_application", sourceId: 7, tx: client });
    const j = client._journals[0];

    expect(j.type).toBe("adjustment");
    expect(j.note).toBe("Kompensasi UMP.2026.07.00001 → INV-001");
    expect(lineFor(j, ACC.advanceSales)?.baseDebit).toBe(220_000_000);
    expect(lineFor(j, ACC.ar)?.baseCredit).toBe(220_000_000);
    expect(lineFor(j, ACC.fx)).toBeUndefined(); // same rate → no FX line
    expect(expectJournalBalanced(j).debit).toBe(220_000_000);
  });

  it("is idempotent — a compensation already posted is never posted twice", async () => {
    const client = createFakeClient({
      mappings,
      advanceApplications: {
        7: {
          id: 7,
          advanceId: 1,
          invoiceId: 3,
          date: d("2026-07-20"),
          amount: 1_000,
          currency: "IDR",
          rate: 1,
          baseAmount: 1_000,
          advance: { id: 1, advanceNo: "UMP-1", type: "sales", currency: "IDR", rate: 1, status: "open" },
          invoice: { id: 3, invoiceNo: "INV-001", currency: "IDR", rate: 1 },
          purchase: null,
        },
      },
    });

    await postForSource({ sourceType: "advance_application", sourceId: 7, tx: client });
    await postForSource({ sourceType: "advance_application", sourceId: 7, tx: client });
    expect(client._journals).toHaveLength(1);
  });
});

/* ═══════════════════════ 3. Partial compensation ═══════════════════════════ */

describe("kompensasi sebagian", () => {
  it("relieves only the compensated slice, leaving the rest of the advance", () => {
    // 100.000 CNY advance, only 40.000 applied to this invoice.
    const lines = buildAdvanceCompensationLines({
      direction: "sales",
      advanceAccountId: ACC.advanceSales,
      counterAccountId: ACC.ar,
      amount: 40_000,
      currency: "CNY",
      rate: 2_200,
      settles: [{ amount: 40_000, currency: "CNY", rate: 2_200 }],
      fxAccountId: ACC.fx,
    });

    expect(lines[0]).toMatchObject({ accountId: ACC.advanceSales, debit: 40_000 });
    expect(expectBalanced(lines).debit).toBe(88_000_000); // 40.000 × 2.200
  });

  it("derives the remaining balance from the applications, in both units", () => {
    const balance = advanceBalance({
      amount: 100_000,
      currency: "CNY",
      rate: 2_200,
      baseAmount: 220_000_000,
      applications: [
        { amount: 40_000, currency: "CNY", rate: 2_200, baseAmount: 88_000_000 },
        { amount: 25_000, currency: "CNY", rate: 2_200, baseAmount: 55_000_000 },
      ],
    });

    expect(balance.applied).toBe(65_000);
    expect(balance.remaining).toBe(35_000); // own currency: exact
    expect(balance.appliedBase).toBe(143_000_000);
    expect(balance.remainingBase).toBe(77_000_000); // IDR base
    expect(balance.isFullyApplied).toBe(false);
  });

  it("reports an advance compensated in full as having no balance left", () => {
    const balance = advanceBalance({
      amount: 100_000,
      currency: "CNY",
      rate: 2_200,
      baseAmount: 220_000_000,
      applications: [{ amount: 100_000, currency: "CNY", rate: 2_200, baseAmount: 220_000_000 }],
    });
    expect(balance.remaining).toBe(0);
    expect(balance.remainingBase).toBe(0);
    expect(balance.isFullyApplied).toBe(true);
  });

  it("one invoice covered by several advances: the slices sum to the invoice", () => {
    // Two advances at different rates, each partly compensating one invoice.
    const first = buildAdvanceCompensationLines({
      direction: "sales",
      advanceAccountId: ACC.advanceSales,
      counterAccountId: ACC.ar,
      amount: 60_000,
      currency: "CNY",
      rate: 2_200,
      settles: [{ amount: 60_000, currency: "CNY", rate: 2_250 }],
      fxAccountId: ACC.fx,
    });
    const second = buildAdvanceCompensationLines({
      direction: "sales",
      advanceAccountId: ACC.advanceSales,
      counterAccountId: ACC.ar,
      amount: 40_000,
      currency: "CNY",
      rate: 2_100,
      settles: [{ amount: 40_000, currency: "CNY", rate: 2_250 }],
      fxAccountId: ACC.fx,
    });

    expectBalanced(first);
    expectBalanced(second);

    // Piutang is relieved for 100.000 CNY at the INVOICE's rate in total —
    // exactly the rupiah it was raised for — regardless of the advances' rates.
    const arRelieved =
      first.filter((l) => l.accountId === ACC.ar).reduce((s, l) => s + (l.credit ?? 0), 0) +
      second.filter((l) => l.accountId === ACC.ar).reduce((s, l) => s + (l.credit ?? 0), 0);
    expect(arRelieved).toBe(100_000);
  });

  it("excludes an unrated application from the IDR total but still counts the currency slice", () => {
    const balance = advanceBalance({
      amount: 100_000,
      currency: "CNY",
      rate: 2_200,
      baseAmount: 220_000_000,
      applications: [
        { amount: 40_000, currency: "CNY", rate: 2_200, baseAmount: 88_000_000 },
        // No rate, no base: has no honest IDR value.
        { amount: 10_000, currency: "CNY", rate: null, baseAmount: null },
      ],
    });

    expect(balance.applied).toBe(50_000); // the slice is real in CNY
    expect(balance.appliedBase).toBe(88_000_000); // but not counted in IDR
    expect(balance.unratedApplications).toBe(1); // and surfaced, not hidden
  });
});

/* ═══════════════ 4. Over-compensation is rejected ══════════════════════════ */

/**
 * Stub for the DB-side guard. It honours `where` on the advance query because
 * the type/status filter is half the ownership check — a stub that ignored it
 * would let the wrong-direction test pass without proving anything.
 */
function guardClient(opts: {
  advances?: Record<string, unknown>[];
  invoice?: Record<string, unknown> | null;
}) {
  return {
    advancePayment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        (opts.advances ?? [])
          .filter((a) => (where.type == null || a.type === where.type) && a.status === where.status)
          .map((a) => ({
            applications: [],
            customer: null,
            supplier: null,
            contract: null,
            ...a,
          })),
    },
    invoice: {
      findUnique: async () =>
        opts.invoice === undefined
          ? null
          : opts.invoice && {
              items: [],
              payments: [],
              advanceApplications: [],
              taxAmount: 0,
              status: "pending",
              ...opts.invoice,
            },
    },
    supplierTransaction: { findUnique: async () => null },
  } as unknown as NonNullable<Parameters<typeof resolveApplicationLines>[0]["client"]>;
}

const cnyAdvance = (over: Record<string, unknown> = {}) => ({
  id: 1,
  advanceNo: "UMP.2026.07.00001",
  type: "sales",
  status: "open",
  date: d("2026-07-05"),
  amount: 100_000,
  currency: "CNY",
  rate: 2_200,
  baseAmount: 220_000_000,
  customerId: 9,
  supplierId: null,
  contractId: null,
  note: null,
  ...over,
});

const cnyInvoice = (over: Record<string, unknown> = {}) => ({
  id: 3,
  invoiceNo: "INV-001",
  date: d("2026-07-20"),
  currency: "CNY",
  rate: 2_250,
  baseAmount: 337_500_000, // 150.000 CNY × 2.250
  items: [{ quantity: 1, price: 150_000 }],
  ...over,
});

describe("over-compensation ditolak", () => {
  it("rejects applying more than the advance's remaining balance", async () => {
    const client = guardClient({ advances: [cnyAdvance()], invoice: cnyInvoice() });
    const result = await resolveApplicationLines({
      targetKind: "invoice",
      targetId: 3,
      lines: [{ advanceId: 1, amount: 120_000 }], // advance is only 100.000
      client,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/melebihi sisa uang muka/);
  });

  it("counts existing applications against the room", async () => {
    const client = guardClient({
      advances: [
        cnyAdvance({
          applications: [
            { id: 5, amount: 70_000, currency: "CNY", rate: 2_200, baseAmount: 154_000_000 },
          ],
        }),
      ],
      invoice: cnyInvoice(),
    });

    // Only 30.000 left; 40.000 must be refused.
    const tooMuch = await resolveApplicationLines({
      targetKind: "invoice",
      targetId: 3,
      lines: [{ advanceId: 1, amount: 40_000 }],
      client,
    });
    expect(tooMuch.ok).toBe(false);

    const fits = await resolveApplicationLines({
      targetKind: "invoice",
      targetId: 3,
      lines: [{ advanceId: 1, amount: 30_000 }],
      client,
    });
    expect(fits.ok).toBe(true);
  });

  it("rejects two lines that each fit alone but not together", async () => {
    const client = guardClient({
      advances: [cnyAdvance({ id: 1 }), cnyAdvance({ id: 2, advanceNo: "UMP-2" })],
      // Invoice worth only 150.000 CNY × 2.250 = Rp 337.500.000.
      invoice: cnyInvoice(),
    });

    // 100.000 + 100.000 CNY at 2.200 = Rp 440.000.000 > the invoice's room.
    const result = await resolveApplicationLines({
      targetKind: "invoice",
      targetId: 3,
      lines: [
        { advanceId: 1, amount: 100_000 },
        { advanceId: 2, amount: 100_000 },
      ],
      client,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/melebihi sisa tagihannya/);
  });

  it("rejects compensating more than the target invoice is worth", async () => {
    const client = guardClient({
      advances: [cnyAdvance({ amount: 100_000, baseAmount: 220_000_000 })],
      // A small invoice: 20.000 CNY × 2.250 = Rp 45.000.000.
      invoice: cnyInvoice({
        items: [{ quantity: 1, price: 20_000 }],
        baseAmount: 45_000_000,
      }),
    });

    const result = await resolveApplicationLines({
      targetKind: "invoice",
      targetId: 3,
      lines: [{ advanceId: 1, amount: 100_000 }],
      client,
    });

    // Without this cap Piutang would go negative — a receivable never owed.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/melebihi sisa tagihannya/);
  });

  it("rejects an advance pointing the wrong way for the target", async () => {
    const client = guardClient({
      advances: [cnyAdvance({ type: "purchase" })],
      invoice: cnyInvoice(),
    });
    const result = await resolveApplicationLines({
      targetKind: "invoice",
      targetId: 3,
      lines: [{ advanceId: 1, amount: 10_000 }],
      client,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a cancelled advance", async () => {
    const client = guardClient({
      advances: [cnyAdvance({ status: "canceled" })],
      invoice: cnyInvoice(),
    });
    const result = await resolveApplicationLines({
      targetKind: "invoice",
      targetId: 3,
      lines: [{ advanceId: 1, amount: 10_000 }],
      client,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unrated foreign advance — its IDR remainder is unknowable", async () => {
    const client = guardClient({
      advances: [cnyAdvance({ rate: null, baseAmount: null })],
      invoice: cnyInvoice(),
    });
    const result = await resolveApplicationLines({
      targetKind: "invoice",
      targetId: 3,
      lines: [{ advanceId: 1, amount: 10_000 }],
      client,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/belum punya kurs/);
  });

  it("rejects the same advance twice in one payload, at the Zod layer", () => {
    const parsed = advanceApplicationsSchema.safeParse({
      targetKind: "invoice",
      targetId: 3,
      date: "2026-07-20",
      lines: [
        { advanceId: 1, amount: 10 },
        { advanceId: 1, amount: 20 },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a foreign advance recorded with no rate, at the Zod layer", () => {
    const parsed = advancePaymentSchema.safeParse({
      type: "sales",
      date: "2026-07-05",
      customerId: 9,
      amount: 100_000,
      currency: "CNY",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a customer for a sales advance and a supplier for a purchase one", () => {
    expect(
      advancePaymentSchema.safeParse({
        type: "sales",
        date: "2026-07-05",
        amount: 1_000,
        currency: "IDR",
      }).success
    ).toBe(false);

    expect(
      advancePaymentSchema.safeParse({
        type: "purchase",
        date: "2026-07-05",
        customerId: 9, // wrong side
        amount: 1_000,
        currency: "IDR",
      }).success
    ).toBe(false);

    expect(
      advancePaymentSchema.safeParse({
        type: "sales",
        date: "2026-07-05",
        customerId: 9,
        amount: 1_000,
        currency: "IDR",
      }).success
    ).toBe(true);
  });
});

/* ═════════ 5. Selisih kurs on compensation — reuses issue #23's plug ════════ */

describe("selisih kurs saat kompensasi (reuses #23)", () => {
  /**
   * The worked example from the live SAI books.
   *
   * A Chinese customer pays 100.000 CNY in advance on 5 July, when 1 CNY =
   * Rp 2.200 → Uang Muka Penjualan is credited Rp 220.000.000.
   * The invoice is finally issued on 20 July for 150.000 CNY, when 1 CNY =
   * Rp 2.250 → Piutang is debited Rp 337.500.000.
   * Compensating the whole advance relieves 100.000 CNY of each — but they were
   * booked at different rates, and the Rp 5.000.000 gap is realized FX.
   */
  it("books the rate gap to Laba/Rugi Selisih Kurs as a LOSS when CNY strengthened", () => {
    const lines = buildAdvanceCompensationLines({
      direction: "sales",
      advanceAccountId: ACC.advanceSales,
      counterAccountId: ACC.ar,
      amount: 100_000,
      currency: "CNY",
      rate: 2_200, // the ADVANCE's rate
      settles: [{ amount: 100_000, currency: "CNY", rate: 2_250 }], // the INVOICE's
      fxAccountId: ACC.fx,
    });

    const advanceLine = lines.find((l) => l.accountId === ACC.advanceSales)!;
    const arLine = lines.find((l) => l.accountId === ACC.ar)!;
    const fxLine = lines.find((l) => l.accountId === ACC.fx)!;

    // Uang Muka relieved at the rate IT was booked at.
    expect(advanceLine.debit).toBe(100_000);
    expect(advanceLine.rate).toBe(2_200);
    // Piutang relieved at the rate IT was booked at.
    expect(arLine.credit).toBe(100_000);
    expect(arLine.rate).toBe(2_250);

    // 220.000.000 − 225.000.000 = −5.000.000 → a DEBIT, i.e. a loss. The plug is
    // booked in IDR at rate 1 because the difference is already a base amount.
    expect(fxLine.debit).toBe(5_000_000);
    expect(fxLine.currency).toBe("IDR");
    expect(fxLine.rate).toBe(1);

    // And the whole entry still balances in IDR base — by construction.
    expect(expectBalanced(lines).debit).toBe(225_000_000);
  });

  it("books a GAIN when the advance was taken at the higher rate", () => {
    const lines = buildAdvanceCompensationLines({
      direction: "sales",
      advanceAccountId: ACC.advanceSales,
      counterAccountId: ACC.ar,
      amount: 100_000,
      currency: "CNY",
      rate: 2_300, // advance booked high
      settles: [{ amount: 100_000, currency: "CNY", rate: 2_250 }],
      fxAccountId: ACC.fx,
    });

    const fxLine = lines.find((l) => l.accountId === ACC.fx)!;
    // 230.000.000 − 225.000.000 = +5.000.000 → a CREDIT, i.e. a gain.
    expect(fxLine.credit).toBe(5_000_000);
    expect(expectBalanced(lines).debit).toBe(230_000_000);
  });

  it("mirrors on the purchase side: prepaying low is a gain", () => {
    const lines = buildAdvanceCompensationLines({
      direction: "purchase",
      advanceAccountId: ACC.advancePurchase,
      counterAccountId: ACC.ap,
      amount: 100_000,
      currency: "CNY",
      rate: 2_200, // we prepaid at 2.200
      settles: [{ amount: 100_000, currency: "CNY", rate: 2_250 }], // purchase booked at 2.250
      fxAccountId: ACC.fx,
    });

    const fxLine = lines.find((l) => l.accountId === ACC.fx)!;
    // Hutang 225.000.000 debit vs Uang Muka 220.000.000 credit → +5.000.000 gain.
    expect(fxLine.credit).toBe(5_000_000);
    expect(expectBalanced(lines).debit).toBe(225_000_000);
  });

  it("posts the FX difference end to end through the engine", async () => {
    const client = createFakeClient({
      mappings,
      advanceApplications: {
        7: {
          id: 7,
          advanceId: 1,
          invoiceId: 3,
          purchaseId: null,
          date: d("2026-07-20"),
          amount: 100_000,
          currency: "CNY",
          rate: 2_200,
          baseAmount: 220_000_000,
          advance: {
            id: 1,
            advanceNo: "UMP.2026.07.00001",
            type: "sales",
            currency: "CNY",
            rate: 2_200,
            status: "open",
          },
          invoice: { id: 3, invoiceNo: "INV-001", currency: "CNY", rate: 2_250 },
          purchase: null,
        },
      },
    });

    await postForSource({ sourceType: "advance_application", sourceId: 7, tx: client });
    const j = client._journals[0];

    expect(lineFor(j, ACC.advanceSales)?.baseDebit).toBe(220_000_000);
    expect(lineFor(j, ACC.ar)?.baseCredit).toBe(225_000_000);
    expect(lineFor(j, ACC.fx)?.baseDebit).toBe(5_000_000);
    expect(expectJournalBalanced(j).debit).toBe(225_000_000);
  });

  it("refuses to post when a difference arises but fx_gain_loss is unmapped", () => {
    expect(() =>
      buildAdvanceCompensationLines({
        direction: "sales",
        advanceAccountId: ACC.advanceSales,
        counterAccountId: ACC.ar,
        amount: 100_000,
        currency: "CNY",
        rate: 2_200,
        settles: [{ amount: 100_000, currency: "CNY", rate: 2_250 }],
        // fxAccountId deliberately absent
      })
    ).toThrow(PostingRuleError);
  });

  it("keeps #23's guard: legs that do not sum to the amount are an ERROR, not FX", () => {
    // The plug must absorb a rate gap only, never an amount mistake.
    expect(() =>
      buildAdvanceCompensationLines({
        direction: "sales",
        advanceAccountId: ACC.advanceSales,
        counterAccountId: ACC.ar,
        amount: 100_000,
        currency: "CNY",
        rate: 2_200,
        settles: [{ amount: 90_000, currency: "CNY", rate: 2_250 }], // 10.000 short
        fxAccountId: ACC.fx,
      })
    ).toThrow(PostingRuleError);
  });
});

/* ═══════════ 6. A rateless legacy target: book flat, never guess ═══════════ */

describe("dokumen tujuan tanpa kurs — dibukukan flat", () => {
  it("books both legs at the advance's rate when the invoice has no rate", async () => {
    const client = createFakeClient({
      mappings,
      advanceApplications: {
        7: {
          id: 7,
          advanceId: 1,
          invoiceId: 3,
          purchaseId: null,
          date: d("2026-07-20"),
          amount: 100_000,
          currency: "CNY",
          rate: 2_200,
          baseAmount: 220_000_000,
          advance: {
            id: 1,
            advanceNo: "UMP.2026.07.00001",
            type: "sales",
            currency: "CNY",
            rate: 2_200,
            status: "open",
          },
          // Legacy invoice: no rate was ever recorded for it.
          invoice: { id: 3, invoiceNo: "INV-LEGACY", currency: "CNY", rate: null },
          purchase: null,
        },
      },
    });

    await postForSource({ sourceType: "advance_application", sourceId: 7, tx: client });
    const j = client._journals[0];

    // Both legs at 2.200, so no FX line at all — the difference from an unknown
    // rate is unknowable, and #23's posture is to decline rather than invent one.
    expect(lineFor(j, ACC.advanceSales)?.baseDebit).toBe(220_000_000);
    expect(lineFor(j, ACC.ar)?.baseCredit).toBe(220_000_000);
    expect(lineFor(j, ACC.ar)?.rate).toBe(2_200);
    expect(lineFor(j, ACC.fx)).toBeUndefined();
    expect(expectJournalBalanced(j).debit).toBe(220_000_000);
  });

  it("books flat when the invoice is in a different currency from the advance", async () => {
    const client = createFakeClient({
      mappings,
      advanceApplications: {
        7: {
          id: 7,
          advanceId: 1,
          invoiceId: 3,
          purchaseId: null,
          date: d("2026-07-20"),
          amount: 100_000,
          currency: "CNY",
          rate: 2_200,
          baseAmount: 220_000_000,
          advance: {
            id: 1,
            advanceNo: "UMP-1",
            type: "sales",
            currency: "CNY",
            rate: 2_200,
            status: "open",
          },
          // No common unit: deriving how many USD a CNY advance clears would need
          // a settlement-date cross rate that nothing records.
          invoice: { id: 3, invoiceNo: "INV-USD", currency: "USD", rate: 16_000 },
          purchase: null,
        },
      },
    });

    await postForSource({ sourceType: "advance_application", sourceId: 7, tx: client });
    const j = client._journals[0];
    expect(lineFor(j, ACC.fx)).toBeUndefined();
    expect(expectJournalBalanced(j).debit).toBe(220_000_000);
  });

  it("omitting `settles` entirely is the same flat booking, with no FX", () => {
    const lines = buildAdvanceCompensationLines({
      direction: "sales",
      advanceAccountId: ACC.advanceSales,
      counterAccountId: ACC.ar,
      amount: 100_000,
      currency: "CNY",
      rate: 2_200,
      fxAccountId: ACC.fx,
    });
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.accountId === ACC.fx)).toBe(false);
    expect(expectBalanced(lines).debit).toBe(220_000_000);
  });
});

/* ═════════════ 7. Advances reduce what AR says the customer owes ═══════════ */

describe("saldo piutang setelah kompensasi", () => {
  it("subtracts a compensated advance from the invoice's outstanding", async () => {
    const client = {
      invoice: {
        findMany: async () => [
          {
            id: 3,
            invoiceNo: "INV-001",
            date: d("2026-07-20"),
            dueDate: null,
            status: "pending",
            currency: "CNY",
            rate: 2_250,
            baseAmount: 337_500_000,
            taxAmount: 0,
            items: [{ quantity: 1, price: 150_000 }],
            payments: [],
            customer: { name: "Buyer CN" },
            advanceApplications: [
              // 100.000 CNY compensated at the advance's rate of 2.200.
              { amount: 100_000, currency: "CNY", rate: 2_200, baseAmount: 220_000_000 },
            ],
          },
        ],
      },
      contract: { findMany: async () => [] },
    } as unknown as Parameters<typeof getReceivables>[1];

    const { rows } = await getReceivables({ asOf: d("2026-07-25") }, client);
    expect(rows).toHaveLength(1);

    // Rp 337.500.000 raised − Rp 220.000.000 compensated = Rp 117.500.000 left.
    expect(rows[0].totalBase).toBe(337_500_000);
    expect(rows[0].paidBase).toBe(220_000_000);
    expect(rows[0].outstandingBase).toBe(117_500_000);
    expect(rows[0].status).toBe("partial");
  });

  it("summarizes outstanding advances in IDR base and counts the unrated ones", () => {
    const summary = summarizeAdvances([
      { remainingBase: 220_000_000 },
      { remainingBase: 45_000_000 },
      { remainingBase: null }, // no rate: counted, never valued 1:1
    ] as Parameters<typeof summarizeAdvances>[0]);

    expect(summary.count).toBe(3);
    expect(summary.outstandingBase).toBe(265_000_000);
    expect(summary.unresolvedCount).toBe(1);
  });
});
