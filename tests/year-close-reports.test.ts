/**
 * LAPORAN SESUDAH TUTUP BUKU TAHUNAN (issue #555, langkah 2).
 *
 * ══ Bentuk kegagalan yang dijaga di sini ═══════════════════════════════════
 * Jurnal penutup menolkan setiap akun laba rugi. Sebuah laporan Laba Rugi yang
 * menjumlahkan SELURUH baris akan menjumlahkan penutupnya juga, dan melaporkan
 * laba **nol** untuk tahun yang baru saja ditutup.
 *
 * Itu kegagalan yang paling meyakinkan bentuknya: laporannya terbit, seimbang,
 * rapi, dan seluruhnya nol — dan pembacanya menyimpulkan perusahaannya tidak
 * menghasilkan apa-apa tahun itu. Tidak ada satu pun galat yang muncul.
 *
 * ⚠ Penjaga ini hanya berarti kalau fake-nya BENAR-BENAR menyaring
 * `journal.type`. Sampai langkah ini ia tidak — `LineWhere` cuma mengenal
 * `date`, jadi penyaring penutup akan diabaikan diam-diam dan tes ini lulus
 * tanpa menguji apa pun. Karena itu kemampuan itu ditambahkan ke fake lebih
 * dulu, dan kasus terakhir di berkas ini membuktikan penyaringnya memang
 * bekerja.
 */
import { describe, expect, it } from "vitest";

import { createFakeReportClient } from "./fake-client";
import { getBalanceSheet, getIncomeStatement, getTrialBalance } from "@/lib/reports";
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

/** Setahun perdagangan: jual 1 M tunai, bayar beban 400 jt. Laba 600 jt. */
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

/** Jurnal penutup 31 Desember: nolkan laba rugi, laba ke Laba Ditahan. */
const PENUTUP = {
  date: AKHIR,
  type: CLOSING_JOURNAL_TYPE,
  lines: [
    { accountId: PENJUALAN, debit: 1_000_000_000 },
    { accountId: BEBAN, credit: 400_000_000 },
    { accountId: LABA_DITAHAN, credit: 600_000_000 },
  ],
};

const sebelum = () => createFakeReportClient({ accounts: ACCOUNTS, journals: OPERASIONAL });
const sesudah = () =>
  createFakeReportClient({ accounts: ACCOUNTS, journals: [...OPERASIONAL, PENUTUP] });

describe("Laba Rugi tahun yang ditutup TIDAK berubah", () => {
  it("laba bersihnya sama sebelum dan sesudah penutupan", async () => {
    const a = await getIncomeStatement(AWAL, AKHIR, sebelum() as never);
    const b = await getIncomeStatement(AWAL, AKHIR, sesudah() as never);

    expect(a.netIncome).toBe(600_000_000);
    expect(b.netIncome).toBe(600_000_000);
  });

  it("baris-barisnya juga sama, bukan hanya totalnya", async () => {
    /* Total yang benar di atas rincian yang salah adalah laporan yang tidak
       lagi menjumlahkan dirinya sendiri — lebih sulit terlihat daripada total
       yang salah. */
    const a = await getIncomeStatement(AWAL, AKHIR, sebelum() as never);
    const b = await getIncomeStatement(AWAL, AKHIR, sesudah() as never);

    expect(b.totalRevenue).toBe(a.totalRevenue);
    expect(b.totalExpense).toBe(a.totalExpense);
    expect(b.revenue).toEqual(a.revenue);
    expect(b.expense).toEqual(a.expense);
  });
});

