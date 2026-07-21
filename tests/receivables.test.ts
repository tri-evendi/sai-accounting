/**
 * AR/AP outstanding, aging and payment status (issue #12).
 *
 * The bulk of these target two hazards that money code fails on quietly:
 * mixing currencies into one number, and inventing a due date for a document
 * that never had one. Both produce plausible-looking wrong totals rather than
 * errors, so they are asserted explicitly rather than left to a happy path.
 */
import { describe, it, expect } from "vitest";
import {
  toBase,
  ageInDays,
  agingBucket,
  deriveStatus,
  settleDocument,
  summarizeAging,
  allocatePaymentsFifo,
  allocatePayments,
  getReceivables,
  getPayables,
  getSupplierPurchaseAllocations,
  emptyAgingTotals,
} from "@/lib/receivables";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("toBase — IDR value of a money row", () => {
  it("takes an IDR amount at face value", () => {
    expect(toBase({ amount: 1500, currency: "IDR" })).toBe(1500);
  });

  it("defaults a missing currency to IDR", () => {
    expect(toBase({ amount: 250 })).toBe(250);
  });

  it("converts a foreign amount with a rate", () => {
    expect(toBase({ amount: 100, currency: "USD", rate: 16000 })).toBe(1_600_000);
  });

  it("prefers the stored base_amount over recomputing from the rate", () => {
    // base_amount is what actually hit the ledger; the rate may have been edited.
    expect(toBase({ amount: 100, currency: "USD", rate: 16000, baseAmount: 1_550_000 })).toBe(
      1_550_000
    );
  });

  it("returns null for a foreign amount with no rate and no base", () => {
    // The whole point: 100 USD must never be read as 100 rupiah.
    expect(toBase({ amount: 100, currency: "USD" })).toBeNull();
  });

  it("returns null for a foreign amount whose rate is zero", () => {
    expect(toBase({ amount: 100, currency: "USD", rate: 0 })).toBeNull();
  });

  it("handles Prisma Decimal-like values via Number coercion", () => {
    expect(toBase({ amount: "1234.56", currency: "IDR" })).toBeCloseTo(1234.56, 2);
  });
});

describe("ageInDays / agingBucket", () => {
  it("counts whole days forward", () => {
    expect(ageInDays(d("2026-01-01"), d("2026-01-31"))).toBe(30);
  });

  it("is zero on the same day", () => {
    expect(ageInDays(d("2026-03-05"), d("2026-03-05"))).toBe(0);
  });

  it("goes negative for a future date", () => {
    expect(ageInDays(d("2026-06-10"), d("2026-06-01"))).toBe(-9);
  });

  it("puts bucket boundaries on the documented side", () => {
    expect(agingBucket(0)).toBe("b0_30");
    expect(agingBucket(30)).toBe("b0_30");
    expect(agingBucket(31)).toBe("b31_60");
    expect(agingBucket(60)).toBe("b31_60");
    expect(agingBucket(61)).toBe("b61_90");
    expect(agingBucket(90)).toBe("b61_90");
    expect(agingBucket(91)).toBe("b90_plus");
  });

  it("files a not-yet-due document in the youngest bucket", () => {
    expect(agingBucket(-15)).toBe("b0_30");
  });
});

describe("deriveStatus", () => {
  const asOf = d("2026-07-20");

  it("is unpaid with no payments and no due date", () => {
    expect(deriveStatus({ totalBase: 1000, paidBase: 0, dueDate: null, asOf })).toBe("unpaid");
  });

  it("is partial once something is paid", () => {
    expect(deriveStatus({ totalBase: 1000, paidBase: 400, dueDate: null, asOf })).toBe("partial");
  });

  it("is paid when fully settled", () => {
    expect(deriveStatus({ totalBase: 1000, paidBase: 1000, dueDate: null, asOf })).toBe("paid");
  });

  it("is paid when overpaid", () => {
    expect(deriveStatus({ totalBase: 1000, paidBase: 1200, dueDate: null, asOf })).toBe("paid");
  });

  it("tolerates sub-cent rounding when deciding it is settled", () => {
    expect(deriveStatus({ totalBase: 1000, paidBase: 999.999, dueDate: null, asOf })).toBe("paid");
  });

  it("is overdue past the due date", () => {
    expect(deriveStatus({ totalBase: 1000, paidBase: 0, dueDate: d("2026-07-01"), asOf })).toBe(
      "overdue"
    );
  });

  it("lets overdue outrank partial", () => {
    expect(deriveStatus({ totalBase: 1000, paidBase: 300, dueDate: d("2026-07-01"), asOf })).toBe(
      "overdue"
    );
  });

  it("never calls a settled document overdue, however old", () => {
    expect(deriveStatus({ totalBase: 1000, paidBase: 1000, dueDate: d("2020-01-01"), asOf })).toBe(
      "paid"
    );
  });

  it("is not overdue on the due date itself", () => {
    expect(deriveStatus({ totalBase: 1000, paidBase: 0, dueDate: asOf, asOf })).toBe("unpaid");
  });

  it("never marks a document with no due date as overdue", () => {
    // The core of the due-date decision: unknown is not the same as late.
    expect(deriveStatus({ totalBase: 1000, paidBase: 0, dueDate: null, asOf })).toBe("unpaid");
  });

  it("never claims a document is paid when its IDR value is unknown", () => {
    expect(deriveStatus({ totalBase: null, paidBase: 5_000_000, dueDate: null, asOf })).toBe(
      "partial"
    );
  });
});

