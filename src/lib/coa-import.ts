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
    key: "parent",
    header: "Akun Induk",
    aliases: ["Parent", "Parent Account", "Induk", "Kode Induk", "Sub Dari"],
    example: "1101",
    hint: "Opsional; KODE akun induknya. Kosong berarti akun tingkat atas.",
  },
  {
    key: "currency",
    header: "Mata Uang",
    aliases: ["Currency", "Valuta", "Mata Uang Utama"],
    example: "IDR",
    hint: "Opsional; kosong berarti IDR. Pilihan: IDR, USD, CNY.",
  },
];

/**
 * Kolom yang DIKENALI tetapi sengaja tidak diimpor (issue #494).
 *
 * `Kurs Saldo` ikut di berkas Accurate dan berisi kurs pembukaan akun valas
 * (BCA CNY @2.261, BCA USD @16.460 pada berkas pengguna pertama). Ia BUKAN
 * milik akunnya melainkan milik SALDO AWALNYA, jadi tempatnya di jalur
 * `master/opening` — bukan di sini.
 *
 * Yang tidak boleh terjadi adalah membuangnya diam-diam. Untuk akun bersaldo
 * valas, kurs pembukaan adalah satu-satunya cara menerjemahkan saldo itu ke IDR
 * di neraca; tanpa kabar, pengguna akan menyangka ia sudah terbawa. Doktrin
 * yang sama dengan `Invoice.rate`/`Contract.rate` yang menolak menebak kurs.
 */
export const RECOGNIZED_BUT_IGNORED: { header: string; aliases: string[]; why: string }[] = [
  {
    header: "Kurs Saldo",
    aliases: ["Kurs", "Rate", "Kurs Saldo (Jika Asing)", "Exchange Rate"],
    why: "Kurs milik SALDO AWAL, bukan milik akunnya — isi lewat Saldo Awal.",
  },
  {
    header: "Cabang Saldo",
    aliases: ["Cabang", "Branch"],
    why: "Cabang/pusat biaya tidak disimpan di akun; pakai Pusat Biaya.",
  },
];

/** Judul kolom yang dikenali-tapi-diabaikan dan MEMANG ada di baris judul. */
export function ignoredColumnsIn(headerRow: unknown[]): { header: string; why: string }[] {
  const seen = headerRow
    .map((c) => (c == null ? "" : String(c).trim().toLowerCase()))
    .filter(Boolean);

  return RECOGNIZED_BUT_IGNORED.filter((spec) =>
    [spec.header, ...spec.aliases].some((n) => seen.includes(n.toLowerCase()))
  ).map(({ header, why }) => ({ header, why }));
}

export interface ParsedAccount {
  code: string;
  name: string;
  type: string;
  normalBalance: NormalBalance;
  currency: string;
  /**
   * KODE akun induknya (issue #494), bukan id — id belum ada saat berkas
   * diurai. `null` = akun tingkat atas.
   *
   * Berkas ekspor Accurate mengisi kolom ini untuk sebagian besar barisnya
   * (`5100008` induknya `5100`, `1101006` induknya `1101`, …). Sebelum #494
   * kolomnya dibaca lalu dibuang, sehingga 180 akun masuk sebagai daftar RATA:
   * laporan yang menjumlah per kelompok akun kehilangan pengelompokannya, dan
   * pengguna harus menyusun ulang 180 hubungan induk-anak dengan tangan —
   * pekerjaan yang justru ingin dihindari dengan mengimpor.
   */
  parentCode: string | null;
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
      parentCode: values.parent.trim() || null,
    });
  }

  /*
   * Induk diperiksa SESUDAH seluruh baris terbaca, dan itu wajib: berkas
   * Accurate urut ABJAD NAMA, bukan urut hierarki — `5100008` muncul di baris 1
   * sedangkan induknya `5100` baru di baris 95. Memeriksa induk per baris akan
   * menolak hampir semuanya sebagai "induk tidak ditemukan".
   */
  errors.push(...parentIssues(accounts));

  return { accounts, errors, duplicateCodesInFile: duplikat.duplicates };
}

/**
 * Cacat hubungan induk-anak yang bisa dilihat DARI BERKAS SAJA (issue #494).
 *
 * Induk yang tidak ada di berkas TIDAK dilaporkan di sini — ia mungkin sudah
 * ada di basis data (mengimpor sebagian bagan akun adalah hal yang wajar), dan
 * yang bisa menjawab itu hanya jalur tulisnya. Yang diperiksa di sini adalah
 * dua cacat yang tidak pernah sah, apa pun isi basis datanya:
 *
 *   • akun yang menjadi induk DIRINYA SENDIRI;
 *   • lingkaran (A → B → A). `Account.parentId` `onDelete: Restrict` tidak
 *     menjaga ini sama sekali, dan sebuah lingkaran membuat setiap laporan yang
 *     menelusuri hierarki berputar tanpa henti.
 */
export function parentIssues(accounts: ParsedAccount[]): RowError[] {
  const issues: RowError[] = [];
  const parentOf = new Map<string, string | null>();
  for (const a of accounts) parentOf.set(a.code, a.parentCode);

  for (const a of accounts) {
    if (a.parentCode === null) continue;

    if (a.parentCode === a.code) {
      issues.push({
        row: 0,
        message: `Akun ${a.code} menjadi induk dirinya sendiri.`,
      });
      continue;
    }

    /* Telusuri ke atas sampai habis atau kembali ke titik awal. Dibatasi
       sepanjang jumlah akun: rantai yang lebih panjang dari itu PASTI
       melingkar, dan batas ini yang menjaga penelusurannya berhenti. */
    let cursor: string | null = a.parentCode;
    for (let step = 0; step < accounts.length && cursor != null; step += 1) {
      if (cursor === a.code) {
        issues.push({
          row: 0,
          message: `Induk akun ${a.code} melingkar (${a.code} → ${a.parentCode} → … → ${a.code}).`,
        });
        break;
      }
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  return issues;
}
