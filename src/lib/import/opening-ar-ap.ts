/**
 * IMPOR PIUTANG & UTANG TERBUKA (issue #381 tahap 4).
 *
 * ══ APA YANG DIBAWA BERKAS INI, DAN KENAPA ITU BUKAN SEKADAR KENYAMANAN ═════
 * Tahap 3 membuat saldo awal piutang/utang lahir sebagai DOKUMEN, sehingga umur
 * piutang terisi dan faktur lama bisa dilunasi. Tetapi wisaya hanya
 * mengumpulkan satu TOTAL per mitra — dan sebuah dokumen tanpa tanggal terbit
 * memakai tanggal jurnal pembuka, jadi umur piutangnya dihitung dari HARI
 * PERTAMA, bukan dari hari fakturnya benar-benar terbit.
 *
 * Akibatnya di layar: seluruh piutang lama tampil di ember umur yang sama, "0–30
 * hari", pada hari pertama. Piutang yang sudah menunggak delapan bulan terlihat
 * sama sehatnya dengan yang terbit kemarin — dan justru daftar itulah alasan
 * orang membuka halaman umur piutang.
 *
 * Berkas ini yang membawa rinciannya: nomor faktur asli, tanggal terbit, jatuh
 * tempo. Umur piutangnya menjadi umur yang sebenarnya.
 *
 * ══ SATU BARIS = SATU DOKUMEN, BUKAN SATU MITRA ════════════════════════════
 * Berbeda dari wisaya. Seorang pelanggan dengan dua belas faktur terbuka
 * menghasilkan dua belas baris, dan itu memang yang dimaksud: dua belas dokumen
 * yang bisa dilunasi satu per satu, dengan umur masing-masing.
 *
 * ══ NILAI YANG DIMINTA ADALAH SISANYA, BUKAN NILAI ASLINYA ═════════════════
 * Kolomnya "Sisa", dan itu keputusan yang disengaja. Sebuah faktur lama yang
 * sudah dibayar separuh punya dua angka — nilai asli dan sisanya — dan yang
 * dibutuhkan buku baru hanya sisanya: pembayaran yang sudah terjadi terjadi di
 * sistem lama, dan mencatatnya lagi di sini berarti mencatat uang yang sama dua
 * kali. Meminta nilai asli lalu meminta pembayarannya pula akan mengundang
 * seluruh riwayat pelunasan lama masuk ke buku baru — pekerjaan berlipat untuk
 * angka yang hasil akhirnya sama.
 *
 * MURNI: tanpa Prisma, tanpa ExcelJS.
 */

import { DuplicateGuard, RowIssues, readImportRows, type RowError } from "@/lib/import/rows";
import { readAmount, readDate, requiredText } from "@/lib/import/fields";
import { EXAMPLE_PARTNER_NAME, type ColumnSpec } from "@/lib/import/spec";

/** Mata uang yang dikenal app — sama dengan impor daftar akun. */
const KNOWN_CURRENCIES = new Set(["IDR", "USD", "CNY"]);

function partnerColumn(label: string, aliases: readonly string[]): ColumnSpec {
  return {
    key: "partner",
    header: label,
    aliases: [...aliases],
    required: true,
    example: EXAMPLE_PARTNER_NAME,
    hint: "Harus PERSIS sama dengan nama yang sudah terdaftar. Impor daftarnya lebih dulu bila belum ada.",
  };
}

const SHARED_COLUMNS: readonly ColumnSpec[] = [
  {
    key: "documentNo",
    header: "No. Dokumen",
    aliases: ["Nomor Faktur", "No Faktur", "Invoice No", "No. Bukti"],
    required: true,
    example: "INV-2025-0417",
    hint: "Nomor dari sistem lama Anda. Dipakai mencocokkan saat pelunasan.",
  },
  {
    key: "date",
    header: "Tanggal",
    aliases: ["Tanggal Faktur", "Date", "Tgl"],
    required: true,
    example: "2025-11-20",
    hint: "Tanggal TERBIT aslinya — inilah yang membuat umur piutangnya benar.",
  },
  {
    key: "dueDate",
    header: "Jatuh Tempo",
    aliases: ["Due Date", "Tgl Jatuh Tempo"],
    example: "2025-12-20",
    hint: "Opsional. Kosong → umurnya dihitung dari tanggal terbit.",
  },
  {
    key: "currency",
    header: "Mata Uang",
    aliases: ["Currency", "Valuta"],
    example: "IDR",
    hint: "Kosong berarti IDR. Pilihan: IDR, USD, CNY.",
  },
  {
    key: "rate",
    header: "Kurs",
    aliases: ["Rate", "Kurs ke IDR"],
    example: "",
    hint: "WAJIB untuk mata uang selain IDR. Kurs saat dokumen terbit.",
  },
  {
    key: "amount",
    header: "Sisa",
    aliases: ["Sisa Tagihan", "Outstanding", "Saldo", "Nilai"],
    required: true,
    example: "15.750.000",
    hint: "SISA yang belum dibayar, bukan nilai faktur aslinya.",
  },
];