describe("Neraca JUSTRU harus memasukkan jurnal penutup", () => {
  it("Laba Ditahan menerima labanya, dan akumulasi laba rugi menjadi nol", async () => {
    /* Kebalikan dari Laba Rugi, dan itulah sebabnya penyaringnya bawaan MATI:
       di sinilah Laba Ditahan memperoleh saldonya. */
    const neraca = await getBalanceSheet(AKHIR, sesudah() as never);

    const re = neraca.equity.find((l) => l.code === "3102");
    expect(re?.amount).toBe(600_000_000);
    expect(neraca.netIncome).toBe(0);
  });

  it("total ekuitas TIDAK berubah oleh penutupan — hanya barisnya yang pindah", async () => {
    /*
     * Invarian terpenting seluruh #555. Kalau penutupan menggeser total
     * ekuitas, ia menciptakan atau menghapus kekayaan yang tidak pernah ada —
     * dan neracanya akan tetap seimbang sambil berbohong.
     */
    const a = await getBalanceSheet(AKHIR, sebelum() as never);
    const b = await getBalanceSheet(AKHIR, sesudah() as never);

    expect(b.totalLiabilitiesEquity).toBe(a.totalLiabilitiesEquity);
    expect(b.totalAssets).toBe(a.totalAssets);
    expect(a.balanced).toBe(true);
    expect(b.balanced).toBe(true);
  });
});

describe("Neraca Saldo memakai buku besar apa adanya", () => {
  it("sesudah penutupan, akun laba rugi bersaldo nol di sana", async () => {
    /* Ia BUKAN laporan laba rugi: ia potret buku besar, dan sesudah tutup buku
       akun laba rugi memang nol. Menyaring penutup di sini akan membuat neraca
       saldo tidak lagi cocok dengan buku yang diwakilinya. */
    const tb = await getTrialBalance(AKHIR, sesudah() as never);

    /*
     * Penjualan TETAP MUNCUL, bersaldo nol — dan itu perilaku yang benar, bukan
     * kelalaian: `getTrialBalance` sengaja hanya membuang akun yang TIDAK
     * BERGERAK sama sekali. Akun yang debit dan kreditnya saling menghapus
     * PUNYA riwayat, dan menyembunyikannya membuat neraca saldo pasca-tutup
     * kehilangan justru baris-baris yang membuktikan penutupannya terjadi.
     *
     * (Dugaan pertama saya keliru di sini — saya menyangka barisnya hilang.
     * Yang salah tesnya, bukan laporannya.)
     */
    const penjualan = tb.rows.find((r) => r.code === "4101");
    expect(penjualan).toBeDefined();
    expect(penjualan?.debit).toBe(0);
    expect(penjualan?.credit).toBe(0);

    const re = tb.rows.find((r) => r.code === "3102");
    expect(re?.credit).toBe(600_000_000);
  });
});

describe("penjaganya benar-benar bisa merah", () => {
  it("fake BENAR-BENAR menyaring `journal.type` — bukan mengabaikannya", async () => {
    /*
     * Tanpa kasus ini, seluruh berkas ini bisa hijau sambil tidak menguji apa
     * pun: sebuah fake yang tidak mengerti `type: { not }` akan memulangkan
     * seluruh baris, dan Laba Rugi "yang mengecualikan penutup" sebenarnya
     * tidak mengecualikan apa-apa.
     *
     * Dibuktikan dari arah sebaliknya: dengan penyaring DIMATIKAN (Neraca),
     * jurnal penutup memang terlihat. Kalau fake-nya buta, kedua angka di bawah
     * akan sama dan tes ini gagal.
     */
    const neraca = await getBalanceSheet(AKHIR, sesudah() as never);
    const labaRugi = await getIncomeStatement(AWAL, AKHIR, sesudah() as never);

    expect(neraca.netIncome).toBe(0); // penutup TERLIHAT
    expect(labaRugi.netIncome).toBe(600_000_000); // penutup TERSARING
    expect(neraca.netIncome).not.toBe(labaRugi.netIncome);
  });
});

/**
 * PEMISAHAN EKUITAS (issue #555, langkah 4).
 *
 * Baris "Akumulasi Laba/Rugi" menjawab satu pertanyaan sampai #555, dan dua
 * sesudahnya: berapa laba TAHUN BERJALAN, dan berapa yang tertinggal dari tahun
 * buku yang terlewat ditutup. Yang kedua biasanya nol — dan ketika tidak, ia
 * justru kabar yang paling perlu diketahui.
 */
