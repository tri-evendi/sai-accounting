/**
 * Kontrak kolom tabel — SATU definisi kolom, DUA perender (issue #189).
 *
 * ── Kenapa modul ini ada ───────────────────────────────────────────────────
 * Migrasi AntD memindahkan tabel dari JSX deklaratif (`<TableRow><TableCell/>`)
 * ke `columns` + `dataSource`. Kalau perpindahan itu dijalankan apa adanya,
 * ia memaksa satu pilihan yang mahal: `columns` berisi fungsi `render`, fungsi
 * tidak serialisable, jadi setiap tabel harus hidup di modul client — termasuk
 * 46 tabel yang hari ini dirender di server tanpa satu baris JavaScript pun.
 *
 * Modul ini memisahkan dua hal yang kelihatannya satu:
 *
 *   • **BENTUK kolom** (judul, perataan, cara sebuah nilai ditampilkan) — data
 *     biasa, ditulis sekali di sini;
 *   • **TEMPAT kolom itu dirender** — server (`StaticTable`) atau client
 *     (`DataTable`).
 *
 * `render` tidak pernah MENYEBERANGI batas client: ia dipanggil di sisi tempat
 * perendernya hidup. Di `StaticTable` ia berjalan di server dan hasilnya jadi
 * HTML; di `DataTable` ia berjalan di client seperti kolom AntD biasa. Karena
 * itu satu berkas kolom bisa dipakai kedua-duanya, dan memindahkan sebuah tabel
 * dari statis ke interaktif kelak cukup dengan mengganti perendernya — bukan
 * menulis ulang kolomnya.
 *
 * ── Kenapa bentuknya meniru AntD, bukan API karangan sendiri ───────────────
 * `SaiColumn` sengaja dibuat sebagai HIMPUNAN BAGIAN dari `ColumnType` milik
 * AntD (`key`/`title`/`dataIndex`/`align`/`render`/`width`/`sorter`), supaya
 * `DataTable` bisa meneruskannya ke `<Table columns={…}>` tanpa penerjemahan,
 * dan supaya orang yang menulis tabel di fase C hanya perlu menghafal SATU
 * API — API AntD. Yang tidak ada di sini (filter dropdown, kolom bertingkat,
 * `onCell`) memang hanya masuk akal di tabel interaktif; kolomnya boleh
 * memakainya lewat `DataTable` secara langsung.
 *
 * Tipe AntD diimpor `import type` — dihapus saat kompilasi, jadi berkas ini
 * TETAP server-safe dan tidak menyeret AntD ke bundel mana pun. Itu yang
 * membuatnya boleh diimpor `StaticTable` (lihat `tests/rsc-boundary.test.ts`).
 *
 * ── Kenapa `moneyColumn` & `statusColumn` TIDAK ada di sini ────────────────
 * Keduanya merender komponen client (`Money`, `StatusBadge`), dan impor ES
 * bersifat statis: kalau mereka tinggal di modul ini, SETIAP halaman yang
 * hanya butuh `textColumn` ikut menyeret keduanya menyeberangi batas client.
 * Itu bukan teori — terukur pada Riwayat Stok, yang tidak punya satu pun kolom
 * uang maupun status: menaruhnya di sini menambah `money.tsx` dan
 * `status-badge.tsx` ke manifest kliennya (+2 modul, ±5 KB) untuk sesuatu yang
 * tidak pernah dirender.
 *
 * Karena itu aturannya: **pembantu yang membawa komponen client tinggal di
 * modulnya sendiri**, dan halaman hanya membayar yang benar-benar dipakainya.
 *
 *   • `@/components/ui/money-column`  — `moneyColumn`
 *   • `@/components/ui/status-column` — `statusColumn`
 */

import type { ColumnType } from "antd/es/table";

import { formatNumber } from "@/lib/utils";

/**
 * Kolom yang dimengerti KEDUA perender.
 *
 * `key` wajib (bukan opsional seperti di AntD): `StaticTable` memakainya
 * sebagai kunci React dan sebagai kunci baris total, dan kolom tanpa identitas
 * membuat baris total diam-diam meleset satu kolom.
 */