export const OPENING_AR_COLUMNS: readonly ColumnSpec[] = [
  partnerColumn("Pelanggan", ["Nama Pelanggan", "Customer", "Customer Name"]),
  ...SHARED_COLUMNS,
];

export const OPENING_AP_COLUMNS: readonly ColumnSpec[] = [
  partnerColumn("Pemasok", ["Nama Pemasok", "Supplier", "Supplier Name"]),
  ...SHARED_COLUMNS,
];

/** Satu dokumen terbuka, sebagaimana dibaca dari berkas. */
export interface ParsedOpeningDocument {
  /** Nama mitra APA ADANYA dari berkas — dicocokkan ke id di route. */
  partner: string;
  documentNo: string;
  date: Date;
  dueDate: Date | null;
  currency: string;
  rate: number | null;
  amount: number;
}

export interface OpeningDocumentsResult {
  rows: ParsedOpeningDocument[];
  errors: RowError[];
  duplicateNumbersInFile: string[];
  truncated: boolean;
}

/**
 * Baca berkas piutang/utang terbuka.
 *
 * Nama mitra TIDAK dicocokkan ke basis data di sini — modul ini murni. Yang
 * mencocokkannya route, dan mitra yang tidak dikenali menjadi galat per-baris
 * di sana, dengan nomor barisnya, seperti galat lain.
 */
export function parseOpeningDocuments(
  sheet: unknown[][],
  columns: readonly ColumnSpec[]
): OpeningDocumentsResult {
  const { rows: dataRows, missingColumns, truncated } = readImportRows(sheet, columns);
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

  const rows: ParsedOpeningDocument[] = [];
  const errors: RowError[] = [];
  const duplikat = new DuplicateGuard("No. Dokumen");

  for (const { row, values } of dataRows) {
    const issues = new RowIssues(row);

    const partner = requiredText(values.partner, "Nama mitra", 100, issues);
    const documentNo = requiredText(values.documentNo, "No. Dokumen", 50, issues);
    const date = readDate(values.date, "Tanggal", issues, { required: true });
    const dueDate = readDate(values.dueDate, "Jatuh tempo", issues);
    const amount = readAmount(values.amount, "Sisa", issues, {
      required: true,
      positive: true,
    });

    const currencyRaw = values.currency.toUpperCase();
    const currency = currencyRaw || "IDR";
    if (currencyRaw && !KNOWN_CURRENCIES.has(currencyRaw)) {
      issues.add(`Mata uang "${currencyRaw}" tidak didukung (pakai IDR/USD/CNY)`);
    }

    /*
     * Kurs WAJIB untuk mata uang asing, dan ini bukan kerewelan: tanpa kurs
     * tidak ada nilai IDR yang jujur, dan menilainya 1:1 akan menempatkan
     * piutang USD 10.000 sebagai Rp 10.000 di neraca — aturan yang sama yang
     * sudah ditegakkan `buildOpeningBalanceLines` untuk saldo awal wisaya.
     */
    const rate = readAmount(values.rate, "Kurs", issues, { positive: currency !== "IDR" });
    if (currency !== "IDR" && (rate === null || rate <= 0)) {
      issues.add(`Kurs wajib diisi untuk mata uang ${currency} — nilai IDR tidak ditebak`);
    }

    // Jatuh tempo sebelum tanggal terbit hampir selalu berarti dua kolom
    // tertukar; menerimanya menghasilkan umur yang negatif.
    if (date && dueDate && dueDate.getTime() < date.getTime()) {
      issues.add("Jatuh tempo lebih awal daripada tanggal terbit");
    }

    if (!issues.failed) duplikat.check(documentNo.toLowerCase(), row, issues);

    const error = issues.toError();
    if (error) {
      errors.push(error);
      continue;
    }

    rows.push({
      partner,
      documentNo,
      date: date!,
      dueDate,
      currency,
      rate: currency === "IDR" ? null : rate,
      amount: amount!,
    });
  }

  return { rows, errors, duplicateNumbersInFile: duplikat.duplicates, truncated };
}
