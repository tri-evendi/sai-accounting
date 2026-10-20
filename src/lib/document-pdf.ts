/**
 * DOKUMEN SATUAN MENJADI PDF, DI SERVER — dari ID-nya, bukan dari muatan.
 *
 * ══ YANG DIBANGUN DI SINI, DAN APA YANG MASIH DI PERAMBAN ══════════════════
 * Rancangan §5 membagi dokumen menjadi dua, dan pembaginya BUKAN jenisnya
 * melainkan ongkosnya:
 *
 *   • satu faktur, surat jalan, kontrak, retur → server, **sinkron**,
 *     di-stream. Milidetik; antrean untuknya hanya menambah penantian.
 *   • laporan periode panjang & paket laporan → **pekerjaan** lewat antrean
 *     (jalur `interactive`, sudah ada).
 *
 * Modul ini yang pertama. Peta di bawah LENGKAP atas seluruh jenis yang
 * tombolnya ada hari ini, dan jenis yang belum punya pemuatnya ditulis `null`
 * beserta sebabnya — bukan dihilangkan dari peta.
 *
 * ══ DARI ID, DAN ITU YANG MEMBUAT §5 BERARTI ═══════════════════════════════
 * Tombol-tombol itu hari ini menggambar PDF di peramban dari PROP yang
 * diserahkan halamannya. Memindahkannya ke server dengan meneruskan prop yang
 * sama berarti angka di atas kertas tetap ditentukan oleh apa yang dikirim
 * klien — sementara server kini tampak menjaminnya. Syarat audit §5 ("server
 * menyimpan byte yang persis sama dengan yang dikirim ke customer") hanya
 * berarti sesuatu bila kertasnya diturunkan dari BUKU.
 *
 * Jadi setiap pemuat di bawah membaca barisnya dari basis data PT AKTIF.
 * Konteksnya dimasuki penjaga rute, jadi id milik PT lain tidak menemukan apa
 * pun — tanpa satu perbandingan kepemilikan yang ditulis tangan. Aturan yang
 * sama dengan rute berkas dokumen (#367).
 *
 * ══ `Record` YANG LENGKAP, BUKAN PETA OPSIONAL ═════════════════════════════
 * Jenis baru tidak akan mengompilasi sampai seseorang memutuskan izinnya DAN
 * pemuatnya. Keputusan "belum ada pemuatnya" ditulis sebagai `null` beserta
 * alasannya, sebab ketiadaan entri tidak bisa dibedakan dari entri yang lupa
 * ditulis.
 */
import "server-only";

import type { Permission } from "@sai/core/authz";

/** Jenis dokumen satuan yang punya tombol cetak hari ini. */
export const DOCUMENT_PDF_KINDS = [
  "invoice",
  "contract",
  "delivery-order",
  "sales-return",
  "purchase-return",
  "opname-sheet",
  "finance-report",
  "stock-report",
] as const;

export type DocumentPdfKind = (typeof DOCUMENT_PDF_KINDS)[number];

/** Berkas yang dipulangkan sebuah pemuat. */
export interface DocumentPdf {
  filename: string;
  content: Uint8Array;
}

interface JenisDokumen {
  /** Izin yang dituntut — sama dengan halaman yang memuat tombolnya. */
  permission: Permission;
  /**
   * Muat barisnya dari buku PT AKTIF lalu render. `null` = dokumen tidak ada
   * di buku ini (404), bukan galat.
   *
   * `null` pada MEDAN ini (bukan nilai kembaliannya) = jenis itu belum punya
   * pemuat sisi server, dan rutenya menjawab 404 untuknya.
   */
  muat: ((id: number) => Promise<DocumentPdf | null>) | null;
  /** Kalau `muat` null: kenapa, dan apa yang dibutuhkan untuk mengisinya. */
  catatan?: string;
}

