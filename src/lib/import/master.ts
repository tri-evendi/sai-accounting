/**
 * IMPOR MASTER DATA — pelanggan, pemasok, barang (issue #381, tahap 2).
 *
 * ══ KENAPA KETIGANYA DI SATU BERKAS ═════════════════════════════════════════
 * Bukan karena mereka mirip di basis data — mereka tidak. Melainkan karena
 * ketiganya menjawab satu pertanyaan yang sama bagi penggunanya: *"bagaimana
 * saya memasukkan daftar yang sudah saya punya di Excel"*. Aturan yang berlaku
 * bagi ketiganya — mana yang wajib, apa yang dianggap kembar, bagaimana baris
 * yang salah dilaporkan — harus dijawab dengan cara yang sama persis, dan tiga
 * berkas terpisah adalah tiga tempat untuk menjawabnya berbeda.
 *
 * ══ YANG SENGAJA TIDAK ADA DI SINI ══════════════════════════════════════════
 * Tidak ada Prisma dan tidak ada ExcelJS: modul ini menerima matriks sel dan
 * memulangkan baris tervalidasi atau galat per-baris — aturan #381 butir 1,
 * dan alasan seluruh aturan impor bisa diuji tanpa MySQL.
 *
 * Tidak ada penulisan. Yang MENGABAIKAN baris yang sudah ada di basis data
 * (bukan menimpanya) adalah route-nya, dengan pola yang sama seperti impor
 * daftar akun: kode yang sudah ada dilewati dan dilaporkan, tidak pernah
 * ditimpa. Impor tidak boleh bisa menghapus pekerjaan orang.
 */

import { DuplicateGuard, RowIssues, readImportRows, type RowError } from "@/lib/import/rows";
import { optionalText, readBoolean, requiredText } from "@/lib/import/fields";
import { EXAMPLE_PARTNER_NAME, type ColumnSpec } from "@/lib/import/spec";

/* ── Kolom bersama pelanggan & pemasok ──────────────────────────────────── */

const CONTACT_COLUMNS: readonly ColumnSpec[] = [
  {
    key: "name",
    header: "Nama",
    aliases: ["Nama Pelanggan", "Nama Pemasok", "Nama Supplier", "Name", "Customer Name", "Supplier Name"],
    required: true,
    example: EXAMPLE_PARTNER_NAME,
    hint: "Wajib, maksimal 100 karakter. Nama yang sama dianggap satu.",
  },
  {
    key: "address",
    header: "Alamat",
    aliases: ["Address"],
    example: "Jl. Merdeka No. 1, Jakarta",
    hint: "Opsional.",
  },
  {
    key: "phone",
    header: "Telepon",
    aliases: ["No Telepon", "Telp", "Phone", "HP"],
    example: "021-1234567",
    hint: "Opsional, maksimal 30 karakter.",
  },
  {
    key: "email",
    header: "Email",
    aliases: ["E-mail", "Surel"],
    example: "info@contoh.co.id",
    hint: "Opsional, maksimal 100 karakter.",
  },
];

export const CUSTOMER_COLUMNS: readonly ColumnSpec[] = [
  ...CONTACT_COLUMNS,
  {
    key: "pic",
    header: "PIC",
    aliases: ["Kontak", "Contact Person", "Narahubung"],
    example: "Budi",
    hint: "Opsional — nama orang yang dihubungi.",
  },
  {
    key: "npwp",
    header: "NPWP",
    example: "01.234.567.8-901.000",
    hint: "Opsional. Diperlukan e-Faktur untuk faktur pajak lokal.",
  },
  {
    key: "taxExempt",
    header: "Bebas PPN",
    aliases: ["Tax Exempt", "Non PPN"],
    example: "Tidak",
    hint: "Ya / Tidak. Kosong berarti Tidak (dikenai PPN).",
  },
];

export const SUPPLIER_COLUMNS: readonly ColumnSpec[] = CONTACT_COLUMNS;

export const ITEM_COLUMNS: readonly ColumnSpec[] = [
  {
    key: "code",
    header: "Kode",
    aliases: ["Kode Barang", "Item Code", "Kode", "SKU", "No Barang"],
    required: true,
    example: "100003",
    hint: "Wajib, maksimal 20 karakter. UNIK — inilah yang membedakan dua barang.",
  },
  {
    key: "name",
    header: "Nama",
    aliases: ["Nama Barang", "Item Name", "Deskripsi", "Description"],
    required: true,
    example: "Kopi Arabika Gayo",
    /*
     * Sejak #493 nama BOLEH kembar — berkas saldo awal 2024 pengguna memuat
     * dua `LONG PEPPER` berkode berbeda. Petunjuknya wajib mengatakan itu:
     * petunjuk yang masih menjanjikan keunikan akan membuat pengguna mengarang
     * nama pembeda ("LONG PEPPER 2") untuk masalah yang sudah tidak ada.
     */
    hint: "Wajib, maksimal 100 karakter. Boleh sama dengan barang lain asal kodenya beda.",
  },
  {
    key: "unit",
    header: "Satuan",
    aliases: ["Unit", "UOM", "Satuan Stok"],
    example: "kg",
    hint: "Opsional, maksimal 20 karakter (kg, pcs, liter, …).",
  },
];

/* ── Hasil ──────────────────────────────────────────────────────────────── */

