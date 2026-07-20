/**
 * Re-allocating an existing supplier payment (issue #38).
 *
 * #37 could only record an allocation while the payment was being created. The
 * work here lets one be edited, removed, or added to a payment that never had
 * any — the legacy case, which is every supplier payment predating #37.
 *
 * Two invariants carry over from #37 and are asserted here for the *edit* path,
 * not just the create path:
 *
 *  1. **No journal changes.** Allocation is reporting data. The endpoint that
 *     writes it must never call the posting engine — asserted structurally
 *     against the route source, because "which functions may this code path
 *     call" is exactly the kind of rule a behavioural test cannot pin down.
 *  2. **Per-supplier AP total is byte-identical** before and after any
 *     allocation change. Asserted by running the identical money through
 *     `getPayables` in each state — unallocated, allocated, edited, cleared —
 *     and comparing supplier totals, the same method #37 used.
 *
 * And one rule specific to editing: a payment's own current allocations must not
 * count against the room available to their own replacements. Getting that wrong
 * is the classic off-by-one of edit flows — it would let a user record an
 * allocation once and then never correct it upwards.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { getPayables, getSupplierPurchaseAllocations } from "@/lib/receivables";
import { resolveAllocationLines } from "@/lib/supplier-allocations";
import { supplierPaymentAllocationsSchema } from "@/lib/validations/finance";

const d = (s: string) => new Date(`${s}T00:00:00`);

/** Paths of the issues a failed parse produced, for terse assertions. */
function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((i) => i.path.join(".")) ?? [];
}

/* ───────────────────────────── Stub data access ────────────────────────────── */

interface StubPurchase {
  id: number;
  supplierId: number;
  date: Date;
  amount: number;
  taxAmount?: number;
  currency?: string;
  rate?: number | null;
  baseAmount?: number | null;
  allocationsReceived?: { paymentId: number; amount: number; currency?: string; rate?: number | null; baseAmount?: number | null }[];
}

/**
 * Stands in for Prisma. It honours the `where` clause on purpose: the supplier
 * filter is half of the ownership guard, so a stub that ignored it would make
 * the cross-supplier test pass without proving anything.
 */
function stubClient(purchases: StubPurchase[]) {
  return {
    supplierTransaction: {
      findMany: async ({ where }: { where: { supplierId: number; type: string } }) =>
        purchases
          .filter((p) => p.supplierId === where.supplierId)
          .map((p) => ({
            taxAmount: 0,
            currency: "IDR",
            rate: null,
            baseAmount: null,
            dueDate: null,
            note: null,
            allocationsReceived: [],
            ...p,
          })),
    },
  } as unknown as Parameters<typeof getSupplierPurchaseAllocations>[1];
}

/* ─────────────────── Room left, with the edited payment excluded ────────────── */

