/**
 * Penjaga nilai enum-like data legacy (issue #111).
 *
 * Yang diuji di sini bukan sekadar "fungsinya memetakan dengan benar",
 * melainkan sifat yang membuat masalahnya tidak terulang: nilai yang TIDAK
 * dikenal harus MELEMPAR. Impor legacy pertama tidak melempar — ia menyalin
 * 'IN'/'OUT'/'PROCESS' dan 'Rp'/'USD'/'CNY' apa adanya ke kolom VARCHAR,
 * berhasil tanpa satu pun keluhan, dan menghasilkan saldo stok nol untuk 33
 * barang serta 18.689 baris kas yang memakai akun bawaan. Diam adalah
 * kegagalan yang paling mahal di sini, jadi diam itulah yang diuji.
 */
import { describe, it, expect } from "vitest";
import { canonicalCashType, canonicalStockType, LegacyValueError } from "@/lib/legacy-values";
import { CASH_TYPES, STOCK_MOVEMENT_TYPES } from "@/lib/constants";

describe("canonicalStockType", () => {
  it("memetakan nilai legacy tb_stok.status ke nilai yang dibandingkan kode", () => {
    expect(canonicalStockType("IN")).toBe("in");
    expect(canonicalStockType("OUT")).toBe("out");
    expect(canonicalStockType("PROCESS")).toBe("process");
  });

  it("PROCESS menjadi `process`, BUKAN `out` — barangnya masih milik perusahaan", () => {
    expect(canonicalStockType("PROCESS")).not.toBe("out");
  });

  it("nilai yang sudah baku dibiarkan apa adanya", () => {
    for (const type of STOCK_MOVEMENT_TYPES) {
      expect(canonicalStockType(type)).toBe(type);
    }
  });

  it("kosong = tidak tahu, dikembalikan null agar pemanggil yang memutuskan", () => {
    expect(canonicalStockType("")).toBeNull();
    expect(canonicalStockType("   ")).toBeNull();
    expect(canonicalStockType(null)).toBeNull();
  });

  it("nilai tak dikenal MELEMPAR, bukan diam-diam jadi `in`", () => {
    expect(() => canonicalStockType("RETUR")).toThrow(LegacyValueError);
    // Pesannya harus menyebut nilai aslinya: yang membacanya sedang mencari
    // baris mana di antara puluhan ribu.
    expect(() => canonicalStockType("RETUR")).toThrow(/RETUR/);
  });
});

describe("canonicalCashType", () => {
  it("nama buku kas legacy menjadi jenis kas baku", () => {
    expect(canonicalCashType("Kas Besar")).toEqual({ type: "kas_besar" });
    expect(canonicalCashType("Kas Kecil")).toEqual({ type: "kas_kecil" });
  });

  it("Rp/USD/CNY adalah REKENING BANK — jenisnya bank, bedanya mata uang", () => {
    expect(canonicalCashType("Rp")).toEqual({ type: "bank", currency: "IDR" });
    expect(canonicalCashType("USD")).toEqual({ type: "bank", currency: "USD" });
    expect(canonicalCashType("CNY")).toEqual({ type: "bank", currency: "CNY" });
  });

  /*
   * Kolom `sumber` legacy mencampur dua dimensi (nama buku kas DAN mata uang).
   * Yang tidak boleh terjadi: mata uang ikut menjadi jenis kas, sehingga
   * beranda menampilkan "akun" bernama Rp dan CNY di samping Kas Besar.
   */
  it("tidak ada nilai legacy yang lolos menjadi jenis kas di luar daftar baku", () => {
    for (const raw of ["Kas Besar", "Kas Kecil", "Rp", "USD", "CNY", "RMB", "bank"]) {
      expect(CASH_TYPES).toContain(canonicalCashType(raw)!.type);
    }
  });

  it("nilai tanpa mata uang tidak memaksakan mata uang apa pun", () => {
    expect(canonicalCashType("Kas Kecil")!.currency).toBeUndefined();
  });

  it("nilai tak dikenal MELEMPAR, bukan diam-diam jatuh ke kas kecil", () => {
    expect(() => canonicalCashType("Dompet Digital")).toThrow(LegacyValueError);
    expect(() => canonicalCashType("Dompet Digital")).toThrow(/Dompet Digital/);
  });

  it("kosong dikembalikan null", () => {
    expect(canonicalCashType("")).toBeNull();
    expect(canonicalCashType(undefined)).toBeNull();
  });
});
