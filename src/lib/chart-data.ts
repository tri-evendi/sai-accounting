/**
 * Seri data grafik — bagian MURNI dari grafik yang dulu tinggal di Beranda.
 *
 * Grafik dipindah ke halaman yang angkanya dijelaskan (stok → /inventory,
 * arus kas → /reports/cash-flow, kontrak → /contracts; lihat
 * `design-system/sai-accounting/pages/dashboard.md`). Begitu dipindah,
 * "ember bulanan 6 bulan terakhir" dipakai DUA halaman sekaligus, jadi
 * logikanya tinggal di sini — bukan disalin dua kali ke masing-masing
 * halaman, tempat keduanya pelan-pelan menyimpang.
 *
 * Modul ini murni (tanpa Prisma/React/next): baris masuk sebagai bentuk
 * seadanya, keluar sebagai array siap-render. Diuji di
 * `tests/chart-data.test.ts`.
 *
 * ── Kenapa urutan array itu PENTING ─────────────────────────────────────────
 * Warna donat di `components/shared/dashboard-charts.tsx` dipasangkan per
 * POSISI, bukan per teks label (pernah keliru: peta warna berkunci teks
 * Indonesia membuat semua irisan abu-abu begitu labelnya ikut bahasa
 * pengguna). Jadi pemanggil WAJIB menyusun datanya dengan urutan
 * aman/menipis/habis dan sah/menunggu/dibatalkan — jangan diurutkan ulang
 * "biar rapi".
 */

/** Nilai numerik apa adanya dari Prisma (Decimal), API (string), atau kode. */
export type Numeric = number | string | { toString(): string };

/** Satu bulan pada sumbu waktu: kunci pencocokan + label sumbu. */
export interface MonthBucket {
  /** `YYYY-MM` lokal — kunci pencocokan, tidak pernah tampil. */
  key: string;
  /** Nama bulan singkat untuk sumbu X. */
  label: string;
}

/** `YYYY-MM` lokal. Sengaja bukan `toISOString()`, yang menggeser ke UTC. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * `monthsBack` bulan terakhir, tertua dulu, termasuk bulan berjalan.
 *
 * Ember dibuat lebih dulu dan selalu lengkap, jadi bulan tanpa transaksi
 * tampil sebagai nol — bukan hilang dari sumbu dan membuat tren terlihat
 * rapat padahal ada jeda.
 */
export function monthlyBuckets(monthsBack: number, now: Date = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: monthKey(d),
      label: d.toLocaleDateString("id-ID", { month: "short" }),
    });
  }
  return buckets;
}

/** Berapa bulan ke belakang yang ditampilkan semua grafik tren. */
export const CHART_MONTHS_BACK = 6;

/** Batas bawah kueri untuk `CHART_MONTHS_BACK` bulan tren (awal bulan tertua). */
export function chartPeriodStart(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - (CHART_MONTHS_BACK - 1), 1);
}

export interface MonthlyActivityPoint {
  month: string;
  contracts: number;
  invoices: number;
}

/**
 * Jumlah kontrak & tagihan baru per bulan.
 *
 * `invoices` sengaja bisa kosong: pemanggil yang penggunanya tidak boleh
 * membaca tagihan TIDAK mengambil barisnya sama sekali (dan tidak merender
 * grafiknya), bukan mengambil lalu membuang hasilnya.
 */
export function monthlyActivitySeries(
  contracts: readonly { createdAt: Date }[],
  invoices: readonly { createdAt: Date }[],
  now: Date = new Date()
): MonthlyActivityPoint[] {
  const byMonth = new Map<string, MonthlyActivityPoint>();
  for (const bucket of monthlyBuckets(CHART_MONTHS_BACK, now)) {
    byMonth.set(bucket.key, { month: bucket.label, contracts: 0, invoices: 0 });
  }

  for (const c of contracts) {
    const entry = byMonth.get(monthKey(c.createdAt));
    if (entry) entry.contracts++;
  }
  for (const inv of invoices) {
    const entry = byMonth.get(monthKey(inv.createdAt));
    if (entry) entry.invoices++;
  }

  return [...byMonth.values()];
}

export interface CashFlowPoint {
  month: string;
  debit: number;
  credit: number;
}

export interface CashFlowSeries {
  currency: string;
  points: CashFlowPoint[];
}

/**
 * Uang masuk/keluar per bulan, DIPISAH per mata uang.
 *
 * Tidak ada konversi ke IDR di sini: menjumlahkan rupiah dengan dolar adalah
 * bug mata-uang-campur yang dijaga di seluruh aplikasi ini. Satu mata uang =
 * satu grafik, dan yang tidak punya transaksi tidak dapat grafik kosong.
 *
 * Urutan mata uang di-sort A→Z supaya susunan kartunya stabil antar render
 * (urutan baris dari DB tidak dijamin).
 */
export function cashFlowSeriesByCurrency(
  rows: readonly { date: Date; debit: Numeric; credit: Numeric; currency: string }[],
  now: Date = new Date()
): CashFlowSeries[] {
  const buckets = monthlyBuckets(CHART_MONTHS_BACK, now);
  const byCurrency = new Map<string, Map<string, CashFlowPoint>>();

  for (const row of rows) {
    let months = byCurrency.get(row.currency);
    if (!months) {
      months = new Map(buckets.map((b) => [b.key, { month: b.label, debit: 0, credit: 0 }]));
      byCurrency.set(row.currency, months);
    }
    const entry = months.get(monthKey(row.date));
    if (entry) {
      entry.debit += Number(row.debit);
      entry.credit += Number(row.credit);
    }
  }

  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, months]) => ({ currency, points: [...months.values()] }));
}

export interface StockLevelPoint {
  name: string;
  stock: number;
  unit: string | null;
}

/** Panjang nama barang sebelum dipendekkan agar muat di sumbu Y. */
const NAME_MAX = 22;

/** Sisa stok per barang untuk grafik batang (nama dipendekkan agar muat). */
export function stockLevelSeries(
  items: readonly { name: string; currentStock: number; unit: string | null }[]
): StockLevelPoint[] {
  return items.map((i) => ({
    name: i.name.length > NAME_MAX ? `${i.name.slice(0, NAME_MAX - 2)}…` : i.name,
    stock: i.currentStock,
    unit: i.unit,
  }));
}

/**
 * Tinggi kartu grafik stok. `StockLevelChart` memotong di 8 batang teratas,
 * jadi kartunya ikut tumbuh sampai 8 baris lalu berhenti — kalau tidak,
 * kartu dengan 2 barang menyisakan ruang kosong setinggi 8 barang.
 */
export function stockLevelChartHeight(data: readonly StockLevelPoint[]): number {
  const bars = Math.min(8, data.filter((d) => d.stock > 0).length);
  return Math.max(300, bars * 36 + 80);
}