describe("getSupplierPurchaseAllocations — room for the payment being edited", () => {
  const purchase: StubPurchase = {
    id: 1,
    supplierId: 5,
    date: d("2026-01-10"),
    amount: 1_000_000,
  };

  it("counts every recorded allocation when no payment is being edited", async () => {
    const state = await getSupplierPurchaseAllocations(
      5,
      stubClient([
        {
          ...purchase,
          allocationsReceived: [{ paymentId: 90, amount: 400_000, baseAmount: 400_000 }],
        },
      ])
    );
    expect(state[0].allocatedBase).toBe(400_000);
    expect(state[0].remainingBase).toBe(600_000);
  });

  it("THE EDIT OFF-BY-ONE: a payment does not compete with itself for room", async () => {
    const client = stubClient([
      {
        ...purchase,
        allocationsReceived: [{ paymentId: 90, amount: 400_000, baseAmount: 400_000 }],
      },
    ]);

    // Payment 90 already put 400k here. That 400k is not a constraint on its
    // replacement — it IS the thing being replaced. Excluding it exposes the
    // purchase's full value, so payment 90 may raise its allocation to 1m.
    const editing = await getSupplierPurchaseAllocations(5, client, { excludePaymentId: 90 });
    expect(editing[0].allocatedBase).toBe(0);
    expect(editing[0].remainingBase).toBe(1_000_000);
  });

  it("still counts OTHER payments' allocations while one is being edited", async () => {
    const state = await getSupplierPurchaseAllocations(
      5,
      stubClient([
        {
          ...purchase,
          allocationsReceived: [
            { paymentId: 90, amount: 400_000, baseAmount: 400_000 },
            { paymentId: 91, amount: 300_000, baseAmount: 300_000 },
          ],
        },
      ]),
      { excludePaymentId: 90 }
    );
    // Only payment 91's 300k binds: the ceiling for payment 90 is 700k, not 1m
    // and not 300k. Excluding one payment must not excuse the rest.
    expect(state[0].allocatedBase).toBe(300_000);
    expect(state[0].remainingBase).toBe(700_000);
  });

  it("excludes a rateless foreign allocation from the room, as it always did", async () => {
    const state = await getSupplierPurchaseAllocations(
      5,
      stubClient([
        {
          ...purchase,
          allocationsReceived: [
            { paymentId: 91, amount: 100, currency: "USD", rate: null, baseAmount: null },
          ],
        },
      ]),
      { excludePaymentId: 90 }
    );
    // 100 USD with no rate has no IDR value; it is never folded in at 1:1.
    expect(state[0].allocatedBase).toBe(0);
    expect(state[0].remainingBase).toBe(1_000_000);
  });
});

/* ───────────────────── The database-side over-allocation guard ─────────────── */

