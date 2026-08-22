/**
 * INTI IMPOR BERSAMA — pembacaan baris & pengumpulan galat (issue #381).
 *
 * Yang dibagikan di sini persis yang SAMA untuk setiap jenis berkas, dan tidak
 * lebih: melewati baris judul, melewati baris kosong, menomori baris seperti
 * yang dilihat orang di Excel, membatasi jumlah baris, dan mengumpulkan galat
 * per baris. Aturan MAKNA setiap kolom tetap tinggal di modul jenisnya.
 *
 * ══ NOMOR BARIS ADALAH NOMOR YANG DILIHAT ORANG ════════════════════════════
 * Galat yang menyebut "baris 12" harus menunjuk baris 12 di Excel — bukan
 * indeks 11 di array, dan bukan baris ke-12 setelah baris judul dibuang. Ini
 * terdengar sepele sampai seseorang memperbaiki baris yang salah, mengunggah
 * ulang, dan mendapat galat yang sama.
 *
 * MURNI: tanpa Prisma, tanpa ExcelJS, tanpa I/O.
 */

import { MAX_IMPORT_ROWS, mapHeaderRow, type ColumnSpec } from "@/lib/import/spec";

export interface RowError {
  /** Nomor baris SEPERTI DI EXCEL (1-based, baris judul = 1). */
  row: number;
  message: string;
}

/** Satu baris data, kolomnya sudah dipetakan menurut judul. */
export interface ImportRow {
  row: number;
  /** kunci kolom → isi selnya, sudah di-trim. Kolom yang tak ada = "". */
  values: Record<string, string>;
}

export interface ReadRowsResult {
  rows: ImportRow[];
  errors: RowError[];
  /**
   * Judul kolom WAJIB yang tidak ditemukan. Terisi = berkasnya salah, bukan
   * barisnya — dan `rows` sengaja dipulangkan KOSONG supaya pemanggil tidak
   * bisa keliru memproses sebagian.
   */
  missingColumns: string[];
  /** `true` bila berkasnya lebih panjang dari batas dan sisanya tidak dibaca. */
  truncated: boolean;
}

const cell = (v: unknown): string => (v == null ? "" : String(v).trim());

export interface ReadRowsOptions {
  /**
   * Nomor baris ASLI di Excel untuk tiap baris data, sejajar `sheet.slice(1)`.
   *
   * Ada sejak berkas ekspor Accurate ikut diterima (integrasi Accurate). Ekspor
   * itu adalah HALAMAN CETAK: lima blok kepala/kaki halaman dibuang dan sisanya
   * dijahit jadi satu tabel sebelum sampai ke sini, jadi baris ke-3 tabel bisa
   * saja baris ke-41 di berkasnya. Tanpa daftar ini galat akan menyebut nomor
   * baris hasil penjahitan — dan janji "nomor baris adalah nomor yang dilihat
   * orang" (lihat kepala berkas ini) berhenti berlaku persis pada berkas yang
   * paling sulit ditelusuri orang.
   *
   * Kosong = berkas tabel biasa, nomornya `indeks + 2` seperti sebelumnya.
   */
  rowNumbers?: readonly number[];
}

/**
 * Baca matriks sel menjadi baris ber-kunci.
 *
 * Baris pertama SELALU dianggap judul (konvensi yang sudah dipakai impor daftar
 * akun, dan yang dipakai setiap templat yang kita terbitkan).
 */
export function readImportRows(
  sheet: unknown[][],
  columns: readonly ColumnSpec[],
  options: ReadRowsOptions = {}
): ReadRowsResult {
  const headerRow = Array.isArray(sheet[0]) ? sheet[0] : [];
  const { index, missing } = mapHeaderRow(headerRow, columns);

  if (missing.length > 0) {
    return { rows: [], errors: [], missingColumns: missing, truncated: false };
  }

  const dataRows = sheet.slice(1);
  const truncated = dataRows.length > MAX_IMPORT_ROWS;
  const rows: ImportRow[] = [];

  dataRows.slice(0, MAX_IMPORT_ROWS).forEach((raw, i) => {
    const cells = Array.isArray(raw) ? raw : [];
    const values: Record<string, string> = {};
    let anyValue = false;

    for (const column of columns) {
      const at = index[column.key];
      const value = at === undefined ? "" : cell(cells[at]);
      values[column.key] = value;
      if (value !== "") anyValue = true;
    }

    /* Baris yang seluruh kolom TERPETAKANNYA kosong dilewati diam-diam: berkas
       spreadsheet hampir selalu membawa ratusan baris kosong di bawah datanya,
       dan menjadikan masing-masing sebuah galat mengubah laporan validasi jadi
       sesuatu yang tak terbaca. */
    if (!anyValue) return;

    rows.push({ row: options.rowNumbers?.[i] ?? i + 2, values });
  });

  return { rows, errors: [], missingColumns: [], truncated };
}

/**
 * Pengumpul galat satu baris — dipakai modul per-jenis saat memvalidasi.
 *
 * Bentuknya sengaja begini: seluruh masalah di SATU baris dikumpulkan lalu
 * dilaporkan sekaligus, bukan berhenti di yang pertama. Orang yang memperbaiki
 * berkas 300 baris tidak boleh menemukan kesalahannya satu per satu, satu
 * unggahan per kesalahan.
 */
export class RowIssues {
  private readonly messages: string[] = [];

  constructor(readonly row: number) {}

  add(message: string): void {
    this.messages.push(message);
  }

  /** `true` bila baris ini tidak boleh dipakai. */
  get failed(): boolean {
    return this.messages.length > 0;
  }

  /** Galat gabungan baris ini, atau `null` bila bersih. */
  toError(): RowError | null {
    return this.messages.length === 0
      ? null
      : { row: this.row, message: this.messages.join("; ") };
  }
}

/**
 * Penjaga nilai KEMBAR di dalam satu berkas (kode akun, kode barang, nomor
 * faktur). Baris kedua dan seterusnya ditolak, dan pesannya menyebut baris
 * PERTAMA-nya — tanpa itu orang harus mencari sendiri kembarannya di antara
 * ratusan baris.
 */
export class DuplicateGuard {
  private readonly seen = new Map<string, number>();
  readonly duplicates: string[] = [];

  constructor(private readonly label: string) {}

  /** `true` bila nilai ini sudah pernah dipakai baris sebelumnya. */
  check(value: string, row: number, issues: RowIssues): boolean {
    const first = this.seen.get(value);
    if (first !== undefined) {
      if (!this.duplicates.includes(value)) this.duplicates.push(value);
      issues.add(`${this.label} "${value}" ganda di dalam berkas (baris ${first})`);
      return true;
    }
    this.seen.set(value, row);
    return false;
  }
}
