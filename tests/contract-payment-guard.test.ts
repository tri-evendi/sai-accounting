/**
 * PENJAGA PEMBAYARAN KONTRAK (issue #483).
 *
 * == Kenapa ia pernah ditunda, dan kenapa tidak lagi ========================
 * Route pembayaran kontrak mendapat penjaga MATA UANG di #424, tetapi penjaga
 * NOMINAL-nya ditunda dengan alasan yang ditulis di kodenya sendiri: "sisa
 * kontrak" belum punya satu definisi, jadi pagar yang memakai satu definisi
 * akan berselisih dengan laporan yang memakai definisi lain.
 *
 * Penghalang itu hilang di #491 → #502 → #503: `buildContractOutstanding`
 * sekarang satu definisi yang dipakai bersama laporan dan pagar fakturnya.
 *
 * == Yang diukur pagar ini, dan yang TIDAK ==================================
 * Sisa yang belum DIBAYAR (kontrak − pembayaran) — bukan sisa yang belum
 * DIFAKTURKAN (kontrak − faktur) yang tampil di layar kontrak. Keduanya
 * menjawab pertanyaan berbeda dan memang boleh berbeda.
 *
 * Memakai nilai yang sudah difakturkan sebagai pagar akan menolak UANG MUKA —
 * pembayaran yang sah dan memang datang sebelum ada faktur. Pagar yang menolak
 * alur yang didukung aplikasinya sendiri lebih buruk daripada tidak ada pagar.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkPaymentFits } from "@/lib/document-payments";

const route = readFileSync(
  join(__dirname, "..", "src", "app", "api", "contracts", "[id]", "payments", "route.ts"),
  "utf8"
);

/** Kontrak USD 10.000 @16.000 yang belum dibayar sepeser pun. */
const KONTRAK = {
  documentCurrency: "USD",
  documentBase: 160_000_000,
  paidBases: [] as (number | null)[],
  paymentCurrency: "USD",
};

describe("aturannya SATU, dipakai bersama sisi faktur", () => {
  it("route memakai `checkPaymentFits`, bukan salinan kedua", () => {
    expect(route).toMatch(/checkPaymentFits\(/);
    /* Kalau suatu hari muncul perbandingan tulisan tangan di sini, ia akan
       menjadi definisi kedua "sisa" — persis yang membuat penjaga ini ditunda. */
    expect(route).not.toMatch(/paymentData\.amount\s*>\s*/);
  });

  it("kalimat penolakannya juga dibagi pakai, bukan disalin", () => {
    expect(route).toMatch(/paymentProblemMessage/);
    expect(route).toMatch(/PaymentRefused/);
  });
});

describe("nominal: tidak boleh melebihi nilai kontrak", () => {
  it("meloloskan pembayaran yang lebih kecil", () => {
    expect(checkPaymentFits({ ...KONTRAK, paymentBase: 40_000_000 })).toBeNull();
  });

  it("meloloskan pelunasan yang pas", () => {
    expect(checkPaymentFits({ ...KONTRAK, paymentBase: 160_000_000 })).toBeNull();
  });

  it("meloloskan cicilan terakhir yang pas menutup sisa", () => {
    expect(
      checkPaymentFits({ ...KONTRAK, paidBases: [100_000_000], paymentBase: 60_000_000 })
    ).toBeNull();
  });

  it("MENOLAK yang melebihi, dan menyebut kedua angkanya", () => {
    const p = checkPaymentFits({ ...KONTRAK, paidBases: [150_000_000], paymentBase: 20_000_000 });
    expect(p?.code).toBe("exceeds_outstanding");
    if (p?.code === "exceeds_outstanding") {
      expect(p.outstandingBase).toBe(10_000_000);
      expect(p.attemptedBase).toBe(20_000_000);
    }
  });
});

describe("uang muka tetap boleh — inilah sebab pagarnya diukur ke NILAI KONTRAK", () => {
  it("pembayaran penuh sebelum ada faktur satu pun tetap lolos", () => {
    /*
     * Pagar yang diukur ke "yang sudah difakturkan" akan menolak ini, padahal
     * uang muka adalah alur yang didukung aplikasi (`advance_sales`).
     */
    expect(checkPaymentFits({ ...KONTRAK, paymentBase: 160_000_000 })).toBeNull();
  });

  it("route TIDAK mengukur ke nilai faktur", () => {
    expect(route).not.toMatch(/invoicedValue|invoicedKg/);
  });
});

describe("mata uang: lebur ke penjaga yang sama", () => {
  it("membayar kontrak USD dengan rupiah ditolak", () => {
    const p = checkPaymentFits({ ...KONTRAK, paymentCurrency: "IDR", paymentBase: 1_000 });
    expect(p?.code).toBe("currency_mismatch");
  });

  it("mata uang diperiksa SEBELUM nominal", () => {
    /* Pembayaran yang mata uangnya salah punya nilai IDR yang tidak berarti
       apa-apa terhadap dokumennya; mengukurnya lebih dulu hanya menghasilkan
       angka kedua yang membingungkan di pesan yang sama. */
    const p = checkPaymentFits({
      ...KONTRAK,
      paymentCurrency: "IDR",
      paymentBase: 999_000_000_000,
    });
    expect(p?.code).toBe("currency_mismatch");
  });

  it("pemeriksaan mata uang yang dulu berdiri sendiri sudah dicabut", () => {
    /* Dua pemeriksaan untuk satu aturan adalah dua tempat yang bisa
       berselisih — dan yang di route dulu menjawab 422 dengan kalimat yang
       dirakit terpisah. */
    expect(route).not.toMatch(/!==\s*\(contract\.currency/);
  });
});

describe("kontrak lama tidak dilumpuhkan penjaganya sendiri", () => {
  it("nilai kontrak DITURUNKAN dari barisnya, bukan dibaca mentah", () => {
    /*
     * Kontrak rupiah dari penyemai contoh maupun impor lama menyimpan
     * `base_amount` NULL — untuk IDR ia memang sama dengan nominalnya. Membaca
     * kolomnya apa adanya akan menganggapnya "tak bernilai" dan menolak SETIAP
     * pembayarannya: penjaga yang berubah jadi kelumpuhan. Ini pelajaran yang
     * sudah dibayar sekali di sisi faktur (#424).
     */
    expect(route).toMatch(/contractSubtotal\(/);
    expect(route).toMatch(/toBase\(\{/);
  });

  it("nilai yang benar-benar tak diketahui dijawab, bukan didiamkan", () => {
    const p = checkPaymentFits({ ...KONTRAK, documentBase: null, paymentBase: 1 });
    expect(p?.code).toBe("document_value_unknown");
  });
});

describe("dijalankan di dalam transaksi", () => {
  it("pembayaran yang sudah ada dibaca lewat `tx`, bukan di luar", () => {
    /* Membacanya di luar transaksi berarti dua permintaan bersamaan bisa
       sama-sama lolos dan bersama-sama melewati batas. */
    expect(route).toMatch(/tx\.contractPayment\.findMany/);
  });
});
