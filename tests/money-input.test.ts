/**
 * Konversi MoneyInput (issue #53).
 *
 * MoneyInput menampilkan `1.234.567` tetapi harus melaporkan angka bersih
 * `1234567` ke form. Kalau titik/koma bocor ke payload, server menerima
 * string yang gagal atau — lebih buruk — terbaca sebagai angka yang salah.
 * Logika format<->angka diuji langsung di sini; keduanya diekspor dari modul
 * yang sama dengan komponennya lewat `__test` agar tidak perlu render DOM.
 */

import { describe, it, expect } from "vitest";
import { displayToNumber, numberToDisplay } from "@/components/ui/money-input-format";

describe("numberToDisplay", () => {
  it("menyisipkan pemisah ribuan id-ID", () => {
    expect(numberToDisplay(1234567, 0)).toBe("1.234.567");
  });

  it("kosong untuk undefined — 'belum diisi' bukan '0'", () => {
    expect(numberToDisplay(undefined, 0)).toBe("");
  });

  it("mempertahankan desimal valas", () => {
    expect(numberToDisplay(1234.5, 2)).toBe("1.234,5");
  });
});

describe("displayToNumber", () => {
  it("membuang titik ribuan, menghasilkan angka bersih", () => {
    expect(displayToNumber("1.234.567", 0)).toBe(1234567);
  });

  it("koma jadi titik desimal untuk valas", () => {
    expect(displayToNumber("1.234,56", 2)).toBe(1234.56);
  });

  it("isian kosong -> undefined, bukan 0", () => {
    // Membedakan 'belum diisi' dari 'nol' penting untuk validasi wajib.
    expect(displayToNumber("", 0)).toBeUndefined();
    expect(displayToNumber("-", 0)).toBeUndefined();
  });

  it("mengabaikan karakter non-angka yang salah ketik", () => {
    expect(displayToNumber("Rp 1.000abc", 0)).toBe(1000);
  });

  it("round-trip angka -> tampilan -> angka tetap utuh", () => {
    for (const n of [0, 1000, 1234567, 50, 999999999]) {
      expect(displayToNumber(numberToDisplay(n, 0), 0)).toBe(n);
    }
  });
});
