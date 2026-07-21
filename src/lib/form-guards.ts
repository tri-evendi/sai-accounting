/**
 * Bantuan anti-salah pada formulir (issue #6) — bagian MURNI-nya.
 *
 * Dua pekerjaan, keduanya tanpa React, tanpa Prisma, tanpa I/O, sehingga bisa
 * diuji di `tests/` tanpa DATABASE_URL dan dipakai baik di server maupun di
 * peramban:
 *
 *  1. **Memanusiakan pesan.** Zod di app ini banyak berbahasa Inggris teknis
 *     ("Amount must be positive", "Expected number, received nan"). Pesan
 *     seperti itu tidak boleh sampai ke staf non-akuntan, jadi setiap pesan
 *     yang kembali dari API dilewatkan ke `humanizeFieldMessage` lebih dulu.
 *     Pesan yang MEMANG sudah ditulis manusiawi (mayoritas pesan Indonesia di
 *     `src/lib/validations/`) dibiarkan apa adanya — memanusiakan bukan berarti
 *     menulis ulang yang sudah baik.
 *
 *  2. **Mencegah sebelum kirim.** Periode terkunci, stok tidak cukup, dan angka
 *     negatif sudah dijaga di server (`assertPeriodOpen`, `assertStockAvailable`,
 *     Zod). Fungsi di sini menampilkan larangan yang SAMA di layar sebelum
 *     tombol Simpan ditekan. Ini murni lapisan kenyamanan: server tetap satu-
 *     satunya otoritas, dan tidak ada satu pun pemeriksaan server yang
 *     dilonggarkan karenanya.
 */

import { MONTH_NAMES } from "@/lib/month-names";
import type { StockShortfall } from "@/lib/delivery-orders";

// ───────────────────────────── Label lapangan ─────────────────────────────

/**
 * Nama field di payload API → label bahasa tugas yang dilihat pengguna.
 * Satu kamus untuk ketiga formulir: nama field-nya memang tidak bertabrakan,
 * dan menyatukannya berarti pesan "Kurs wajib diisi" berbunyi sama di mana pun.
 */
export const FIELD_LABELS: Record<string, string> = {
  // Umum
  date: "Tanggal",
  dueDate: "Tanggal jatuh tempo",
  status: "Status",
  currency: "Mata uang",
  rate: "Kurs",
  note: "Catatan",
  notes: "Catatan",
  items: "Baris barang",
  // Kontrak
  contractNo: "Nomor kontrak",
  buyer: "Pembeli (buyer)",
  consignee: "Penerima barang",
  consigneeId: "Penerima barang",
  packaging: "Kemasan",
  shipment: "Pengapalan",
  top1: "Termin pembayaran 1",
  top2: "Termin pembayaran 2",
  // Faktur
  invoiceNo: "Nomor tagihan",
  customerId: "Pelanggan",
  contractId: "Kontrak sumber",
  taxable: "Kena PPN",
  taxRate: "Tarif PPN",
  pebNumber: "Nomor PEB",
  pebDate: "Tanggal PEB",
  exportNote: "Keterangan ekspor",
  // Kas & bank
  type: "Jenis kas",
  description: "Keterangan",
  debit: "Uang Masuk",
  credit: "Uang Keluar",
  counterAccountId: "Kategori (akun lawan)",
  // Stok
  itemId: "Barang",
  itemName: "Nama barang",
  quantity: "Jumlah",
  unitCost: "Harga pokok per unit",
  bags: "Jumlah bags",
  kgPerBag: "Kg per bag",
  price: "Harga",
  pricePerKg: "Harga per kg",
  amount: "Jumlah",
};

/** Label bahasa tugas untuk sebuah field; jatuh kembali ke namanya sendiri. */
export function fieldLabel(field: string | null | undefined): string {
  if (!field) return "Isian ini";
  return FIELD_LABELS[field] ?? field;
}

