/**
 * Riwayat Hitung Ulang Stok (issue #129).
 *
 * A stock count has no table: it exists only as the adjustment movements sharing
 * a date and the `OPNAME_ADJUSTMENT_NOTE` marker. Two things therefore have to
 * hold, and both fail silently if they don't:
 *
 *  1. **Direction survives the round trip.** Movements store a positive quantity
 *     plus a type; the history has to reattach the sign. A report where surplus
 *     and shrinkage look identical is worse than no report at all.
 *
 *  2. **One day is one session.** Grouping is the only thing reconstructing the
 *     count, so it must be exactly as precise as the data allows — no more.
 */
import { describe, it, expect } from "vitest";
import { buildOpnameHistory, type OpnameAdjustmentInput } from "@/lib/opname-history";
import { OPNAME_ADJUSTMENT_NOTE } from "@/lib/constants";

const row = (
  date: string,
  itemName: string,
  type: string,
  quantity: number
): OpnameAdjustmentInput => ({
  date: new Date(`${date}T09:00:00`),
  itemName,
  unit: "kg",
  type,
  quantity,
});

describe("buildOpnameHistory — direction", () => {
  it("reads `in` as surplus (positive) and `out` as shrinkage (negative)", () => {
    const h = buildOpnameHistory([
      row("2026-07-15", "Kopi", "in", 40),
      row("2026-07-15", "Teh", "out", 12.5),
    ]);
    const byName = Object.fromEntries(h.sessions[0].adjustments.map((a) => [a.itemName, a.variance]));
    expect(byName["Kopi"]).toBe(40);
    expect(byName["Teh"]).toBe(-12.5);
  });

  it("reports shrinkage as a positive magnitude in `decrease`, and nets correctly", () => {
    const h = buildOpnameHistory([
      row("2026-07-15", "Kopi", "in", 40),
      row("2026-07-15", "Teh", "out", 12.5),
    ]);
    expect(h.sessions[0].increase).toBe(40);
    expect(h.sessions[0].decrease).toBe(12.5); // magnitude, not −12,5
    expect(h.netVariance).toBe(27.5);
    expect(h.totalIncrease).toBe(40);
    expect(h.totalDecrease).toBe(12.5);
  });

  it("skips a movement type that is neither in nor out, rather than guessing", () => {
    // `process` is not an opname outcome. Treating an unrecognised type as
    // shrinkage is the bug class issue #111 fixed; guarded here too.
    const h = buildOpnameHistory([
      row("2026-07-15", "Kopi", "in", 10),
      row("2026-07-15", "Gula", "process", 999),
    ]);
    expect(h.sessions[0].adjustments.map((a) => a.itemName)).toEqual(["Kopi"]);
    expect(h.netVariance).toBe(10);
  });
});

describe("buildOpnameHistory — sessions", () => {
  it("groups adjustments sharing a date into one session", () => {
    const h = buildOpnameHistory([
      row("2026-07-15", "Kopi", "in", 40),
      row("2026-07-15", "Teh", "out", 5),
      row("2026-07-15", "Gula", "out", 2),
    ]);
    expect(h.sessionCount).toBe(1);
    expect(h.adjustmentCount).toBe(3);
  });

  it("groups by calendar DAY, so times within a day do not split a count", () => {
    const h = buildOpnameHistory([
      { ...row("2026-07-15", "Kopi", "in", 40), date: new Date("2026-07-15T08:00:00") },
      { ...row("2026-07-15", "Teh", "out", 5), date: new Date("2026-07-15T17:30:00") },
    ]);
    expect(h.sessionCount).toBe(1);
  });

  it("puts the newest session first — the last count is what people look for", () => {
    const h = buildOpnameHistory([
      row("2026-06-30", "Kopi", "in", 1),
      row("2026-07-31", "Kopi", "in", 2),
      row("2026-07-15", "Kopi", "in", 3),
    ]);
    expect(h.sessions.map((s) => s.dateISO)).toEqual(["2026-07-31", "2026-07-15", "2026-06-30"]);
  });

  it("orders adjustments within a day by size of discrepancy", () => {
    const h = buildOpnameHistory([
      row("2026-07-15", "Kecil", "in", 2),
      row("2026-07-15", "Besar", "out", 90),
      row("2026-07-15", "Sedang", "in", 30),
    ]);
    // Largest |variance| first — the rows that need explaining.
    expect(h.sessions[0].adjustments.map((a) => a.itemName)).toEqual(["Besar", "Sedang", "Kecil"]);
  });

  it("returns an honest empty history rather than a zero session", () => {
    const h = buildOpnameHistory([]);
    expect(h.sessions).toEqual([]);
    expect(h.sessionCount).toBe(0);
    expect(h.netVariance).toBe(0);
  });
});

describe("OPNAME_ADJUSTMENT_NOTE", () => {
  it("keeps the exact literal already written to production rows", () => {
    // The write path stamps this and the reader matches on it. Changing the text
    // would orphan every count already recorded — no error, just an empty
    // history. Pinning the literal makes that a failing test instead.
    expect(OPNAME_ADJUSTMENT_NOTE).toBe("Penyesuaian stok opname");
  });
});
