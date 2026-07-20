/**
 * The API-side half of auto-posting (issue #9), exercised without a database:
 *
 *  1. Zod now guards the inputs the posting engine cannot guess — an FX rate,
 *     a counter account, a unit cost. Catching these at validation time turns a
 *     would-be 422 rollback into a plain 400 with a field error.
 *  2. `fxAmounts` derives the rate + IDR base value persisted alongside every
 *     foreign-currency amount.
 *  3. Posting failures map to actionable 422s, never a 500 stack trace, and say
 *     out loud that the record was not saved.
 */
import { describe, expect, it } from "vitest";
import {
  invoicePaymentSchema,
  invoiceSchema,
  invoiceSubtotal,
  invoiceTotal,
} from "@/lib/validations/invoice";
import { contractPaymentSchema, contractSchema } from "@/lib/validations/contract";
import { cashTransactionSchema, supplierTransactionSchema } from "@/lib/validations/finance";
import { stockUpdateSchema } from "@/lib/validations/inventory";
import { fxAmounts } from "@/lib/validations/fx";
import { handlePostingError, postingErrorResponse, NOT_SAVED_NOTICE } from "@/lib/api-errors";
import { MissingMappingError, PostingRuleError, SourceNotFoundError } from "@/lib/posting";
import { UnbalancedJournalError } from "@/lib/ledger";

/** Paths of the issues a failed parse produced, for terse assertions. */
function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((i) => i.path.join(".")) ?? [];
}