describe("settleDocument — outstanding per document", () => {
  const asOf = d("2026-07-20");

  it("computes a simple IDR partial payment", () => {
    const r = settleDocument({
      total: 1_000_000,
      currency: "IDR",
      date: d("2026-07-01"),
      payments: [{ amount: 400_000, currency: "IDR" }],
      asOf,
    });
    expect(r.totalBase).toBe(1_000_000);
    expect(r.paidBase).toBe(400_000);
    expect(r.outstandingBase).toBe(600_000);
    expect(r.outstanding).toBe(600_000);
    expect(r.status).toBe("partial");
  });

  it("keeps a USD document's remainder in USD when every payment was USD", () => {
    const r = settleDocument({
      total: 1000,
      currency: "USD",
      rate: 16_000,
      date: d("2026-07-01"),
      payments: [{ amount: 250, currency: "USD", rate: 16_000 }],
      asOf,
    });
    expect(r.totalBase).toBe(16_000_000);
    expect(r.paidBase).toBe(4_000_000);
    expect(r.outstandingBase).toBe(12_000_000);
    expect(r.outstanding).toBe(750); // still meaningful: one currency throughout
  });

  it("refuses a single-currency remainder once currencies are mixed", () => {
    // A USD invoice settled partly in IDR has no honest USD remainder — the only
    // correct common unit is IDR base, so `outstanding` must stay null.
    const r = settleDocument({
      total: 1000,
      currency: "USD",
      rate: 16_000,
      date: d("2026-07-01"),
      payments: [
        { amount: 250, currency: "USD", rate: 16_000 },
        { amount: 3_200_000, currency: "IDR" },
      ],
      asOf,
    });
    expect(r.totalBase).toBe(16_000_000);
    expect(r.paidBase).toBe(7_200_000);
    expect(r.outstandingBase).toBe(8_800_000);
    expect(r.outstanding).toBeNull();
  });

  it("never adds a foreign amount at face value — 100 USD is not 100 IDR", () => {
    const r = settleDocument({
      total: 1_000_000,
      currency: "IDR",
      date: d("2026-07-01"),
      payments: [{ amount: 100, currency: "USD" }], // no rate at all
      asOf,
    });
    expect(r.paidBase).toBe(0);
    expect(r.outstandingBase).toBe(1_000_000);
    expect(r.unratedCount).toBe(1);
    expect(r.status).toBe("unpaid");
  });

  it("counts unrated foreign payments so the UI can disclose them", () => {
    const r = settleDocument({
      total: 1_000_000,
      currency: "IDR",
      date: d("2026-07-01"),
      payments: [
        { amount: 200_000, currency: "IDR" },
        { amount: 50, currency: "CNY" },
        { amount: 60, currency: "USD" },
      ],
      asOf,
    });
    expect(r.paidBase).toBe(200_000);
    expect(r.unratedCount).toBe(2);
  });

  it("leaves a foreign document with no rate at an unknown IDR value", () => {
    const r = settleDocument({
      total: 1000,
      currency: "USD",
      date: d("2026-07-01"),
      payments: [],
      asOf,
    });
    expect(r.totalBase).toBeNull();
    expect(r.outstandingBase).toBeNull();
    expect(r.status).toBe("unpaid");
  });

  it("floors an overpaid document at zero rather than going negative", () => {
    const r = settleDocument({
      total: 1_000_000,
      currency: "IDR",
      date: d("2026-07-01"),
      payments: [{ amount: 1_250_000, currency: "IDR" }],
      asOf,
    });
    expect(r.outstandingBase).toBe(0);
    expect(r.outstanding).toBe(0);
    expect(r.status).toBe("paid");
  });

  it("ages from the due date when there is one", () => {
    const r = settleDocument({
      total: 100,
      currency: "IDR",
      date: d("2026-01-01"),
      dueDate: d("2026-06-20"),
      payments: [],
      asOf,
    });
    expect(r.ageFromIssue).toBe(false);
    expect(r.ageDays).toBe(30);
    expect(r.bucket).toBe("b0_30");
    expect(r.status).toBe("overdue");
  });

  it("ages from the document date when the due date is unknown, and stays not-overdue", () => {
    const r = settleDocument({
      total: 100,
      currency: "IDR",
      date: d("2026-01-01"),
      payments: [],
      asOf,
    });
    expect(r.ageFromIssue).toBe(true);
    expect(r.ageDays).toBe(200);
    expect(r.bucket).toBe("b90_plus");
    expect(r.status).toBe("unpaid"); // old, but not knowably late
  });

  it("adds up several payments across currencies in IDR base only", () => {
    const r = settleDocument({
      total: 2000,
      currency: "USD",
      rate: 16_000,
      date: d("2026-07-01"),
      payments: [
        { amount: 500, currency: "USD", rate: 16_000 }, // 8,000,000
        { amount: 7_000, currency: "CNY", rate: 2_200 }, // 15,400,000
      ],
      asOf,
    });
    expect(r.totalBase).toBe(32_000_000);
    expect(r.paidBase).toBe(23_400_000);
    expect(r.outstandingBase).toBe(8_600_000);
    expect(r.outstanding).toBeNull();
  });
});

describe("summarizeAging", () => {
  it("sums outstanding into buckets and skips settled rows", () => {
    const s = summarizeAging([
      { outstandingBase: 100, bucket: "b0_30" },
      { outstandingBase: 50, bucket: "b0_30" },
      { outstandingBase: 200, bucket: "b90_plus" },
      { outstandingBase: 0, bucket: "b31_60" },
    ]);
    expect(s.buckets).toEqual({ ...emptyAgingTotals(), b0_30: 150, b90_plus: 200 });
    expect(s.total).toBe(350);
    expect(s.unresolved).toBe(0);
  });

  it("excludes rows with an unknown IDR value and reports them separately", () => {
    const s = summarizeAging([
      { outstandingBase: 100, bucket: "b0_30" },
      { outstandingBase: null, bucket: "b0_30" },
    ]);
    expect(s.total).toBe(100);
    expect(s.unresolved).toBe(1);
  });
});

