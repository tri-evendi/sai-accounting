/**
 * Impor Daftar Akun (Akun Perkiraan) dari Excel — inti murni (issue: impor COA).
 *
 * Modul ini TIDAK menyentuh DB dan TIDAK membaca file: ia menerima baris mentah
 * (array of array, hasil parse `@/lib/xlsx-read`) dan mengubahnya menjadi baris
 * akun tervalidasi atau daftar galat per-baris. Dipisah begini supaya seluruh
 * aturan impor bisa diuji tanpa MySQL maupun ExcelJS (lihat tests/coa-import).
 *
 * Format mengikuti konvensi Accurate yang biasa dipakai staff:
 *   - Baris pertama = judul kolom, TIDAK diimpor.
 *   - Kolom: Kode | Nama | Tipe | Mata Uang (opsional, default IDR).
 *   - Kolom "Tipe" memakai KODE Accurate (BANK, AREC, …) yang dipetakan ke tipe
 *     internal app. Saldo normal TIDAK diminta — ia turunan dari tipe.
 */
import { normalBalanceFor, type NormalBalance } from "@/lib/accounting";
import {
  readImportRows,
  DuplicateGuard,
  RowIssues,
  type ReadRowsOptions,
  type RowError,
} from "@/lib/import/rows";
import { readMapped, requiredText } from "@/lib/import/fields";
import { MAX_IMPORT_ROWS, type ColumnSpec } from "@/lib/import/spec";

/**
 * Peta kode tipe Accurate → tipe internal app (`ACCOUNT_TYPES.value`).
 * Persis daftar yang dipakai template impor Accurate; huruf besar semua.
 */
export const ACCURATE_TYPE_MAP: Record<string, string> = {
  BANK: "cash_bank", // Kas/Bank
  AREC: "account_receivable", // Piutang Usaha
  INTR: "inventory", // Persediaan
  OCAS: "other_current_asset", // Aset lancar lainnya
  FASS: "fixed_asset", // Aset Tetap
  DEPR: "accumulated_depreciation", // Akumulasi Depresiasi
  OASS: "other_asset", // Aset lainnya
  APAY: "account_payable", // Utang Usaha
  OCLY: "other_current_liability", // Utang lancar lain-lain
  LTLY: "long_term_liability", // Utang jangka panjang
  EQTY: "equity", // Ekuitas
  REVE: "revenue", // Pendapatan
  COGS: "cogs", // Beban Pokok Penjualan
  EXPS: "expense", // Beban
  OEXP: "other_expense", // Beban lain-lain
  OINC: "other_income", // Pendapatan lain-lain
};

/** Legenda kode tipe untuk ditampilkan di UI & template. */
export const ACCURATE_TYPE_LEGEND: { code: string; label: string }[] = [
  { code: "BANK", label: "Kas/Bank" },
  { code: "AREC", label: "Piutang Usaha" },
  { code: "INTR", label: "Persediaan" },
  { code: "OCAS", label: "Aset lancar lainnya" },
  { code: "FASS", label: "Aset Tetap" },
  { code: "DEPR", label: "Akumulasi Depresiasi" },
  { code: "OASS", label: "Aset lainnya" },
  { code: "APAY", label: "Utang Usaha" },
  { code: "OCLY", label: "Utang lancar lain-lain" },
  { code: "LTLY", label: "Utang jangka panjang" },
  { code: "EQTY", label: "Ekuitas" },
  { code: "REVE", label: "Pendapatan" },
  { code: "COGS", label: "Beban Pokok Penjualan" },
  { code: "EXPS", label: "Beban" },
  { code: "OEXP", label: "Beban lain-lain" },
  { code: "OINC", label: "Pendapatan lain-lain" },
];

/**
 * Kode tipe DAN nama tipe yang ikut diterima — kunci huruf besar semua.
 *
 * ══ KENAPA NAMANYA IKUT, BUKAN HANYA KODENYA ═══════════════════════════════
 * `ACCURATE_TYPE_MAP` memuat kode empat huruf (BANK, AREC, …) yang dipakai
 * TEMPLAT impor Accurate. Tetapi berkas yang keluar dari tombol Ekspor di
 * layar Akun Perkiraan bukan templat impor melainkan LAPORAN, dan laporan
 * mencetak tipe akun sebagai kata yang dibaca manusia — "Kas/Bank", bukan
 * "BANK".
 *
 * Tanpa kolom ini, berkas ekspor COA Accurate ditolak baris demi baris dengan
 * `Tipe akun "Kas/Bank" tidak dikenal` — penolakan yang menyalahkan orangnya
 * atas berkas yang sebenarnya sudah benar. Karena legendanya memang sudah kita
 * miliki (`ACCURATE_TYPE_LEGEND`, dan ia yang dicetak di templat kita sendiri),
 * menerimanya tidak menambah satu pun sumber kebenaran baru.
 */
export const ACCURATE_TYPE_LOOKUP: Record<string, string> = {
  ...ACCURATE_TYPE_MAP,
  ...Object.fromEntries(
    ACCURATE_TYPE_LEGEND.map(({ code, label }) => [label.toUpperCase(), ACCURATE_TYPE_MAP[code]])
  ),
};

