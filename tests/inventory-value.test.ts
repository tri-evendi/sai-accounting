/**
 * Nilai persediaan (issue #58).
 *
 * "Nilai Persediaan" dulu hanya kuantitas — model Item tak punya kolom biaya.
 * Ternyata biaya ADA di gerakan stok (`Stock.unit_cost` pada baris `in`), jadi
 * nilai bisa dihitung memakai rata-rata tertimbang yang SAMA dengan mesin HPP.
 * Test ini mengunci: nilai = sisa stok × biaya rata-rata, dan item tanpa dasar
 * biaya dilaporkan `null` (bukan Rp 0 yang menyesatkan).
 */

import { describe, it, expect } from "vitest";
import { summarizeInventoryItem, type ItemWithStock } from "@/lib/inventory";

function item(stock: ItemWithStock["stock"]): ItemWithStock {
  return { id: 1, name: "Kopi", unit: "kg", stock };
}

describe("summarizeInventoryItem — nilai persediaan", () => {
  it("nilai = sisa × biaya rata-rata tertimbang", () => {
    // in 100@10.000 + in 100@20.000 => avg 15.000; out 50 => sisa 150
    const s = summarizeInventoryItem(
      item([
        { quantity: 100, type: "in", date: "2026-01-01", unitCost: 10000 },
        { quantity: 100, type: "in", date: "2026-01-02", unitCost: 20000 },
        { quantity: 50, type: "out", date: "2026-01-03" },
      ])
    );
    expect(s.currentStock).toBe(150);
    expect(s.unitCost).toBe(15000);
    expect(s.stockValue).toBe(150 * 15000);
  });

  it("item tanpa biaya masuk → unitCost & stockValue null (bukan 0)", () => {
    const s = summarizeInventoryItem(
      item([
        { quantity: 100, type: "in", date: "2026-01-01", unitCost: null },
        { quantity: 30, type: "out", date: "2026-01-02" },
      ])
    );
    expect(s.currentStock).toBe(70);
    expect(s.unitCost).toBeNull();
    expect(s.stockValue).toBeNull();
  });

  it("baris in tanpa biaya dikecualikan dari rata-rata (bukan dianggap nol)", () => {
    // hanya baris 100@12.000 yang bercosting → avg 12.000, bukan 6.000
    const s = summarizeInventoryItem(
      item([
        { quantity: 100, type: "in", date: "2026-01-01", unitCost: 12000 },
        { quantity: 100, type: "in", date: "2026-01-02", unitCost: null },
      ])
    );
    expect(s.unitCost).toBe(12000);
    expect(s.stockValue).toBe(200 * 12000);
  });
});