describe("allocatePaymentsFifo", () => {
  const purchases = [
    { id: 2, date: d("2026-02-01"), base: 500 },
    { id: 1, date: d("2026-01-01"), base: 300 },
    { id: 3, date: d("2026-03-01"), base: 200 },
  ];

  it("settles the oldest purchase first", () => {
    const r = allocatePaymentsFifo(purchases, 400);
    expect(r.applied.get(1)).toBe(300); // oldest fully covered
    expect(r.applied.get(2)).toBe(100); // next partly covered
    expect(r.applied.get(3)).toBe(0);
    expect(r.unapplied).toBe(0);
  });

  it("covers everything and reports the overpayment", () => {
    const r = allocatePaymentsFifo(purchases, 1200);
    expect(r.applied.get(1)).toBe(300);
    expect(r.applied.get(2)).toBe(500);
    expect(r.applied.get(3)).toBe(200);
    expect(r.unapplied).toBe(200);
  });

  it("applies nothing when nothing has been paid", () => {
    const r = allocatePaymentsFifo(purchases, 0);
    expect(r.applied.get(1)).toBe(0);
    expect(r.unapplied).toBe(0);
  });

  it("skips a purchase with no determinable IDR value", () => {
    const r = allocatePaymentsFifo(
      [
        { id: 1, date: d("2026-01-01"), base: null },
        { id: 2, date: d("2026-02-01"), base: 500 },
      ],
      500
    );
    expect(r.applied.has(1)).toBe(false);
    expect(r.applied.get(2)).toBe(500);
  });

  it("breaks a same-date tie by id so allocation is deterministic", () => {
    const r = allocatePaymentsFifo(
      [
        { id: 9, date: d("2026-01-01"), base: 100 },
        { id: 4, date: d("2026-01-01"), base: 100 },
      ],
      100
    );
    expect(r.applied.get(4)).toBe(100);
    expect(r.applied.get(9)).toBe(0);
  });
});

/* ─────────────────────── Data-access shape, via a stub ─────────────────────── */

function stubClient(seed: {
  invoices?: unknown[];
  contracts?: unknown[];
  supplierTransactions?: unknown[];
}) {
  return {
    invoice: { findMany: async () => seed.invoices ?? [] },
    contract: { findMany: async () => seed.contracts ?? [] },
    supplierTransaction: { findMany: async () => seed.supplierTransactions ?? [] },
  } as unknown as Parameters<typeof getReceivables>[1];
}

describe("getReceivables", () => {
  const asOf = d("2026-07-20");

  const invoice = (over: Record<string, unknown> = {}) => ({
    id: 1,
    invoiceNo: "INV-001",
    date: d("2026-07-01"),
    dueDate: null,
    currency: "IDR",
    rate: null,
    baseAmount: null,
    taxAmount: 0,
    customer: { name: "PT Maju" },
    items: [{ quantity: 10, price: 100_000 }],
    payments: [],
    ...over,
  });

  it("lists an unpaid invoice with its outstanding and party", async () => {
    const r = await getReceivables({ asOf }, stubClient({ invoices: [invoice()] }));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].partyName).toBe("PT Maju");
    expect(r.rows[0].outstandingBase).toBe(1_000_000);
    expect(r.aging.total).toBe(1_000_000);
    expect(r.byParty[0]).toEqual({ name: "PT Maju", outstandingBase: 1_000_000, count: 1 });
  });

  it("includes tax in the document value", async () => {
    const r = await getReceivables(
      { asOf },
      stubClient({ invoices: [invoice({ taxAmount: 110_000 })] })
    );
    expect(r.rows[0].total).toBe(1_110_000);
  });

  it("drops a fully paid invoice — this is an outstanding report", async () => {
    const r = await getReceivables(
      { asOf },
      stubClient({
        invoices: [invoice({ payments: [{ amount: 1_000_000, currency: "IDR" }] })],
      })
    );
    expect(r.rows).toHaveLength(0);
    expect(r.aging.total).toBe(0);
  });

  it("keeps a document whose IDR value is unknown, rather than hiding it", async () => {
    const r = await getReceivables(
      { asOf },
      stubClient({ invoices: [invoice({ currency: "USD", rate: null, baseAmount: null })] })
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].outstandingBase).toBeNull();
    expect(r.unresolvedCount).toBe(1);
    expect(r.aging.unresolved).toBe(1);
  });

  it("labels an invoice with no customer instead of dropping it", async () => {
    const r = await getReceivables({ asOf }, stubClient({ invoices: [invoice({ customer: null })] }));
    expect(r.rows[0].partyName).toBe("Tanpa pelanggan");
  });

  it("filters to overdue documents only when asked", async () => {
    const client = stubClient({
      invoices: [
        invoice({ id: 1, invoiceNo: "INV-1", dueDate: d("2026-07-01") }), // overdue
        invoice({ id: 2, invoiceNo: "INV-2", dueDate: null }), // unknown, not overdue
        invoice({ id: 3, invoiceNo: "INV-3", dueDate: d("2026-08-30") }), // not yet due
      ],
    });
    const all = await getReceivables({ asOf }, client);
    expect(all.rows).toHaveLength(3);
    expect(all.overdueCount).toBe(1);

    const overdue = await getReceivables({ asOf, overdueOnly: true }, client);
    expect(overdue.rows.map((x) => x.documentNo)).toEqual(["INV-1"]);
  });

  it("carries contract payment terms verbatim without turning them into a date", async () => {
    const r = await getReceivables(
      { asOf },
      stubClient({
        contracts: [
          {
            id: 7,
            contractNo: "CTR-7",
            date: d("2026-07-01"),
            dueDate: null,
            buyer: "Buyer Co",
            currency: "IDR",
            top1: "30% advance",
            top2: "70% on B/L",
            items: [{ bags: 10, kgPerBag: 50, pricePerKg: 1_000 }],
            payments: [],
          },
        ],
      })
    );
    expect(r.rows[0].terms).toBe("30% advance · 70% on B/L");
    expect(r.rows[0].dueDate).toBeNull();
    expect(r.rows[0].ageFromIssue).toBe(true);
    expect(r.rows[0].total).toBe(500_000);
  });

  const contract = (over: Record<string, unknown> = {}) => ({
    id: 20,
    contractNo: "CTR-20",
    date: d("2026-07-01"),
    dueDate: null,
    buyer: "Buyer Co",
    currency: "USD",
    rate: null,
    baseAmount: null,
    top1: null,
    top2: null,
    // USD 1,000.
    items: [{ bags: 10, kgPerBag: 10, pricePerKg: 10 }],
    payments: [],
    ...over,
  });

  it("counts a rated foreign contract toward the IDR totals (issue #36)", async () => {
    const r = await getReceivables(
      { asOf },
      stubClient({
        contracts: [contract({ rate: 16_250, baseAmount: 16_250_000 })],
      })
    );

    expect(r.rows[0].currency).toBe("USD");
    expect(r.rows[0].total).toBe(1_000);
    expect(r.rows[0].totalBase).toBe(16_250_000);
    expect(r.rows[0].outstandingBase).toBe(16_250_000);
    expect(r.aging.total).toBe(16_250_000);
    expect(r.aging.unresolved).toBe(0);
    expect(r.unresolvedCount).toBe(0);
  });

  it("falls back to rate × amount when base_amount was never stored", async () => {
    const r = await getReceivables(
      { asOf },
      stubClient({ contracts: [contract({ rate: 16_000, baseAmount: null })] })
    );
    expect(r.rows[0].totalBase).toBe(16_000_000);
  });

  it("keeps a legacy rateless contract listed but out of the totals", async () => {
    // Contracts predating migration 0008 have no recorded rate and are not
    // backfilled. They must stay visible and stay excluded — never valued 1:1.
    const r = await getReceivables({ asOf }, stubClient({ contracts: [contract()] }));

    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].totalBase).toBeNull();
    expect(r.rows[0].outstandingBase).toBeNull();
    expect(r.aging.total).toBe(0);
    expect(r.aging.unresolved).toBe(1);
    expect(r.unresolvedCount).toBe(1);
  });

  it("mixes rated and rateless contracts without contaminating the total", async () => {
    const r = await getReceivables(
      { asOf },
      stubClient({
        contracts: [
          contract({ id: 21, contractNo: "CTR-21", rate: 16_250, baseAmount: 16_250_000 }),
          contract({ id: 22, contractNo: "CTR-22" }),
        ],
      })
    );

    expect(r.rows).toHaveLength(2);
    expect(r.aging.total).toBe(16_250_000);
    expect(r.unresolvedCount).toBe(1);
  });

  it("needs no rate for an IDR contract — it is already base currency", async () => {
    const r = await getReceivables(
      { asOf },
      stubClient({ contracts: [contract({ currency: "IDR", rate: null, baseAmount: null })] })
    );
    expect(r.rows[0].totalBase).toBe(1_000);
    expect(r.unresolvedCount).toBe(0);
  });
});