describe("resolveAllocationLines — the guard shared by create and edit", () => {
  const purchases: StubPurchase[] = [
    { id: 1, supplierId: 5, date: d("2026-01-10"), amount: 1_000_000 },
    { id: 2, supplierId: 5, date: d("2026-02-10"), amount: 500_000 },
    // Another supplier's purchase, to prove allocations cannot cross the line.
    { id: 3, supplierId: 6, date: d("2026-01-10"), amount: 800_000 },
  ];

  it("allocates a legacy payment that never had any", async () => {
    const result = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [{ purchaseId: 1, amount: 400_000 }],
      excludePaymentId: 90,
      client: stubClient(purchases),
    });
    expect(result).toEqual({
      ok: true,
      lines: [{ purchaseId: 1, amount: 400_000, base: 400_000 }],
    });
  });

  it("accepts an empty set — clearing every allocation is a valid outcome", async () => {
    const result = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [],
      excludePaymentId: 90,
      client: stubClient(purchases),
    });
    expect(result).toEqual({ ok: true, lines: [] });
  });

  it("lets an edit RAISE its own allocation to the purchase's full value", async () => {
    const client = stubClient([
      {
        ...purchases[0],
        allocationsReceived: [{ paymentId: 90, amount: 400_000, baseAmount: 400_000 }],
      },
      purchases[1],
    ]);

    // Without the exclusion this is 1m against a 600k remainder — rejected, and
    // the user could never correct an allocation upwards.
    const raised = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [{ purchaseId: 1, amount: 1_000_000 }],
      excludePaymentId: 90,
      client,
    });
    expect(raised.ok).toBe(true);

    // ...and the same request from a DIFFERENT payment is still rejected, which
    // is what proves the exclusion is scoped to the payment being edited.
    const other = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [{ purchaseId: 1, amount: 1_000_000 }],
      excludePaymentId: 91,
      client,
    });
    expect(other.ok).toBe(false);
  });

  it("rejects an edit that exceeds what OTHER payments left behind", async () => {
    const client = stubClient([
      {
        ...purchases[0],
        allocationsReceived: [
          { paymentId: 90, amount: 400_000, baseAmount: 400_000 },
          { paymentId: 91, amount: 300_000, baseAmount: 300_000 },
        ],
      },
    ]);

    const atCeiling = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [{ purchaseId: 1, amount: 700_000 }],
      excludePaymentId: 90,
      client,
    });
    expect(atCeiling.ok).toBe(true);

    const overCeiling = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [{ purchaseId: 1, amount: 700_001 }],
      excludePaymentId: 90,
      client,
    });
    expect(overCeiling.ok).toBe(false);
    if (!overCeiling.ok) expect(overCeiling.error).toContain("melebihi sisa utangnya");
  });

  it("rejects an allocation to another supplier's purchase, edit path included", async () => {
    const result = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [{ purchaseId: 3, amount: 100_000 }],
      excludePaymentId: 90,
      client: stubClient(purchases),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("tidak ditemukan pada supplier ini");
  });

  it("decrements room across lines — two edits that fit alone but not together", async () => {
    const result = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [
        { purchaseId: 2, amount: 400_000 },
        // Purchase 2 is worth 500k: 400k + 200k does not fit, and the second
        // line must be measured against what the first one already took.
        { purchaseId: 2, amount: 200_000 },
      ],
      excludePaymentId: 90,
      client: stubClient(purchases),
    });
    expect(result.ok).toBe(false);
  });

  it("refuses to allocate against a purchase with no usable rate", async () => {
    const result = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [{ purchaseId: 4, amount: 100_000 }],
      excludePaymentId: 90,
      client: stubClient([
        {
          id: 4,
          supplierId: 5,
          date: d("2026-01-10"),
          amount: 1_000,
          currency: "USD",
          rate: null,
          baseAmount: null,
        },
      ]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("belum punya kurs");
  });

  it("converts a foreign edit at the PAYMENT's rate before comparing", async () => {
    const client = stubClient(purchases);

    // 100 USD at 16,000 = 1.6m IDR, which overflows purchase 2's 500k...
    const over = await resolveAllocationLines({
      supplierId: 5,
      currency: "USD",
      rate: 16_000,
      allocations: [{ purchaseId: 2, amount: 100 }],
      excludePaymentId: 90,
      client,
    });
    expect(over.ok).toBe(false);

    // ...while 30 USD is 480k, which fits. Never compared raw: 100 USD is not
    // 100 IDR, and the guard works in IDR base only.
    const fits = await resolveAllocationLines({
      supplierId: 5,
      currency: "USD",
      rate: 16_000,
      allocations: [{ purchaseId: 2, amount: 30 }],
      excludePaymentId: 90,
      client,
    });
    expect(fits).toEqual({ ok: true, lines: [{ purchaseId: 2, amount: 30, base: 480_000 }] });
  });

  it("measures room from recorded allocations only, never net of the FIFO guess", async () => {
    // Purchase 1 is entirely covered by a FIFO estimate in the report, because
    // the supplier's legacy payment has to land somewhere. That guess must not
    // consume the room a user needs to record the truth.
    const result = await resolveAllocationLines({
      supplierId: 5,
      currency: "IDR",
      allocations: [{ purchaseId: 1, amount: 1_000_000 }],
      excludePaymentId: 90,
      client: stubClient([purchases[0], purchases[1]]),
    });
    expect(result.ok).toBe(true);
  });
});

/* ──────────────────────── The payload-side cap on an edit ──────────────────── */