describe("payment schemas require an FX rate", () => {
  const base = { invoiceId: 1, date: "2026-03-15", amount: 1000 };

  it("rejects a foreign-currency invoice payment with no rate", () => {
    const result = invoicePaymentSchema.safeParse({ ...base, currency: "USD" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rate");
  });

  it("accepts a foreign-currency invoice payment carrying a rate", () => {
    const result = invoicePaymentSchema.safeParse({ ...base, currency: "USD", rate: 16250 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.rate).toBe(16250);
  });

  it("needs no rate for an IDR payment — the base currency is 1:1", () => {
    const result = invoicePaymentSchema.safeParse({ ...base, currency: "IDR" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive rate", () => {
    const result = invoicePaymentSchema.safeParse({ ...base, currency: "USD", rate: 0 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rate");
  });

  it("applies the same rule to contract payments", () => {
    const payment = { contractId: 1, date: "2026-03-15", amount: 500, currency: "CNY" };
    expect(contractPaymentSchema.safeParse(payment).success).toBe(false);
    expect(contractPaymentSchema.safeParse({ ...payment, rate: 2250 }).success).toBe(true);
  });
});

describe("invoice schema carries currency, rate, tax and customer (issue #35)", () => {
  const base = {
    invoiceNo: "SI.2026.03.00001",
    date: "2026-03-15",
    items: [{ itemName: "Kopi Robusta", quantity: 10, price: 2_500 }],
  };

  it("rejects a foreign-currency invoice with no rate — a 400, not a 422 rollback", () => {
    const result = invoiceSchema.safeParse({ ...base, currency: "USD" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rate");
  });

  it("accepts a foreign-currency invoice carrying a rate", () => {
    const result = invoiceSchema.safeParse({ ...base, currency: "USD", rate: 16_250 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("USD");
      expect(result.data.rate).toBe(16_250);
    }
  });

  it("defaults to IDR, which needs no rate", () => {
    const result = invoiceSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("IDR");
      expect(result.data.taxAmount).toBe(0);
    }
  });

  it("rejects a non-positive rate", () => {
    const result = invoiceSchema.safeParse({ ...base, currency: "CNY", rate: 0 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rate");
  });

  it("rejects negative tax", () => {
    const result = invoiceSchema.safeParse({ ...base, taxAmount: -1 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("taxAmount");
  });

  it("accepts a customer link and leaves it optional for legacy documents", () => {
    const linked = invoiceSchema.safeParse({ ...base, customerId: 42 });
    expect(linked.success).toBe(true);
    if (linked.success) expect(linked.data.customerId).toBe(42);

    const unlinked = invoiceSchema.safeParse({ ...base, customerId: null });
    expect(unlinked.success).toBe(true);
  });

  it("totals the document in its own currency, tax included", () => {
    const items = [
      { itemName: "A", quantity: 10, price: 150_000 },
      { itemName: "B", quantity: 2, price: 250_000 },
    ];
    expect(invoiceSubtotal(items)).toBe(2_000_000);
    expect(invoiceTotal(items, 220_000)).toBe(2_220_000);
    expect(invoiceTotal(items)).toBe(2_000_000);
  });

  it("derives the IDR base from the gross document value", () => {
    const items = [{ itemName: "A", quantity: 4, price: 2_500 }];
    // USD 10,000 + USD 1,100 PPN, at 16,250 → IDR 180,375,000.
    expect(fxAmounts("USD", invoiceTotal(items, 1_100), 16_250).baseAmount).toBe(180_375_000);
  });
});

describe("contract schema", () => {
  const items = [{ itemName: "Kopi", bags: 100, kgPerBag: 60, pricePerKg: 3 }];
  const base = { contractNo: "SC-1", date: "2026-03-15", buyer: "ACME", items };

  it("requires a rate for a foreign-currency contract that will post", () => {
    const result = contractSchema.safeParse({ ...base, currency: "USD", status: "signed" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rate");
  });

  it("exempts a cancelled contract — it produces no journal", () => {
    const result = contractSchema.safeParse({ ...base, currency: "USD", status: "canceled" });
    expect(result.success).toBe(true);
  });

  it("exempts a zero-value contract — nothing to post", () => {
    const zero = [{ itemName: "Kopi", bags: 0, kgPerBag: 0, pricePerKg: 0 }];
    const result = contractSchema.safeParse({ ...base, items: zero, currency: "USD" });
    expect(result.success).toBe(true);
  });
});

describe("cash transaction schema", () => {
  const base = {
    type: "kas_besar",
    date: "2026-03-15",
    description: "Bayar listrik",
    currency: "IDR",
    credit: 500_000,
  };

  it("demands a counter account — the engine cannot post one side alone", () => {
    const result = cashTransactionSchema.safeParse(base);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("counterAccountId");
  });

  it("accepts a complete IDR cash entry", () => {
    const result = cashTransactionSchema.safeParse({ ...base, counterAccountId: 42 });
    expect(result.success).toBe(true);
  });

  it("still demands either a debit or a credit", () => {
    const result = cashTransactionSchema.safeParse({
      ...base,
      credit: 0,
      counterAccountId: 42,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("debit");
  });

  it("demands a rate for a foreign-currency cash entry", () => {
    const result = cashTransactionSchema.safeParse({
      ...base,
      currency: "USD",
      counterAccountId: 42,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rate");
  });
});

describe("supplier transaction schema", () => {
  const base = { supplierId: 1, date: "2026-03-15", amount: 1_000_000, currency: "IDR" };

  it("accepts the two types the posting engine has rules for", () => {
    expect(supplierTransactionSchema.safeParse({ ...base, type: "purchase" }).success).toBe(true);
    expect(supplierTransactionSchema.safeParse({ ...base, type: "payment" }).success).toBe(true);
  });

  it("rejects any other type rather than letting the engine throw", () => {
    const result = supplierTransactionSchema.safeParse({ ...base, type: "refund" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("type");
  });

  it("rejects input VAT on a payment — tax belongs to the purchase", () => {
    const result = supplierTransactionSchema.safeParse({
      ...base,
      type: "payment",
      taxAmount: 110_000,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("taxAmount");
  });

  it("defaults tax to zero", () => {
    const result = supplierTransactionSchema.safeParse({ ...base, type: "purchase" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.taxAmount).toBe(0);
  });
});

describe("stock update schema", () => {
  const base = { itemId: 1, quantity: 10, date: "2026-03-15" };

  it("requires a unit cost on incoming stock — it is the only COGS input", () => {
    const result = stockUpdateSchema.safeParse({ ...base, type: "in" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("unitCost");
  });

  it("accepts incoming stock with a unit cost", () => {
    const result = stockUpdateSchema.safeParse({ ...base, type: "in", unitCost: 25_000 });
    expect(result.success).toBe(true);
  });

  it("needs no unit cost on outgoing stock — cost is derived, not re-entered", () => {
    const result = stockUpdateSchema.safeParse({ ...base, type: "out" });
    expect(result.success).toBe(true);
  });
});

describe("fxAmounts", () => {
  it("treats IDR as 1:1", () => {
    expect(fxAmounts("IDR", 250_000)).toEqual({ rate: 1, baseAmount: 250_000 });
  });

  it("converts a foreign amount to its IDR base value", () => {
    expect(fxAmounts("USD", 1_000, 16_250)).toEqual({ rate: 16_250, baseAmount: 16_250_000 });
  });

  it("rounds the base value to cents", () => {
    const { baseAmount } = fxAmounts("USD", 33.333, 3);
    expect(baseAmount).toBe(100);
  });

  it("throws rather than booking foreign currency at 1:1", () => {
    expect(() => fxAmounts("USD", 1_000)).toThrow(/Kurs/);
    expect(() => fxAmounts("USD", 1_000, 0)).toThrow(/Kurs/);
  });
});

describe("posting errors become actionable responses", () => {
  it("names the mapping to configure on a missing mapping (422)", async () => {
    const response = postingErrorResponse(new MissingMappingError("ar_default", "CNY"));
    expect(response?.status).toBe(422);

    const body = await response?.json();
    expect(body.code).toBe("missing_account_mapping");
    expect(body.mappingKey).toBe("ar_default");
    expect(body.currency).toBe("CNY");
    expect(body.saved).toBe(false);
    // Indonesian, names the slot, and says the write was rolled back.
    expect(body.error).toContain("Piutang Usaha");
    expect(body.error).toContain(NOT_SAVED_NOTICE);
  });

  it("maps a rule violation to 422", async () => {
    const response = postingErrorResponse(new PostingRuleError("Kurs tidak tersedia."));
    expect(response?.status).toBe(422);

    const body = await response?.json();
    expect(body.code).toBe("posting_rule");
    expect(body.saved).toBe(false);
  });

  it("maps an unbalanced journal to 422", async () => {
    const response = postingErrorResponse(new UnbalancedJournalError("Tidak seimbang."));
    expect(response?.status).toBe(422);
    expect((await response?.json()).code).toBe("unbalanced_journal");
  });

  it("maps a missing source record to 422", async () => {
    const response = postingErrorResponse(new SourceNotFoundError("invoice", 7));
    expect(response?.status).toBe(422);
    expect((await response?.json()).code).toBe("source_not_found");
  });

  it("returns null for anything else, so real bugs are not disguised", () => {
    expect(postingErrorResponse(new Error("connection lost"))).toBeNull();
    expect(postingErrorResponse("not even an error")).toBeNull();
  });

  it("handlePostingError rethrows non-posting failures", () => {
    const bug = new TypeError("cannot read property of undefined");
    expect(() => handlePostingError(bug)).toThrow(bug);
    expect(() => handlePostingError(new PostingRuleError("x"))).not.toThrow();
  });
});
