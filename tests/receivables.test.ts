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
  getReceivables,
  getPayables,
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
