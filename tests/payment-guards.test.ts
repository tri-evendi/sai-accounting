/**
 * Penjaga jalur-tulis pembayaran (issue #424).
 *
 * Ditemukan lewat pengujian langsung di produksi: faktur Rp11.100.000 yang sudah
 * lunas menerima Rp5.000.000 lagi, dan faktur Rp2.000.000 (IDR) menerima
 * USD 500.000 @16.000 = Rp8.000.000.000 — keduanya 201, tanpa satu galat pun,
 * karena jurnalnya memang seimbang di kedua sisi.
 *
 * Yang diuji di sini adalah ATURANNYA (`checkPaymentFits`, murni). Rangkaian
 * route-nya — mengambil angka di dalam transaksi, menerjemahkan alasannya —
 * hidup di route dan tidak dipalsukan di sini.
 */
import { describe, expect, it } from "vitest";

import { checkPaymentFits } from "@/lib/document-payments";
import { paymentFormSchema } from "@/lib/validations/payment";

/** Faktur rupiah Rp10.000.000 yang belum dibayar sepeser pun. */
const IDR_10JT = {
  documentCurrency: "IDR",
  documentBase: 10_000_000,
  paidBases: [] as (number | null)[],
  paymentCurrency: "IDR",
};

describe("penjaga kelebihan bayar", () => {
  it("meloloskan pembayaran yang lebih kecil dari tagihan", () => {
    expect(checkPaymentFits({ ...IDR_10JT, paymentBase: 4_000_000 })).toBeNull();
  });

  it("meloloskan pelunasan yang pas", () => {
    expect(checkPaymentFits({ ...IDR_10JT, paymentBase: 10_000_000 })).toBeNull();
  });

  it("meloloskan cicilan terakhir yang pas menutup sisa", () => {
    expect(
      checkPaymentFits({ ...IDR_10JT, paidBases: [6_000_000], paymentBase: 4_000_000 })
    ).toBeNull();
  });

  it("menolak pembayaran pada faktur yang sudah lunas", () => {
    const problem = checkPaymentFits({
      ...IDR_10JT,
      paidBases: [10_000_000],
      paymentBase: 5_000_000,
    });

    expect(problem).toEqual({
      code: "exceeds_outstanding",
      outstandingBase: 0,
      attemptedBase: 5_000_000,
    });
  });

  it("menolak cicilan yang membuat totalnya melebihi tagihan", () => {
    const problem = checkPaymentFits({
      ...IDR_10JT,
      paidBases: [6_000_000, 3_000_000],
      paymentBase: 2_000_000,
    });

    expect(problem?.code).toBe("exceeds_outstanding");
    if (problem?.code === "exceeds_outstanding") {
      expect(problem.outstandingBase).toBe(1_000_000);
    }
  });

  it("tidak tersandung derau pembulatan setengah sen", () => {
    expect(
      checkPaymentFits({ ...IDR_10JT, paidBases: [9_999_999.996], paymentBase: 0.005 })
    ).toBeNull();
  });

  it("menyebut sisa yang NEGATIF apa adanya pada dokumen yang terlanjur lebih bayar", () => {
    /* Data lama dari sebelum penjaga ini ada. Menampilkannya sebagai "sisa 0"
       adalah penyamaran yang membuat cacat ini bertahan lama — laporan sudah
       menjepitnya dengan Math.max(0,…), pesan galat tidak boleh ikut. */
    const problem = checkPaymentFits({
      ...IDR_10JT,
      paidBases: [16_000_000],
      paymentBase: 1_000_000,
    });

    if (problem?.code === "exceeds_outstanding") {
      expect(problem.outstandingBase).toBe(-6_000_000);
    } else {
      throw new Error("seharusnya ditolak");
    }
  });
});

describe("penjaga mata uang", () => {
  it("menolak pembayaran USD atas faktur IDR — kerusakan terbesar #424", () => {
    expect(
      checkPaymentFits({ ...IDR_10JT, paymentCurrency: "USD", paymentBase: 8_000_000_000 })
    ).toEqual({ code: "currency_mismatch", documentCurrency: "IDR", paymentCurrency: "USD" });
  });

  it("menolak pembayaran IDR atas faktur USD", () => {
    expect(
      checkPaymentFits({
        documentCurrency: "USD",
        documentBase: 160_000_000,
        paidBases: [],
        paymentCurrency: "IDR",
        paymentBase: 1_000_000,
      })
    ).toEqual({ code: "currency_mismatch", documentCurrency: "USD", paymentCurrency: "IDR" });
  });

  it("meloloskan valas yang mata uangnya cocok", () => {
    expect(
      checkPaymentFits({
        documentCurrency: "USD",
        documentBase: 160_000_000,
        paidBases: [],
        paymentCurrency: "USD",
        paymentBase: 80_000_000,
      })
    ).toBeNull();
  });

  it("mata uang diperiksa LEBIH DULU — nominalnya tak berarti bila mata uangnya salah", () => {
    const problem = checkPaymentFits({
      ...IDR_10JT,
      paidBases: [10_000_000],
      paymentCurrency: "USD",
      paymentBase: 1,
    });

    expect(problem?.code).toBe("currency_mismatch");
  });
});

describe("dokumen yang nilainya tidak terukur", () => {
  it("menolak bila nilai IDR dokumennya tidak diketahui", () => {
    expect(
      checkPaymentFits({ ...IDR_10JT, documentBase: null, paymentBase: 1_000_000 })
    ).toEqual({ code: "document_value_unknown" });
  });

  it("menolak bila ada pembayaran lama yang nilai IDR-nya tidak diketahui", () => {
    /* Buku produksi memuat enam baris seperti ini (valas tanpa kurs). Menjumlahkan
       yang tak diketahui sebagai nol akan MENGARANG sisa tagihan. */
    expect(
      checkPaymentFits({ ...IDR_10JT, paidBases: [3_000_000, null], paymentBase: 1_000_000 })
    ).toEqual({ code: "document_value_unknown" });
  });
});

describe("bawaan mata uang pembayaran", () => {
  it("adalah IDR, bukan USD", () => {
    /* `default("USD")` sudah melahirkan pembayaran rupiah berlabel USD tanpa
       kurs di buku produksi — nilainya jadi tak terhitung di umur piutang. */
    const parsed = paymentFormSchema.parse({ date: "2026-01-31", amount: 1_000_000 });

    expect(parsed.currency).toBe("IDR");
  });
});
