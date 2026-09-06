/**
 * PEMBATALAN TUTUP BUKU (issue #555, langkah 3) — kenapa jurnal lawannya
 * bertipe `closing`, bukan `reversal`.
 *
 * ══ BAHAYANYA NYATA, DAN DIBUKTIKAN DI SINI ════════════════════════════════
 * `reverseJournal()` menerbitkan jurnal bertipe `reversal`. Laba Rugi hanya
 * mengecualikan tipe `closing`. Jadi pembalikan sebuah jurnal penutup akan IKUT
 * TERBACA sebagai pendapatan dan beban — dan menutup lalu membatalkan membuat
 * Laba Rugi melaporkan pendapatan DUA KALI lipat.
 *
 * Berkas ini tidak menyatakan bahaya itu, ia MEMPERAGAKANNYA: kasus pertama
 * memakai tipe yang salah dan menunjukkan angkanya berlipat; kasus kedua
 * memakai tipe yang benar dan menunjukkan bukunya kembali seperti semula.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createFakeReportClient } from "./fake-client";
import { getBalanceSheet, getIncomeStatement } from "@/lib/reports";
import { CLOSING_JOURNAL_TYPE } from "@/lib/year-close";

const KAS = 1;
const PENJUALAN = 2;
const BEBAN = 3;
const LABA_DITAHAN = 4;

const ACCOUNTS = [
  { id: KAS, code: "1101", name: "Kas", type: "cash_bank", normalBalance: "debit" },
  { id: PENJUALAN, code: "4101", name: "Penjualan", type: "revenue", normalBalance: "credit" },
  { id: BEBAN, code: "6101", name: "Beban Gaji", type: "expense", normalBalance: "debit" },
  { id: LABA_DITAHAN, code: "3102", name: "Laba Ditahan", type: "equity", normalBalance: "credit" },
];

const AWAL = new Date(2026, 0, 1);
const AKHIR = new Date(2026, 11, 31, 23, 59, 59, 999);

const OPERASIONAL = [
  {
    date: new Date(2026, 2, 10),
    lines: [
      { accountId: KAS, debit: 1_000_000_000 },
      { accountId: PENJUALAN, credit: 1_000_000_000 },
    ],
  },
  {
    date: new Date(2026, 5, 20),
    lines: [
      { accountId: BEBAN, debit: 400_000_000 },
      { accountId: KAS, credit: 400_000_000 },
    ],
  },
];

const PENUTUP = {
  date: AKHIR,
  type: CLOSING_JOURNAL_TYPE,
  lines: [
    { accountId: PENJUALAN, debit: 1_000_000_000 },
    { accountId: BEBAN, credit: 400_000_000 },
    { accountId: LABA_DITAHAN, credit: 600_000_000 },
  ],
};

/** Jurnal lawan penutup — tipenya jadi variabel percobaan di sini. */
const lawan = (type: string) => ({
  date: AKHIR,
  type,
  lines: [
    { accountId: PENJUALAN, credit: 1_000_000_000 },
    { accountId: BEBAN, debit: 400_000_000 },
    { accountId: LABA_DITAHAN, debit: 600_000_000 },
  ],
});

const buku = (journals: unknown[]) =>
  createFakeReportClient({ accounts: ACCOUNTS, journals: journals as never });

describe("tipe jurnal lawan menentukan benar-salahnya", () => {
  it("⚠ dengan tipe `reversal`, Laba Rugi melaporkan pendapatan DUA KALI lipat", async () => {
    /*
     * Inilah yang akan terjadi kalau pembatalan memakai `reverseJournal()`.
     * Penutupnya tersaring (tipe `closing`), tetapi LAWANNYA tidak — dan
     * lawannya mengkredit Penjualan sebesar 1 M sekali lagi.
     *
     * Angkanya masuk akal, jurnalnya seimbang, neracanya benar. Hanya laporan
     * laba ruginya yang berbohong, dan tidak ada satu galat pun yang muncul.
     */
    const is = await getIncomeStatement(AWAL, AKHIR, buku([...OPERASIONAL, PENUTUP, lawan("reversal")]) as never);

    expect(is.totalRevenue).toBe(2_000_000_000); // seharusnya 1 M
    expect(is.netIncome).toBe(1_200_000_000); // seharusnya 600 jt
  });

  it("dengan tipe `closing`, Laba Rugi tetap seperti semula", async () => {
    const is = await getIncomeStatement(
      AWAL,
      AKHIR,
      buku([...OPERASIONAL, PENUTUP, lawan(CLOSING_JOURNAL_TYPE)]) as never
    );

    expect(is.totalRevenue).toBe(1_000_000_000);
    expect(is.netIncome).toBe(600_000_000);
  });

  it("dan Neraca kembali persis ke keadaan sebelum ditutup", async () => {
    /* Keduanya terlihat oleh Neraca dan saling menghapus — Laba Ditahan kembali
       nol, akumulasi laba rugi kembali penuh. */
    const sebelum = await getBalanceSheet(AKHIR, buku(OPERASIONAL) as never);
    const sesudah = await getBalanceSheet(
      AKHIR,
      buku([...OPERASIONAL, PENUTUP, lawan(CLOSING_JOURNAL_TYPE)]) as never
    );

    expect(sesudah.netIncome).toBe(sebelum.netIncome);
    expect(sesudah.equity.find((l) => l.code === "3102")).toBeUndefined();
    expect(sesudah.totalLiabilitiesEquity).toBe(sebelum.totalLiabilitiesEquity);
  });
});

describe("layanannya memang menulis tipe yang benar", () => {
  /*
   * KOMENTARNYA DIBUANG lebih dulu. Berkas layanannya MENJELASKAN kenapa
   * `reverseJournal()` tidak dipakai, jadi penyapuan mentah akan menemukan
   * namanya di dalam penjelasan itu sendiri dan memerah untuk kode yang justru
   * benar. Yang dijaga PEMANGGILAN, bukan penyebutan — pola `bersih()` di
   * `tests/scheduler-heartbeat`.
   */
  const src = readFileSync(join(__dirname, "..", "src", "lib", "year-close-service.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("pembatalan memposting bertipe `closing`, dan TIDAK memakai reverseJournal()", () => {
    /* Dibaca dari sumbernya — pola `health-probe-scope`. Kasus di atas
       membuktikan bahayanya; yang ini menjaga agar jalannya tidak diambil. */
    expect(src).not.toMatch(/\breverseJournal\s*\(/);
    const undo = src.slice(src.indexOf("export async function reverseYearClose"));
    expect(undo).toContain("type: CLOSING_JOURNAL_TYPE");
  });

  it("tanggal jurnal lawan mengikuti jurnal ASLINYA, bukan hari ini", () => {
    /* Pembatalan harus mengembalikan neraca TANGGAL ITU. Jurnal lawan
       bertanggal hari ini meninggalkan neraca akhir tahun tetap tertutup
       sementara neraca hari ini terbuka — dua tanggal yang tidak sepakat. */
    const undo = src.slice(src.indexOf("export async function reverseYearClose"));
    expect(undo).toContain("date: original.date");
  });

  it("penutupan bertanggal akhir TAHUN BUKU, bukan hari dijalankannya", () => {
    /* Kalau tidak, Laba Rugi tahun itu berubah sesudah dilaporkan — dan laporan
       yang sudah diserahkan ke bank tidak lagi bisa dihasilkan ulang dari
       bukunya sendiri. */
    const close = src.slice(
      src.indexOf("export async function closeYear"),
      src.indexOf("export async function reverseYearClose")
    );
    expect(close).toContain("fiscalYearBounds");
    expect(close).toContain("date: end");
  });
});
