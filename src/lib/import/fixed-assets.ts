/**
 * IMPOR ASET TETAP (issue #381 tahap 4).
 *
 * ══ YANG MEMBEDAKANNYA DARI MASTER DATA ════════════════════════════════════
 * Pelanggan dan barang cukup dipindahkan namanya. Aset tetap membawa SEJARAH:
 * ia sudah disusutkan bertahun-tahun di sistem lama, dan yang harus ikut pindah
 * bukan hanya harga perolehannya melainkan berapa yang SUDAH disusutkan dan
 * SAMPAI BULAN APA.
 *
 * Tanpa keduanya, jadwal penyusutannya MENGULANG dari nol: mesin akan
 * menyusutkan aset berumur delapan tahun seolah baru dibeli, membebani laba
 * bertahun-tahun lagi atas nilai yang sudah habis dibebankan. Itu bukan selisih
 * kecil — untuk aset yang hampir lunas, ia menggandakan seluruh bebannya.
 *
 * Karena itu berkas ini meminta dua kolom yang tidak ada di impor lain:
 * **Akumulasi Penyusutan** dan **Terakhir Disusutkan**.
 *
 * ══ KENAPA TIDAK MEMBUAT RIWAYAT PENYUSUTANNYA ═════════════════════════════
 * Godaan yang wajar: buat saja baris `fixed_asset_depreciation` untuk setiap
 * bulan yang sudah lewat, supaya riwayatnya lengkap. Itu SALAH, dan salahnya
 * dalam: setiap baris riwayat di aplikasi ini berpasangan dengan JURNAL yang
 * benar-benar diposting. Membuat riwayat tanpa jurnal berarti membuat laporan
 * penyusutan yang tidak bisa ditelusuri ke buku besar mana pun — dan jurnalnya
 * memang tidak boleh ada di sini, sebab beban itu sudah dibebankan di pembukuan
 * lama.
 *
 * Yang dibawa karena itu hanya KEADAANNYA (`accumulatedDepreciation` +
 * `lastDepreciation*`), dan `depreciateAsset` menolak periode yang sudah
 * tercakup keadaan itu.
 *
 * MURNI: tanpa Prisma, tanpa ExcelJS.
 */

import { DuplicateGuard, RowIssues, readImportRows, type RowError } from "@/lib/import/rows";
import { optionalText, readAmount, readDate, requiredText } from "@/lib/import/fields";
import type { ColumnSpec } from "@/lib/import/spec";

export const FIXED_ASSET_COLUMNS: readonly ColumnSpec[] = [
  {
    key: "assetNo",
    header: "Kode Aset",
    aliases: ["No Aset", "Asset No", "Kode"],
    required: true,
    example: "AT-001",
    hint: "Unik. Boleh memakai kode dari sistem lama Anda.",
  },
  {
    key: "name",
    header: "Nama",
    aliases: ["Nama Aset", "Asset Name", "Deskripsi"],
    required: true,
    example: "Truk Colt Diesel",
    hint: "Maksimal 150 karakter.",
  },
  {
    key: "category",
    header: "Kategori",
    aliases: ["Category", "Kelompok"],
    required: true,
    example: "Kendaraan",
    hint: "Harus PERSIS sama dengan kategori yang sudah ada. Kategori membawa akun & metodenya.",
  },
  {
    key: "acquisitionDate",
    header: "Tanggal Perolehan",
    aliases: ["Tgl Perolehan", "Acquisition Date", "Tanggal Beli"],
    required: true,
    example: "2019-04-15",
    hint: "Tanggal aslinya, bukan tanggal Anda pindah aplikasi.",
  },
  {
    key: "cost",
    header: "Harga Perolehan",
    aliases: ["Acquisition Cost", "Nilai Perolehan", "Harga Beli"],
    required: true,
    example: "350.000.000",
    hint: "Harga perolehan penuh, sebelum penyusutan.",
  },
  {
    key: "residual",
    header: "Nilai Residu",
    aliases: ["Residual Value", "Nilai Sisa"],
    example: "0",
    hint: "Opsional; kosong berarti 0.",
  },
  {
    key: "usefulLifeMonths",
    header: "Umur (bulan)",
    aliases: ["Useful Life", "Umur Manfaat", "Masa Manfaat"],
    example: "96",
    hint: "Opsional — kosong memakai bawaan kategorinya. 8 tahun = 96.",
  },
  {
    key: "accumulated",
    header: "Akumulasi Penyusutan",
    aliases: ["Accumulated Depreciation", "Akm. Penyusutan", "Akumulasi"],
    required: true,
    example: "175.000.000",
    hint: "Yang SUDAH disusutkan di sistem lama. Isi 0 untuk aset yang belum pernah disusutkan.",
  },
  {
    key: "lastDepreciated",
    header: "Terakhir Disusutkan",
    aliases: ["Last Depreciated", "Penyusutan Terakhir", "Sampai Bulan"],
    example: "2025-12",
    hint: "Bulan TERAKHIR yang sudah dibebankan di sistem lama (YYYY-MM). Kosong bila belum pernah.",
  },
  {
    key: "location",
    header: "Lokasi",
    aliases: ["Location", "Penempatan"],
    example: "Gudang Pusat",
    hint: "Opsional.",
  },
];

