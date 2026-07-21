/**
 * Period lock (issue #13).
 *
 * The point of these tests is the second path. Since issue #9 the ledger is
 * written automatically whenever a source document changes, so the interesting
 * question is not "can I hand-type a journal into a closed month" — it is
 * "can I edit or delete an invoice dated in a closed month and have the ledger
 * quietly rewrite itself". Both must be refused, and refused at a point no new
 * API route can route around.
 */
import { describe, expect, it } from "vitest";
import {
  ClosedPeriodError,
  assertPeriodOpen,
  isPeriodClosed,
  periodBounds,
  periodLabel,
  periodOf,
} from "@/lib/period";
import { postJournal, reverseJournal } from "@/lib/ledger";
import {
  ANY_CURRENCY,
  MAPPING_KEYS,
  postForSource,
  repostForSource,
  unpostForSource,
} from "@/lib/posting";
import { postingErrorResponse, NOT_SAVED_NOTICE } from "@/lib/api-errors";
import { periodCloseSchema, periodReopenSchema } from "@/lib/validations/period";
import { createFakeClient, type FakeMapping, type FakePeriod } from "./fake-client";

const ACC = { ar: 101, sales: 201, cash: 301 };

const MAPPINGS: FakeMapping[] = [
  { key: MAPPING_KEYS.AR_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.ar, isActive: true },
  { key: MAPPING_KEYS.SALES_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.sales, isActive: true },
  { key: MAPPING_KEYS.CASH_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.cash, isActive: true },
];

/** Mid-month, so no timezone offset can push it into a neighbouring period. */
const IN_MARCH = new Date("2026-03-15T00:00:00.000Z");
const IN_APRIL = new Date("2026-04-15T00:00:00.000Z");

const MARCH_CLOSED: FakePeriod[] = [{ year: 2026, month: 3, status: "closed" }];

const invoiceSeed = (date: Date) => ({
  7: {
    id: 7,
    invoiceNo: "SI.2026.03.00007",
    date,
    status: "pending",
    items: [{ quantity: 10, price: 150_000 }],
  },
});

const balancedEntry = (date: Date) => ({
  date,
  type: "general",
  note: "Uji periode",
  lines: [
    { accountId: ACC.ar, debit: 1_000_000, credit: 0 },
    { accountId: ACC.sales, debit: 0, credit: 1_000_000 },
  ],
});

// ─── Period helpers ──────────────────────────────────────

describe("period helpers", () => {
  it("maps a date to its calendar month", () => {
    expect(periodOf(IN_MARCH)).toEqual({ year: 2026, month: 3 });
  });

  it("labels a period in Indonesian", () => {
    expect(periodLabel(2026, 3)).toBe("Maret 2026");
    expect(periodLabel(2026, 12)).toBe("Desember 2026");
  });

  it("bounds a month from its first instant to its last", () => {
    const { start, end } = periodBounds(2026, 2);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(1);
    // 2026 is not a leap year — February ends on the 28th.
    expect(end.getDate()).toBe(28);
    expect(end.getHours()).toBe(23);
  });

  it("treats a month with no row as open, so enabling the lock freezes nothing", async () => {
    const tx = createFakeClient({ periods: [] });
    expect(await isPeriodClosed(IN_MARCH, tx)).toBe(false);
    await expect(assertPeriodOpen(IN_MARCH, tx)).resolves.toBeUndefined();
  });

  it("treats an explicit open row as open", async () => {
    const tx = createFakeClient({ periods: [{ year: 2026, month: 3, status: "open" }] });
    expect(await isPeriodClosed(IN_MARCH, tx)).toBe(false);
  });

  it("reports a closed month as closed, and only that month", async () => {
    const tx = createFakeClient({ periods: MARCH_CLOSED });
    expect(await isPeriodClosed(IN_MARCH, tx)).toBe(true);
    expect(await isPeriodClosed(IN_APRIL, tx)).toBe(false);
  });

  it("explains itself in Indonesian, naming the period and the way out", async () => {
    const tx = createFakeClient({ periods: MARCH_CLOSED });
    const error = await assertPeriodOpen(IN_MARCH, tx).catch((e) => e);

    expect(error).toBeInstanceOf(ClosedPeriodError);
    expect(error.year).toBe(2026);
    expect(error.month).toBe(3);
    expect(error.message).toContain("Maret 2026");
    expect(error.message).toContain("sudah ditutup");
    expect(error.message).toContain("Tutup Periode");
  });
});

// ─── Path 1: direct ledger writes ────────────────────────

describe("the ledger refuses to write into a closed month", () => {
  it("blocks postJournal", async () => {
    const tx = createFakeClient({ periods: MARCH_CLOSED });
    await expect(postJournal(balancedEntry(IN_MARCH), tx)).rejects.toBeInstanceOf(
      ClosedPeriodError
    );
    expect(tx._journals).toHaveLength(0);
  });

  it("still allows an open month", async () => {
    const tx = createFakeClient({ periods: MARCH_CLOSED });
    await expect(postJournal(balancedEntry(IN_APRIL), tx)).resolves.toBeTruthy();
    expect(tx._journals).toHaveLength(1);
  });

  it("blocks reversing a journal that sits in a closed month", async () => {
    const periods: FakePeriod[] = [];
    const tx = createFakeClient({ periods });

    const journal = await postJournal(balancedEntry(IN_MARCH), tx);
    periods.push({ year: 2026, month: 3, status: "closed" });

    await expect(reverseJournal(journal.id, tx)).rejects.toBeInstanceOf(ClosedPeriodError);
    // The original is untouched: no reversal added, not marked reversed.
    expect(tx._journals).toHaveLength(1);
    expect(tx._journals[0].isReversed).toBe(false);
  });
});

