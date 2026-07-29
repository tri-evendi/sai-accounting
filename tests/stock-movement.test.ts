/**
 * Kartu Stok / Mutasi — the period stock report (issue #126).
 *
 * Two promises, and they fail differently:
 *
 *  1. **Every row reconciles.** `saldo awal + masuk − keluar = saldo akhir` must
 *     hold on each row and on the totals. This is the whole reason the report
 *     carries bookends: without them, a period's in/out sits beside a lifetime
 *     balance and the row answers two different questions at once.
 *
 *  2. **`process` is counted but never netted (issue #111).** It is the one
 *     movement type that must appear in the report while changing no balance.
 *     Netting it deletes stock that physically exists; dropping it hides a
 *     movement that really happened. Both failures are silent, so both are pinned.
 */
import { describe, it, expect } from "vitest";
import { buildStockMovementReport, type StockTotalRow } from "@/lib/stock-movement";
import { calculateStockTotals } from "@/lib/inventory";

const KOPI = 1;
const TEH = 2;
const GULA = 3;

const ITEMS = [
  { id: KOPI, name: "Kopi Arabika", unit: "kg" },
  { id: TEH, name: "Teh Hijau", unit: "kg" },
  { id: GULA, name: "Gula", unit: "kg" },
];

const t = (itemId: number, type: string, quantity: number): StockTotalRow => ({
  itemId,
  type,
  quantity,
});

describe("buildStockMovementReport — the balance identity", () => {
  const opening = [t(KOPI, "in", 2_000), t(KOPI, "out", 800), t(TEH, "in", 300)];
  const period = [
    t(KOPI, "in", 400),
    t(KOPI, "out", 650),
    t(TEH, "in", 100),
    // Gula: no opening balance, first movement is inside the period.
    t(GULA, "in", 50),
  ];

  it("carries the opening balance in from before the period", () => {
    const r = buildStockMovementReport(ITEMS, opening, period);
    const kopi = r.rows.find((x) => x.id === KOPI)!;
    expect(kopi.opening).toBe(1_200); // 2.000 masuk − 800 keluar, semuanya sebelum periode
    expect(kopi.movedIn).toBe(400);
    expect(kopi.movedOut).toBe(650);
    expect(kopi.closing).toBe(950);
  });

  it("reconciles on EVERY row", () => {
    const r = buildStockMovementReport(ITEMS, opening, period);
    for (const row of r.rows) {
      expect(row.opening + row.movedIn - row.movedOut, `row ${row.name}`).toBe(row.closing);
    }
  });

  it("reconciles on the totals too", () => {
    const r = buildStockMovementReport(ITEMS, opening, period);
    expect(r.totalOpening + r.totalIn - r.totalOut).toBe(r.totalClosing);
    expect(r.totalOpening).toBe(1_500); // 1.200 + 300 + 0
    expect(r.totalClosing).toBe(1_400); // 950 + 400 + 50
  });

  it("starts an item at zero when its first movement is inside the period", () => {
    const r = buildStockMovementReport(ITEMS, opening, period);
    const gula = r.rows.find((x) => x.id === GULA)!;
    expect(gula.opening).toBe(0);
    expect(gula.closing).toBe(50);
  });

  it("shows a negative closing rather than clamping it to zero", () => {
    // Oversold or mis-keyed stock is real and must stay visible — clamping to 0
    // would hide the very error the report exists to surface.
    const r = buildStockMovementReport([ITEMS[0]], [t(KOPI, "in", 10)], [t(KOPI, "out", 40)]);
    expect(r.rows[0].closing).toBe(-30);
  });
});

describe("buildStockMovementReport — `process` is counted, never netted", () => {
  const period = [t(KOPI, "in", 400), t(KOPI, "out", 100), t(KOPI, "process", 250)];

  it("leaves the balance untouched — processed goods are still owned", () => {
    const r = buildStockMovementReport([ITEMS[0]], [t(KOPI, "in", 1_000)], period);
    const kopi = r.rows[0];
    expect(kopi.processed).toBe(250);
    expect(kopi.closing).toBe(1_300); // 1.000 + 400 − 100, `process` tidak ikut
  });

  it("agrees with calculateStockTotals, the rule the Stok page already uses", () => {
    // Two implementations of one rule is how the Stok page and the dashboard
    // once disagreed (issue #111). This holds them to the same answer.
    const movements = [
      { quantity: 400, type: "in", date: "2026-07-01" },
      { quantity: 100, type: "out", date: "2026-07-02" },
      { quantity: 250, type: "process", date: "2026-07-03" },
    ];
    const viaPage = calculateStockTotals(movements);
    const r = buildStockMovementReport([ITEMS[0]], [], period);
    expect(r.rows[0].closing).toBe(viaPage.currentStock);
  });

  it("flags the column only when the period actually contains a process movement", () => {
    expect(buildStockMovementReport([ITEMS[0]], [], period).hasProcess).toBe(true);
    expect(
      buildStockMovementReport([ITEMS[0]], [], [t(KOPI, "in", 5)]).hasProcess
    ).toBe(false);
  });

  it("never lets an unknown movement type behave like an outflow", () => {
    // The `else`-means-outflow bug from issue #111, guarded at this layer too.
    const r = buildStockMovementReport([ITEMS[0]], [t(KOPI, "in", 100)], [t(KOPI, "mystery", 999)]);
    expect(r.rows[0].closing).toBe(100);
    expect(r.rows[0].movedOut).toBe(0);
  });
});

describe("buildStockMovementReport — dormant items", () => {
  it("hides items with no balance and no movement, and counts them", () => {
    const r = buildStockMovementReport(ITEMS, [t(KOPI, "in", 5)], [t(TEH, "in", 1)]);
    expect(r.rows.map((x) => x.name)).toEqual(["Kopi Arabika", "Teh Hijau"]);
    expect(r.dormantCount).toBe(1); // Gula
  });

  it("keeps an item that only holds an opening balance and did not move", () => {
    // Stock sitting in the warehouse all period IS the answer to "what do I hold",
    // so it must not be mistaken for a dormant master record.
    const r = buildStockMovementReport([ITEMS[0]], [t(KOPI, "in", 500)], []);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].opening).toBe(500);
    expect(r.rows[0].closing).toBe(500);
    expect(r.dormantCount).toBe(0);
  });

  it("keeps an item whose movements net to zero — it moved, that is the point", () => {
    const r = buildStockMovementReport([ITEMS[0]], [], [t(KOPI, "in", 20), t(KOPI, "out", 20)]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].closing).toBe(0);
    expect(r.dormantCount).toBe(0);
  });

  it("returns an honest empty report rather than inventing rows", () => {
    const r = buildStockMovementReport(ITEMS, [], []);
    expect(r.rows).toEqual([]);
    expect(r.dormantCount).toBe(3);
    expect(r.totalClosing).toBe(0);
  });

  it("preserves fractional quantities — stock is Decimal(15,3)", () => {
    const r = buildStockMovementReport([ITEMS[0]], [t(KOPI, "in", 12.5)], [t(KOPI, "out", 0.25)]);
    expect(r.rows[0].closing).toBeCloseTo(12.25, 3);
  });
});
