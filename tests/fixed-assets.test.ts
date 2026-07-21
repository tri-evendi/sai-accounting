/**
 * Aset Tetap + penyusutan (issue #28).
 *
 *  1. Pure straight-line math: periodic amount, the final-period true-up (so
 *     accumulated never exceeds cost − residual), a fully-depreciated asset
 *     stopping, and disposal gain/loss.
 *  2. The pure journal builders (D: Beban Penyusutan / K: Akumulasi Penyusutan;
 *     disposal removal + laba/rugi pelepasan) balanced on IDR base.
 *  3. The posting engine end-to-end against the in-memory fake client:
 *     depreciation & disposal journals, idempotent re-run of a posted period,
 *     and a closed-period run refused by the period lock.
 */
import { describe, expect, it } from "vitest";
import { assertBalanced, prepareLines, type JournalLineInput } from "@/lib/ledger";
import {
  depreciableBase,
  bookValue,
  straightLineMonthly,
  depreciationForPeriod,
  nextPeriodDepreciation,
  isFullyDepreciated,
  depreciationSchedule,
  disposalGainLoss,
  DepreciationError,
} from "@/lib/depreciation";
import {
  PostingRuleError,
  buildDepreciationLines,
  buildAssetDisposalLines,
  postForSource,
  MAPPING_KEYS,
  ANY_CURRENCY,
} from "@/lib/posting";
import { ClosedPeriodError } from "@/lib/period";
import { createFakeClient, type FakeJournal, type FakeMapping } from "./fake-client";

const ACC = { asset: 1201, accum: 1202, expense: 6103, cash: 1101, gainLoss: 7103 };

function expectBalanced(lines: JournalLineInput[]) {
  const prepared = prepareLines(lines);
  expect(() => assertBalanced(prepared)).not.toThrow();
  return prepared;
}
const debitOn = (lines: JournalLineInput[], id: number) =>
  lines.filter((l) => l.accountId === id).reduce((s, l) => s + (l.debit ?? 0), 0);
const creditOn = (lines: JournalLineInput[], id: number) =>
  lines.filter((l) => l.accountId === id).reduce((s, l) => s + (l.credit ?? 0), 0);

// ─── 1. Pure straight-line math ──────────────────────────