export interface SaiColumn<T> {
  key: string;
  title: React.ReactNode;
  /** Kunci baris yang nilainya diteruskan ke `render` sebagai argumen pertama. */
  dataIndex?: Extract<keyof T, string>;
  align?: "left" | "right" | "center";
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
  width?: number | string;
  /**
   * **Kolom ini menawarkan kendali urut.** Sejak issue #265 artinya SAMA di
   * kedua perender — itu syarat supaya sebuah tabel bisa berpindah perender
   * tanpa kolomnya ditulis ulang — hanya MEKANISMEnya yang berbeda:
   *
   *  • `DataTable` mengurutkan di peramban, memakai pembanding di bawah;
   *  • `StaticTable` merender judulnya sebagai TAUTAN `?sort=…&dir=…`, dan
   *    pengurutannya dikerjakan basis data lewat `orderBy` (`lib/table-sort.ts`).
   *    Karena itu `StaticTable` hanya membaca sifat "bisa diurutkan"-nya, bukan
   *    isi pembandingnya — dan ia MELEMPAR bila sebuah kolom menyatakan `sorter`
   *    tanpa konteks `sort`, alih-alih mengabaikannya diam-diam seperti dulu.
   *
   * Bawaannya MATI di semua pembantu kolom. Sampai #265 `moneyColumn`/
   * `qtyColumn` menyalakannya sendiri, dan karena `StaticTable` mengabaikannya,
   * 30 berkas membawa prop yang tidak melakukan apa pun. Menyalakan sortir
   * adalah keputusan HALAMAN — hanya halaman yang tahu apakah kolomnya punya
   * `orderBy` di basis data — jadi ia harus ditulis di halaman itu.
   */
  sorter?: boolean | ((a: T, b: T) => number);
  /**
   * Gaya SEL — bukan gaya header. Dipakai kolom laporan yang berwarna menurut
   * arah angkanya ("Masuk" hijau, "Keluar" merah); kedua perender menjaga agar
   * ia tidak bocor ke `<th>` (lihat `static-table.tsx` dan `data-table.tsx`).
   *
   * Sampai #203 bentuknya `className` berisi kelas Tailwind. Ia berganti
   * menjadi gaya sebaris bersama pencabutan Tailwind: kelas yang tidak dikenal
   * lembar gaya mana pun tidak akan pernah gagal — ia hanya berhenti mewarnai.
   */
  cellStyle?: React.CSSProperties;
}

export type SaiColumns<T> = SaiColumn<T>[];

/**
 * Penegasan bahwa `SaiColumn` benar-benar himpunan bagian `ColumnType` AntD.
 * Kalau AntD kelak mengubah salah satu nama prop, baris ini yang gagal lebih
 * dulu — di `tsc`, bukan di layar sebagai kolom yang diam-diam tak terbaca.
 */
type _AssignableToAntd<T> = SaiColumn<T> extends ColumnType<T> ? true : never;
export type SaiColumnIsAntdColumn = _AssignableToAntd<Record<string, unknown>>;

/* ------------------------------------------------------------------ */
/* Pembantu kolom — aturan tampilan hidup di sini, bukan di tiap halaman */
/* ------------------------------------------------------------------ */

export interface ColumnBase<T> {
  /** Bawaan `key`; sekaligus kunci nilai baris yang dibaca. */
  dataIndex: Extract<keyof T, string>;
  title: React.ReactNode;
  key?: string;
  sorter?: boolean | ((a: T, b: T) => number);
  width?: number | string;
}

/** Kolom teks biasa — rata kiri, tanpa perlakuan khusus. */
export function textColumn<T>({
  dataIndex,
  title,
  key,
  sorter,
  width,
}: ColumnBase<T>): SaiColumn<T> {
  return { key: key ?? dataIndex, dataIndex, title, align: "left", sorter, width };
}

/**
 * Membandingkan dua nilai sebagai ANGKA, bukan sebagai teks hasil format.
 * Kalau diurutkan sebagai teks, "Rp 9.000" mendarat di atas "Rp 10.000" dan
 * daftar "nilai terbesar" jadi salah — kesalahan yang sangat mudah lolos mata.
 */
export function numericSorter<T>(dataIndex: Extract<keyof T, string>) {
  return (a: T, b: T) => Number(a[dataIndex] ?? 0) - Number(b[dataIndex] ?? 0);
}

/** Nilai yang BELUM DIKETAHUI — dibedakan dari nol (MASTER.md). */
export function isEmptyValue(raw: unknown) {
  return raw === null || raw === undefined || raw === "";
}

/**
 * Kolom KUANTITAS — aturan uang dikurangi mata uangnya: rata kanan, tabular
 * nums, format id-ID. Dipakai laporan persediaan, yang angkanya jumlah barang
 * dan bukan nominal; memformatnya sebagai uang akan mencetak "Rp" di kolom
 * satuan barang.
 */
export function qtyColumn<T>({
  dataIndex,
  title,
  key,
  // Bawaan MATI sejak #265 — lihat catatan `sorter` di `SaiColumn`.
  sorter = false,
  width,
  cellStyle,
}: ColumnBase<T> & { cellStyle?: React.CSSProperties }): SaiColumn<T> {
  return {
    key: key ?? dataIndex,
    dataIndex,
    title,
    align: "right",
    width,
    cellStyle,
    sorter: sorter === true ? numericSorter<T>(dataIndex) : sorter,
    render: (raw) => (
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {isEmptyValue(raw) ? "—" : formatNumber(Number(raw))}
      </span>
    ),
  };
}
