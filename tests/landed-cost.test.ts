/**
 * ONGKOS SAMPAI GUDANG (issue #510).
 *
 * == Yang salah sebelum ini =================================================
 * Wisaya pembelian sudah menulis `stock_movements.unit_cost`, tetapi ongkos
 * yang membuat barang SAMPAI di gudang tidak ikut ke sana. Bagan akun pengguna
 * memuat `5100015 FREIGHT / EKSPEDISI PEMBELIAN` bertipe COGS, jadi ongkos itu
 * mendarat di laba rugi pada tanggal pembelian — bukan menempel pada barangnya.
 *
 * Dua akibatnya berlawanan arah: nilai persediaan di neraca terlalu rendah, dan
 * HPP jatuh di periode yang salah (beban saat beli, pendapatan saat jual —
 * berbulan-bulan kemudian untuk rempah yang menunggu kontainer).
 *
 * == Kenapa tidak butuh mesin jurnal baru ===================================
 * Gerakan stok `in` TIDAK menghasilkan jurnal; persediaan didebet oleh jurnal
 * PEMBELIAN sebesar `amount`. Jadi memasukkan ongkosnya ke `amount` sudah
 * mendebet Persediaan dengan benar, dan yang tersisa hanyalah menempelkannya ke
 * `unit_cost` supaya ia keluar lagi sebagai HPP saat barang terjual.
 */
import { describe, expect, it } from "vitest";
import {
  allocateAdditionalCost,
  buildPurchasePayload,
  emptyPurchaseDraft,
  purchaseBookedValue,
  purchaseTotal,
  purchaseValue,
  type PurchaseDraft,
} from "@/lib/wizard";

function draft(over: (d: PurchaseDraft) => void): PurchaseDraft {
  const d = emptyPurchaseDraft("2026-08-25");
  d.supplier.name = "PT Rempah Jaya";
  d.receipt.include = true;
  d.receipt.date = "2026-08-25";
  over(d);
  return d;
}

/** Satu baris draf pembelian yang diterima penuh. */
function line(itemId: number, name: string, qty: number, price: number) {
  return {
    itemId,
    itemName: name,
    quantity: qty,
    price,
    unit: "kg",
    receive: true,
    receiveQuantity: qty,
  } as PurchaseDraft["lines"][number];
}

