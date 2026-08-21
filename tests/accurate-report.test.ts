/**
 * Pembaca ekspor laporan Accurate + parser Rincian Buku Besar (inti murni).
 *
 * Fixture-nya SINTETIS, dan itu disengaja dua kali:
 *  • berkas contoh yang memicu fitur ini berisi buku besar sungguhan sebuah PT,
 *    dan `docs/accurate-reference.md` sudah menetapkan bahwa nilai spesifik PT
 *    tidak disimpan di repo — hanya struktur & aturannya;
 *  • tes yang menyusun sendiri kejanggalannya bisa menyatakan APA yang diuji.
 *
 * Yang ditiru dari berkas aslinya, satu per satu: baris judul di baris 5 (bukan
 * 1) dan diulang tiap halaman, blok kepala/kaki halaman, sel termerge yang
 * nilainya tersalin ke tiap anggotanya, kepala seksi akun dua baris, baris
 * total yang dicetak dua kali, dan — yang paling penting — sel Keterangan yang
 * TERPOTONG ganti halaman sehingga referensinya jatuh sendirian ke halaman
 * berikutnya.
 */
import { describe, it, expect } from "vitest";
import {
  flattenAccurateReport,
  isAccurateReport,
  readAccurateReport,
} from "@/lib/accurate/report-sheet";
import { parseAccurateLedgerReport, splitLedgerDescription } from "@/lib/accurate/ledger-report";
import { parseAccurateDateText, parseAccuratePeriod } from "@/lib/accurate/dates";

/** Baris spanduk: satu nilai tersalin ke kolom B..S, seperti hasil merge. */
function banner(text: string): unknown[] {
  const row: unknown[] = [""];
  for (let i = 1; i <= 18; i += 1) row.push(text);
  return row;
}

/** Baris data: sel per INDEKS kolom (0 = A). */
function cells(values: Record<number, unknown>): unknown[] {
  const max = Math.max(...Object.keys(values).map(Number));
  const row: unknown[] = [];
  for (let i = 0; i <= max; i += 1) row.push(values[i] ?? "");
  return row;
}

const COMPANY = "PT CONTOH ANUGERAH";
const TITLE = "Rincian Buku Besar";
const PERIOD = "Dari 01 Jan 2025 s/d 31 Des 2025";
const FILTER = "Filter berdasarkan : Kode Perkiraan";

/** Judul kolom pada posisi aslinya, "Tipe Transaksi" termerge di G:H. */
const HEADER = cells({
  4: "Tanggal",
  6: "Tipe Transaksi",
  7: "Tipe Transaksi",
  10: "Keterangan",
  12: "Debit",
  14: "Kredit",
  16: "Saldo Akhir",
});

const pageHead = () => [banner(COMPANY), banner(TITLE), banner(PERIOD), banner(FILTER)];
const pageFoot = (n: number, of: number) => {
  const page: unknown[] = [""];
  for (let i = 1; i <= 17; i += 1) page.push(`Halaman ${n}`);
  page.push(` dari ${of}`);
  return [
    [],
    banner("ACCURATE Accounting System Report"),
    [],
    banner("Tercetak pada 21 August 2026 - 09:03"),
    page,
  ];
};

const entry = (date: string, description: string, debit: number, balance: number) =>
  cells({ 4: date, 6: "Faktur Pembelian", 7: "Faktur Pembelian", 10: description, 12: debit, 14: 0, 16: balance });

/**
 * Dua halaman, dengan sel Keterangan baris terakhir halaman 1 terpotong:
 * teksnya berakhir dengan pergantian baris, dan referensinya berdiri sendiri
 * di puncak halaman 2.
 */
