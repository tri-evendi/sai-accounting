/**
 * Inti impor bersama (issue #381, tahap 1) — pemetaan judul, pembacaan baris,
 * dan pembaca nilai.
 *
 * Yang dijaga di sini bukan kerapian abstraksi melainkan tiga kelas kesalahan
 * yang SEMUANYA berhasil tanpa galat — yaitu bentuk kesalahan yang paling
 * mahal, karena tidak ada yang memberitahu siapa pun bahwa ia terjadi:
 *
 *   1. kolom terbaca menurut posisi → nilai tertukar antar kolom;
 *   2. `1.234.567,89` → `NaN` → nol yang tercatat sebagai nol;
 *   3. `01/02/2026` dibaca gaya Amerika → faktur bergeser sebulan.
 */
import { describe, expect, it } from "vitest";

import { mapHeaderRow, normalizeHeader, type ColumnSpec } from "@/lib/import/spec";
import { DuplicateGuard, RowIssues, readImportRows } from "@/lib/import/rows";
import {
  parseAmount,
  parseImportDate,
  readAmount,
  readDate,
  readMapped,
  requiredText,
} from "@/lib/import/fields";

const COLUMNS: readonly ColumnSpec[] = [
  { key: "code", header: "Kode", aliases: ["Kode Barang"], required: true },
  { key: "name", header: "Nama", required: true },
  { key: "unit", header: "Satuan" },
];

describe("pemetaan judul", () => {
  it("judul disamakan tanpa spasi/huruf besar/tanda baca", () => {
    expect(normalizeHeader("Kode Akun")).toBe("kodeakun");
    expect(normalizeHeader("KODE_AKUN")).toBe("kodeakun");
    expect(normalizeHeader("  kode-akun  ")).toBe("kodeakun");
  });

  it("makna TIDAK ikut disamakan", () => {
    // "kode" dan "kode barang" adalah dua judul berbeda, dan menyatukannya
    // akan memetakan kolom yang salah tanpa suara.
    expect(normalizeHeader("Kode")).not.toBe(normalizeHeader("Kode Barang"));
  });

  it("URUTAN kolom tidak menentukan apa pun", () => {
    // Inilah perbaikan yang dibawa #381: pembacaan menurut posisi benar hanya
    // selama berkasnya lahir dari templat kita sendiri.
    const { index } = mapHeaderRow(["Satuan", "Nama", "Kode"], COLUMNS);
    expect(index).toEqual({ unit: 0, name: 1, code: 2 });
  });

  it("kolom tak dikenal diabaikan, bukan ditolak", () => {
    // Berkas ekspor dari aplikasi lain hampir selalu membawa kolom tambahan.
    const { index, missing } = mapHeaderRow(["ID Internal", "Kode", "Nama"], COLUMNS);
    expect(missing).toEqual([]);
    expect(index).toMatchObject({ code: 1, name: 2 });
  });

  it("alias diterima", () => {
    expect(mapHeaderRow(["Kode Barang", "Nama"], COLUMNS).index).toMatchObject({ code: 0 });
  });

  it("kolom WAJIB yang hilang disebut namanya", () => {
    expect(mapHeaderRow(["Nama", "Satuan"], COLUMNS).missing).toEqual(["Kode"]);
  });

  it("judul kembar diambil yang PERTAMA", () => {
    // Menebak yang mana yang dimaksud bukan wewenang modul ini.
    expect(mapHeaderRow(["Kode", "Kode"], COLUMNS).index.code).toBe(0);
  });
});

describe("pembacaan baris", () => {
  const HEADER = ["Kode", "Nama", "Satuan"];

  it("nomor barisnya adalah nomor yang DILIHAT ORANG di Excel", () => {
    // Galat yang menyebut "baris 12" harus menunjuk baris 12 — bukan indeks 11,
    // dan bukan baris ke-12 setelah judul dibuang.
    const { rows } = readImportRows([HEADER, ["A", "Kopi", "kg"]], COLUMNS);
    expect(rows[0].row).toBe(2);
  });

  it("baris kosong dilewati diam-diam", () => {
    // Spreadsheet membawa ratusan baris kosong di bawah datanya; menjadikan
    // masing-masing sebuah galat mengubah laporan validasi jadi tak terbaca.
    const { rows } = readImportRows(
      [HEADER, ["A", "Kopi", "kg"], ["", "", ""], [], ["B", "Teh", "kg"]],
      COLUMNS
    );
    expect(rows.map((r) => r.values.code)).toEqual(["A", "B"]);
  });

  it("kolom opsional yang tidak ada di berkas terbaca sebagai kosong", () => {
    const { rows } = readImportRows([["Kode", "Nama"], ["A", "Kopi"]], COLUMNS);
    expect(rows[0].values.unit).toBe("");
  });

  it("kolom wajib hilang → NOL baris dipulangkan", () => {
    // Pemanggil tidak boleh bisa keliru memproses sebagian dari berkas yang
    // judulnya sendiri salah.
    const hasil = readImportRows([["Nama"], ["Kopi"]], COLUMNS);
    expect(hasil.missingColumns).toEqual(["Kode"]);
    expect(hasil.rows).toEqual([]);
  });

  it("berkas melebihi batas ditandai, bukan didiamkan", () => {
    const sheet = [HEADER, ...Array.from({ length: 10_001 }, (_, i) => [`A${i}`, "x", "kg"])];
    const hasil = readImportRows(sheet, COLUMNS);
    expect(hasil.truncated).toBe(true);
    expect(hasil.rows).toHaveLength(10_000);
  });
});