/** Mata uang yang dikenal app. Kode lain ditolak agar tak memicu galat format. */
const KNOWN_CURRENCIES = new Set(["IDR", "USD", "CNY"]);

export { MAX_IMPORT_ROWS };

/**
 * Kolom berkas impor. Sejak #381 dipetakan menurut JUDUL, bukan posisi.
 *
 * Perbedaannya bukan kerapian: pembacaan menurut posisi benar selama berkasnya
 * lahir dari templat kita sendiri, dan salah pada berkas pertama yang datang
 * dari aplikasi lain — di mana kolomnya berurutan lain atau ada kolom tambahan
 * di depan. Yang terjadi saat itu bukan penolakan melainkan IMPOR YANG
 * BERHASIL DENGAN NILAI TERTUKAR: nama akun masuk ke kolom kode, tanpa satu
 * pun galat.
 */
export const COA_COLUMNS: readonly ColumnSpec[] = [
  {
    key: "code",
    header: "Kode",
    aliases: ["Kode Akun", "Account Code", "No Akun", "Kode Perkiraan", "No. Perkiraan"],
    required: true,
    example: "1101",
    hint: "Maksimal 20 karakter, unik.",
  },
  {
    key: "name",
    header: "Nama",
    aliases: ["Nama Akun", "Account Name", "Keterangan", "Nama Perkiraan"],
    required: true,
    example: "Kas",
    hint: "Maksimal 150 karakter.",
  },
  {
    key: "type",
    header: "Tipe",
    aliases: ["Tipe Akun", "Account Type", "Jenis", "Tipe Perkiraan"],
    required: true,
    example: "BANK",
    hint: "Kode tipe Accurate (BANK) atau namanya (Kas/Bank) — lihat legenda.",
  },
  {
    key: "currency",
    header: "Mata Uang",
    aliases: ["Currency", "Valuta", "Mata Uang Utama"],
    example: "IDR",
    hint: "Opsional; kosong berarti IDR. Pilihan: IDR, USD, CNY.",
  },
];

export interface ParsedAccount {
  code: string;
  name: string;
  type: string;
  normalBalance: NormalBalance;
  currency: string;
}

export type { RowError };

export interface CoaImportResult {
  accounts: ParsedAccount[];
  errors: RowError[];
  /** Baris duplikat KODE di dalam file yang sama (dibuang, dicatat). */
  duplicateCodesInFile: string[];
}

/**
 * Validasi & petakan baris mentah Excel menjadi akun.
 *
 * Baris pertama dianggap judul dan dilewati (konvensi Accurate). Baris kosong
 * dilewati diam-diam. Setiap baris data wajib punya Kode, Nama, dan Tipe yang
 * dikenal; mata uang opsional (default IDR). Kode ganda DI DALAM file ditolak
 * di sini; bentrok dengan kode yang SUDAH ADA di DB diperiksa saat menulis.
 */
export function parseCoaRows(
  rows: unknown[][],
  options: ReadRowsOptions = {}
): CoaImportResult {
  const accounts: ParsedAccount[] = [];
  const errors: RowError[] = [];
  const duplikat = new DuplicateGuard("Kode");

  const { rows: dataRows, missingColumns } = readImportRows(rows, COA_COLUMNS, options);

  /* Kolom wajib yang tidak ditemukan adalah kesalahan BERKAS, bukan baris —
     dan melaporkannya sebagai galat pada baris 1 membuat orang mencari-cari di
     dalam datanya, padahal yang salah judulnya. */
  if (missingColumns.length > 0) {
    return {
      accounts: [],
      errors: [
        {
          row: 1,
          message:
            `Kolom wajib tidak ditemukan di baris judul: ${missingColumns.join(", ")}. ` +
            "Unduh templat lalu salin datanya ke sana.",
        },
      ],
      duplicateCodesInFile: [],
    };
  }

  for (const { row, values } of dataRows) {
    const issues = new RowIssues(row);

    const code = requiredText(values.code, "Kode akun", 20, issues);
    const name = requiredText(values.name, "Nama akun", 150, issues);
    const type = readMapped(values.type, "Tipe akun", ACCURATE_TYPE_LOOKUP, issues, {
      required: true,
    });

    const currencyRaw = values.currency.toUpperCase();
    const currency = currencyRaw || "IDR";
    if (currencyRaw && !KNOWN_CURRENCIES.has(currencyRaw)) {
      issues.add(`Mata uang "${currencyRaw}" tidak didukung (pakai IDR/USD/CNY)`);
    }

    // Kembar diperiksa SESUDAH bentuknya sah: melaporkan "kode ganda" untuk
    // dua baris yang kodenya sama-sama kosong tidak menolong siapa pun.
    if (!issues.failed) duplikat.check(code, row, issues);

    const error = issues.toError();
    if (error) {
      errors.push(error);
      continue;
    }

    accounts.push({
      code,
      name,
      type: type!,
      normalBalance: normalBalanceFor(type!),
      currency,
    });
  }

  return { accounts, errors, duplicateCodesInFile: duplikat.duplicates };
}