function twoPageSheet(): unknown[][] {
  return [
    ...pageHead(),                                        // 1–4
    HEADER,                                               // 5
    cells({ 2: "5100006004", 3: "5100006004", 4: "5100006004" }), // 6  kepala seksi: kode
    cells({ 3: "5100006004 - BIAYA ASURANSI  EKSPORT", 4: "5100006004 - BIAYA ASURANSI  EKSPORT" }), // 7
    cells({ 4: "2024-12-31", 10: "Saldo per 31 Dec 2024", 16: 0 }), // 8  saldo awal
    entry("2025-01-25", "DOC-1\nSAI 00100", 1000, 1000),  // 9
    entry("2025-02-10", "DOC-2\n", 500, 1500),            // 10 ← terpotong
    ...pageFoot(1, 2),                                    // 11–15
    ...pageHead(),                                        // 16–19
    HEADER,                                               // 20 judul kolom DIULANG
    cells({ 10: "SAI 000011" }),                          // 21 ← potongan yatim
    entry("2025-03-01", "DOC-3\nSAI 00101", 250, 1750),   // 22
    cells({ 12: 1750, 14: 0 }),                           // 23 total
    cells({ 12: 1750, 14: 0 }),                           // 24 total, dicetak dua kali
    ...pageFoot(2, 2),                                    // 25–29
  ];
}

describe("isAccurateReport", () => {
  it("mengenali laporan dari penanda kaki halamannya", () => {
    expect(isAccurateReport(twoPageSheet())).toBe(true);
  });

  it("tidak salah mengenali berkas tabel biasa", () => {
    expect(isAccurateReport([["Kode", "Nama"], ["1101", "Kas"]])).toBe(false);
  });
});

describe("readAccurateReport", () => {
  const report = readAccurateReport(twoPageSheet())!;

  it("membaca metadata dari kepala halaman", () => {
    expect(report.meta).toMatchObject({
      company: COMPANY,
      title: TITLE,
      period: PERIOD,
      filter: FILTER,
      printedAt: "21 August 2026 - 09:03",
      pageCount: 2,
    });
  });

  it("menemukan baris judul di baris 5, bukan baris 1", () => {
    expect(report.headerRow).toBe(5);
    expect(report.columnIndexes).toEqual([4, 6, 10, 12, 14, 16]);
  });

  it("membuang kepala & kaki halaman, termasuk judul kolom yang diulang", () => {
    const rowNumbers = report.rows.map((r) => r.row);
    expect(rowNumbers).not.toContain(20); // judul kolom halaman 2
    expect(rowNumbers).not.toContain(16); // nama PT halaman 2
    expect(rowNumbers).not.toContain(15); // "Halaman 1 dari 2"
  });

  it("menyimpan kepala seksi akun sebagai baris tersendiri", () => {
    const sections = report.rows.filter((r) => r.kind === "section");
    expect(sections.map((s) => s.text)).toEqual([
      "5100006004",
      "5100006004 - BIAYA ASURANSI  EKSPORT",
    ]);
  });

  it("menyambung sel yang terpotong ganti halaman, dan mencatatnya", () => {
    const joined = report.rows.find((r) => r.row === 10)!;
    expect(joined.cells[10]).toBe("DOC-2\nSAI 000011");
    // potongan yatimnya tidak lagi berdiri sebagai baris
    expect(report.rows.some((r) => r.row === 21)).toBe(false);
    expect(report.repairs).toEqual([
      { kind: "joined_wrapped_cell", row: 21, joinedInto: 10, text: "SAI 000011" },
    ]);
  });

  it("TIDAK menebak pemilik potongan bila baris sebelumnya tidak menggantung", () => {
    const sheet = [
      ...pageHead(),
      HEADER,
      entry("2025-01-25", "DOC-1\nSAI 00100", 1000, 1000), // lengkap, tak menggantung
      cells({ 10: "SAI 999" }),                            // potongan tak jelas
      ...pageFoot(1, 1),
    ];
    const result = readAccurateReport(sheet)!;
    expect(result.repairs).toEqual([{ kind: "stray_fragment", row: 7, text: "SAI 999" }]);
    // barisnya dibiarkan di tempatnya — tidak ditempelkan ke transaksi lain
    expect(result.rows.find((r) => r.row === 6)!.cells[10]).toBe("DOC-1\nSAI 00100");
  });

  it("tidak memutasi sheet masukan", () => {
    const sheet = twoPageSheet();
    const before = JSON.stringify(sheet[9]);
    readAccurateReport(sheet);
    expect(JSON.stringify(sheet[9])).toBe(before);
  });

  it("memulangkan null untuk berkas yang bukan laporan Accurate", () => {
    expect(readAccurateReport([["Kode", "Nama"], ["1101", "Kas"]])).toBeNull();
  });
});