export interface ParsedContact {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface ParsedCustomer extends ParsedContact {
  pic: string | null;
  npwp: string | null;
  taxExempt: boolean;
}

export interface ParsedItem {
  /** Identitas barang (#493) — yang dipakai impor untuk mengenali duplikat. */
  code: string;
  name: string;
  unit: string | null;
}

export interface MasterImportResult<T> {
  rows: T[];
  errors: RowError[];
  /** Nama yang muncul lebih dari sekali DI DALAM berkas (baris kedua dibuang). */
  duplicateNamesInFile: string[];
  /** `true` bila berkasnya melebihi batas dan sisanya tidak dibaca. */
  truncated: boolean;
}

/**
 * Kolom wajib yang hilang adalah kesalahan BERKAS, bukan baris.
 *
 * Dilaporkan sebagai satu galat di baris 1 — baris judul — sebab di situlah
 * salahnya. Melaporkannya di baris data membuat orang mencari-cari di dalam
 * datanya, padahal yang perlu diperbaiki judulnya.
 */
function headerError(missing: string[]): RowError {
  return {
    row: 1,
    message:
      `Kolom wajib tidak ditemukan di baris judul: ${missing.join(", ")}. ` +
      "Unduh templat lalu salin datanya ke sana.",
  };
}

/**
 * Alamat surel — diperiksa BENTUKNYA saja, tidak pernah keberadaannya.
 *
 * Sebuah impor tidak boleh menolak baris karena alamatnya tidak bisa dihubungi:
 * daftar pelanggan lama penuh alamat yang sudah mati, dan pemiliknya tetap
 * berhak memindahkannya. Yang ditolak hanyalah teks yang jelas bukan alamat —
 * sebab itu hampir selalu berarti kolomnya tergeser.
 */
function readEmail(raw: string, issues: RowIssues): string | null {
  const value = optionalText(raw, "Email", 100, issues);
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    issues.add(`Email "${value}" tidak berbentuk alamat surel`);
    return null;
  }
  return value;
}

function readContact(values: Record<string, string>, issues: RowIssues): ParsedContact {
  return {
    name: requiredText(values.name, "Nama", 100, issues),
    address: optionalText(values.address, "Alamat", 5000, issues),
    phone: optionalText(values.phone, "Telepon", 30, issues),
    email: readEmail(values.email, issues),
  };
}

/**
 * Kerangka bersama ketiga jenis: baca baris, validasi per baris, tolak kembar.
 *
 * Kembar diperiksa SESUDAH bentuknya sah — melaporkan "nama ganda" untuk dua
 * baris yang namanya sama-sama kosong tidak menolong siapa pun.
 *
 * ══ APA yang dianggap kembar berbeda per jenis (#493) ══════════════════════
 * Pelanggan & pemasok dikenali NAMANYA. Barang TIDAK: sejak #493 identitasnya
 * kode, dan dua barang boleh bernama sama — berkas saldo awal 2024 pengguna
 * memuat `LONG PEPPER` 100006 dan 100010, dua mutu berbeda yang harga
 * satuannya berselisih hampir empat kali lipat. Menjaga kembar menurut nama di
 * sini akan menolak baris kedua sebagai "nama ganda", yaitu menolak justru
 * berkas yang menjadi alasan #493 ada.
 *
 * Karena itu penandanya disuntikkan pemanggil (`identity`), bukan ditebak.
 * `label` ikut supaya galatnya menyebut kolom yang benar-benar bentrok.
 */
function parseMaster<T extends { name: string }>(
  sheet: unknown[][],
  columns: readonly ColumnSpec[],
  build: (values: Record<string, string>, issues: RowIssues) => T,
  identity: { label: string; of: (row: T) => string } = {
    label: "Nama",
    of: (row) => row.name,
  }
): MasterImportResult<T> {
  const { rows: dataRows, missingColumns, truncated } = readImportRows(sheet, columns);
  if (missingColumns.length > 0) {
    return {
      rows: [],
      errors: [headerError(missingColumns)],
      duplicateNamesInFile: [],
      truncated: false,
    };
  }

  const rows: T[] = [];
  const errors: RowError[] = [];
  const duplikat = new DuplicateGuard(identity.label);

  for (const { row, values } of dataRows) {
    const issues = new RowIssues(row);
    const parsed = build(values, issues);

    if (!issues.failed) duplikat.check(identity.of(parsed).toLowerCase(), row, issues);

    const error = issues.toError();
    if (error) errors.push(error);
    else rows.push(parsed);
  }

  return { rows, errors, duplicateNamesInFile: duplikat.duplicates, truncated };
}

export function parseCustomerRows(sheet: unknown[][]): MasterImportResult<ParsedCustomer> {
  return parseMaster(sheet, CUSTOMER_COLUMNS, (values, issues) => ({
    ...readContact(values, issues),
    pic: optionalText(values.pic, "PIC", 100, issues),
    npwp: optionalText(values.npwp, "NPWP", 30, issues),
    /* Kosong = TIDAK bebas PPN, dan itu bawaan yang benar: memperlakukan sel
       kosong sebagai "bebas PPN" akan diam-diam menghapus pajak dari setiap
       faktur pelanggan yang kolomnya tidak diisi. */
    taxExempt: readBoolean(values.taxExempt, "Bebas PPN", issues) ?? false,
  }));
}

export function parseSupplierRows(sheet: unknown[][]): MasterImportResult<ParsedContact> {
  return parseMaster(sheet, SUPPLIER_COLUMNS, (values, issues) => readContact(values, issues));
}

export function parseItemRows(sheet: unknown[][]): MasterImportResult<ParsedItem> {
  return parseMaster(
    sheet,
    ITEM_COLUMNS,
    (values, issues) => ({
      code: requiredText(values.code, "Kode barang", 20, issues),
      name: requiredText(values.name, "Nama barang", 100, issues),
      unit: optionalText(values.unit, "Satuan", 20, issues),
    }),
    /* KODE, bukan nama (#493) — lihat catatan pada `parseMaster` di atas. */
    { label: "Kode", of: (row) => row.code }
  );
}