describe("getPayables", () => {
  const asOf = d("2026-07-20");
  const supplier = { name: "CV Sumber" };

  it("allocates supplier payments oldest-purchase-first across documents", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          {
            id: 1,
            supplierId: 5,
            date: d("2026-01-10"),
            dueDate: null,
            type: "purchase",
            amount: 1_000_000,
            currency: "IDR",
            rate: null,
            baseAmount: null,
            note: null,
            supplier,
          },
          {
            id: 2,
            supplierId: 5,
            date: d("2026-02-10"),
            dueDate: null,
            type: "purchase",
            amount: 500_000,
            currency: "IDR",
            rate: null,
            baseAmount: null,
            note: null,
            supplier,
          },
          {
            id: 3,
            supplierId: 5,
            date: d("2026-03-01"),
            dueDate: null,
            type: "payment",
            amount: 1_200_000,
            currency: "IDR",
            rate: null,
            baseAmount: null,
            note: null,
            supplier,
          },
        ],
      })
    );
    // The older purchase is fully settled and drops off; the newer keeps the rest.
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].id).toBe(2);
    expect(r.rows[0].outstandingBase).toBe(300_000);
    expect(r.aging.total).toBe(300_000);
  });

  it("converts a foreign purchase before comparing it with an IDR payment", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          {
            id: 1,
            supplierId: 5,
            date: d("2026-06-01"),
            dueDate: null,
            type: "purchase",
            amount: 1_000,
            currency: "USD",
            rate: 16_000,
            baseAmount: 16_000_000,
            note: null,
            supplier,
          },
          {
            id: 2,
            supplierId: 5,
            date: d("2026-06-15"),
            dueDate: null,
            type: "payment",
            amount: 6_000_000,
            currency: "IDR",
            rate: null,
            baseAmount: null,
            note: null,
            supplier,
          },
        ],
      })
    );
    expect(r.rows[0].totalBase).toBe(16_000_000);
    expect(r.rows[0].outstandingBase).toBe(10_000_000);
    expect(r.rows[0].status).toBe("partial");
    // No single-currency remainder: the payment was not in the purchase currency.
    expect(r.rows[0].outstanding).toBeNull();
  });

  it("keeps suppliers independent — one supplier's payment never settles another's", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          {
            id: 1,
            supplierId: 5,
            date: d("2026-06-01"),
            dueDate: null,
            type: "purchase",
            amount: 400_000,
            currency: "IDR",
            rate: null,
            baseAmount: null,
            note: null,
            supplier,
          },
          {
            id: 2,
            supplierId: 6,
            date: d("2026-06-02"),
            dueDate: null,
            type: "payment",
            amount: 400_000,
            currency: "IDR",
            rate: null,
            baseAmount: null,
            note: null,
            supplier: { name: "PT Lain" },
          },
        ],
      })
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].partyName).toBe("CV Sumber");
    expect(r.rows[0].outstandingBase).toBe(400_000);
  });

  it("marks an overdue purchase and honours the overdue filter", async () => {
    const client = stubClient({
      supplierTransactions: [
        {
          id: 1,
          supplierId: 5,
          date: d("2026-05-01"),
          dueDate: d("2026-06-01"),
          type: "purchase",
          amount: 400_000,
          currency: "IDR",
          rate: null,
          baseAmount: null,
          note: null,
          supplier,
        },
        {
          id: 2,
          supplierId: 5,
          date: d("2026-05-01"),
          dueDate: null,
          type: "purchase",
          amount: 100_000,
          currency: "IDR",
          rate: null,
          baseAmount: null,
          note: null,
          supplier,
        },
      ],
    });
    const all = await getPayables({ asOf }, client);
    expect(all.overdueCount).toBe(1);

    const overdue = await getPayables({ asOf, overdueOnly: true }, client);
    expect(overdue.rows).toHaveLength(1);
    expect(overdue.rows[0].id).toBe(1);
    expect(overdue.rows[0].status).toBe("overdue");
  });
});