describe("penyebaran: jumlahnya harus utuh", () => {
  it("sebanding NILAI baris", () => {
    const shares = allocateAdditionalCost(
      [
        { value: 750_000, quantity: 50 },
        { value: 250_000, quantity: 50 },
      ],
      100_000,
      "value"
    );
    expect(shares).toEqual([75_000, 25_000]);
  });

  it("sebanding BERAT — jawaban yang berbeda, dan itulah sebabnya bisa dipilih", () => {
    /*
     * Baris yang sama, dasar yang lain: yang mahal menanggung lebih sedikit
     * karena beratnya sama. Untuk ongkos ANGKUT ini justru lebih dekat ke
     * sebabnya — kontainer dibayar per berat, bukan per harga.
     */
    const shares = allocateAdditionalCost(
      [
        { value: 750_000, quantity: 50 },
        { value: 250_000, quantity: 50 },
      ],
      100_000,
      "weight"
    );
    expect(shares).toEqual([50_000, 50_000]);
  });

  it("pembagian yang tidak habis tidak melahirkan atau menguapkan rupiah", () => {
    /* 10 dibagi tiga sama rata = 3,33 + 3,33 + 3,33 = 9,99. Satu sen yang
       hilang di situ adalah satu sen yang membuat neraca tidak seimbang. */
    const total = 10;
    const shares = allocateAdditionalCost(
      [
        { value: 1, quantity: 1 },
        { value: 1, quantity: 1 },
        { value: 1, quantity: 1 },
      ],
      total,
      "value"
    );
    expect(shares.reduce((s, v) => s + v, 0)).toBe(total);
  });

  it("dasar yang jumlahnya nol tidak membagi dengan nol", () => {
    const shares = allocateAdditionalCost(
      [
        { value: 0, quantity: 0 },
        { value: 0, quantity: 0 },
      ],
      100_000,
      "value"
    );
    expect(shares).toEqual([0, 0]);
    expect(shares.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("tanpa ongkos, tak ada yang disebar", () => {
    expect(allocateAdditionalCost([{ value: 100, quantity: 1 }], 0, "value")).toEqual([0]);
  });
});

describe("ongkosnya masuk buku sebagai persediaan, bukan beban", () => {
  const d = draft((x) => {
    x.lines = [line(1, "BLACK PEPPER", 100, 10_000)];
    x.purchase.additionalCost = 500_000;
  });

  it("nilai yang dibukukan = barang + ongkos", () => {
    expect(purchaseValue(d)).toBe(1_000_000);
    expect(purchaseBookedValue(d)).toBe(1_500_000);
  });

  it("`amount` yang dikirim ke server membawa ongkosnya", () => {
    /* Inilah yang mendebet Persediaan: jurnal pembelian memakai `amount`.
       Kalau ongkosnya tidak di sini, ia tidak pernah menempel di neraca. */
    expect(buildPurchasePayload(d).purchase.amount).toBe(1_500_000);
  });

  it("PPN dihitung DI ATAS nilai yang sudah termasuk ongkos", () => {
    const withTax = draft((x) => {
      x.lines = [line(1, "BLACK PEPPER", 100, 10_000)];
      x.purchase.additionalCost = 500_000;
      x.purchase.taxAmount = 165_000;
    });
    expect(purchaseTotal(withTax)).toBe(1_665_000);
  });
});

describe("harga pokok per unit membawa bagian ongkosnya", () => {
  it("100 kg @10.000 + ongkos 500.000 → unit_cost 15.000", () => {
    const d = draft((x) => {
      x.lines = [line(1, "BLACK PEPPER", 100, 10_000)];
      x.purchase.additionalCost = 500_000;
    });
    const payload = buildPurchasePayload(d);
    expect(payload.receipt?.items[0].unitCost).toBe(15_000);
  });

  it("dua barang, dasar NILAI: yang mahal menanggung lebih banyak", () => {
    const d = draft((x) => {
      x.lines = [line(6, "LONG PEPPER", 10, 50_000), line(10, "LONG PEPPER", 10, 13_500)];
      x.purchase.additionalCost = 127_000;
      x.purchase.additionalCostBasis = "value";
    });
    const items = buildPurchasePayload(d).receipt!.items;
    /* 500.000 : 135.000 → 100.000 : 27.000 */
    expect(items[0].unitCost).toBe(60_000);
    expect(items[1].unitCost).toBe(16_200);
  });

  it("dua barang, dasar BERAT: keduanya menanggung sama", () => {
    const d = draft((x) => {
      x.lines = [line(6, "LONG PEPPER", 10, 50_000), line(10, "LONG PEPPER", 10, 13_500)];
      x.purchase.additionalCost = 127_000;
      x.purchase.additionalCostBasis = "weight";
    });
    const items = buildPurchasePayload(d).receipt!.items;
    expect(items[0].unitCost).toBe(56_350);
    expect(items[1].unitCost).toBe(19_850);
  });

  it("bawaannya NILAI bila tidak disebut", () => {
    const d = draft((x) => {
      x.lines = [line(6, "A", 10, 50_000), line(10, "B", 10, 13_500)];
      x.purchase.additionalCost = 127_000;
    });
    const items = buildPurchasePayload(d).receipt!.items;
    expect(items[0].unitCost).toBe(60_000);
  });
});

describe("hanya barang yang MASUK GUDANG yang menanggung", () => {
  it("baris yang tidak diterima tidak menerima sebaran", () => {
    /* Menempelkannya ke baris lain akan membuat harga pokok barang yang
       diterima menanggung ongkos barang yang tidak pernah datang. */
    const d = draft((x) => {
      x.lines = [
        line(1, "BLACK PEPPER", 100, 10_000),
        { ...line(2, "CLOVE", 100, 10_000), receive: false, receiveQuantity: 0 },
      ];
      x.purchase.additionalCost = 500_000;
    });
    const items = buildPurchasePayload(d).receipt!.items;
    expect(items).toHaveLength(1);
    expect(items[0].unitCost).toBe(15_000);
  });

  it("diterima SEBAGIAN: yang dinilai hanya yang datang", () => {
    const d = draft((x) => {
      x.lines = [{ ...line(1, "BLACK PEPPER", 100, 10_000), receiveQuantity: 40 }];
      x.purchase.additionalCost = 400_000;
    });
    const items = buildPurchasePayload(d).receipt!.items;
    /* Seluruh ongkos menempel pada 40 kg yang benar-benar masuk gudang:
       10.000 + 400.000/40 = 20.000. */
    expect(items[0].quantity).toBe(40);
    expect(items[0].unitCost).toBe(20_000);
  });
});

describe("valas: ongkos ikut dikurskan, sekali", () => {
  it("harga + ongkos dikalikan kurs bersama-sama", () => {
    const d = draft((x) => {
      x.lines = [line(1, "BLACK PEPPER", 100, 10)];
      x.purchase.currency = "USD";
      x.purchase.rate = 16_000;
      x.purchase.additionalCost = 500; // USD
    });
    const payload = buildPurchasePayload(d);
    /* (10 + 500/100) × 16.000 = 15 × 16.000 = 240.000 */
    expect(payload.receipt?.items[0].unitCost).toBe(240_000);
    /* `amount` tetap dalam mata uang DOKUMEN — kursnya dibawa terpisah. */
    expect(payload.purchase.amount).toBe(1_500);
    expect(payload.purchase.rate).toBe(16_000);
  });
});

describe("tanpa ongkos, tidak ada yang berubah", () => {
  it("angkanya sama persis dengan sebelum #510", () => {
    const d = draft((x) => {
      x.lines = [line(1, "BLACK PEPPER", 100, 10_000)];
    });
    const payload = buildPurchasePayload(d);
    expect(payload.purchase.amount).toBe(1_000_000);
    expect(payload.receipt?.items[0].unitCost).toBe(10_000);
  });
});
