/**
 * NERACA KOMPARATIF (issue #557).
 *
 * Dua sifat yang khas Neraca dan tidak ada di Laba Rugi:
 *
 *   1. **Sumbunya TANGGAL, bukan rentang.** Neraca pembanding yang salah
 *      tanggal tetap SEIMBANG — jadi tidak ada yang berbunyi.
 *   2. **Blok ekuitas memuat baris SINTETIS berkode kosong** ("Akumulasi
 *      Laba/Rugi" dan saudaranya sejak #555). Penyandingan berbasis kode akan
 *      menabrakkan keduanya menjadi satu.
 */
import { describe, expect, it } from "vitest";

import { balanceSheetLayout, type BalanceSheetShape } from "@/lib/statement-layout";
import { comparisonDate } from "@/lib/statement-compare";

const line = (code: string, name: string, amount: number) => ({ code, name, amount });

const buat = (over: Partial<BalanceSheetShape> = {}): BalanceSheetShape =>
  ({
    assets: [line("1101", "Kas", 1_000)],
    liabilities: [line("2101", "Hutang", 400)],
    equity: [line("3101", "Modal", 500)],
    totalAssets: 1_000,
    totalLiabilities: 400,
    totalEquity: 500,
    netIncome: 100,
    totalLiabilitiesEquity: 1_000,
    balanced: true,
    ...over,
  }) as BalanceSheetShape;

describe("neraca satu kolom tidak berubah", () => {
  it("tanpa pembanding, tidak ada medan `prior`/`percent`", () => {
    for (const r of balanceSheetLayout(buat())) {
      expect(r).not.toHaveProperty("prior");
      expect(r).not.toHaveProperty("percent");
    }
  });
});

describe("kolom pembanding", () => {
  const kini = buat();
  const lalu = buat({
    assets: [line("1101", "Kas", 800), line("1102", "Bank Lama", 50)],
    totalAssets: 850,
    netIncome: 50,
    totalLiabilitiesEquity: 850,
  });
  const rows = balanceSheetLayout(kini, undefined, lalu);

  it("baris akun membawa nilai lalu & persennya", () => {
    const kas = rows.find((r) => r.code === "1101")!;
    expect(kas.amount).toBe(1_000);
    expect(kas.prior).toBe(800);
    expect(kas.percent).toBe(25);
  });

  it("akun yang hanya ada di neraca LALU tetap muncul", () => {
    const lama = rows.find((r) => r.code === "1102")!;
    expect(lama.amount).toBe(0);
    expect(lama.prior).toBe(50);
  });

  it("⚠ baris ekuitas SINTETIS dipasangkan, tidak saling menabrak", () => {
    /*
     * "Akumulasi Laba/Rugi" berkode KOSONG di kedua periode. Kalau
     * penyandingannya berbasis kode, keduanya menjadi satu kunci dan salah
     * satunya hilang — atau lebih buruk, nilainya tertukar.
     */
    const sintetis = rows.filter((r) => r.kind === "line" && r.code === "");
    expect(sintetis).toHaveLength(1);
    expect(sintetis[0].amount).toBe(100);
    expect(sintetis[0].prior).toBe(50);
  });

  it("baris penutup membandingkan totalnya", () => {
    const total = rows.filter((r) => r.kind === "total");
    expect(total[0].amount).toBe(1_000);
    expect(total[0].prior).toBe(850);
  });

  it("judul seksi berpembanding `null`, bukan 0", () => {
    const judul = rows.find((r) => r.kind === "section")!;
    expect(judul.amount).toBeNull();
    expect(judul.prior).toBeNull();
  });
});

describe("dua baris ekuitas (tahun buku terlewat, #555) tetap berpasangan", () => {
  it("keduanya dipasangkan menurut urutan yang sama", () => {
    const dua = (cur: number, prior: number) =>
      buat({ netIncome: cur + prior, currentYearIncome: cur, priorUnclosedIncome: prior });
    const rows = balanceSheetLayout(dua(70, 30), undefined, dua(40, 10));
    const sintetis = rows.filter((r) => r.kind === "line" && r.code === "");
    expect(sintetis).toHaveLength(2);
    /* Urutannya: tahun lalu belum ditutup, lalu tahun berjalan. */
    expect(sintetis[0].amount).toBe(30);
    expect(sintetis[0].prior).toBe(10);
    expect(sintetis[1].amount).toBe(70);
    expect(sintetis[1].prior).toBe(40);
  });
});

describe("sumbu tanggal", () => {
  it("pembanding Neraca setahun sebelumnya, bukan sepanjang rentang", () => {
    const asOf = new Date(2026, 11, 31, 23, 59, 59, 999);
    expect(comparisonDate(asOf, "previous_year").getFullYear()).toBe(2025);
  });
});
