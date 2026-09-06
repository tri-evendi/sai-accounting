/**
 * LAPORAN PERUBAHAN EKUITAS (issue #555, langkah 5).
 *
 * Seluruh nilai laporan ini ada pada satu sifat: **saldo akhirnya sama dengan
 * ekuitas di Neraca pada tanggal yang sama.** Laporan yang tidak berjumlah
 * demikian lebih buruk daripada tidak ada — ia terbaca resmi, ia
 * ditandatangani, dan ia membantah laporan di sebelahnya.
 *
 * Karena itu berkas ini menguji rekonsiliasinya terhadap `getBalanceSheet()`
 * yang SUNGGUHAN, bukan terhadap angka yang diketik ulang di sini.
 */
import { describe, expect, it } from "vitest";

import { createFakeReportClient } from "./fake-client";
import { getBalanceSheet, getEquityStatement } from "@/lib/reports";
import { buildEquityStatement, equityReconciles } from "@/lib/equity-statement";
import { balanceSheetEquityTotal } from "@/lib/statement-layout";
import { CLOSING_JOURNAL_TYPE } from "@/lib/year-close";

const KAS = 1;
const PENJUALAN = 2;
const BEBAN = 3;
const MODAL = 4;
const LABA_DITAHAN = 5;
const PRIVE = 6;

const ACCOUNTS = [
  { id: KAS, code: "1101", name: "Kas", type: "cash_bank", normalBalance: "debit" },
  { id: PENJUALAN, code: "4101", name: "Penjualan", type: "revenue", normalBalance: "credit" },
  { id: BEBAN, code: "6101", name: "Beban Gaji", type: "expense", normalBalance: "debit" },
  { id: MODAL, code: "3101", name: "Modal", type: "equity", normalBalance: "credit" },
  { id: LABA_DITAHAN, code: "3102", name: "Laba Ditahan", type: "equity", normalBalance: "credit" },
  { id: PRIVE, code: "3103", name: "Prive", type: "equity", normalBalance: "debit" },
];

const AWAL = new Date(2026, 0, 1);
const AKHIR = new Date(2026, 11, 31, 23, 59, 59, 999);

/** Modal awal disetor 2025; 2026: laba 600 jt, setoran 200 jt, prive 50 jt. */
const JOURNALS = [
  {
    date: new Date(2025, 5, 1),
    lines: [
      { accountId: KAS, debit: 1_000_000_000 },
      { accountId: MODAL, credit: 1_000_000_000 },
    ],
  },
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
  {
    date: new Date(2026, 6, 1),
    lines: [
      { accountId: KAS, debit: 200_000_000 },
      { accountId: MODAL, credit: 200_000_000 },
    ],
  },
  {
    date: new Date(2026, 8, 9),
    lines: [
      { accountId: PRIVE, debit: 50_000_000 },
      { accountId: KAS, credit: 50_000_000 },
    ],
  },
];

const buku = (extra: unknown[] = []) =>
  createFakeReportClient({
    accounts: ACCOUNTS,
    journals: [...JOURNALS, ...extra] as never,
    fiscalYearStart: new Date(2025, 0, 1),
  });