describe("pemisahan Laba Tahun Berjalan dari tahun lalu yang belum ditutup", () => {
  const AWAL_TAHUN_BUKU = new Date(2020, 0, 1); // tahun buku kalender

  /** 2025 menghasilkan 100 jt, 2026 menghasilkan 600 jt. Tak satu pun ditutup. */
  const DUA_TAHUN = [
    {
      date: new Date(2025, 4, 5),
      lines: [
        { accountId: KAS, debit: 100_000_000 },
        { accountId: PENJUALAN, credit: 100_000_000 },
      ],
    },
    ...OPERASIONAL,
  ];

  const bukuDuaTahun = () =>
    createFakeReportClient({
      accounts: ACCOUNTS,
      journals: DUA_TAHUN,
      fiscalYearStart: AWAL_TAHUN_BUKU,
    });

  it("memisahkan keduanya, dan keduanya berjumlah `netIncome`", async () => {
    const neraca = await getBalanceSheet(AKHIR, bukuDuaTahun() as never);

    expect(neraca.currentYearIncome).toBe(600_000_000);
    expect(neraca.priorUnclosedIncome).toBe(100_000_000);
    /* Invarian yang menjaga `balanceSheetEquityTotal` (#258) tetap satu rumus:
       pecahannya tidak boleh menjadi penjumlahan kedua yang menyimpang. */
    expect(neraca.currentYearIncome! + neraca.priorUnclosedIncome!).toBe(neraca.netIncome);
  });

  it("tahun buku NON-kalender memindahkan batasnya", async () => {
    /* Tahun buku mulai 1 April. Penjualan 5 Mei 2025 ada di tahun buku 2025;
       transaksi Maret 2026 dan Juni 2026 jatuh di sisi yang BERBEDA. */
    const buku = createFakeReportClient({
      accounts: ACCOUNTS,
      journals: DUA_TAHUN,
      fiscalYearStart: new Date(2020, 3, 1),
    });
    const neraca = await getBalanceSheet(AKHIR, buku as never);

    /* Penjualan 10 Maret 2026 masih tahun buku 2025; beban 20 Juni 2026 sudah
       tahun buku 2026. Jadi tahun berjalan hanya memikul bebannya. */
    expect(neraca.currentYearIncome).toBe(-400_000_000);
    expect(neraca.currentYearIncome! + neraca.priorUnclosedIncome!).toBe(neraca.netIncome);
  });

  it("tanpa awal tahun buku, TIDAK ada yang dipecah — dan itu bukan nol", async () => {
    /*
     * Buku yang belum menyetel awal tahun bukunya tidak bisa dipecah, dan
     * menebaknya akan memisahkan laba pada tanggal yang salah. Yang benar:
     * seluruh `netIncome` tetap menjadi satu baris, persis seperti sebelum
     * #555 — bukan `currentYearIncome: 0`, yang akan menampilkan laba nol untuk
     * buku yang jelas menghasilkan.
     */
    const neraca = await getBalanceSheet(
      AKHIR,
      createFakeReportClient({ accounts: ACCOUNTS, journals: DUA_TAHUN }) as never
    );

    expect(neraca.currentYearIncome).toBe(neraca.netIncome);
    expect(neraca.priorUnclosedIncome).toBe(0);
  });

  it("sesudah 2025 ditutup, sisa tahun lalu menjadi nol", async () => {
    const penutup2025 = {
      date: new Date(2025, 11, 31, 23, 59, 59, 999),
      type: CLOSING_JOURNAL_TYPE,
      lines: [
        { accountId: PENJUALAN, debit: 100_000_000 },
        { accountId: LABA_DITAHAN, credit: 100_000_000 },
      ],
    };
    const neraca = await getBalanceSheet(
      AKHIR,
      createFakeReportClient({
        accounts: ACCOUNTS,
        journals: [...DUA_TAHUN, penutup2025],
        fiscalYearStart: AWAL_TAHUN_BUKU,
      }) as never
    );

    expect(neraca.priorUnclosedIncome).toBe(0);
    expect(neraca.currentYearIncome).toBe(600_000_000);
    expect(neraca.equity.find((l) => l.code === "3102")?.amount).toBe(100_000_000);
  });
});
