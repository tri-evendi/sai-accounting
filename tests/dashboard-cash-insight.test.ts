/**
 * PENJAGA #472 — kalimat arah kas harus menyebut angka yang SAMA dengan
 * halaman yang dibuka tautannya.
 *
 * == Keputusan yang tercatat di sini ========================================
 * Catatan #472 menahan kalimat ini karena "semantik kartunya perlu diputuskan
 * lebih dulu": kartu kas beranda menjumlah `cash_movements` PER MATA UANG dan
 * TANPA batas tanggal, dan menaruh kueri berbatas tanggal di sebelahnya
 * berisiko melahirkan dua tempat yang menyebut kas dengan angka berbeda.
 *
 * Keputusannya: **kartunya tidak berubah, dan kalimatnya tidak menyebut
 * saldo.** Kartu menjawab "berapa yang saya punya, dalam mata uang apa";
 * kalimat menjawab "berapa kas bergerak bulan ini", dalam IDR base. Sebuah
 * saldo dan sebuah selisih bukan besaran yang sama — keduanya tidak bisa
 * saling membantah, dan tidak ada pembaca yang bisa membaca yang satu sebagai
 * yang lain.
 *
 * Yang MASIH bisa salah, dan karena itu diuji di sini: selisih yang disebut
 * kalimat harus identik dengan `netChange` yang dipajang Arus Kas untuk bulan
 * yang sama. Kalau tidak, kalimatnya membantah halaman yang ia suruh buka —
 * yang lebih buruk daripada tidak ada kalimat.
 */
import { describe, expect, it } from "vitest";

import { getCashBalanceBase, getCashFlow } from "@/lib/reports";
import { buildDashboardInsights, THRESHOLD } from "@/lib/dashboard-insights";
import { createFakeReportClient, type FakeSeedJournal } from "./fake-client";

const ACCOUNTS = [
  { id: 1, code: "110101", name: "Kas Besar", type: "cash_bank", normalBalance: "debit" },
  { id: 2, code: "110103", name: "Bank", type: "cash_bank", normalBalance: "debit" },
  { id: 3, code: "410101", name: "Penjualan", type: "revenue", normalBalance: "credit" },
  { id: 4, code: "610101", name: "Beban Gaji", type: "expense", normalBalance: "debit" },
  { id: 5, code: "310101", name: "Modal", type: "equity", normalBalance: "credit" },
];

const d = (iso: string) => new Date(`${iso}T00:00:00`);

/** Akhir Juli (bulan lalu) dan akhir Agustus (bulan ini). */
const AKHIR_LALU = new Date("2026-07-31T23:59:59.999");
const AWAL_INI = d("2026-08-01");
const AKHIR_INI = new Date("2026-08-31T23:59:59.999");

const JOURNALS: FakeSeedJournal[] = [
  /* Juli: kas masuk 100 juta, keluar 20 juta → saldo akhir Juli 80 juta. */
  {
    id: 1,
    date: d("2026-07-05"),
    note: "Modal disetor",
    lines: [
      { accountId: 1, debit: 100_000_000 },
      { accountId: 5, credit: 100_000_000 },
    ],
  },
  {
    id: 2,
    date: d("2026-07-20"),
    note: "Gaji Juli",
    lines: [
      { accountId: 4, debit: 20_000_000 },
      { accountId: 1, credit: 20_000_000 },
    ],
  },
  /* Agustus: masuk 10 juta ke bank, keluar 40 juta dari kas → bergerak −30 juta. */
  {
    id: 3,
    date: d("2026-08-08"),
    note: "Penjualan tunai",
    lines: [
      { accountId: 2, debit: 10_000_000 },
      { accountId: 3, credit: 10_000_000 },
    ],
  },
  {
    id: 4,
    date: d("2026-08-25"),
    note: "Gaji Agustus",
    lines: [
      { accountId: 4, debit: 40_000_000 },
      { accountId: 1, credit: 40_000_000 },
    ],
  },
];

const client = createFakeReportClient({ accounts: ACCOUNTS, journals: JOURNALS });

describe("saldo kas base per tanggal", () => {
  it("menjumlahkan SELURUH akun kas & bank, bukan satu saja", async () => {
    /* 80 juta di kas − 40 juta gaji + 10 juta di bank = 50 juta. */
    expect(await getCashBalanceBase(AKHIR_INI, client)).toBe(50_000_000);
  });

  it("terikat tanggal: akhir bulan lalu tidak melihat mutasi bulan ini", async () => {
    expect(await getCashBalanceBase(AKHIR_LALU, client)).toBe(80_000_000);
  });
});

describe("selisihnya IDENTIK dengan netChange Arus Kas bulan yang sama", () => {
  it("kalimat dan halaman yang dibuka tautannya menyebut satu angka", async () => {
    const [thisMonth, lastMonth, cashFlow] = await Promise.all([
      getCashBalanceBase(AKHIR_INI, client),
      getCashBalanceBase(AKHIR_LALU, client),
      getCashFlow(AWAL_INI, AKHIR_INI, client),
    ]);

    expect(thisMonth - lastMonth).toBe(cashFlow.netChange);
    /* `reconciled` adalah pemeriksaan Arus Kas atas dirinya sendiri; kalau ia
       merah, pembandingan di atas kehilangan artinya. */
    expect(cashFlow.reconciled).toBe(true);
  });

  it("kalimatnya menyebut nominal yang sama dengan selisih itu", async () => {
    const thisMonth = await getCashBalanceBase(AKHIR_INI, client);
    const lastMonth = await getCashBalanceBase(AKHIR_LALU, client);
    const [insight] = buildDashboardInsights({ cash: { thisMonth, lastMonth } });

    expect(insight.id).toBe("cash-drop");
    expect(insight.values.amount).toBe(Math.abs(thisMonth - lastMonth));
    /* 30 juta dari 80 juta = 37,5% → dibulatkan 38. */
    expect(insight.values.percent).toBe(38);
    expect(insight.href).toBe("/reports/cash-flow");
  });
});

describe("diam ketika belum ada yang bisa dikatakan", () => {
  it("buku tanpa akun kas memulangkan nol, bukan melempar", async () => {
    const kosong = createFakeReportClient({
      accounts: [ACCOUNTS[2], ACCOUNTS[4]],
      journals: [],
    });
    expect(await getCashBalanceBase(AKHIR_INI, kosong)).toBe(0);
  });

  it("bulan lalu nol → tidak ada kalimat (pembagian tanpa dasar)", () => {
    /* 0 → 50 juta adalah kenaikan tak berhingga persen. Kalimat yang menyebut
       persentase atas dasar nol bukan berita, ia artefak aritmetika. */
    expect(buildDashboardInsights({ cash: { thisMonth: 50_000_000, lastMonth: 0 } })).toEqual([]);
  });

  it("pergerakan di bawah ambang tidak melahirkan kalimat", () => {
    const kecil = THRESHOLD.cashAmount - 1;
    expect(
      buildDashboardInsights({ cash: { thisMonth: 10_000_000 - kecil, lastMonth: 10_000_000 } })
    ).toEqual([]);
  });
});