export const DOCUMENT_PDF: Readonly<Record<DocumentPdfKind, JenisDokumen>> = {
  /*
   * FAKTUR — pemuatnya sudah ada sejak #465, dan itu bukan kebetulan: jalur
   * surel faktur sudah merender PDF ini di server. Rute cetak memakai pintu
   * yang SAMA (`invoicePdfById`), jadi kertas yang dicetak dan lampiran yang
   * dikirim tidak bisa berbeda — bukan karena keduanya memakai generator yang
   * sama, tapi karena keduanya satu fungsi.
   */
  invoice: {
    permission: "invoice.read",
    muat: async (id) => {
      const { invoicePdfById } = await import("@/lib/invoice-send");
      return invoicePdfById(id);
    },
  },

  /*
   * ══ LIMA JENIS DI BAWAH BELUM PINDAH, DAN SEBABNYA SATU ═════════════════
   *
   * Masing-masing butuh PEMUAT sisi server: satu kueri yang menyusun bentuk
   * yang diminta generatornya dari baris buku. Hari ini bentuk itu dirakit di
   * dalam komponen halaman, dari prop yang sudah dimuat server component-nya —
   * jadi "memindahkannya" bukan memindahkan generator melainkan memindahkan
   * PERAKITAN DATANYA, dan itu satu kueri per jenis.
   *
   * Ia TIDAK dikerjakan sekaligus dengan sengaja. Faktur lebih dulu karena
   * pemuatnya sudah ada dan terbukti di produksi, sehingga rute, penjaga, dan
   * bentuk jawabannya terbukti di satu jenis sebelum lima jenis ikut
   * bergantung padanya. Lima entri `null` di bawah adalah DAFTAR PEKERJAAN
   * yang terbaca, bukan lubang: rutenya menjawab 404, dan tombolnya tetap
   * menggambar di peramban seperti sebelumnya.
   */
  contract: {
    permission: "contract.read",
    muat: null,
    catatan:
      "butuh pemuat: `contracts` + `contract_items` → `ContractData`. " +
      "Hari ini dirakit di `pdf-export-buttons.tsx` dari prop halaman.",
  },
  "delivery-order": {
    permission: "document.read",
    muat: null,
    catatan:
      "butuh pemuat: `delivery_orders` + item + consignee → `ShippingDocData`. " +
      "Hari ini dirakit di `delivery-orders/[id]/pdf-button.tsx`.",
  },
  "sales-return": {
    permission: "return.read",
    muat: null,
    catatan: "butuh pemuat: `sales_returns` + item → `ReturnPdfData`.",
  },
  "purchase-return": {
    permission: "return.read",
    muat: null,
    catatan: "butuh pemuat: `purchase_returns` + item → `ReturnPdfData`.",
  },

  /*
   * TIGA DI BAWAH BUKAN dokumen satuan — mereka LAPORAN, dan §5 menaruh
   * laporan di jalur yang berbeda: yang panjang lewat antrean, yang pendek
   * lewat rute laporan (`/api/reports/pdf`, sudah ada).
   *
   * Mereka ada di peta ini supaya `Record`-nya lengkap atas setiap tombol yang
   * benar-benar ada, dan supaya keputusan "bukan di sini" tertulis — bukan
   * ditemukan lagi oleh orang berikutnya yang mencari di mana lembar opname
   * seharusnya dibuat.
   */
  "opname-sheet": {
    permission: "inventory.read",
    muat: null,
    catatan:
      "BUKAN dokumen satuan: lembar hitung ulang stok adalah laporan. " +
      "Tempatnya jalur laporan, bukan rute ini.",
  },
  "finance-report": {
    permission: "report.read",
    muat: null,
    catatan: "BUKAN dokumen satuan — lihat `/api/reports/pdf`.",
  },
  "stock-report": {
    permission: "inventory.read",
    muat: null,
    catatan: "BUKAN dokumen satuan — laporan stok, lihat jalur laporan.",
  },
};

/** Apakah `v` salah satu jenis yang dikenal? */
export function isDocumentPdfKind(v: string): v is DocumentPdfKind {
  return (DOCUMENT_PDF_KINDS as readonly string[]).includes(v);
}
