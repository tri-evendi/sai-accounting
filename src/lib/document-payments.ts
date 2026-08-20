/**
 * Penjaga jalur-tulis pembayaran dokumen (issue #424).
 *
 * ══ APA YANG DULU TIDAK DIPERIKSA ═══════════════════════════════════════════
 * `POST /api/invoices/[id]/payments` dan `POST /api/contracts/[id]/payments`
 * menerima pembayaran apa pun. Diuji di produksi 21 Agustus 2026:
 *
 *   • Faktur Rp11.100.000 yang SUDAH lunas menerima Rp5.000.000 lagi → 201.
 *   • Faktur Rp2.000.000 (IDR) menerima USD 500.000 @ kurs 16.000 → 201,
 *     terbukukan Rp8.000.000.000.
 *
 * Sesudahnya Piutang Usaha bersaldo −Rp7,9 miliar dan Bank (USD) +Rp8 miliar.
 *
 * ══ KENAPA TIDAK ADA YANG BERBUNYI ══════════════════════════════════════════
 * Karena bukunya TIDAK timpang. Kedua sisi jurnalnya benar — kas bertambah,
 * piutang berkurang — jadi `assertBalanced` puas, neraca saldo seimbang, dan
 * tak satu pun penjaga yang ada punya alasan bersuara. Satu-satunya jejaknya
 * adalah aset bersaldo negatif, yang baru ketahuan bila ada yang membaca Neraca
 * dengan teliti.
 *
 * Laporan pun ikut menyembunyikannya: `settleDocument` menjepit sisa dengan
 * `Math.max(0, …)`, jadi faktur yang kelebihan bayar tampil "lunas, sisa 0" —
 * benar untuk ember umur piutang, menyesatkan sebagai satu-satunya tempat orang
 * mungkin melihatnya.
 *
 * ══ KENAPA BUKAN "FITUR UANG MUKA" ══════════════════════════════════════════
 * Aplikasi ini SUDAH punya modul Uang Muka (`advance_payments`) untuk uang yang
 * diterima sebelum ada tagihannya. Kelebihan bayar di sini bukan jalan kedua
 * menuju hal yang sama — ia salah ketik yang tersimpan diam-diam. Pemeriksaan
 * tutup buku pun sudah menganggap aset bersaldo negatif sebagai GEJALA
 * KESALAHAN (`checkNegativeAssetsWarn`), bukan keadaan yang sah.
 *
 * ══ PRESEDEN ═══════════════════════════════════════════════════════════════
 * Sisi utang sudah dijaga sejak issue #37 (`lib/supplier-allocations.ts`):
 * alokasi yang melebihi sisa utang ditolak sebelum apa pun ditulis. Modul ini
 * membawa aturan yang sama ke sisi piutang dan kontrak — dan menambahkan satu
 * yang belum dijaga di mana pun: mata uang pembayaran harus sama dengan mata
 * uang dokumennya.
 *
 * MURNI: tidak menyentuh basis data, tidak menyentuh Prisma. Yang mengumpulkan
 * angkanya adalah route, di DALAM transaksinya — supaya dua pembayaran yang
 * datang bersamaan tidak bisa sama-sama lolos pemeriksaan yang sama.
 */

/** Setengah sen. Uang bertipe Decimal(15,2), jadi di bawah ini hanya derau pembulatan. */
export const MONEY_EPSILON = 0.005;

/**
 * Kenapa sebuah pembayaran ditolak — DATA, bukan kalimat.
 *
 * Route yang menerjemahkannya (`getRequestI18n`), sama seperti galat validasi
 * lain sejak fase i18n: kalimat yang dipanggang di modul tidak bisa ikut
 * berganti bahasa.
 */
export type PaymentProblem =
  | { code: "currency_mismatch"; documentCurrency: string; paymentCurrency: string }
  | { code: "document_value_unknown" }
  | { code: "exceeds_outstanding"; outstandingBase: number; attemptedBase: number };

export interface PaymentFitInput {
  /** Mata uang dokumen yang dibayar. */
  documentCurrency: string;
  /** Nilai dokumen dalam IDR. `null` = kursnya belum diisi, jadi tak terukur. */
  documentBase: number | null;
  /**
   * Nilai IDR pembayaran yang SUDAH tercatat pada dokumen ini. `null` di salah
   * satu barisnya berarti ada pembayaran valas tanpa kurs — jumlahnya tidak
   * diketahui, dan menebaknya berarti mengarang sisa tagihan.
   */
  paidBases: (number | null)[];
  /** Mata uang pembayaran yang sedang diajukan. */
  paymentCurrency: string;
  /** Nilai IDR pembayaran yang sedang diajukan. */
  paymentBase: number;
}

/**
 * Apakah pembayaran ini muat? `null` bila tidak ada masalah.
 *
 * Urutannya disengaja: mata uang DULU. Pembayaran yang mata uangnya salah punya
 * nilai IDR yang tidak berarti apa-apa terhadap dokumen itu, jadi mengukurnya
 * lebih dulu hanya menghasilkan angka kedua yang membingungkan di pesan yang
 * sama.
 */
export function checkPaymentFits(input: PaymentFitInput): PaymentProblem | null {
  const documentCurrency = input.documentCurrency || "IDR";
  const paymentCurrency = input.paymentCurrency || "IDR";

  if (paymentCurrency !== documentCurrency) {
    return { code: "currency_mismatch", documentCurrency, paymentCurrency };
  }

  if (input.documentBase == null || input.paidBases.some((b) => b == null)) {
    return { code: "document_value_unknown" };
  }

  const paid = input.paidBases.reduce<number>((sum, b) => sum + (b ?? 0), 0);
  const outstandingBase = round2(input.documentBase - paid);

  if (input.paymentBase > outstandingBase + MONEY_EPSILON) {
    return {
      code: "exceeds_outstanding",
      // Tidak dijepit ke nol: dokumen yang TERLANJUR kelebihan bayar (data lama,
      // sebelum penjaga ini ada) harus menyebutkan sisanya yang negatif apa
      // adanya. Menampilkannya sebagai "sisa 0" adalah persis penyamaran yang
      // membuat cacat ini bertahan begitu lama.
      outstandingBase,
      attemptedBase: round2(input.paymentBase),
    };
  }

  return null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
