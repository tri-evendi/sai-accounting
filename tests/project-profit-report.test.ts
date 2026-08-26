/**
 * PENJAGA #495 (butir 2) — laba per proyek harus berdamai dengan laba rugi
 * perusahaan.
 *
 * == Sifat yang dijaga, dan kenapa ia yang terpenting ======================
 * Sebuah laporan per-proyek yang jumlahnya TIDAK sama dengan laporan
 * perusahaan lebih berbahaya daripada tidak ada laporannya. Keduanya tampak
 * benar sendiri-sendiri; yang salah hanya terlihat oleh orang yang kebetulan
 * menjumlahkan kolomnya, dan orang itu biasanya auditor.
 *
 * Karena itu yang diuji bukan "angkanya betul untuk satu kasus", melainkan
 *
 *     Σ semua proyek + tanpa proyek ≡ laba rugi perusahaan
 *
 * sebagai sifat, atas bentuk data yang paling mungkin merusaknya: akun kontra,
 * pusat biaya nonaktif, jurnal tanpa proyek, dan akun neraca yang nyasar.
 */
import { describe, expect, it } from "vitest";

import {
  foldProjectProfit,
  type ProjectAccount,
  type ProjectCenter,
  type ProjectProfitInput,
} from "@/lib/project-profit-report";

/* Tipe akun memakai nama yang sama dengan `accountCategoryFor` di
   `lib/accounting.ts` — bukan tebakan. */
const AKUN: ProjectAccount[] = [
  { id: 1, type: "revenue" },
  { id: 2, type: "cogs" },
  { id: 3, type: "expense" },
  { id: 9, type: "cash_bank" }, // neraca — tidak boleh ikut
];

const PROYEK: ProjectCenter[] = [
  { id: 10, code: "PRJ-A", name: "Ekspor Lada" },
  { id: 20, code: "PRJ-B", name: "Jasa Pengurusan" },
];

const baris = (
  accountId: number,
  costCenterId: number | null,
  debit: number,
  credit: number
): ProjectProfitInput => ({ accountId, costCenterId, debit, credit });

describe("rekonsiliasi — sifat yang paling mahal kalau hilang", () => {
  const lines = [
    baris(1, 10, 0, 400_000_000), // pendapatan proyek A
    baris(2, 10, 298_400_000, 0), // HPP proyek A
    baris(3, 10, 24_150_000, 0), // beban proyek A
    baris(1, 20, 0, 12_000_000), // pendapatan proyek B
    baris(3, 20, 40_000_000, 0), // beban proyek B — rugi
    baris(3, null, 7_500_000, 0), // beban tanpa proyek
  ];

  it("Σ proyek + tanpa proyek = totalnya", () => {
    const { rows, total } = foldProjectProfit(lines, AKUN, PROYEK);
    const jumlah = rows.reduce((s, r) => s + r.profit, 0);
    expect(jumlah).toBe(total.profit);
  });

  it("baris 'tanpa proyek' SELALU ada, meski nol", () => {
    /* Tanpanya daftar ini tidak pernah berjumlah sama dengan laba rugi
       perusahaan, dan pembacanya tidak bisa membedakan "proyek ini tidak punya
       biaya" dari "biayanya ada tapi lupa diberi proyek". */
    const { rows } = foldProjectProfit([], AKUN, PROYEK);
    expect(rows.at(-1)!.costCenterId).toBeNull();
    expect(rows).toHaveLength(PROYEK.length + 1);
  });

  it("proyek tanpa satu pun jurnal tetap muncul", () => {
    /* Proyek yang hilang dari daftar terbaca sebagai proyek yang tidak ada,
       padahal ia proyek yang belum dibukukan. */
    const { rows } = foldProjectProfit([baris(1, 10, 0, 1_000_000)], AKUN, PROYEK);
    expect(rows.find((r) => r.costCenterId === 20)).toMatchObject({ revenue: 0, profit: 0 });
  });
});

describe("angkanya", () => {
  it("laba & margin proyek yang menghasilkan", () => {
    const { rows } = foldProjectProfit(
      [
        baris(1, 10, 0, 400_000_000),
        baris(2, 10, 298_400_000, 0),
        baris(3, 10, 24_150_000, 0),
      ],
      AKUN,
      PROYEK
    );
    const a = rows.find((r) => r.costCenterId === 10)!;
    expect(a.grossProfit).toBe(101_600_000);
    expect(a.profit).toBe(77_450_000);
    expect(a.margin).toBeCloseTo(0.1936, 4);
  });

  it("proyek yang MERUGI memulangkan laba negatif, tidak dijepit ke nol", () => {
    const { rows } = foldProjectProfit(
      [baris(1, 20, 0, 12_000_000), baris(3, 20, 40_000_000, 0)],
      AKUN,
      PROYEK
    );
    const b = rows.find((r) => r.costCenterId === 20)!;
    expect(b.profit).toBe(-28_000_000);
    expect(b.margin).toBeLessThan(0);
  });

  it("pendapatan nol → margin null, BUKAN 0", () => {
    /* "0%" di kolom margin terbaca sebagai impas — kebalikan dari keadaan
       sebuah proyek yang menyerap biaya tanpa satu rupiah pendapatan. */
    const { rows } = foldProjectProfit([baris(3, 10, 40_000_000, 0)], AKUN, PROYEK);
    const a = rows.find((r) => r.costCenterId === 10)!;
    expect(a.margin).toBeNull();
    expect(a.profit).toBe(-40_000_000);
  });
});

describe("bentuk data yang paling mungkin merusak rekonsiliasinya", () => {
  it("akun kontra: Retur Penjualan mengurangi pendapatannya sendiri", () => {
    /* Arah tanda per KATEGORI, bukan per bagian. Sebuah salinan aturan tanda
       adalah cara paling halus bagi dua laporan untuk menyimpang: keduanya
       benar sendiri-sendiri, dan hanya berbeda saat akun kontra muncul. */
    const { rows } = foldProjectProfit(
      [baris(1, 10, 0, 100_000_000), baris(1, 10, 15_000_000, 0)],
      AKUN,
      PROYEK
    );
    expect(rows.find((r) => r.costCenterId === 10)!.revenue).toBe(85_000_000);
  });

  it("jurnal milik pusat biaya yang TIDAK terdaftar tidak menguap", () => {
    /*
     * Pusat biaya yang dinonaktifkan tetap punya jurnal. Kalau baris itu
     * dibuang, jumlahnya berhenti berdamai dengan laba rugi perusahaan dan
     * tidak ada yang bisa melihat ke mana perginya — persis kegagalan yang
     * berkas ini ada untuk mencegahnya.
     */
    const { rows, total } = foldProjectProfit(
      [baris(3, 999, 5_000_000, 0)],
      AKUN,
      PROYEK
    );
    expect(total.operatingExpense).toBe(5_000_000);
    expect(rows.at(-1)!.operatingExpense).toBe(5_000_000);
    expect(rows.reduce((s, r) => s + r.profit, 0)).toBe(total.profit);
  });

  it("akun NERACA yang nyasar diabaikan, bukan dijumlahkan", () => {
    const { total } = foldProjectProfit([baris(9, 10, 900_000_000, 0)], AKUN, PROYEK);
    expect(total.profit).toBe(0);
  });

  it("akun yang tidak dikenal dilewati tanpa melempar", () => {
    /* Baris jurnal atas akun yang sudah dihapus dari daftar tidak boleh
       menjatuhkan seluruh laporan. */
    expect(() => foldProjectProfit([baris(404, 10, 1_000, 0)], AKUN, PROYEK)).not.toThrow();
  });
});