describe("straight-line depreciation math", () => {
  it("computes the nominal monthly amount", () => {
    // 12,000,000 over 12 months, no residual → 1,000,000/month.
    expect(straightLineMonthly({ cost: 12_000_000, residualValue: 0, usefulLifeMonths: 12 })).toBe(
      1_000_000
    );
  });

  it("respects the residual value in the depreciable base", () => {
    expect(depreciableBase(10_000_000, 1_000_000)).toBe(9_000_000);
    // 9,000,000 over 12 months.
    expect(straightLineMonthly({ cost: 10_000_000, residualValue: 1_000_000, usefulLifeMonths: 12 })).toBe(
      750_000
    );
  });

  it("trues up the final period so accumulated never exceeds cost − residual", () => {
    // 10,000,000 − 1,000,000 residual over 7 months does NOT divide evenly.
    const params = { cost: 10_000_000, residualValue: 1_000_000, usefulLifeMonths: 7 };
    const base = depreciableBase(params.cost, params.residualValue); // 9,000,000
    const schedule = depreciationSchedule(params, 2026, 1);

    expect(schedule).toHaveLength(7);
    // Every period except the last is the nominal monthly amount.
    const monthly = straightLineMonthly(params); // 1,285,714.29
    for (const row of schedule.slice(0, 6)) expect(row.amount).toBe(monthly);
    // The last period is a few cents different — the true-up.
    expect(schedule[6].amount).not.toBe(monthly);
    // Accumulated lands EXACTLY on the base, never a cent over.
    expect(schedule[6].accumulated).toBe(base);
    expect(schedule.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(base, 2);
    // Book value ends exactly at the residual.
    expect(schedule[6].bookValue).toBe(params.residualValue);
  });

  it("trues up the final period rather than spilling a rounding tail into an extra one", () => {
    // 1000 / 3 = 333.33 (rounds down), so 3 × 333.33 = 999.99 would leave a
    // 0.01 tail. The final period must absorb it — exactly 3 periods, not 4.
    const params = { cost: 1_000, residualValue: 0, usefulLifeMonths: 3 };
    expect(depreciationForPeriod(params, 1)).toBe(333.33);
    expect(depreciationForPeriod(params, 2)).toBe(333.33);
    expect(depreciationForPeriod(params, 3)).toBe(333.34); // true-up
    expect(depreciationForPeriod(params, 4)).toBe(0); // beyond useful life
    const schedule = depreciationSchedule(params, 2026, 1);
    expect(schedule).toHaveLength(3);
    expect(schedule[2].accumulated).toBe(1_000);
  });

  it("stops a fully-depreciated asset (returns 0, isFullyDepreciated true)", () => {
    const params = { cost: 6_000_000, residualValue: 0, usefulLifeMonths: 6 };
    expect(isFullyDepreciated(params, 6_000_000)).toBe(true);
    // Six periods already elapsed → nothing more to post.
    expect(nextPeriodDepreciation(params, 6, 6_000_000)).toBe(0);
    // A seventh calendar month never depreciates beyond the useful life.
    expect(depreciationForPeriod(params, 7)).toBe(0);
  });

  it("book value = cost − accumulated", () => {
    expect(bookValue(5_000_000, 2_000_000)).toBe(3_000_000);
  });

  it("rejects bad parameters loudly", () => {
    expect(() => straightLineMonthly({ cost: 0, residualValue: 0, usefulLifeMonths: 12 })).toThrow(
      DepreciationError
    );
    expect(() =>
      straightLineMonthly({ cost: 1000, residualValue: 2000, usefulLifeMonths: 12 })
    ).toThrow(DepreciationError);
    expect(() =>
      straightLineMonthly({ cost: 1000, residualValue: 0, usefulLifeMonths: 0 })
    ).toThrow(DepreciationError);
    expect(() =>
      straightLineMonthly({ cost: 1000, residualValue: 0, usefulLifeMonths: 12, method: "double_declining" })
    ).toThrow(DepreciationError);
  });
});

describe("disposal gain/loss (laba/rugi pelepasan)", () => {
  it("gain when proceeds exceed net book value", () => {
    // NBV = 10,000,000 − 6,000,000 = 4,000,000; sold for 5,000,000 → gain 1,000,000.
    expect(disposalGainLoss(10_000_000, 6_000_000, 5_000_000)).toBe(1_000_000);
  });
  it("loss when proceeds fall below net book value", () => {
    // NBV = 4,000,000; sold for 2,500,000 → loss 1,500,000 (negative).
    expect(disposalGainLoss(10_000_000, 6_000_000, 2_500_000)).toBe(-1_500_000);
  });
  it("full loss on a scrapped asset with no proceeds", () => {
    expect(disposalGainLoss(10_000_000, 6_000_000, 0)).toBe(-4_000_000);
  });
});

// ─── 2. Pure journal builders ────────────────────────────

describe("buildDepreciationLines → D: Beban Penyusutan, K: Akumulasi Penyusutan", () => {
  it("books a balanced IDR journal", () => {
    const lines = buildDepreciationLines({
      expenseAccountId: ACC.expense,
      accumulatedAccountId: ACC.accum,
      amount: 1_000_000,
    });
    expect(debitOn(lines, ACC.expense)).toBe(1_000_000);
    expect(creditOn(lines, ACC.accum)).toBe(1_000_000);
    expect(lines).toHaveLength(2);
    expectBalanced(lines);
  });

  it("refuses a non-positive amount and a self-referencing pair", () => {
    expect(() =>
      buildDepreciationLines({ expenseAccountId: ACC.expense, accumulatedAccountId: ACC.accum, amount: 0 })
    ).toThrow(PostingRuleError);
    expect(() =>
      buildDepreciationLines({ expenseAccountId: 5, accumulatedAccountId: 5, amount: 100 })
    ).toThrow(PostingRuleError);
  });
});

describe("buildAssetDisposalLines → remove cost + accum, book proceeds & gain/loss", () => {
  it("gain case: proceeds above NBV credit the gain, balanced", () => {
    const lines = buildAssetDisposalLines({
      assetAccountId: ACC.asset,
      accumulatedAccountId: ACC.accum,
      cashAccountId: ACC.cash,
      gainLossAccountId: ACC.gainLoss,
      cost: 10_000_000,
      accumulatedDepreciation: 6_000_000,
      proceeds: 5_000_000,
    });
    expect(debitOn(lines, ACC.accum)).toBe(6_000_000); // remove accumulated
    expect(creditOn(lines, ACC.asset)).toBe(10_000_000); // remove cost
    expect(debitOn(lines, ACC.cash)).toBe(5_000_000); // proceeds in
    expect(creditOn(lines, ACC.gainLoss)).toBe(1_000_000); // gain (income, credit)
    expect(debitOn(lines, ACC.gainLoss)).toBe(0);
    expectBalanced(lines);
  });

  it("loss case: proceeds below NBV debit the loss, balanced", () => {
    const lines = buildAssetDisposalLines({
      assetAccountId: ACC.asset,
      accumulatedAccountId: ACC.accum,
      cashAccountId: ACC.cash,
      gainLossAccountId: ACC.gainLoss,
      cost: 10_000_000,
      accumulatedDepreciation: 6_000_000,
      proceeds: 2_500_000,
    });
    expect(debitOn(lines, ACC.gainLoss)).toBe(1_500_000); // loss (debit)
    expect(creditOn(lines, ACC.gainLoss)).toBe(0);
    expectBalanced(lines);
  });

  it("scrapped, fully depreciated: no proceeds, no gain/loss, still balanced", () => {
    const lines = buildAssetDisposalLines({
      assetAccountId: ACC.asset,
      accumulatedAccountId: ACC.accum,
      cashAccountId: ACC.cash,
      gainLossAccountId: ACC.gainLoss,
      cost: 6_000_000,
      accumulatedDepreciation: 6_000_000,
      proceeds: 0,
    });
    // D: accum 6,000,000, K: asset 6,000,000. No cash, no gain/loss line.
    expect(debitOn(lines, ACC.accum)).toBe(6_000_000);
    expect(creditOn(lines, ACC.asset)).toBe(6_000_000);
    expect(lines.filter((l) => l.accountId === ACC.gainLoss)).toHaveLength(0);
    expect(lines.filter((l) => l.accountId === ACC.cash)).toHaveLength(0);
    expectBalanced(lines);
  });

  it("refuses accumulated depreciation greater than cost", () => {
    expect(() =>
      buildAssetDisposalLines({
        assetAccountId: ACC.asset,
        accumulatedAccountId: ACC.accum,
        cashAccountId: ACC.cash,
        gainLossAccountId: ACC.gainLoss,
        cost: 1_000_000,
        accumulatedDepreciation: 1_200_000,
        proceeds: 0,
      })
    ).toThrow(PostingRuleError);
  });
});

// ─── 3. Posting engine end-to-end (fake client) ──────────

const DATE = new Date("2026-03-31T00:00:00.000Z");
const MAPPINGS: FakeMapping[] = [
  { key: MAPPING_KEYS.CASH_DEFAULT, currency: "IDR", accountId: ACC.cash, isActive: true },
  { key: MAPPING_KEYS.DISPOSAL_GAIN_LOSS, currency: ANY_CURRENCY, accountId: ACC.gainLoss, isActive: true },
];

function expectBalancedIdr(journal: FakeJournal | null) {
  expect(journal).not.toBeNull();
  const d = journal!.lines.reduce((s, l) => s + l.baseDebit, 0);
  const c = journal!.lines.reduce((s, l) => s + l.baseCredit, 0);
  expect(Math.round(d * 100)).toBe(Math.round(c * 100));
  expect(d).toBeGreaterThan(0);
  return journal!;
}

const depSeed = (overrides: Record<string, unknown> = {}) => ({
  1: {
    id: 1,
    assetId: 10,
    year: 2026,
    month: 3,
    date: DATE,
    amount: 1_000_000,
    accumulatedAfter: 1_000_000,
    asset: {
      id: 10,
      assetNo: "FA.2026.00001",
      expenseAccountId: ACC.expense,
      accumulatedAccountId: ACC.accum,
    },
    ...overrides,
  },
});

describe("depreciation posting source", () => {
  it("posts D: Beban Penyusutan / K: Akumulasi Penyusutan, balanced in IDR", async () => {
    const tx = createFakeClient({ fixedAssetDepreciations: depSeed() });
    const j = (await postForSource({ sourceType: "depreciation", sourceId: 1, tx })) as unknown as FakeJournal;
    const journal = expectBalancedIdr(j);
    expect(journal.lines.find((l) => l.accountId === ACC.expense)?.debit).toBe(1_000_000);
    expect(journal.lines.find((l) => l.accountId === ACC.accum)?.credit).toBe(1_000_000);
    expect(journal.sourceType).toBe("depreciation");
  });

  it("is idempotent: re-running a posted period posts nothing new", async () => {
    const tx = createFakeClient({ fixedAssetDepreciations: depSeed() });
    await postForSource({ sourceType: "depreciation", sourceId: 1, tx });
    await postForSource({ sourceType: "depreciation", sourceId: 1, tx });
    // One journal, not two — the live-journal guard prevents the double-post.
    expect(tx._journals.filter((jj) => jj.sourceType === "depreciation")).toHaveLength(1);
  });

  it("refuses to post into a closed period (period lock #13)", async () => {
    const tx = createFakeClient({
      fixedAssetDepreciations: depSeed(),
      periods: [{ year: 2026, month: 3, status: "closed" }],
    });
    await expect(postForSource({ sourceType: "depreciation", sourceId: 1, tx })).rejects.toBeInstanceOf(
      ClosedPeriodError
    );
    expect(tx._journals).toHaveLength(0);
  });
});

const assetSeed = (overrides: Record<string, unknown> = {}) => ({
  10: {
    id: 10,
    assetNo: "FA.2026.00001",
    status: "disposed",
    disposalDate: DATE,
    acquisitionCost: 10_000_000,
    accumulatedDepreciation: 6_000_000,
    disposalProceeds: 5_000_000,
    assetAccountId: ACC.asset,
    accumulatedAccountId: ACC.accum,
    ...overrides,
  },
});

describe("fixed-asset disposal posting source", () => {
  it("gain: books removal + proceeds + gain, balanced in IDR", async () => {
    const tx = createFakeClient({ mappings: MAPPINGS, fixedAssets: assetSeed() });
    const j = (await postForSource({ sourceType: "fixed_asset_disposal", sourceId: 10, tx })) as unknown as FakeJournal;
    const journal = expectBalancedIdr(j);
    expect(journal.lines.find((l) => l.accountId === ACC.accum)?.debit).toBe(6_000_000);
    expect(journal.lines.find((l) => l.accountId === ACC.asset)?.credit).toBe(10_000_000);
    expect(journal.lines.find((l) => l.accountId === ACC.cash)?.debit).toBe(5_000_000);
    expect(journal.lines.find((l) => l.accountId === ACC.gainLoss)?.credit).toBe(1_000_000);
  });

  it("loss: proceeds below NBV debit the loss, balanced", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      fixedAssets: assetSeed({ disposalProceeds: 2_500_000 }),
    });
    const j = (await postForSource({ sourceType: "fixed_asset_disposal", sourceId: 10, tx })) as unknown as FakeJournal;
    const journal = expectBalancedIdr(j);
    expect(journal.lines.find((l) => l.accountId === ACC.gainLoss)?.debit).toBe(1_500_000);
  });

  it("refuses to post into a closed period", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      fixedAssets: assetSeed(),
      periods: [{ year: 2026, month: 3, status: "closed" }],
    });
    await expect(
      postForSource({ sourceType: "fixed_asset_disposal", sourceId: 10, tx })
    ).rejects.toBeInstanceOf(ClosedPeriodError);
    expect(tx._journals).toHaveLength(0);
  });
});
