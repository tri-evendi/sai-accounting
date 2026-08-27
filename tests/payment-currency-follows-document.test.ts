/**
 * Mata uang pembayaran mengikuti dokumennya.
 *
 * Server sudah MENOLAK pembayaran yang mata uangnya berbeda dari kontrak/faktur
 * sejak #424/#483 (`checkPaymentFits` → `currency_mismatch`). Yang tidak ikut
 * diperbaiki waktu itu adalah bawaan FORMULIRNYA: ia membuka dialog di "USD"
 * apa pun dokumennya, sehingga pada kontrak rupiah atau CNY tombol Simpan
 * pertama selalu gagal — perbaikan #424 ditimpa kembali setiap kali dialog
 * dibuka.
 *
 * Yang memakukan perbaikannya bukan berkas ini melainkan TIPE: `documentCurrency`
 * kini prop WAJIB pada `PaymentForm`, jadi bawaan diam-diam tidak bisa lahir
 * lagi tanpa gagal di `tsc`. Yang diuji di sini adalah penyempitan di
 * perbatasannya — satu-satunya bagian yang bisa salah tanpa terlihat.
 */
import { describe, expect, it } from "vitest";
import { asCurrency, BASE_CURRENCY } from "@/lib/validations/fx";
import { checkPaymentFits } from "@/lib/document-payments";

describe("asCurrency", () => {
  it("meneruskan ketiga mata uang yang dikenal", () => {
    for (const c of ["IDR", "USD", "CNY"] as const) {
      expect(asCurrency(c)).toBe(c);
    }
  });

  it("menjatuhkan kode asing ke mata uang dasar, bukan meledak", () => {
    // Kolomnya `VarChar(5)` dan enumnya hidup di zod, jadi baris warisan bisa
    // membawa apa saja. Halaman yang mati karena satu baris lama jauh lebih
    // buruk daripada satu label yang berbunyi IDR.
    expect(asCurrency("SGD")).toBe(BASE_CURRENCY);
    expect(asCurrency("")).toBe(BASE_CURRENCY);
    expect(asCurrency(null)).toBe(BASE_CURRENCY);
    expect(asCurrency(undefined)).toBe(BASE_CURRENCY);
  });

  it("tidak mengubah huruf — 'usd' BUKAN 'USD'", () => {
    // Sengaja: yang tersimpan huruf kecil adalah data yang perlu dilihat orang,
    // bukan diam-diam dirapikan di lapisan tampilan.
    expect(asCurrency("usd")).toBe(BASE_CURRENCY);
  });
});

describe("penjaga server yang membuat bawaan itu penting", () => {
  it("menolak pembayaran yang mata uangnya berbeda dari dokumennya", () => {
    expect(
      checkPaymentFits({
        documentCurrency: "CNY",
        documentBase: 1_000_000,
        paidBases: [],
        paymentCurrency: "USD",
        paymentBase: 500_000,
      })
    ).toEqual({ code: "currency_mismatch", documentCurrency: "CNY", paymentCurrency: "USD" });
  });

  it("meloloskan yang mata uangnya sama — inilah yang kini jadi bawaan formulir", () => {
    expect(
      checkPaymentFits({
        documentCurrency: "CNY",
        documentBase: 1_000_000,
        paidBases: [],
        paymentCurrency: "CNY",
        paymentBase: 500_000,
      })
    ).toBeNull();
  });
});
