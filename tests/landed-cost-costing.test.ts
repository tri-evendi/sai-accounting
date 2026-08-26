/**
 * PENJAGA #495 butir 1 — biaya impor yang menempel harus SAMPAI ke rata-rata,
 * dan sampai ke SEMUA permukaan yang membacanya.
 *
 * == Dua cacat yang dijaga, dan keduanya diam =============================
 *
 * 1. **Baris `cost_adjust` tersaring `q <= 0`.** Ia berkuantitas nol menurut
 *    rancangannya, jadi penjaga kuantitas di `weightedAverageUnitCost` akan
 *    membuangnya sebelum nilainya sempat dihitung — dan seluruh bea masuk
 *    hilang tanpa satu pun galat.
 *
 * 2. **Kolomnya tidak ikut di `select`.** Kolom yang tidak diambil datang
 *    sebagai `undefined`, dan `undefined` dijumlahkan sebagai nol. Sebuah
 *    kueri yang lupa menyebut `valueAdjustment` karena itu menjawab lebih
 *    rendah daripada kueri di sebelahnya — dua permukaan, satu barang, dua
 *    angka, dan yang satu dipakai memposting HPP.
 *
 * Cacat kedua tidak bisa ditangkap uji aritmetika mana pun, jadi ia dijaga
 * dengan menyapu SUMBER kueri-kuerinya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { weightedAverageUnitCost } from "@/lib/posting/cogs";
import { STOCK_MOVEMENT_TYPES } from "@/lib/constants";
import { calculateStockTotals } from "@/lib/inventory";

/* `date` disebut karena `calculateStockTotals` memakai `StockMovement` yang
   memuatnya; mesin biayanya sendiri tidak membacanya. */
const HARI = new Date("2026-08-14T00:00:00.000Z");
const masuk = (quantity: number, unitCost: number) => ({
  type: "in",
  quantity,
  unitCost,
  date: HARI,
});
const sesuaikan = (valueAdjustment: number) => ({
  type: "cost_adjust",
  quantity: 0,
  valueAdjustment,
  date: HARI,
});

describe("penyesuaian nilai sampai ke rata-rata", () => {
  it("menaikkan rata-rata tepat sebesar nilai ÷ kuantitas", () => {
    /* 1.000 kg @ 50.000 = 50 juta. Bea masuk 5 juta → 55 juta / 1.000 = 55.000. */
    const avg = weightedAverageUnitCost([masuk(1000, 50_000), sesuaikan(5_000_000)]);
    expect(avg).toBe(55_000);
  });

  it("TIDAK menambah kuantitas — hanya nilai", () => {
    /*
     * Kalau ia ikut menambah kuantitas, rata-ratanya justru TURUN dan saldo
     * barangnya membengkak tanpa ada barang yang datang.
     */
    const tanpa = weightedAverageUnitCost([masuk(1000, 50_000)]);
    const dengan = weightedAverageUnitCost([masuk(1000, 50_000), sesuaikan(5_000_000)]);
    expect(dengan).toBeGreaterThan(tanpa);
    expect(calculateStockTotals([masuk(1000, 50_000), sesuaikan(5_000_000)]).currentStock).toBe(
      1000
    );
  });

  it("baris berkuantitas nol tidak tersaring penjaga kuantitas", () => {
    /* Cacat #1 di kepala berkas: `q <= 0` berdiri SESUDAHnya, bukan sebelum. */
    expect(weightedAverageUnitCost([masuk(100, 1_000), sesuaikan(100_000)])).toBe(2_000);
  });

  it("beberapa penyesuaian menumpuk", () => {
    /* Satu kontainer bisa menerima bea masuk, freight, dan PPJK terpisah. */
    const avg = weightedAverageUnitCost([
      masuk(1000, 50_000),
      sesuaikan(3_000_000),
      sesuaikan(2_000_000),
    ]);
    expect(avg).toBe(55_000);
  });

  it("tanpa penyesuaian, jawabannya persis seperti dulu", () => {
    /* Pemasangan yang sudah berjalan tidak boleh bergeser satu rupiah pun. */
    expect(weightedAverageUnitCost([masuk(1000, 50_000), masuk(500, 60_000)])).toBe(
      weightedAverageUnitCost([
        { ...masuk(1000, 50_000), valueAdjustment: null },
        { ...masuk(500, 60_000), valueAdjustment: null },
      ])
    );
  });

  it("penyesuaian TANPA barang bercosting tidak melahirkan rata-rata dari udara", () => {
    /* Kuantitasnya nol → pembaginya nol. Jawaban yang jujur 0, bukan Infinity. */
    const avg = weightedAverageUnitCost([sesuaikan(5_000_000)]);
    expect(avg).toBe(0);
    expect(Number.isFinite(avg)).toBe(true);
  });
});

describe("saldo tidak bergerak sedikit pun", () => {
  it("`cost_adjust` bukan masuk dan bukan keluar", () => {
    const totals = calculateStockTotals([masuk(1000, 50_000), sesuaikan(9_000_000)]);
    expect(totals.totalIn).toBe(1000);
    expect(totals.totalOut).toBe(0);
  });

  it("jenisnya terdaftar, jadi ia tidak ditolak saat masuk", () => {
    expect(STOCK_MOVEMENT_TYPES).toContain("cost_adjust");
  });
});

describe("setiap kueri yang menyuapi mesin biaya menyebut kolomnya", () => {
  /*
   * Cacat #2. Tidak ada uji aritmetika yang bisa menangkapnya — hasilnya
   * "benar" untuk data yang diberikan tes, dan salah hanya untuk data yang
   * datang dari kueri yang lupa.
   */
  const baca = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

  it.each([
    ["src/lib/posting/cogs.ts", "averageUnitCostForItem"],
    ["src/lib/stock-report.ts", "laporan nilai persediaan"],
  ])("%s (%s)", (rel) => {
    const src = baca(rel);
    /* Setiap `select` yang menyebut `unitCost` harus menyebut `valueAdjustment`
       juga — keduanya dasar nilai yang sama. */
    for (const m of src.matchAll(/select:\s*\{[^}]*unitCost:\s*true[^}]*\}/g)) {
      expect(
        m[0],
        `select menyebut unitCost tetapi tidak valueAdjustment — biaya impor ` +
          `yang menempel akan hilang diam-diam (#495 butir 1)`
      ).toMatch(/valueAdjustment:\s*true/);
    }
  });

  it("`averageUnitCostForItem` tidak menyaring `type: \"in\"` saja", () => {
    /* Penyaring itu membuang seluruh baris `cost_adjust` sebelum mesinnya
       sempat melihatnya — dan fungsi ini yang dipakai memposting HPP retur. */
    const src = baca("src/lib/posting/cogs.ts");
    const fn = src.slice(src.indexOf("export async function averageUnitCostForItem"));
    expect(fn.slice(0, 900)).toMatch(/type:\s*\{\s*in:\s*\["in",\s*"cost_adjust"\]\s*\}/);
  });
});