describe("rekonsiliasi dengan Neraca — sifat yang membuat laporan ini berguna", () => {
  it("saldo akhir = ekuitas di Neraca pada tanggal yang sama", async () => {
    const client = buku();
    const laporan = await getEquityStatement(AWAL, AKHIR, client as never);
    const neraca = await getBalanceSheet(AKHIR, client as never);

    expect(equityReconciles(laporan, balanceSheetEquityTotal(neraca))).toBe(true);
    expect(laporan.totalClosing).toBe(1_750_000_000); // 1 M + 200 jt − 50 jt + 600 jt
  });

  it("tetap rekonsiliasi SESUDAH tahun buku ditutup", async () => {
    /*
     * Kasus yang paling mungkin memecahkannya: tutup buku memindahkan laba dari
     * "belum ditutup" ke Laba Ditahan. Kalau laporan ini menghitung salah satu
     * sisinya sendiri, total akhirnya akan bergeser persis sebesar laba itu.
     */
    const penutup = {
      date: AKHIR,
      type: CLOSING_JOURNAL_TYPE,
      lines: [
        { accountId: PENJUALAN, debit: 1_000_000_000 },
        { accountId: BEBAN, credit: 400_000_000 },
        { accountId: LABA_DITAHAN, credit: 600_000_000 },
      ],
    };
    const client = buku([penutup]);
    const laporan = await getEquityStatement(AWAL, AKHIR, client as never);
    const neraca = await getBalanceSheet(AKHIR, client as never);

    expect(equityReconciles(laporan, balanceSheetEquityTotal(neraca))).toBe(true);
    /* Totalnya TIDAK berubah oleh penutupan — hanya kolomnya yang pindah. */
    expect(laporan.totalClosing).toBe(1_750_000_000);
    expect(laporan.unclosedIncome.closing).toBe(0);
    expect(
      laporan.components.find((c) => c.code === "3102")?.closing
    ).toBe(600_000_000);
  });
});

describe("ia menjelaskan PERUBAHANNYA, bukan hanya saldonya", () => {
  it("setoran dan penarikan tampil terpisah, bukan sebagai mutasi bersih", async () => {
    /* Satu kolom "mutasi bersih" menyembunyikan setoran 500 jt yang diikuti
       prive 500 jt pada periode yang sama — dua peristiwa yang sangat berbeda
       artinya, tampil sebagai nol. */
    const laporan = await getEquityStatement(AWAL, AKHIR, buku() as never);

    const modal = laporan.components.find((c) => c.code === "3101")!;
    expect(modal.opening).toBe(1_000_000_000);
    expect(modal.additions).toBe(200_000_000);
    expect(modal.reductions).toBe(0);
    expect(modal.closing).toBe(1_200_000_000);

    const prive = laporan.components.find((c) => c.code === "3103")!;
    expect(prive.reductions).toBe(50_000_000);
    expect(prive.additions).toBe(0);
  });

  it("laba belum ditutup adalah komponen TANPA akun, dan tetap ditampilkan", async () => {
    /* Ia memang tidak punya akun — itulah keadaan yang membuat laporan ini
       perlu ada. Menyembunyikannya membuat saldo akhir tidak berjumlah ekuitas
       di Neraca. */
    const laporan = await getEquityStatement(AWAL, AKHIR, buku() as never);
    expect(laporan.unclosedIncome.opening).toBe(0);
    expect(laporan.unclosedIncome.movement).toBe(600_000_000);
    expect(laporan.unclosedIncome.closing).toBe(600_000_000);
  });

  it("akun ekuitas yang tidak bersaldo dan tidak bergerak dilewati", async () => {
    const laporan = await getEquityStatement(AWAL, AKHIR, buku() as never);
    // Laba Ditahan belum tersentuh pada skenario tanpa penutupan.
    expect(laporan.components.some((c) => c.code === "3102")).toBe(false);
  });
});

describe("bentuk murninya", () => {
  it("pergerakan laba belum ditutup DITURUNKAN, bukan dijumlahkan sendiri", () => {
    /* Ia memikul dua hal sekaligus — laba yang lahir periode ini DAN laba yang
       dipindahkan keluar oleh tutup buku. Menghitungnya dari salah satu saja
       membuat saldo akhirnya meleset persis sebesar yang lain. */
    const st = buildEquityStatement({
      components: [],
      openingUnclosedIncome: 100,
      closingUnclosedIncome: 30,
    });
    expect(st.unclosedIncome.movement).toBe(-70);
    expect(st.totalClosing).toBe(30);
  });

  it("rekonsiliasi menolak selisih satu sen", () => {
    const st = buildEquityStatement({
      components: [],
      openingUnclosedIncome: 0,
      closingUnclosedIncome: 100,
    });
    expect(equityReconciles(st, 100)).toBe(true);
    expect(equityReconciles(st, 100.01)).toBe(false);
  });
});