describe("pengumpul galat per baris", () => {
  it("SELURUH masalah satu baris dilaporkan sekaligus", () => {
    // Orang yang memperbaiki berkas 300 baris tidak boleh menemukan
    // kesalahannya satu per satu, satu unggahan per kesalahan.
    const issues = new RowIssues(7);
    issues.add("Kode kosong");
    issues.add("Nama kosong");
    expect(issues.toError()).toEqual({ row: 7, message: "Kode kosong; Nama kosong" });
  });

  it("baris bersih tidak menghasilkan galat", () => {
    expect(new RowIssues(3).toError()).toBeNull();
  });

  it("kembar menyebut baris PERTAMANYA", () => {
    const guard = new DuplicateGuard("Kode");
    const a = new RowIssues(2);
    const b = new RowIssues(9);
    expect(guard.check("1101", 2, a)).toBe(false);
    expect(guard.check("1101", 9, b)).toBe(true);
    expect(b.toError()?.message).toContain("baris 2");
    expect(guard.duplicates).toEqual(["1101"]);
  });
});

describe("angka dari spreadsheet", () => {
  it("gaya Indonesia, gaya Inggris, dan sel angka menghasilkan nilai yang SAMA", () => {
    expect(parseAmount("1.234.567,89")).toBe(1234567.89);
    expect(parseAmount("1,234,567.89")).toBe(1234567.89);
    expect(parseAmount("1234567.89")).toBe(1234567.89);
  });

  it("tanpa desimal, pemisahnya ribuan — apa pun tandanya", () => {
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("1,234")).toBe(1234);
    expect(parseAmount("12.345.678")).toBe(12345678);
  });

  it("awalan Rp dan spasi diterima", () => {
    expect(parseAmount("Rp 1.500.000")).toBe(1500000);
  });

  it("negatif tetap negatif", () => {
    expect(parseAmount("-1.500,50")).toBe(-1500.5);
  });

  it("yang bukan angka ditolak, TIDAK menjadi nol", () => {
    // Nol yang lahir dari `NaN` adalah saldo yang salah tanpa satu pun galat.
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.2.3.4,5,6")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });

  it("readAmount melaporkan, bukan menebak", () => {
    const issues = new RowIssues(4);
    expect(readAmount("abc", "Saldo", issues)).toBeNull();
    expect(issues.toError()?.message).toContain('"abc"');

    const kosong = new RowIssues(4);
    expect(readAmount("", "Saldo", kosong, { required: true })).toBeNull();
    expect(kosong.failed).toBe(true);

    const nol = new RowIssues(4);
    expect(readAmount("0", "Saldo", nol, { positive: true })).toBeNull();
    expect(nol.failed).toBe(true);
  });
});

describe("tanggal dari spreadsheet", () => {
  it("ISO dan gaya Indonesia dibaca sama", () => {
    expect(parseImportDate("2026-01-31")?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(parseImportDate("31/01/2026")?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(parseImportDate("31-01-2026")?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("hari-dulu, BUKAN bulan-dulu", () => {
    // `new Date("01/02/2026")` membacanya 2 Januari. Faktur yang bergeser
    // sebulan tanpa galat tidak akan ditemukan siapa pun sampai umur
    // piutangnya salah.
    expect(parseImportDate("01/02/2026")?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("tanggal yang tidak ada ditolak, bukan digulung ke bulan berikutnya", () => {
    expect(parseImportDate("31/02/2026")).toBeNull();
    expect(parseImportDate("2026-13-01")).toBeNull();
    expect(parseImportDate("kemarin")).toBeNull();
  });

  it("readDate menyebut bentuk yang diterima", () => {
    const issues = new RowIssues(5);
    readDate("kemarin", "Tanggal", issues);
    expect(issues.toError()?.message).toContain("2026-01-31");
  });
});

describe("pilihan dari peta kode", () => {
  const MAP = { BANK: "cash_bank", AREC: "account_receivable" };

  it("tidak peka huruf besar-kecil", () => {
    expect(readMapped("bank", "Tipe", MAP, new RowIssues(2))).toBe("cash_bank");
  });

  it("kode tak dikenal DISEBUT namanya di galatnya", () => {
    const issues = new RowIssues(2);
    readMapped("XXXX", "Tipe", MAP, issues);
    expect(issues.toError()?.message).toContain('"XXXX"');
  });

  it("kosong boleh punya nilai bawaan", () => {
    expect(readMapped("", "Tipe", MAP, new RowIssues(2), { fallback: "cash_bank" })).toBe(
      "cash_bank"
    );
  });
});

describe("teks", () => {
  it("kosong dan kepanjangan sama-sama ditolak, dengan kalimat yang berbeda", () => {
    const kosong = new RowIssues(2);
    requiredText("", "Nama", 10, kosong);
    expect(kosong.toError()?.message).toContain("kosong");

    const panjang = new RowIssues(2);
    requiredText("x".repeat(11), "Nama", 10, panjang);
    expect(panjang.toError()?.message).toContain("10 karakter");
  });
});

describe("bagian bulat yang bukan angka di locale mana pun ditolak", () => {
  it("kelompok ribuan harus tiga digit", () => {
    // `1.2.3.4` bukan angka di locale mana pun. Menerimanya sebagai 1234
    // adalah "berhasil tanpa galat" — bentuk kegagalan yang paling mahal untuk
    // berkas berisi saldo pelanggan.
    expect(parseAmount("1.2.3.4")).toBeNull();
    expect(parseAmount("12.34.567")).toBeNull();
    expect(parseAmount("1.2345")).toBeNull();
  });

  it("dua jenis pemisah di bagian bulat ditolak", () => {
    expect(parseAmount("1.234,567.89")).toBeNull();
  });

  it("yang benar tetap diterima", () => {
    expect(parseAmount("123")).toBe(123);
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("12.345.678,90")).toBe(12345678.9);
    expect(parseAmount("-999")).toBe(-999);
  });
});