/* ──────────────────── Payment → purchase allocation (#37) ──────────────────── */

/**
 * Allocation replaces a *guess* with recorded fact, and must do so without
 * moving a single rupiah. Two things are asserted throughout:
 *
 *  1. Recorded allocations decide the per-row split; FIFO handles only what is
 *     left unallocated, and every row it touches is flagged `allocationEstimated`
 *     so the page can label it instead of implying it is data.
 *  2. The supplier's *total* outstanding is identical no matter how (or whether)
 *     payments are allocated. That is the acceptance criterion "no money moves",
 *     and it is asserted directly against the same data with and without
 *     allocations rather than eyeballed per row.
 */
describe("allocatePayments — recorded allocations with a FIFO fallback", () => {
  const purchases = [
    { id: 1, date: d("2026-01-10"), base: 1_000_000 },
    { id: 2, date: d("2026-02-10"), base: 500_000 },
    { id: 3, date: d("2026-03-10"), base: 300_000 },
  ];

  it("applies a recorded allocation to its named purchase, not the oldest", () => {
    // FIFO would have settled purchase 1. The user said purchase 2, so it is 2.
    const r = allocatePayments(purchases, [{ purchaseId: 2, base: 500_000 }], 0);
    expect(r.applied.get(1)).toBe(0);
    expect(r.applied.get(2)).toBe(500_000);
    expect(r.estimated.size).toBe(0);
  });

  it("splits one payment across several purchases", () => {
    const r = allocatePayments(
      purchases,
      [
        { purchaseId: 1, base: 400_000 },
        { purchaseId: 3, base: 300_000 },
      ],
      0
    );
    expect(r.applied.get(1)).toBe(400_000);
    expect(r.applied.get(2)).toBe(0);
    expect(r.applied.get(3)).toBe(300_000);
    // Nothing was guessed at, so nothing is flagged as an estimate.
    expect(r.estimated.size).toBe(0);
  });

  it("handles a partial allocation — the purchase keeps the remainder open", () => {
    const r = allocatePayments(purchases, [{ purchaseId: 2, base: 200_000 }], 0);
    expect(r.applied.get(2)).toBe(200_000);
    expect(r.estimated.has(2)).toBe(false);
  });

  it("falls back to FIFO for an unallocated pool, flagging what it touches", () => {
    const r = allocatePayments(purchases, [], 1_200_000);
    expect(r.applied.get(1)).toBe(1_000_000);
    expect(r.applied.get(2)).toBe(200_000);
    expect(r.applied.get(3)).toBe(0);
    // Both rows the estimate touched are marked; the untouched one is not.
    expect([...r.estimated].sort()).toEqual([1, 2]);
  });

  it("mixes both: allocations bind, and only the remainder is estimated", () => {
    // 300k explicitly clears purchase 3; a separate legacy 600k is guessed.
    const r = allocatePayments(purchases, [{ purchaseId: 3, base: 300_000 }], 600_000);
    expect(r.applied.get(3)).toBe(300_000);
    expect(r.applied.get(1)).toBe(600_000); // FIFO, oldest first
    expect(r.estimated.has(3)).toBe(false); // recorded → fact
    expect(r.estimated.has(1)).toBe(true); // FIFO → estimate
  });

  it("lets FIFO top up a partially allocated purchase, flagging it once topped", () => {
    const r = allocatePayments(purchases, [{ purchaseId: 1, base: 400_000 }], 300_000);
    expect(r.applied.get(1)).toBe(700_000);
    // Part fact, part guess — the row as a whole is an estimate, so it is badged.
    expect(r.estimated.has(1)).toBe(true);
  });

  it("caps an over-allocation at the purchase value and spills the rest to FIFO", () => {
    // Defence in depth: the API rejects this, but if bad data ever lands, the
    // excess must not vanish — that would silently shrink the supplier's debt.
    const r = allocatePayments(purchases, [{ purchaseId: 3, base: 500_000 }], 0);
    expect(r.applied.get(3)).toBe(300_000); // capped at its own value
    expect(r.applied.get(1)).toBe(200_000); // spilled into the estimate pool
    expect(r.estimated.has(1)).toBe(true);
  });

  it("counts an allocation with no IDR value instead of guessing one", () => {
    const r = allocatePayments(purchases, [{ purchaseId: 1, base: null }], 0);
    expect(r.unratedAllocations).toBe(1);
    expect(r.applied.get(1)).toBe(0);
  });

  it("counts an allocation aimed at a purchase with no usable rate", () => {
    const rateless = [{ id: 9, date: d("2026-01-01"), base: null }];
    const r = allocatePayments(rateless, [{ purchaseId: 9, base: 100_000 }], 0);
    expect(r.unratedAllocations).toBe(1);
    expect(r.applied.get(9)).toBe(0);
  });

  it("reports payment left over once every purchase is covered", () => {
    const r = allocatePayments(purchases, [{ purchaseId: 1, base: 1_000_000 }], 1_000_000);
    expect(r.applied.get(2)).toBe(500_000);
    expect(r.applied.get(3)).toBe(300_000);
    expect(r.unapplied).toBe(200_000); // prepayment, owed to nothing yet
  });

  it("THE INVARIANT: total applied is identical however the payment is allocated", () => {
    const paid = 1_200_000;
    const totalOf = (r: ReturnType<typeof allocatePayments>) =>
      [...r.applied.values()].reduce((s, v) => s + v, 0);

    // Same money, four different allocation stories.
    const legacy = allocatePayments(purchases, [], paid);
    const oneDoc = allocatePayments(purchases, [{ purchaseId: 2, base: 500_000 }], 700_000);
    const split = allocatePayments(
      purchases,
      [
        { purchaseId: 2, base: 500_000 },
        { purchaseId: 3, base: 300_000 },
      ],
      400_000
    );
    const overAllocated = allocatePayments(purchases, [{ purchaseId: 3, base: 900_000 }], 300_000);

    for (const r of [legacy, oneDoc, split, overAllocated]) {
      expect(totalOf(r)).toBe(paid);
    }
  });

  it("THE INVARIANT holds when payments exceed the total debt", () => {
    const capacity = 1_800_000; // 1,000k + 500k + 300k
    const totalOf = (r: ReturnType<typeof allocatePayments>) =>
      [...r.applied.values()].reduce((s, v) => s + v, 0);

    const legacy = allocatePayments(purchases, [], 2_500_000);
    const allocated = allocatePayments(
      purchases,
      [
        { purchaseId: 1, base: 1_000_000 },
        { purchaseId: 3, base: 300_000 },
      ],
      1_200_000
    );

    // 2.5m of payment against 1.8m of debt: 1.8m absorbed, 700k left over —
    // and the leftover is invariant too, not just the absorbed part.
    expect(totalOf(legacy)).toBe(capacity);
    expect(totalOf(allocated)).toBe(capacity);
    expect(legacy.unapplied).toBe(700_000);
    expect(allocated.unapplied).toBe(legacy.unapplied);
  });

  it("matches the old FIFO-only result exactly when nothing is allocated", () => {
    // Backwards compatibility: with no allocations the new path must reproduce
    // `allocatePaymentsFifo` row for row, or every legacy screen would shift.
    const oldWay = allocatePaymentsFifo(purchases, 1_200_000);
    const newWay = allocatePayments(purchases, [], 1_200_000);
    for (const p of purchases) {
      expect(newWay.applied.get(p.id)).toBe(oldWay.applied.get(p.id));
    }
    expect(newWay.unapplied).toBe(oldWay.unapplied);
  });
});