// ─── Path 2: auto-posting from source documents ──────────

describe("auto-posting cannot rewrite a closed month", () => {
  it("blocks creating a document dated in a closed month", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      periods: MARCH_CLOSED,
      invoices: invoiceSeed(IN_MARCH),
    });

    await expect(
      postForSource({ sourceType: "invoice", sourceId: 7, tx })
    ).rejects.toBeInstanceOf(ClosedPeriodError);
    expect(tx._journals).toHaveLength(0);
  });

  it("blocks EDITING a document dated in a closed month, leaving the ledger intact", async () => {
    const periods: FakePeriod[] = [];
    const invoices = invoiceSeed(IN_MARCH);
    const tx = createFakeClient({ mappings: MAPPINGS, periods, invoices });

    // Booked while March was still open.
    await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    expect(tx._journals).toHaveLength(1);
    const originalCredit = tx._journals[0].lines.reduce((s, l) => s + l.baseCredit, 0);

    // Books are closed and reported. Now someone edits the invoice.
    periods.push({ year: 2026, month: 3, status: "closed" });
    (invoices[7].items as { quantity: number; price: number }[])[0].price = 999_000;

    await expect(
      repostForSource({ sourceType: "invoice", sourceId: 7, tx })
    ).rejects.toBeInstanceOf(ClosedPeriodError);

    // March's ledger is exactly as it was reported: one live journal, unreversed,
    // same amount. This is the regression issue #13 exists to prevent.
    expect(tx._journals).toHaveLength(1);
    expect(tx._journals[0].isReversed).toBe(false);
    expect(tx._journals[0].lines.reduce((s, l) => s + l.baseCredit, 0)).toBe(originalCredit);
  });

  it("blocks DELETING a document dated in a closed month", async () => {
    const periods: FakePeriod[] = [];
    const tx = createFakeClient({
      mappings: MAPPINGS,
      periods,
      invoices: invoiceSeed(IN_MARCH),
    });

    await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    periods.push({ year: 2026, month: 3, status: "closed" });

    // The delete path only ever calls reverseJournal — never postJournal — so a
    // guard placed on postJournal alone would wave this straight through.
    await expect(
      unpostForSource({ sourceType: "invoice", sourceId: 7, tx })
    ).rejects.toBeInstanceOf(ClosedPeriodError);
    expect(tx._journals).toHaveLength(1);
    expect(tx._journals[0].isReversed).toBe(false);
  });

  it("blocks back-dating a document INTO a closed month", async () => {
    const periods: FakePeriod[] = [];
    const invoices = invoiceSeed(IN_APRIL);
    const tx = createFakeClient({ mappings: MAPPINGS, periods, invoices });

    await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    periods.push({ year: 2026, month: 3, status: "closed" });

    // Edit moves an April document back into closed March.
    invoices[7].date = IN_MARCH;
    await expect(
      repostForSource({ sourceType: "invoice", sourceId: 7, tx })
    ).rejects.toBeInstanceOf(ClosedPeriodError);
  });

  it("lets an open month be edited normally", async () => {
    const invoices = invoiceSeed(IN_APRIL);
    const tx = createFakeClient({ mappings: MAPPINGS, periods: MARCH_CLOSED, invoices });

    await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    (invoices[7].items as { quantity: number; price: number }[])[0].price = 200_000;
    await expect(
      repostForSource({ sourceType: "invoice", sourceId: 7, tx })
    ).resolves.toBeTruthy();

    // Original reversed, replacement posted — the normal edit trail.
    expect(tx._journals[0].isReversed).toBe(true);
    expect(tx._journals).toHaveLength(3);
  });
});

// ─── API surface ─────────────────────────────────────────

describe("a closed period reaches the client as an actionable 422", () => {
  it("maps ClosedPeriodError to 422 with a machine-readable code and the period", async () => {
    const response = postingErrorResponse(new ClosedPeriodError(2026, 3));
    expect(response?.status).toBe(422);

    const body = await response?.json();
    expect(body.code).toBe("period_closed");
    expect(body.period).toEqual({ year: 2026, month: 3 });
    expect(body.saved).toBe(false);
    expect(body.error).toContain("Maret 2026");
    // Says out loud that the document write was rolled back with it.
    expect(body.error).toContain(NOT_SAVED_NOTICE);
  });
});

describe("close / reopen input rules", () => {
  it("accepts a well-formed close", () => {
    expect(periodCloseSchema.safeParse({ year: 2026, month: 3 }).success).toBe(true);
  });

  it("rejects an impossible month", () => {
    expect(periodCloseSchema.safeParse({ year: 2026, month: 13 }).success).toBe(false);
    expect(periodCloseSchema.safeParse({ year: 2026, month: 0 }).success).toBe(false);
  });

  it("demands a written reason before reopening", () => {
    expect(periodReopenSchema.safeParse({ year: 2026, month: 3 }).success).toBe(false);
    expect(periodReopenSchema.safeParse({ year: 2026, month: 3, reason: "x" }).success).toBe(false);
    expect(
      periodReopenSchema.safeParse({
        year: 2026,
        month: 3,
        reason: "Koreksi faktur SI.2026.03.00007 yang salah nominal.",
      }).success
    ).toBe(true);
  });
});
