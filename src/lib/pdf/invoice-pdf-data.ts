/**
 * Bahan cetak sebuah faktur — SATU pemetaan, dipakai dua permukaan (issue #465).
 *
 * ══ KENAPA ADA ══════════════════════════════════════════════════════════════
 * Sampai #465 hanya ada satu jalan menuju kertas: tombol di halaman faktur
 * merakit objeknya sendiri di dalam JSX, lalu memanggil `generateInvoicePDF` di
 * BROWSER. Begitu faktur juga bisa dikirim lewat surel, jalannya menjadi dua —
 * dan yang kedua berjalan di server, jauh dari objek yang dirakit halaman itu.
 *
 * Dua perakitan berarti dua pemetaan yang perlahan menyimpang: satu kolom
 * ditambahkan di halaman, terlupa di pengirim, dan sejak hari itu kertas yang
 * DILIHAT pengguna berbeda dari kertas yang DITERIMA pelanggannya — dengan
 * nomor faktur yang sama. Itu cacat termahal di fitur ini, karena tidak ada
 * satu pun galat yang menandainya; yang terjadi hanya dua kertas yang beredar.
 *
 * Modul ini MURNI (tanpa Prisma, tanpa jsPDF, tanpa React) supaya pemetaannya
 * bisa diuji langsung, dan supaya mengimpornya dari komponen server tidak
 * menyeret jsPDF ke mana pun.
 */

/** Bentuk baris yang dibutuhkan — sengaja struktural, bukan tipe Prisma:
 *  `Decimal` sudah cukup ditandai sebagai "sesuatu yang bisa di-`Number()`". */
export interface InvoiceRowForPdf {
  invoiceNo: string;
  date: Date;
  status: string;
  currency: string | null;
  taxAmount: unknown;
  taxable: boolean | null;
  taxRate: unknown;
  pebNumber: string | null;
  pebDate: Date | null;
  exportNote: string | null;
  customer?: { name: string } | null;
  items: { itemName: string; quantity: unknown; price: unknown; unit: string | null }[];
  payments: { date: Date; amount: unknown; currency: string; note: string | null }[];
}

/** Objek yang diterima `generateInvoicePDF` — tanggal sebagai ISO, uang sebagai
 *  `number`, karena begitulah renderer membacanya. */
export interface InvoicePdfData {
  invoiceNo: string;
  date: string;
  status: string;
  currency: string;
  taxAmount: number;
  taxable: boolean;
  taxRate: number | null;
  pebNumber: string | null;
  pebDate: string | null;
  exportNote: string | null;
  customerName: string | null;
  items: { itemName: string; quantity: number; price: number; unit: string | null }[];
  payments: { date: string; amount: number; currency: string; note: string | null }[];
}

const num = (v: unknown): number => Number(v ?? 0);

export function buildInvoicePdfData(invoice: InvoiceRowForPdf): InvoicePdfData {
  const taxAmount = num(invoice.taxAmount);

  return {
    invoiceNo: invoice.invoiceNo,
    date: invoice.date.toISOString(),
    status: invoice.status,
    /* Kolom `currency` boleh kosong pada baris lama; IDR adalah bawaan yang
       sama dengan yang dipakai skema. */
    currency: invoice.currency || "IDR",
    taxAmount,
    /* Baris warisan (issue #16): `taxable` belum ada sebagai kolom, tetapi
       `tax_amount` sudah terisi. Yang tersimpan itulah yang benar-benar
       diposting, jadi ia tetap dibaca sebagai faktur ber-PPN — kalau tidak,
       barisnya kehilangan label PPN-nya di kertas. */
    taxable: invoice.taxable ?? taxAmount > 0,
    taxRate: invoice.taxRate != null ? Number(invoice.taxRate) : null,
    pebNumber: invoice.pebNumber ?? null,
    pebDate: invoice.pebDate ? invoice.pebDate.toISOString() : null,
    exportNote: invoice.exportNote ?? null,
    customerName: invoice.customer?.name ?? null,
    items: invoice.items.map((i) => ({
      itemName: i.itemName,
      quantity: num(i.quantity),
      price: num(i.price),
      unit: i.unit,
    })),
    payments: invoice.payments.map((p) => ({
      date: p.date.toISOString(),
      amount: num(p.amount),
      currency: p.currency,
      note: p.note,
    })),
  };
}