// ─────────────────────────── Memanusiakan pesan ───────────────────────────

/** Pesan yang jelas-jelas keluaran mentah Zod / bahasa Inggris teknis. */
const LOOKS_TECHNICAL =
  /^(invalid\b|expected\b|required\b|too (small|big)\b|unrecognized\b|string must\b|number must\b|array must\b|nan\b|must be\b)/i;

interface Rule {
  match: RegExp;
  say: (label: string) => string;
}

/**
 * Diperiksa berurutan — yang lebih spesifik lebih dulu, karena beberapa pesan
 * Zod cocok dengan lebih dari satu pola (mis. "Too small: expected number to be
 * >0" adalah "harus lebih besar dari 0", bukan sekadar "tidak boleh negatif").
 */
const RULES: Rule[] = [
  {
    match: /either debit or credit/i,
    say: () => "Isi salah satu: Uang Masuk atau Uang Keluar. Salah satunya harus lebih dari 0.",
  },
  {
    match: /at least one item/i,
    say: () => "Tambahkan minimal satu baris barang sebelum menyimpan.",
  },
  {
    match: /invalid email/i,
    say: () => "Alamat email belum benar. Contoh yang benar: nama@perusahaan.com.",
  },
  {
    match: /invalid date|expected date|invalid_date/i,
    say: (label) => `${label} belum berupa tanggal yang benar. Pilih tanggalnya dari kalender.`,
  },
  {
    match: /must be positive|greater than 0|to be >0|must be greater than/i,
    say: (label) => `${label} harus lebih besar dari 0.`,
  },
  {
    match: /0 or more|greater than or equal to 0|to be >=0/i,
    say: (label) => `${label} tidak boleh negatif — isi 0 atau lebih.`,
  },
  {
    match: /received nan|expected number/i,
    say: (label) => `${label} harus berupa angka. Hapus huruf atau tanda yang bukan angka.`,
  },
  {
    match: /is required|^required$|received undefined|received null|at least 1 character|to be >=1\b/i,
    say: (label) => `${label} wajib diisi.`,
  },
  {
    match: /too big|at most|less than or equal|to be <=/i,
    say: (label) => `${label} terlalu panjang atau terlalu besar. Persingkat isiannya.`,
  },
  {
    match: /invalid option|invalid enum|invalid value|invalid input/i,
    say: (label) => `Pilihan ${label} tidak dikenali. Pilih salah satu opsi yang tersedia.`,
  },
];

/** Selalu diakhiri tanda baca supaya terbaca sebagai kalimat, bukan potongan. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Ubah satu pesan validasi menjadi kalimat Indonesia yang bisa ditindaklanjuti.
 *
 * Pesan yang sudah manusiawi dikembalikan apa adanya (hanya dirapikan tanda
 * bacanya); hanya pesan yang terbaca sebagai keluaran teknis yang ditulis ulang.
 */
export function humanizeFieldMessage(
  field: string | null | undefined,
  raw: string | null | undefined
): string {
  const label = fieldLabel(field);
  const text = (raw ?? "").trim();

  if (!text) return `${label} belum benar. Periksa lagi isiannya.`;

  for (const rule of RULES) {
    if (rule.match.test(text)) return rule.say(label);
  }

  // Tidak cocok pola mana pun tetapi masih berbau Inggris teknis: jangan
  // ditampilkan mentah-mentah.
  if (LOOKS_TECHNICAL.test(text)) {
    return `${label} belum benar. Periksa lagi isiannya.`;
  }

  return asSentence(text);
}

// ───────────────────────── Pencegahan sebelum kirim ─────────────────────────

/** Satu bulan buku yang sudah ditutup. */
export interface ClosedPeriodRef {
  year: number;
  month: number;
}