describe("getPayables — allocated and legacy rows side by side", () => {
  const asOf = d("2026-07-20");
  const supplier = { name: "CV Sumber" };

  const purchase = (over: Record<string, unknown> = {}) => ({
    id: 1,
    supplierId: 5,
    date: d("2026-01-10"),
    dueDate: null,
    type: "purchase",
    amount: 1_000_000,
    currency: "IDR",
    rate: null,
    baseAmount: null,
    taxAmount: 0,
    note: null,
    supplier,
    allocationsMade: [],
    ...over,
  });

  const payment = (over: Record<string, unknown> = {}) => ({
    ...purchase(),
    id: 90,
    type: "payment",
    date: d("2026-03-01"),
    ...over,
  });

  it("settles the purchase the payment names, not the oldest one", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, date: d("2026-01-10"), amount: 1_000_000 }),
          purchase({ id: 2, date: d("2026-02-10"), amount: 500_000 }),
          payment({
            id: 90,
            amount: 500_000,
            // Explicitly settles the NEWER purchase — FIFO would have said #1.
            allocationsMade: [
              { purchaseId: 2, amount: 500_000, currency: "IDR", rate: null, baseAmount: 500_000 },
            ],
          }),
        ],
      })
    );

    // Purchase 2 is cleared and drops off; purchase 1 remains fully open.
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].id).toBe(1);
    expect(r.rows[0].outstandingBase).toBe(1_000_000);
    // Nothing was guessed, so nothing is badged.
    expect(r.rows[0].allocationEstimated).toBe(false);
  });

  it("spreads one payment across several purchases", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, amount: 1_000_000 }),
          purchase({ id: 2, date: d("2026-02-10"), amount: 500_000 }),
          payment({
            amount: 900_000,
            allocationsMade: [
              { purchaseId: 1, amount: 600_000, currency: "IDR", rate: null, baseAmount: 600_000 },
              { purchaseId: 2, amount: 300_000, currency: "IDR", rate: null, baseAmount: 300_000 },
            ],
          }),
        ],
      })
    );

    const byId = new Map(r.rows.map((x) => [x.id, x]));
    expect(byId.get(1)!.outstandingBase).toBe(400_000);
    expect(byId.get(2)!.outstandingBase).toBe(200_000);
    expect(byId.get(1)!.allocationEstimated).toBe(false);
    expect(byId.get(2)!.allocationEstimated).toBe(false);
  });

  it("flags a legacy payment's rows as estimated", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, amount: 1_000_000 }),
          purchase({ id: 2, date: d("2026-02-10"), amount: 500_000 }),
          // No `allocationsMade` at all — exactly how every pre-0009 row reads.
          payment({ amount: 1_200_000 }),
        ],
      })
    );

    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].id).toBe(2);
    expect(r.rows[0].outstandingBase).toBe(300_000);
    expect(r.rows[0].allocationEstimated).toBe(true);
  });

  it("treats a row with an undefined allocations relation as legacy, not a crash", async () => {
    // Defensive: older callers/queries may not include the relation at all.
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, amount: 1_000_000, allocationsMade: undefined }),
          payment({ amount: 400_000, allocationsMade: undefined }),
        ],
      })
    );
    expect(r.rows[0].outstandingBase).toBe(600_000);
    expect(r.rows[0].allocationEstimated).toBe(true);
  });

  it("mixes allocated and legacy payments for the SAME supplier", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, date: d("2026-01-10"), amount: 1_000_000 }),
          purchase({ id: 2, date: d("2026-02-10"), amount: 500_000 }),
          purchase({ id: 3, date: d("2026-03-10"), amount: 300_000 }),
          // Recorded: clears purchase 3 outright.
          payment({
            id: 90,
            amount: 300_000,
            allocationsMade: [
              { purchaseId: 3, amount: 300_000, currency: "IDR", rate: null, baseAmount: 300_000 },
            ],
          }),
          // Legacy: no allocation, so FIFO spreads it oldest-first.
          payment({ id: 91, amount: 700_000 }),
        ],
      })
    );

    const byId = new Map(r.rows.map((x) => [x.id, x]));
    // Purchase 3 is settled by fact and drops off entirely.
    expect(byId.has(3)).toBe(false);
    // The legacy 700k lands on the oldest purchase — a guess, and badged as one.
    expect(byId.get(1)!.outstandingBase).toBe(300_000);
    expect(byId.get(1)!.allocationEstimated).toBe(true);
    // Purchase 2 is untouched by either mechanism, so it is not an estimate.
    expect(byId.get(2)!.outstandingBase).toBe(500_000);
    expect(byId.get(2)!.allocationEstimated).toBe(false);
  });

  it("estimates only the unallocated remainder of a partially allocated payment", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, date: d("2026-01-10"), amount: 1_000_000 }),
          purchase({ id: 2, date: d("2026-02-10"), amount: 500_000 }),
          // 800k paid, but the user only said where 300k of it went.
          payment({
            amount: 800_000,
            allocationsMade: [
              { purchaseId: 2, amount: 300_000, currency: "IDR", rate: null, baseAmount: 300_000 },
            ],
          }),
        ],
      })
    );

    const byId = new Map(r.rows.map((x) => [x.id, x]));
    expect(byId.get(2)!.outstandingBase).toBe(200_000);
    expect(byId.get(2)!.allocationEstimated).toBe(false); // fact only
    expect(byId.get(1)!.outstandingBase).toBe(500_000); // 500k of guessed money
    expect(byId.get(1)!.allocationEstimated).toBe(true);
  });

  it("never lets an allocation cross supplier boundaries", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, supplierId: 5, amount: 400_000 }),
          purchase({ id: 2, supplierId: 6, amount: 400_000, supplier: { name: "PT Lain" } }),
          // Supplier 6's payment claims to settle supplier 5's purchase. It must
          // not: allocation is applied within a supplier, so it is counted as
          // unresolvable rather than quietly clearing another supplier's debt.
          payment({
            id: 90,
            supplierId: 6,
            amount: 400_000,
            supplier: { name: "PT Lain" },
            allocationsMade: [
              { purchaseId: 1, amount: 400_000, currency: "IDR", rate: null, baseAmount: 400_000 },
            ],
          }),
        ],
      })
    );

    const byId = new Map(r.rows.map((x) => [x.id, x]));
    expect(byId.get(1)!.outstandingBase).toBe(400_000); // untouched
    expect(byId.get(2)!.outstandingBase).toBe(400_000); // its own payment went nowhere
  });

  it("excludes a rateless foreign payment's allocation instead of valuing it 1:1", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, amount: 16_000_000 }),
          payment({
            amount: 1_000,
            currency: "USD",
            rate: null,
            baseAmount: null,
            allocationsMade: [
              { purchaseId: 1, amount: 1_000, currency: "USD", rate: null, baseAmount: null },
            ],
          }),
        ],
      })
    );

    // 1,000 USD must never be read as 1,000 rupiah — the debt stands in full.
    expect(r.rows[0].outstandingBase).toBe(16_000_000);
    expect(r.rows[0].unratedCount).toBeGreaterThan(0);
  });

  it("converts a foreign payment's allocation at its own rate", async () => {
    const r = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, amount: 16_000_000 }),
          payment({
            amount: 500,
            currency: "USD",
            rate: 16_000,
            baseAmount: 8_000_000,
            allocationsMade: [
              {
                purchaseId: 1,
                amount: 500,
                currency: "USD",
                rate: 16_000,
                baseAmount: 8_000_000,
              },
            ],
          }),
        ],
      })
    );

    expect(r.rows[0].outstandingBase).toBe(8_000_000);
    expect(r.rows[0].allocationEstimated).toBe(false);
  });

  /**
   * The headline acceptance criterion: "Total utang per supplier tetap sama
   * persis sebelum & sesudah perubahan." Asserted by running the identical
   * money through `getPayables` with and without allocations and comparing the
   * supplier total, not by inspecting rows.
   */
  it("ACCEPTANCE: per-supplier total is byte-identical with and without allocations", async () => {
    const purchases = [
      purchase({ id: 1, date: d("2026-01-10"), amount: 1_000_000 }),
      purchase({ id: 2, date: d("2026-02-10"), amount: 500_000 }),
      purchase({ id: 3, date: d("2026-03-10"), amount: 300_000 }),
    ];

    const legacy = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [...purchases, payment({ id: 90, amount: 1_200_000 })],
      })
    );

    const allocated = await getPayables(
      { asOf },
      stubClient({
        supplierTransactions: [
          ...purchases,
          payment({
            id: 90,
            amount: 1_200_000,
            // Same 1.2m, deliberately allocated in the least FIFO-like way.
            allocationsMade: [
              { purchaseId: 3, amount: 300_000, currency: "IDR", rate: null, baseAmount: 300_000 },
              { purchaseId: 2, amount: 500_000, currency: "IDR", rate: null, baseAmount: 500_000 },
              { purchaseId: 1, amount: 400_000, currency: "IDR", rate: null, baseAmount: 400_000 },
            ],
          }),
        ],
      })
    );

    // Not a rupiah moved: same supplier total, same grand total.
    expect(allocated.byParty[0].outstandingBase).toBe(legacy.byParty[0].outstandingBase);
    expect(allocated.byParty[0].outstandingBase).toBe(600_000); // 1.8m - 1.2m
    expect(allocated.aging.total).toBe(legacy.aging.total);

    // ...but the per-row split genuinely differs, which is the whole point.
    // FIFO clears the oldest and leaves 300k each on #2 and #3; the recorded
    // allocation clears #2 and #3 outright and leaves 600k on #1 instead.
    expect(legacy.rows.map((x) => x.id)).toEqual([3, 2]);
    expect(allocated.rows.map((x) => x.id)).toEqual([1]);
    expect(allocated.rows[0].outstandingBase).toBe(600_000);

    // The FIFO row that actually absorbed guessed money is badged; the row FIFO
    // never reached is left alone rather than blanket-flagged.
    const legacyById = new Map(legacy.rows.map((x) => [x.id, x]));
    expect(legacyById.get(2)!.allocationEstimated).toBe(true);
    expect(legacyById.get(3)!.allocationEstimated).toBe(false);
    expect(allocated.rows[0].allocationEstimated).toBe(false);
  });

  it("ACCEPTANCE: supplier total is unchanged for a partially allocated payment", async () => {
    const build = (allocationsMade: unknown[]) =>
      stubClient({
        supplierTransactions: [
          purchase({ id: 1, date: d("2026-01-10"), amount: 1_000_000 }),
          purchase({ id: 2, date: d("2026-02-10"), amount: 500_000 }),
          payment({ id: 90, amount: 900_000, allocationsMade }),
        ],
      });

    const legacy = await getPayables({ asOf }, build([]));
    const partial = await getPayables(
      { asOf },
      build([
        { purchaseId: 2, amount: 400_000, currency: "IDR", rate: null, baseAmount: 400_000 },
      ])
    );

    expect(partial.byParty[0].outstandingBase).toBe(legacy.byParty[0].outstandingBase);
    expect(partial.byParty[0].outstandingBase).toBe(600_000); // 1.5m - 900k
    expect(partial.aging.total).toBe(legacy.aging.total);
  });
});

