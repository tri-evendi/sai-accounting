/**
 * Pembaca BERKAS UNGGAHAN untuk impor — satu pintu (integrasi Accurate).
 *
 * Sebelum ini setiap route impor memanggil `readFirstSheetRows` langsung, dan
 * itu benar selama setiap berkas yang masuk adalah tabel. Sejak ekspor laporan
 * Accurate ikut diterima, ada dua bentuk berkas yang harus dikenali — dan
 * membiarkan tiap route memutuskannya sendiri berarti enam tempat yang akan
 * menyimpang, persis kelas masalah yang `@/lib/import/spec` sudah selesaikan
 * untuk pemetaan kolom.
 *
 * Yang dilakukan: baca sheet pertama; bila ia laporan cetak Accurate, ratakan
 * dulu (`flattenAccurateReport`) dan bawa serta nomor baris ASLINYA supaya
 * galat tetap menunjuk baris yang dilihat orang di berkasnya. Selain itu,
 * kembalikan apa adanya — berkas dari templat kita sendiri tidak berubah
 * jalurnya sama sekali.
 *
 * SERVER-ONLY: ExcelJS adalah pustaka Node.
 */
import { readFirstSheetRows } from "@/lib/xlsx-read";
import {
  flattenAccurateReport,
  isAccurateReport,
  type AccurateRepair,
  type AccurateReportMeta,
} from "@/lib/accurate/report-sheet";
import type { ReadRowsOptions } from "@/lib/import/rows";

export interface ImportSheet {
  /** Matriks bergaya tabel: indeks 0 baris judul, sisanya data. */
  rows: unknown[][];
  /** Diteruskan apa adanya ke `readImportRows`. */
  options: ReadRowsOptions;
  /** Terisi hanya bila berkasnya ekspor laporan Accurate. */
  accurate: { meta: AccurateReportMeta; repairs: AccurateRepair[] } | null;
}

export async function readImportSheet(buffer: Buffer): Promise<ImportSheet> {
  const sheet = await readFirstSheetRows(buffer);
  if (!isAccurateReport(sheet)) return { rows: sheet, options: {}, accurate: null };

  const flat = flattenAccurateReport(sheet);
  /* Penanda Accurate ada tapi baris judulnya tidak ketemu: perlakukan sebagai
     tabel biasa dan biarkan pemetaan kolom yang menolaknya. Galat "kolom wajib
     tidak ditemukan" jauh lebih bisa ditindaklanjuti daripada galat dari sini
     yang menyebut bentuk halaman cetak. */
  if (!flat) return { rows: sheet, options: {}, accurate: null };

  return {
    rows: flat.rows,
    options: { rowNumbers: flat.rowNumbers },
    accurate: { meta: flat.meta, repairs: flat.repairs },
  };
}