/** "Maret 2026" — sama persis dengan `periodLabel` di `@/lib/period`. */
export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/** `YYYY-MM-DD` → {year, month}; null bila bukan tanggal yang bisa dibaca. */
function parseYearMonth(value: string | null | undefined): ClosedPeriodRef | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Pesan bila `date` jatuh di bulan yang sudah ditutup — cermin UI dari
 * `assertPeriodOpen`. Server tetap memeriksa ulang di dalam transaksi yang sama
 * dengan penulisan dokumen; ini hanya memberi tahu lebih awal.
 */
export function closedPeriodIssue(
  date: string | null | undefined,
  closed: readonly ClosedPeriodRef[],
  label = "Tanggal"
): string | null {
  const at = parseYearMonth(date);
  if (!at) return null;
  const hit = closed.some((p) => p.year === at.year && p.month === at.month);
  if (!hit) return null;
  return (
    `${label} jatuh di ${monthLabel(at.year, at.month)}, dan bulan itu sudah ditutup ` +
    `(tutup buku). Transaksi bertanggal di bulan tertutup tidak bisa disimpan agar ` +
    `laporan yang sudah terbit tetap konsisten. Pilih tanggal di bulan yang masih ` +
    `terbuka, atau minta Manager membuka kembali periode itu di menu Tutup Periode.`
  );
}

/** Satu isian angka yang mau diperiksa tanda negatifnya. */
export interface NumericEntry {
  field: string;
  value: number;
  /** Label khusus; standarnya diambil dari `FIELD_LABELS`. */
  label?: string;
}

/** Isian negatif pertama (urut sesuai daftar), atau null bila semuanya sah. */
export function negativeValueIssue(
  entries: readonly NumericEntry[]
): { field: string; message: string } | null {
  for (const entry of entries) {
    if (Number.isFinite(entry.value) && entry.value < 0) {
      const label = entry.label ?? fieldLabel(entry.field);
      return {
        field: entry.field,
        message: `${label} tidak boleh negatif — isi 0 atau lebih. Untuk mengurangi, catat transaksi di arah sebaliknya.`,
      };
    }
  }
  return null;
}

const qty = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);

/**
 * Kalimat "stok tidak cukup" — cermin UI dari `assertStockAvailable`
 * (`@/lib/delivery-orders`), memakai bentuk kekurangan yang sama persis.
 */
export function stockShortfallMessage(shortfalls: readonly StockShortfall[]): string | null {
  if (shortfalls.length === 0) return null;
  const detail = shortfalls
    .map((s) => `${s.itemName} (diminta ${qty(s.requested)} kg, tersedia ${qty(s.available)} kg)`)
    .join("; ");
  return (
    `Stok tidak cukup: ${detail}. Kurangi jumlahnya, atau catat barang masuk lebih ` +
    `dulu di menu Tambah / Kurangi Stok.`
  );
}

/**
 * Ambang "pengeluaran stok besar" yang layak dikonfirmasi dulu: setengah atau
 * lebih dari sisa stok barang itu. Bukan larangan — hanya jeda satu ketukan
 * sebelum sesuatu yang sulit dibatalkan (stok berkurang + jurnal HPP terbentuk).
 */
export const LARGE_STOCK_OUT_RATIO = 0.5;

/** Apakah pengeluaran ini cukup besar untuk minta konfirmasi? */
export function isLargeStockOut(requested: number, available: number): boolean {
  if (!(requested > 0) || !(available > 0)) return false;
  return requested >= available * LARGE_STOCK_OUT_RATIO;
}

/** Isi dialog konfirmasi untuk pengeluaran stok besar. */
export function largeStockOutMessage(
  itemName: string,
  requested: number,
  available: number,
  unit = "kg"
): string {
  const sisa = available - requested;
  return (
    `${itemName}: ${qty(requested)} ${unit} akan dikeluarkan dari stok ${qty(available)} ${unit}, ` +
    `menyisakan ${qty(sisa)} ${unit}. Stok berkurang dan jurnal HPP langsung terbentuk. Lanjutkan?`
  );
}
