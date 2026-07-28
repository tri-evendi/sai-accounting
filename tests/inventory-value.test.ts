/**
 * Nilai persediaan (issue #58).
 *
 * "Nilai Persediaan" dulu hanya kuantitas — model Item tak punya kolom biaya.
 * Ternyata biaya ADA di gerakan stok (`StockMovement.unit_cost` pada baris `in`), jadi
 * nilai bisa dihitung memakai rata-rata tertimbang yang SAMA dengan mesin HPP.
 * Test ini mengunci: nilai = sisa stok × biaya rata-rata, dan item tanpa dasar
 * biaya dilaporkan `null` (bukan Rp 0 yang menyesatkan).
 */

import { describe, it, expect } from "vitest";
import { calculateStockTotals, stockLevelsFromTotals, summarizeInventoryItem, type ItemWithStock } from "@/lib/inventory";

function item(stockMovements: ItemWithStock["stockMovements"]): ItemWithStock {
  return { id: 1, name: "Kopi", unit: "kg", stockMovements };
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

/**
 * Saldo dari GROUP BY vs saldo dari baris gerakan (issue #104).
 *
 * Beranda kini menjumlahkan stok di BASIS DATA, halaman Stok masih menjumlahkan
 * di JavaScript dari baris gerakan. Dua jalur, satu angka — kalau keduanya
 * berselisih, "stok menipis" di beranda akan menyebut angka lain daripada
 * halaman yang dibuka pengguna untuk memeriksanya. Tes ini yang menahan itu.
 */
describe("stockLevelsFromTotals — sepakat dengan calculateStockTotals", () => {
  const items = [
    { id: 1, name: "Kopi", unit: "kg" },
    { id: 2, name: "Teh", unit: "kg" },
    { id: 3, name: "Gula", unit: "kg" }, // belum pernah bergerak
  ];

  it("menghitung saldo = Σ masuk − Σ keluar", () => {
    const levels = stockLevelsFromTotals(items, [
      { itemId: 1, type: "in", quantity: 100 },
      { itemId: 1, type: "out", quantity: 40 },
      { itemId: 2, type: "in", quantity: 7.5 },
    ]);

    expect(levels.find((l) => l.id === 1)!.currentStock).toBe(60);
    expect(levels.find((l) => l.id === 2)!.currentStock).toBe(7.5);
  });

  it("barang tanpa gerakan tetap muncul dengan saldo nol", () => {
    const levels = stockLevelsFromTotals(items, []);
    expect(levels).toHaveLength(3);
    expect(levels.every((l) => l.currentStock === 0)).toBe(true);
  });

  it("angkanya sama persis dengan jalur baris-per-baris", () => {
    const movements = [
      { quantity: 100, type: "in", date: "2026-01-01" },
      { quantity: 25, type: "out", date: "2026-02-01" },
      { quantity: 5, type: "out", date: "2026-03-01" },
    ];
    const viaRows = calculateStockTotals(movements).currentStock;
    const viaGroupBy = stockLevelsFromTotals([items[0]], [
      { itemId: 1, type: "in", quantity: 100 },
      { itemId: 1, type: "out", quantity: 30 },
    ])[0].currentStock;

    expect(viaGroupBy).toBe(viaRows);
  });

  /*
   * Gerakan `process` (issue #111) — barang yang sedang disortir/diolah dan
   * masih milik perusahaan. Tes ini menahan DUA hal sekaligus:
   *
   *  1. ia tidak menggeser saldo (dulu ia tak cocok 'in' maupun 'out' hanya
   *     karena datanya bertulisan 'PROCESS'; sekarang ia netral karena memang
   *     diputuskan begitu);
   *  2. kedua jalur memperlakukannya SAMA. Versi lama `stockLevelsFromTotals`
   *     memakai `else`, jadi beranda menghitungnya sebagai barang KELUAR
   *     sementara halaman Stok mengabaikannya — satu barang, dua angka.
   */
  it("gerakan `process` tidak menambah maupun mengurangi saldo, di KEDUA jalur", () => {
    const viaRows = calculateStockTotals([
      { quantity: 100, type: "in", date: "2026-01-01" },
      { quantity: 30, type: "process", date: "2026-02-01" },
      { quantity: 20, type: "out", date: "2026-03-01" },
    ]);
    const viaGroupBy = stockLevelsFromTotals([items[0]], [
      { itemId: 1, type: "in", quantity: 100 },
      { itemId: 1, type: "process", quantity: 30 },
      { itemId: 1, type: "out", quantity: 20 },
    ])[0].currentStock;

    expect(viaRows.currentStock).toBe(80);
    expect(viaGroupBy).toBe(viaRows.currentStock);
    expect(viaRows.totalIn).toBe(100);
    expect(viaRows.totalOut).toBe(20);
  });

  /*
   * Kenapa huruf besar/kecil diuji: collation MySQL `utf8mb4_unicode_ci`
   * membuat 'IN' cocok dengan 'in' DI SQL, jadi setiap pemeriksaan lewat basis
   * data terlihat benar. Perbandingan di JavaScript tidak — dan di sinilah
   * saldonya dihitung. Baris bertulisan 'IN' berarti data BELUM dinormalkan
   * (migration 0043), dan yang benar adalah ia tidak diam-diam ikut terhitung.
   */
  it("nilai bergaya legacy ('IN'/'OUT') tidak ikut terhitung — bukan cocok diam-diam", () => {
    const totals = calculateStockTotals([
      { quantity: 500, type: "IN", date: "2026-01-01" },
      { quantity: 200, type: "OUT", date: "2026-02-01" },
    ]);
    expect(totals.currentStock).toBe(0);
  });
});
