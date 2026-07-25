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

/** Mata uang yang dikenal app. Kode lain ditolak agar tak memicu galat format. */
const KNOWN_CURRENCIES = new Set(["IDR", "USD", "CNY"]);

/** Accurate hanya memproses 10.000 baris pertama; kita samakan agar jujur. */
export const MAX_IMPORT_ROWS = 10_000;

export interface ParsedAccount {
  code: string;
  name: string;
  type: string;
  normalBalance: NormalBalance;
  currency: string;
}

export interface RowError {
  /** Nomor baris di file (1-based, termasuk baris judul). */
  row: number;
  message: string;
}

export interface CoaImportResult {
  accounts: ParsedAccount[];
  errors: RowError[];
  /** Baris duplikat KODE di dalam file yang sama (dibuang, dicatat). */
  duplicateCodesInFile: string[];
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * Validasi & petakan baris mentah Excel menjadi akun.
 *
 * Baris pertama dianggap judul dan dilewati (konvensi Accurate). Baris kosong
 * dilewati diam-diam. Setiap baris data wajib punya Kode, Nama, dan Tipe yang
 * dikenal; mata uang opsional (default IDR). Kode ganda DI DALAM file ditolak
 * di sini; bentrok dengan kode yang SUDAH ADA di DB diperiksa saat menulis.
 */
export function parseCoaRows(rows: unknown[][]): CoaImportResult {
  const accounts: ParsedAccount[] = [];
  const errors: RowError[] = [];
  const seenCodes = new Map<string, number>();
  const duplicateCodesInFile: string[] = [];

  // Lewati baris judul (baris 1). Batasi ke MAX_IMPORT_ROWS baris data.
  const dataRows = rows.slice(1, 1 + MAX_IMPORT_ROWS);

  dataRows.forEach((raw, i) => {
    const rowNo = i + 2; // +1 untuk judul, +1 untuk 1-based
    const cells = Array.isArray(raw) ? raw : [];
    const code = str(cells[0]);
    const name = str(cells[1]);
    const typeCode = str(cells[2]).toUpperCase();
    const currencyRaw = str(cells[3]).toUpperCase();

    // Baris benar-benar kosong: lewati tanpa galat.
    if (!code && !name && !typeCode && !currencyRaw) return;

    const rowErrors: string[] = [];
    if (!code) rowErrors.push("Kode akun kosong");
    if (code.length > 20) rowErrors.push("Kode akun lebih dari 20 karakter");
    if (!name) rowErrors.push("Nama akun kosong");
    if (name.length > 150) rowErrors.push("Nama akun lebih dari 150 karakter");

    const type = ACCURATE_TYPE_MAP[typeCode];
    if (!typeCode) rowErrors.push("Tipe akun kosong");
    else if (!type) rowErrors.push(`Kode tipe "${typeCode}" tidak dikenal`);

    const currency = currencyRaw || "IDR";
    if (currencyRaw && !KNOWN_CURRENCIES.has(currencyRaw)) {
      rowErrors.push(`Mata uang "${currencyRaw}" tidak didukung (pakai IDR/USD/CNY)`);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNo, message: rowErrors.join("; ") });
      return;
    }

    // Duplikat kode di dalam file: catat sekali, buang baris kedua dst.
    if (seenCodes.has(code)) {
      if (!duplicateCodesInFile.includes(code)) duplicateCodesInFile.push(code);
      errors.push({ row: rowNo, message: `Kode "${code}" ganda di dalam file (baris ${seenCodes.get(code)})` });
      return;
    }
    seenCodes.set(code, rowNo);

    accounts.push({
      code,
      name,
      type,
      normalBalance: normalBalanceFor(type),
      currency,
    });
  });

  return { accounts, errors, duplicateCodesInFile };
}