describe("flattenAccurateReport", () => {
  const flat = flattenAccurateReport(twoPageSheet())!;

  it("meratakan jadi tabel berjudul di baris pertama", () => {
    expect(flat.rows[0]).toEqual([
      "Tanggal",
      "Tipe Transaksi",
      "Keterangan",
      "Debit",
      "Kredit",
      "Saldo Akhir",
    ]);
  });

  it("mempertahankan nomor baris ASLI di Excel", () => {
    // saldo awal(8), dua entri(9,10), entri halaman 2(22), dua total(23,24)
    expect(flat.rowNumbers).toEqual([8, 9, 10, 22, 23, 24]);
    expect(flat.rows).toHaveLength(flat.rowNumbers.length + 1);
  });

  it("membuang kepala seksi — sebuah tabel tak punya tempat untuknya", () => {
    expect(flat.rows.some((r) => String(r[0]).startsWith("5100006004"))).toBe(false);
  });
});

describe("splitLedgerDescription", () => {
  it("memisahkan nomor dokumen dari nomor referensi", () => {
    expect(splitLedgerDescription("DOC-1\nSAI 00100")).toEqual({
      description: "DOC-1",
      reference: "SAI 00100",
    });
  });

  it("sel satu baris berarti referensinya memang tidak dicetak", () => {
    expect(splitLedgerDescription("DOC-1")).toEqual({ description: "DOC-1", reference: "" });
  });
});