/**
 * The numbers behind the allocation picker and the API's over-allocation guard.
 *
 * Note what this deliberately does NOT do: it never subtracts the FIFO estimate.
 * Remaining room is computed from recorded allocations only, so a guess can
 * never block a user from recording the truth.
 */
describe("getSupplierPurchaseAllocations — recorded room per purchase", () => {
  const allocStub = (purchases: unknown[]) =>
    ({
      supplierTransaction: { findMany: async () => purchases },
    }) as unknown as Parameters<typeof getSupplierPurchaseAllocations>[1];

  const purchase = (over: Record<string, unknown> = {}) => ({
    id: 1,
    date: d("2026-01-10"),
    dueDate: null,
    amount: 1_000_000,
    currency: "IDR",
    rate: null,
    baseAmount: null,
    taxAmount: 0,
    note: null,
    allocationsReceived: [],
    ...over,
  });

  it("reports the full value as remaining when nothing is allocated", async () => {
    const [p] = await getSupplierPurchaseAllocations(5, allocStub([purchase()]));
    expect(p.totalBase).toBe(1_000_000);
    expect(p.allocatedBase).toBe(0);
    expect(p.remainingBase).toBe(1_000_000);
  });

  it("includes input VAT in the purchase value — the debt is net + PPN", async () => {
    const [p] = await getSupplierPurchaseAllocations(
      5,
      allocStub([purchase({ amount: 1_000_000, taxAmount: 110_000, baseAmount: 1_110_000 })])
    );
    expect(p.amount).toBe(1_110_000);
    expect(p.remainingBase).toBe(1_110_000);
  });

  it("subtracts recorded allocations from the remaining room", async () => {
    const [p] = await getSupplierPurchaseAllocations(
      5,
      allocStub([
        purchase({
          allocationsReceived: [
            { amount: 300_000, currency: "IDR", rate: null, baseAmount: 300_000 },
            { amount: 200_000, currency: "IDR", rate: null, baseAmount: 200_000 },
          ],
        }),
      ])
    );
    expect(p.allocatedBase).toBe(500_000);
    expect(p.remainingBase).toBe(500_000);
  });

  it("converts a foreign allocation before subtracting it", async () => {
    const [p] = await getSupplierPurchaseAllocations(
      5,
      allocStub([
        purchase({
          allocationsReceived: [
            { amount: 25, currency: "USD", rate: 16_000, baseAmount: 400_000 },
          ],
        }),
      ])
    );
    // 25 USD is 400,000 IDR here — never 25 rupiah off the balance.
    expect(p.allocatedBase).toBe(400_000);
    expect(p.remainingBase).toBe(600_000);
  });

  it("ignores an allocation with no IDR value rather than guessing", async () => {
    const [p] = await getSupplierPurchaseAllocations(
      5,
      allocStub([
        purchase({
          allocationsReceived: [{ amount: 50, currency: "USD", rate: null, baseAmount: null }],
        }),
      ])
    );
    expect(p.allocatedBase).toBe(0);
    expect(p.remainingBase).toBe(1_000_000);
  });

  it("reports null remaining for a foreign purchase with no rate", async () => {
    // The API refuses to allocate against this: "how much is left" has no answer.
    const [p] = await getSupplierPurchaseAllocations(
      5,
      allocStub([purchase({ amount: 1_000, currency: "USD", rate: null, baseAmount: null })])
    );
    expect(p.totalBase).toBeNull();
    expect(p.remainingBase).toBeNull();
  });

  it("floors remaining at zero for an over-allocated purchase", async () => {
    const [p] = await getSupplierPurchaseAllocations(
      5,
      allocStub([
        purchase({
          allocationsReceived: [
            { amount: 1_500_000, currency: "IDR", rate: null, baseAmount: 1_500_000 },
          ],
        }),
      ])
    );
    // Never negative: the picker must not offer "room" that would be a refund.
    expect(p.remainingBase).toBe(0);
  });
});
