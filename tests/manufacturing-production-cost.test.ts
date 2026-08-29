/**
 * Akumulasi biaya perintah produksi (#495 butir 3, tahap 2).
 *
 * Yang diuji di sini menentukan harga pokok barang jadi. Harga pokok yang salah
 * tidak pernah mengumumkan dirinya — ia muncul bertahun-tahun kemudian sebagai
 * margin yang tak bisa dijelaskan — jadi tiap keputusannya punya tesnya sendiri.
 *
 * Murni: tanpa DATABASE_URL.
 */
import { describe, expect, it } from "vitest";
import {
  akumulasiBiaya,
  bagianPenyerapan,
  hargaPokokKeluaran,
  ProductionCostError,
  type KomponenTerpakai,
  type OperasiTerpakai,
} from "@/lib/manufacturing/production-cost";

const BAHAN: KomponenTerpakai[] = [
  { itemId: 1, itemName: "Lada Hitam Mentah", issuedQuantity: 1000, issuedCost: 45_000_000 },
  { itemId: 3, itemName: "Karung Goni", issuedQuantity: 20, issuedCost: 100_000 },
];

const OPERASI: OperasiTerpakai[] = [
  {
    sequence: 1,
    name: "Sortir",
    standardHours: 8,
    actualHours: 10,
    laborRate: 25_000,
    overheadRate: 10_000,
  },
];

describe("akumulasiBiaya", () => {
  it("menjumlahkan bahan, upah diserap, dan overhead diserap", () => {
    const b = akumulasiBiaya(BAHAN, OPERASI);
    expect(b.bahan).toBe(45_100_000);
    expect(b.tenagaKerja).toBe(10 * 25_000);
    expect(b.overhead).toBe(10 * 10_000);
    expect(b.total).toBe(45_450_000);
  });

  it("menyerap pada jam SUNGGUHAN, bukan jam standar", () => {
    // Menyerap pada jam standar membuat setiap perintah selalu "tepat", dan
    // varians efisiensi tidak akan pernah muncul di mana pun.
    const b = akumulasiBiaya(BAHAN, OPERASI);
    expect(b.jamStandar).toBe(8);
    expect(b.jamSungguhan).toBe(10);
    expect(b.tenagaKerja).toBe(10 * 25_000);
    expect(b.tenagaKerja).not.toBe(8 * 25_000);
  });

  it("operasi yang BELUM dilaporkan tidak menyerap apa pun", () => {
    // `null` adalah "belum diketahui". Memperlakukannya nol terbaca sama dengan
    // "dikerjakan tanpa waktu sama sekali" — dua keadaan yang sangat berbeda.
    const b = akumulasiBiaya(BAHAN, [{ ...OPERASI[0], actualHours: null }]);
    expect(b.tenagaKerja).toBe(0);
    expect(b.overhead).toBe(0);
    expect(b.jamSungguhan).toBe(0);
    // Jam standarnya tetap dihitung — ia pembanding, bukan penyerapan.
    expect(b.jamStandar).toBe(8);
  });

  it("perintah tanpa operasi hanya menampung bahannya", () => {
    const b = akumulasiBiaya(BAHAN, []);
    expect(b.total).toBe(45_100_000);
  });

  it("perintah tanpa bahan dan tanpa operasi bernilai nol", () => {
    const b = akumulasiBiaya([], []);
    expect(b.total).toBe(0);
  });
});

describe("hargaPokokKeluaran", () => {
  it("membagi isi WIP dengan keluaran sungguhan", () => {
    expect(hargaPokokKeluaran(45_450_000, 950)).toBe(47_842.11);
  });

  it("MENOLAK keluaran nol — itu susut proses, bukan produksi", () => {
    // Memulangkan nol akan diam-diam melenyapkan nilai bahannya dari buku.
    expect(() => hargaPokokKeluaran(45_450_000, 0)).toThrow(ProductionCostError);
    expect(() => hargaPokokKeluaran(45_450_000, -1)).toThrow(ProductionCostError);
  });

  it("kalimat penolakannya menunjuk jalan yang benar", () => {
    try {
      hargaPokokKeluaran(1, 0);
      expect.unreachable("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).toContain("susut proses");
    }
  });
});

describe("bagianPenyerapan", () => {
  it("hanya memulangkan bagian yang bernilai", () => {
    // Jurnal berbaris nol tetap seimbang dan tetap lolos setiap penjaga, tapi ia
    // memenuhi buku besar dengan baris yang tak berarti bagi pembacanya.
    const b = akumulasiBiaya(BAHAN, [{ ...OPERASI[0], overheadRate: 0 }]);
    expect(bagianPenyerapan(b).map((x) => x.jenis)).toEqual(["tenaga_kerja"]);
  });

  it("kosong ketika tak ada yang diserap", () => {
    expect(bagianPenyerapan(akumulasiBiaya(BAHAN, []))).toEqual([]);
  });

  it("keduanya ketika keduanya bernilai", () => {
    const b = akumulasiBiaya(BAHAN, OPERASI);
    expect(bagianPenyerapan(b)).toEqual([
      { jenis: "tenaga_kerja", nilai: 250_000 },
      { jenis: "overhead", nilai: 100_000 },
    ]);
  });
});
