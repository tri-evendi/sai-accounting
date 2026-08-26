/**
 * Impor SALDO STOK AWAL (issue #381 — berkas terakhir dari enam).
 *
 * == Kenapa berkas ini menyusul belakangan ==================================
 * Tahap 4 #381 menyebut stok awal sebagai "sudah ada lewat #379, tinggal jalur
 * impornya" — dan jalur itu memang tak pernah dibuat. Stok awal selama ini
 * hanya bisa DIKETIK satu per satu di wisaya penyiapan, yang berbenturan dengan
 * kriteria selesai #381 sendiri: *"membawa mitra, barang, stok, piutang/utang
 * terbuka, dan aset tetapnya TANPA MENGETIK ULANG"*.
 *
 * Untuk pengguna pertama (12 barang) mengetik masih wajar. Untuk perusahaan
 * pindahan berikutnya belum tentu — dan merekalah alasan #381 ada.
 *
 * == BARANG DICOCOKKAN LEWAT KODE, BUKAN NAMA ==============================
 * Sejak #493 dua barang boleh bernama sama persis selama kodenya berbeda —
 * `LONG PEPPER` 100006 (±Rp 50.000/kg) dan 100010 (±Rp 13.500/kg) di data
 * pengguna pertama. Berkas saldo awal yang mencocokkan nama tidak bisa
 * menyatakan barang MANA yang dimaksud, dan menebaknya berarti menaruh Rp 239
 * juta di barang yang salah pada hari pertama buku dibuka.
 *
 * Nama boleh ikut di berkas sebagai kolom OPSIONAL — ia membantu manusia
 * membaca berkasnya — tetapi ia tidak pernah dipakai mencocokkan.
 *
 * == MURNI ==================================================================
 * Sepola `coa-import.ts` dan `import/fixed-assets.ts`: parsing + validasi
 * tanpa Prisma dan tanpa ExcelJS. Pencocokan ke barang yang BENAR-BENAR ada
 * dikerjakan route-nya, sebab itu menuntut basis data.
 */
import { DuplicateGuard, RowIssues, readImportRows, type RowError } from "@/lib/import/rows";
import { requiredText, optionalText, readAmount } from "@/lib/import/fields";
import type { ColumnSpec } from "@/lib/import/spec";

export const OPENING_STOCK_COLUMNS: readonly ColumnSpec[] = [
  {
    key: "code",
    header: "Kode Barang",
    aliases: ["Kode", "Item Code", "SKU", "No Barang"],
    required: true,
    example: "100003",
    hint: "Wajib. Harus sama dengan kode barang yang sudah ada di Daftar Barang.",
  },
  {
    key: "name",
    header: "Nama Barang",
    aliases: ["Nama", "Item Name", "Deskripsi"],
    example: "BLACK PEPPER",
    /* Opsional DAN tidak dipakai mencocokkan — dikatakan supaya tidak ada yang
       menyangka menyunting kolom ini mengubah barang yang dituju. */
    hint: "Opsional, hanya untuk memudahkan membaca berkas. Yang dicocokkan KODE-nya.",
  },
  {
    key: "quantity",
    header: "Kuantitas",
    aliases: ["Qty", "Jumlah", "Kts", "Kts Akhir"],
    required: true,
    example: "1624.36",
    hint: "Wajib, lebih besar dari nol. Sampai 3 desimal.",
  },
  {
    key: "unitCost",
    header: "Harga Pokok",
    aliases: ["Harga Pokok/Unit", "Unit Cost", "Biaya per Unit", "Harga"],
    required: true,
    example: "54000",
    hint: "Wajib, lebih besar dari nol. Rupiah per unit — bukan nilai totalnya.",
  },
];

export interface ParsedOpeningStock {
  code: string;
  /** Nama sebagaimana tertulis di berkas; hanya untuk pesan galat & tampilan. */
  name: string | null;
  quantity: number;
  unitCost: number;
}

export interface OpeningStockImportResult {
  rows: ParsedOpeningStock[];
  errors: RowError[];
  /** Kode yang muncul lebih dari sekali DI DALAM berkas. */
  duplicateCodesInFile: string[];
  truncated: boolean;
}

/**
 * Urai baris saldo stok awal.
 *
 * Kuantitas dan harga pokok WAJIB positif — aturan yang sama dengan
 * `openingStockSchema`, dan alasannya sama: baris nol tidak menambah apa pun ke
 * jurnal maupun ke stok, jadi ia hanya baris yang membingungkan pembacanya.
 *
 * Kode ganda DI DALAM berkas ditolak di sini. Dua baris untuk satu barang bukan
 * "dijumlahkan" — di berkas saldo awal ia hampir selalu berarti berkasnya salah
 * susun, dan menjumlahkannya diam-diam menyembunyikan itu.
 */
export function parseOpeningStockRows(sheet: unknown[][]): OpeningStockImportResult {
  const { rows: dataRows, missingColumns, truncated } = readImportRows(
    sheet,
    OPENING_STOCK_COLUMNS
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
      duplicateCodesInFile: [],
      truncated: false,
    };
  }

  const rows: ParsedOpeningStock[] = [];
  const errors: RowError[] = [];
  const duplikat = new DuplicateGuard("Kode Barang");

  for (const { row, values } of dataRows) {
    const issues = new RowIssues(row);

    const code = requiredText(values.code, "Kode barang", 20, issues);
    const name = optionalText(values.name, "Nama barang", 100, issues);
    const quantity = readAmount(values.quantity, "Kuantitas", issues, {
      required: true,
      positive: true,
    });
    const unitCost = readAmount(values.unitCost, "Harga pokok", issues, {
      required: true,
      positive: true,
    });

    /* Kembar diperiksa SESUDAH bentuknya sah: melaporkan "kode ganda" untuk dua
       baris yang kodenya sama-sama kosong tidak menolong siapa pun. */
    if (!issues.failed) duplikat.check(code.toLowerCase(), row, issues);

    const error = issues.toError();
    if (error) {
      errors.push(error);
      continue;
    }

    rows.push({ code, name: name || null, quantity: quantity!, unitCost: unitCost! });
  }

  return { rows, errors, duplicateCodesInFile: duplikat.duplicates, truncated };
}