export interface ParsedFixedAsset {
  assetNo: string;
  name: string;
  /** Nama kategori APA ADANYA — dicocokkan ke id di route. */
  category: string;
  acquisitionDate: Date;
  cost: number;
  residual: number;
  /** `null` → pakai bawaan kategorinya. */
  usefulLifeMonths: number | null;
  accumulated: number;
  lastDepreciationYear: number | null;
  lastDepreciationMonth: number | null;
  location: string | null;
}

export interface FixedAssetImportResult {
  rows: ParsedFixedAsset[];
  errors: RowError[];
  duplicateNumbersInFile: string[];
  truncated: boolean;
}

/** `YYYY-MM` → {tahun, bulan}. Menerima juga `YYYY-MM-DD` (harinya diabaikan). */
function parsePeriod(raw: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function parseFixedAssetRows(sheet: unknown[][]): FixedAssetImportResult {
  const { rows: dataRows, missingColumns, truncated } = readImportRows(
    sheet,
    FIXED_ASSET_COLUMNS
  );
  if (missingColumns.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message:
            `Kolom wajib tidak ditemukan di baris judul: ${missingColumns.join(", ")}. ` +
            "Unduh templat lalu salin datanya ke sana.",
        },
      ],
      duplicateNumbersInFile: [],
      truncated: false,
    };
  }

  const rows: ParsedFixedAsset[] = [];
  const errors: RowError[] = [];
  const duplikat = new DuplicateGuard("Kode Aset");

  for (const { row, values } of dataRows) {
    const issues = new RowIssues(row);

    const assetNo = requiredText(values.assetNo, "Kode aset", 50, issues);
    const name = requiredText(values.name, "Nama aset", 150, issues);
    const category = requiredText(values.category, "Kategori", 100, issues);
    const acquisitionDate = readDate(values.acquisitionDate, "Tanggal perolehan", issues, {
      required: true,
    });
    const cost = readAmount(values.cost, "Harga perolehan", issues, {
      required: true,
      positive: true,
    });
    const residual = readAmount(values.residual, "Nilai residu", issues) ?? 0;
    const accumulated =
      readAmount(values.accumulated, "Akumulasi penyusutan", issues, { required: true }) ?? 0;

    let usefulLifeMonths: number | null = null;
    if (values.usefulLifeMonths) {
      const umur = readAmount(values.usefulLifeMonths, "Umur", issues, { positive: true });
      if (umur !== null && !Number.isInteger(umur)) {
        issues.add("Umur harus bilangan bulat dalam BULAN (8 tahun = 96)");
      } else {
        usefulLifeMonths = umur;
      }
    }

    if (residual < 0) issues.add("Nilai residu tidak boleh negatif");
    if (accumulated < 0) issues.add("Akumulasi penyusutan tidak boleh negatif");

    /*
     * Akumulasi tidak boleh melebihi yang bisa disusutkan. Kalau ia lebih besar,
     * yang tersisa untuk disusutkan menjadi NEGATIF — dan sebuah aset yang
     * bebannya negatif akan menambah laba setiap bulan, diam-diam, sampai
     * seseorang bertanya kenapa penyusutannya berwarna hijau.
     */
    if (cost !== null && accumulated > 0) {
      const dasar = cost - residual;
      if (accumulated > dasar) {
        issues.add(
          `Akumulasi penyusutan (${accumulated}) melebihi yang bisa disusutkan ` +
            `(harga perolehan − residu = ${dasar})`
        );
      }
    }

    let lastYear: number | null = null;
    let lastMonth: number | null = null;
    if (values.lastDepreciated) {
      const periode = parsePeriod(values.lastDepreciated);
      if (!periode) {
        issues.add(
          `Terakhir disusutkan "${values.lastDepreciated}" bukan bulan yang dikenali (pakai 2025-12)`
        );
      } else {
        lastYear = periode.year;
        lastMonth = periode.month;
      }
    }

    /*
     * Akumulasi > 0 TANPA bulan terakhir adalah keadaan yang tidak bisa
     * ditindaklanjuti mesin: ia tahu berapa yang sudah dibebankan tapi tidak
     * tahu sampai kapan, jadi bulan berikutnya yang dijalankan bisa membebani
     * ulang bulan yang sudah dibebankan di sistem lama.
     */
    if (accumulated > 0 && lastYear === null) {
      issues.add(
        "Akumulasi penyusutan terisi tetapi 'Terakhir Disusutkan' kosong — " +
          "isi bulan terakhir yang sudah dibebankan di sistem lama"
      );
    }

    // Bulan terakhir sebelum tanggal perolehan berarti salah satu kolomnya keliru.
    if (acquisitionDate && lastYear !== null && lastMonth !== null) {
      const acqPeriod =
        acquisitionDate.getUTCFullYear() * 12 + (acquisitionDate.getUTCMonth() + 1);
      if (lastYear * 12 + lastMonth < acqPeriod) {
        issues.add("'Terakhir Disusutkan' lebih awal daripada tanggal perolehan");
      }
    }

    if (!issues.failed) duplikat.check(assetNo.toLowerCase(), row, issues);

    const error = issues.toError();
    if (error) {
      errors.push(error);
      continue;
    }

    rows.push({
      assetNo,
      name,
      category,
      acquisitionDate: acquisitionDate!,
      cost: cost!,
      residual,
      usefulLifeMonths,
      accumulated,
      lastDepreciationYear: lastYear,
      lastDepreciationMonth: lastMonth,
      location: optionalText(values.location, "Lokasi", 150, issues),
    });
  }

  return { rows, errors, duplicateNumbersInFile: duplikat.duplicates, truncated };
}