describe("supplierPaymentAllocationsSchema — the edit payload", () => {
  it("accepts a set that fits inside the stored payment amount", () => {
    const result = supplierPaymentAllocationsSchema(1_000_000).safeParse({
      transactionId: 90,
      allocations: [
        { purchaseId: 1, amount: 600_000 },
        { purchaseId: 2, amount: 400_000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty set — that is how an allocation is removed", () => {
    const result = supplierPaymentAllocationsSchema(1_000_000).safeParse({
      transactionId: 90,
      allocations: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects allocating more than the payment is worth, exactly as create does", () => {
    const result = supplierPaymentAllocationsSchema(1_000_000).safeParse({
      transactionId: 90,
      allocations: [
        { purchaseId: 1, amount: 600_000 },
        { purchaseId: 2, amount: 500_000 },
      ],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("allocations");
  });

  it("caps against the STORED amount, so a client cannot raise its own ceiling", () => {
    // The payload carries an `amount` of its own; it is ignored. Only the amount
    // the route read from the database decides the cap.
    const result = supplierPaymentAllocationsSchema(100_000).safeParse({
      transactionId: 90,
      amount: 9_999_999,
      allocations: [{ purchaseId: 1, amount: 500_000 }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("allocations");
  });

  it("rejects the same purchase twice in one edit", () => {
    const result = supplierPaymentAllocationsSchema(1_000_000).safeParse({
      transactionId: 90,
      allocations: [
        { purchaseId: 1, amount: 100_000 },
        { purchaseId: 1, amount: 100_000 },
      ],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("allocations.1.purchaseId");
  });

  it("rejects a zero or negative allocation amount", () => {
    expect(
      supplierPaymentAllocationsSchema(1_000).safeParse({
        transactionId: 90,
        allocations: [{ purchaseId: 1, amount: 0 }],
      }).success
    ).toBe(false);
    expect(
      supplierPaymentAllocationsSchema(1_000).safeParse({
        transactionId: 90,
        allocations: [{ purchaseId: 1, amount: -5 }],
      }).success
    ).toBe(false);
  });

  it("requires a transaction id — an edit must name what it edits", () => {
    const result = supplierPaymentAllocationsSchema(1_000).safeParse({ allocations: [] });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("transactionId");
  });
});

/* ───────────── INVARIANT 1: allocation never touches the ledger ────────────── */

/**
 * Asserted against the route source rather than by running it.
 *
 * The rule is "this code path may not call the posting engine", and that is a
 * statement about the code, not about one execution of it: a behavioural test
 * only shows that the calls did not happen for the inputs it happened to try.
 * Reading the source catches the regression that matters — someone adding a
 * `repostForSource` to the allocation handler because it felt symmetrical.
 */
describe("INVARIANT: the allocation endpoint writes no journal", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/suppliers/[id]/transactions/route.ts"),
    "utf8"
  );

  /** Body of one exported handler, up to the next `export async function`. */
  function handler(name: string): string {
    const start = source.indexOf(`export async function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const rest = source.slice(start + 1);
    const end = rest.indexOf("\nexport async function ");
    return end === -1 ? rest : rest.slice(0, end);
  }

  const POSTING_CALLS = ["postForSource(", "repostForSource(", "unpostForSource("];

  it("PUT calls no posting function at all", () => {
    const put = handler("PUT");
    for (const call of POSTING_CALLS) expect(put).not.toContain(call);
  });

  it("PUT touches only the allocation table, never the transaction or the ledger", () => {
    const put = handler("PUT");
    // It may read the payment (findFirst) but must not write it, and must not
    // reach the journal tables directly either.
    expect(put).not.toContain("supplierTransaction.update");
    expect(put).not.toContain("supplierTransaction.delete");
    expect(put).not.toContain("journal");
    expect(put).toContain("supplierPaymentAllocation.deleteMany");
    expect(put).toContain("supplierPaymentAllocation.createMany");
  });

  it("the check is meaningful: the create and delete paths DO post", () => {
    // Without this, the assertions above would pass on a file that had no
    // posting anywhere and prove nothing.
    expect(handler("POST")).toContain("postForSource(");
    expect(handler("DELETE")).toContain("unpostForSource(");
  });

  it("the allocation helper module never imports the posting engine", () => {
    const helper = readFileSync(path.join(process.cwd(), "src/lib/supplier-allocations.ts"), "utf8");
    expect(helper).not.toContain("@/lib/posting");
    expect(helper).not.toContain("@/lib/ledger");
  });
});

/* ────────── INVARIANT 2: the supplier's AP total never moves on an edit ─────── */

describe("INVARIANT: per-supplier AP total is identical across every edit", () => {
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

  const alloc = (purchaseId: number, amount: number) => ({
    purchaseId,
    amount,
    currency: "IDR",
    rate: null,
    baseAmount: amount,
  });

  /** The same money, differing only in what the payment says it settles. */
  const build = (allocationsMade: unknown[]) =>
    ({
      invoice: { findMany: async () => [] },
      contract: { findMany: async () => [] },
      supplierTransaction: {
        findMany: async () => [
          purchase({ id: 1, date: d("2026-01-10"), amount: 1_000_000 }),
          purchase({ id: 2, date: d("2026-02-10"), amount: 500_000 }),
          purchase({ id: 3, date: d("2026-03-10"), amount: 300_000 }),
          payment({ id: 90, amount: 1_200_000, allocationsMade }),
        ],
      },
    }) as unknown as Parameters<typeof getPayables>[1];

  it("ACCEPTANCE: editing an allocation moves the split, never the total", async () => {
    // Three states of the same 1.2m payment: as first recorded, after the user
    // corrects it to a different set of purchases, and after clearing it back
    // to nothing (the legacy state).
    const before = await getPayables({ asOf }, build([alloc(1, 1_000_000), alloc(2, 200_000)]));
    const edited = await getPayables({ asOf }, build([alloc(3, 300_000), alloc(2, 500_000), alloc(1, 400_000)]));
    const cleared = await getPayables({ asOf }, build([]));

    // Not a rupiah moved by either operation.
    expect(edited.byParty[0].outstandingBase).toBe(before.byParty[0].outstandingBase);
    expect(cleared.byParty[0].outstandingBase).toBe(before.byParty[0].outstandingBase);
    expect(before.byParty[0].outstandingBase).toBe(600_000); // 1.8m − 1.2m
    expect(edited.aging.total).toBe(before.aging.total);
    expect(cleared.aging.total).toBe(before.aging.total);

    // ...but the per-row split genuinely differs, which is the point of editing.
    expect(before.rows.map((r) => r.id)).toEqual([3, 2]);
    expect(edited.rows.map((r) => r.id)).toEqual([1]);
  });

  it("ACCEPTANCE: removing one line of a multi-line allocation keeps the total", async () => {
    const both = await getPayables({ asOf }, build([alloc(2, 500_000), alloc(3, 300_000)]));
    // The user deletes the line against purchase 3; that 300k does not vanish,
    // it returns to the unallocated pool and is estimated instead.
    const removed = await getPayables({ asOf }, build([alloc(2, 500_000)]));

    expect(removed.byParty[0].outstandingBase).toBe(both.byParty[0].outstandingBase);
    expect(removed.byParty[0].outstandingBase).toBe(600_000);
    expect(removed.aging.total).toBe(both.aging.total);
  });

  it("ACCEPTANCE: allocating a legacy payment keeps the total and drops the badge", async () => {
    const legacy = await getPayables({ asOf }, build([]));
    const fixed = await getPayables({ asOf }, build([alloc(3, 300_000), alloc(2, 500_000), alloc(1, 400_000)]));

    expect(fixed.byParty[0].outstandingBase).toBe(legacy.byParty[0].outstandingBase);
    expect(fixed.aging.total).toBe(legacy.aging.total);

    // The badge is the user-visible payoff: before, FIFO guessed and the rows it
    // touched were flagged; after, every remaining row is backed by a recorded
    // allocation and nothing is flagged.
    expect(legacy.rows.some((r) => r.allocationEstimated)).toBe(true);
    expect(fixed.rows.some((r) => r.allocationEstimated)).toBe(false);
  });

  it("keeps the badge semantics exact: only rows FIFO actually reached are flagged", async () => {
    // 1.2m unallocated clears purchase 1 (1m) and 200k of purchase 2. Purchase 3
    // is never reached, so it is NOT flagged — it absorbed no guessed money.
    const legacy = await getPayables({ asOf }, build([]));
    const byId = new Map(legacy.rows.map((r) => [r.id, r]));
    expect(byId.get(2)!.allocationEstimated).toBe(true);
    expect(byId.get(3)!.allocationEstimated).toBe(false);
  });

  it("keeps the total when an edit leaves part of the payment unallocated", async () => {
    // A half-finished correction — one line recorded, the rest still guessed —
    // must be just as safe as a complete one.
    const none = await getPayables({ asOf }, build([]));
    const partial = await getPayables({ asOf }, build([alloc(3, 300_000)]));

    expect(partial.byParty[0].outstandingBase).toBe(none.byParty[0].outstandingBase);
    expect(partial.aging.total).toBe(none.aging.total);
  });
});