describe("parseAccurateLedgerReport", () => {
  const report = parseAccurateLedgerReport(twoPageSheet())!;
  const account = report.accounts[0];

  it("menyusun satu akun dari kepala seksi dua baris", () => {
    expect(report.accounts).toHaveLength(1);
    expect(account.code).toBe("5100006004");
    // spasi ganda dari laporan dirapikan
    expect(account.name).toBe("BIAYA ASURANSI EKSPORT");
  });

  it("membaca saldo awal, entri, total, dan saldo akhir", () => {
    expect(account.opening).toBe(0);
    expect(account.openingDate?.toISOString().slice(0, 10)).toBe("2024-12-31");
    expect(account.entries).toHaveLength(3);
    expect(account.sumDebit).toBe(1750);
    expect(account.sumCredit).toBe(0);
    expect(account.printedTotalDebit).toBe(1750);
    expect(account.closing).toBe(1750);
    expect(account.printedClosing).toBe(1750);
  });

  it("memakai referensi hasil sambungan, bukan menganggapnya hilang", () => {
    expect(account.entries[1].reference).toBe("SAI 000011");
    expect(account.warnings.some((w) => w.kind === "missing_reference")).toBe(false);
  });

  it("tidak mengeluh soal total yang dicetak dua kali dengan angka sama", () => {
    expect(account.warnings.some((w) => w.kind === "total_mismatch")).toBe(false);
  });

  it("saldo berjalan yang cocok tidak menghasilkan peringatan", () => {
    expect(account.warnings.some((w) => w.kind === "running_balance_mismatch")).toBe(false);
  });

  it("menemukan saldo berjalan yang TIDAK cocok", () => {
    const sheet = [
      ...pageHead(),
      HEADER,
      cells({ 2: "6101", 3: "6101" }),
      cells({ 3: "6101 - BEBAN LAIN", 4: "6101 - BEBAN LAIN" }),
      entry("2025-01-25", "DOC-1\nREF-1", 1000, 1000),
      entry("2025-02-10", "DOC-2\nREF-2", 500, 9999), // seharusnya 1500
      ...pageFoot(1, 1),
    ];
    const parsed = parseAccurateLedgerReport(sheet)!;
    const mismatch = parsed.accounts[0].warnings.filter(
      (w) => w.kind === "running_balance_mismatch"
    );
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].row).toBe(9);
  });

  it("menandai referensi ganda bernominal sama sebagai kandidat pembukuan ganda", () => {
    const sheet = [
      ...pageHead(),
      HEADER,
      cells({ 2: "6101", 3: "6101" }),
      cells({ 3: "6101 - BEBAN LAIN", 4: "6101 - BEBAN LAIN" }),
      entry("2025-01-25", "DOC-A\nSAI 000069", 468313, 468313),
      entry("2025-02-10", "DOC-B\nSAI 000069", 468313, 936626),
      ...pageFoot(1, 1),
    ];
    const parsed = parseAccurateLedgerReport(sheet)!;
    const duplicates = parsed.accounts[0].warnings.filter(
      (w) => w.kind === "duplicate_reference"
    );
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].message).toContain("SAI 000069");
  });

  it("membaca akun bersaldo normal KREDIT tanpa diberi tahu tipenya", () => {
    // Debit MENURUNKAN saldo → arahnya disimpulkan dari saldo yang dicetak.
    const sheet = [
      ...pageHead(),
      HEADER,
      cells({ 2: "2101", 3: "2101" }),
      cells({ 3: "2101 - UTANG USAHA", 4: "2101 - UTANG USAHA" }),
      cells({ 4: "2024-12-31", 10: "Saldo per 31 Dec 2024", 16: 5000 }),
      cells({ 4: "2025-01-10", 10: "BAYAR-1\nREF-1", 12: 2000, 14: 0, 16: 3000 }),
      cells({ 4: "2025-01-20", 10: "TERIMA-1\nREF-2", 12: 0, 14: 1000, 16: 4000 }),
      ...pageFoot(1, 1),
    ];
    const parsed = parseAccurateLedgerReport(sheet)!;
    const utang = parsed.accounts[0];
    expect(utang.closing).toBe(4000);
    expect(utang.warnings.some((w) => w.kind === "running_balance_mismatch")).toBe(false);
  });

  it("menyebut kolom wajib yang hilang alih-alih memulangkan akun kosong", () => {
    const sheet = [
      ...pageHead(),
      cells({ 4: "Tanggal", 10: "Keterangan" }), // tanpa Debit/Kredit
      entry("2025-01-25", "DOC-1", 1000, 1000),
      ...pageFoot(1, 1),
    ];
    const parsed = parseAccurateLedgerReport(sheet)!;
    expect(parsed.missingColumns).toEqual(["Debit", "Kredit"]);
    expect(parsed.accounts).toEqual([]);
  });
});

describe("tanggal bergaya Accurate", () => {
  it("membaca nama bulan Indonesia maupun Inggris", () => {
    expect(parseAccurateDateText("31 Des 2025")?.toISOString().slice(0, 10)).toBe("2025-12-31");
    expect(parseAccurateDateText("31 Dec 2024")?.toISOString().slice(0, 10)).toBe("2024-12-31");
    expect(parseAccurateDateText("01 Agustus 2026")?.toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("menolak tanggal yang tidak ada", () => {
    expect(parseAccurateDateText("31 Feb 2025")).toBeNull();
    expect(parseAccurateDateText("bukan tanggal")).toBeNull();
  });

  it("membaca rentang dari kepala laporan", () => {
    const period = parseAccuratePeriod(PERIOD)!;
    expect(period.from.toISOString().slice(0, 10)).toBe("2025-01-01");
    expect(period.to.toISOString().slice(0, 10)).toBe("2025-12-31");
  });

  it("memulangkan null bila periodenya tidak ada", () => {
    expect(parseAccuratePeriod(null)).toBeNull();
  });
});
