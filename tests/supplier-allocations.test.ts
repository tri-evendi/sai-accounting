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

/* ─── INVARIANT 1: an edit keeps the journal honest, per currency (issue #42) ─── */

/**
 * Asserted against the route source rather than by running it.
 *
 * The rule USED to be "this code path may not call the posting engine". Issue #42
 * changed it: for a foreign-currency payment the allocation decides which slice of
 * hutang is relieved at which document rate, hence the realised selisih kurs, so
 * an edit MUST repost — while a pure-IDR payment stays reporting-only. The
 * regression that now matters is either half slipping: someone deleting the repost
 * because it "felt safe", or someone reposting an IDR payment for symmetry and
 * churning journals that never change. Both are statements about the code, so both
 * are checked by reading it — the same method #37/#38 used for the old rule.
 */
describe("INVARIANT: an allocation edit reposts a foreign payment, and only a foreign one", () => {
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

  it("PUT reposts through the shared engine, never a bespoke posting path", () => {
    const put = handler("PUT");
    // The whole of #42: reuse the one engine entry point, so the reposted journal
    // is exactly what a fresh post produces. Never touch the ledger tables direct.
    expect(put).toContain("repostForSource(");
    expect(put).not.toContain("postJournal");
    expect(put).not.toContain("reverseJournal");
    expect(put).not.toContain("journal.");
  });

  it("PUT gates the repost on currency — an IDR payment is reporting-only still", () => {
    const put = handler("PUT");
    // The repost sits under an `isForeign` guard derived from BASE_CURRENCY. A
    // pure-IDR payment has no rate and no FX, so its allocation moves no money.
    const guardIdx = put.indexOf("isForeign");
    const repostIdx = put.indexOf("repostForSource(");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(repostIdx).toBeGreaterThan(guardIdx);
    expect(put).toContain("BASE_CURRENCY");
  });

  it("PUT replaces the allocation set atomically and never writes the payment row", () => {
    const put = handler("PUT");
    expect(put).toContain("supplierPaymentAllocation.deleteMany");
    expect(put).toContain("supplierPaymentAllocation.createMany");
    expect(put).not.toContain("supplierTransaction.update");
    expect(put).not.toContain("supplierTransaction.delete");
    // The repost must share the allocation write's transaction, or a failed post
    // could commit a half-edited set — so it takes `tx`, and the block catches
    // posting failures the way the create path does.
    expect(put).toContain("handlePostingError");
  });

  it("DELETE guards the RESTRICT'd purchase FK so no journal is left stale", () => {
    const del = handler("DELETE");
    // A purchase a payment still points at cannot be deleted out from under that
    // payment's journal; the route surfaces the RESTRICT as a clean 409.
    expect(del).toContain("allocationsReceived");
    expect(del).toContain("409");
  });

  it("the check is meaningful: the create path posts, the delete path unposts", () => {
    expect(handler("POST")).toContain("postForSource(");
    expect(handler("DELETE")).toContain("unpostForSource(");
  });

  it("the allocation helper module still never imports the posting engine", () => {
    // The repost is wired at the write SITE (the route), not buried in the shared
    // validation helper — that module still only shapes and checks rows.
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

/* ─ INVARIANT 2, FX: the AP total holds even when the edit changes the FX (issue #42) ─ */

/**
 * The foreign-currency case of the same acceptance criterion. Editing a foreign
 * payment's allocation genuinely changes its JOURNAL (which hutang slice is
 * relieved at which rate, and hence the realised selisih kurs) — that is what #42
 * is about. What must NOT change is the reported per-supplier AP total in IDR
 * base: `getPayables` measures it as Σ(purchase base) − Σ(payment base), and
 * neither sum depends on how a payment is split across purchases.
 */
describe("INVARIANT: a foreign payment's AP total is unmoved by any allocation edit", () => {
  const asOf = d("2026-07-20");
  const supplier = { name: "Jiangsu Trading" };

  // Two USD purchases booked at the same 15.000 so the IDR base arithmetic is
  // transparent: 4.000 USD = 60 juta, 6.000 USD = 90 juta, total 150 juta.
  const usdPurchase = (id: number, date: Date, amountUsd: number) => ({
    id,
    supplierId: 7,
    date,
    dueDate: null,
    type: "purchase",
    amount: amountUsd,
    currency: "USD",
    rate: 15_000,
    baseAmount: amountUsd * 15_000,
    taxAmount: 0,
    note: null,
    supplier,
    allocationsMade: [],
  });

  const usdAlloc = (purchaseId: number, amountUsd: number) => ({
    purchaseId,
    amount: amountUsd,
    currency: "USD",
    rate: 15_000,
    baseAmount: amountUsd * 15_000,
  });

  // One USD 8.000 payment (120 juta base) against 150 juta of debt.
  const build = (allocationsMade: unknown[]) =>
    ({
      invoice: { findMany: async () => [] },
      contract: { findMany: async () => [] },
      supplierTransaction: {
        findMany: async () => [
          usdPurchase(1, d("2026-01-10"), 4_000),
          usdPurchase(2, d("2026-02-10"), 6_000),
          {
            ...usdPurchase(90, d("2026-03-01"), 8_000),
            id: 90,
            type: "payment",
            date: d("2026-03-01"),
            allocationsMade,
          },
        ],
      },
    }) as unknown as Parameters<typeof getPayables>[1];

  it("ACCEPTANCE: reallocating a USD payment moves the split and the FX, not the AP total", async () => {
    // Config A settles purchase 1 in full and 4.000 USD of purchase 2.
    const a = await getPayables({ asOf }, build([usdAlloc(1, 4_000), usdAlloc(2, 4_000)]));
    // Config B settles 2.000 USD of purchase 1 and purchase 2 in full — a
    // different journal entirely (different slices, different realised FX).
    const b = await getPayables({ asOf }, build([usdAlloc(1, 2_000), usdAlloc(2, 6_000)]));

    // 150 juta of debt less 120 juta of payment = 30 juta, in BOTH configurations.
    expect(a.byParty[0].outstandingBase).toBe(30_000_000);
    expect(b.byParty[0].outstandingBase).toBe(a.byParty[0].outstandingBase);
    expect(b.aging.total).toBe(a.aging.total);

    // ...yet which purchase stays open genuinely differs — the split really moved.
    expect(a.rows.map((r) => r.id)).toEqual([2]);
    expect(b.rows.map((r) => r.id)).toEqual([1]);
  });

  it("holds when the edit hands part of the payment back to the FIFO estimate", async () => {
    const full = await getPayables({ asOf }, build([usdAlloc(1, 4_000), usdAlloc(2, 4_000)]));
    // Drop one line: the freed 4.000 USD returns to the pool and is estimated, but
    // the supplier's IDR-base AP total is the same 30 juta.
    const partial = await getPayables({ asOf }, build([usdAlloc(1, 4_000)]));

    expect(partial.byParty[0].outstandingBase).toBe(full.byParty[0].outstandingBase);
    expect(partial.byParty[0].outstandingBase).toBe(30_000_000);
  });
});
