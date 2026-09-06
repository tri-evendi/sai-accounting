/**
 * KOLOM PEMBANDING (issue #557) — penyandingan dan rentangnya.
 *
 * Tiga sifat yang, bila salah, menghasilkan laporan yang terbaca resmi dan
 * membandingkan hal yang bukan tandingannya:
 *
 *   1. akun yang hanya ada di satu periode tidak boleh hilang;
 *   2. persen atas dasar NOL bukan angka;
 *   3. Neraca dibandingkan pada TANGGAL, Laba Rugi pada RENTANG.
 */
import { describe, expect, it } from "vitest";

import {
  compareLines,
  comparisonDate,
  comparisonRange,
  type ComparableLine,
} from "@/lib/statement-compare";

const l = (code: string, name: string, amount: number): ComparableLine => ({ code, name, amount });

describe("penyandingan baris", () => {
  it("menghitung selisih dan persennya", () => {
    const r = compareLines([l("4101", "Penjualan", 120)], [l("4101", "Penjualan", 100)]);
    expect(r[0]).toEqual({
      code: "4101",
      name: "Penjualan",
      current: 120,
      prior: 100,
      delta: 20,
      percent: 20,
    });
  });

  it("akun yang hanya ada di periode BERJALAN dapat nol di sisi pembanding", () => {
    const r = compareLines([l("6102", "Beban Baru", 50)], []);
    expect(r[0].prior).toBe(0);
    expect(r[0].delta).toBe(50);
  });

  it("⚠ akun yang hanya ada di periode PEMBANDING tetap muncul", () => {
    /* Akun yang bersaldo tahun lalu dan nol tahun ini adalah informasi — sering
       justru yang paling ingin dilihat. Membuangnya juga membuat kolom
       pembanding berhenti berjumlah total periode pembandingnya. */
    const r = compareLines([l("4101", "Penjualan", 100)], [l("6109", "Beban Lama", 30)]);
    expect(r).toHaveLength(2);
    const lama = r.find((x) => x.code === "6109")!;
    expect(lama.current).toBe(0);
    expect(lama.prior).toBe(30);
    expect(lama.delta).toBe(-30);
    expect(lama.percent).toBe(-100);
  });

  it("urutannya mengikuti periode BERJALAN; yang lama menyusul di belakang", () => {
    /* Kalau dicampur menurut kode, susunan laporan berjalan berubah hanya
       karena sebuah akun lama ikut tampil — dan pembaca yang hafal letak
       barisnya kehilangan pegangan. */
    const r = compareLines(
      [l("6200", "Zeta", 1), l("4101", "Alpha", 2)],
      [l("1000", "Lama A", 3), l("0500", "Lama B", 4)]
    );
    expect(r.map((x) => x.code)).toEqual(["6200", "4101", "0500", "1000"]);
  });
});

describe("persen atas dasar nol", () => {
  it("pembanding NOL → persennya null, bukan Infinity", () => {
    const r = compareLines([l("4101", "Penjualan", 100)], [l("4101", "Penjualan", 0)]);
    expect(r[0].percent).toBeNull();
    expect(Number.isFinite(r[0].delta)).toBe(true);
  });

  it("keduanya nol → tetap null, bukan NaN", () => {
    const r = compareLines([l("4101", "x", 0)], [l("4101", "x", 0)]);
    expect(r[0].percent).toBeNull();
  });

  it("pembanding NEGATIF memakai nilai mutlaknya sebagai dasar", () => {
    /* Rugi 100 → rugi 50 adalah PERBAIKAN 50%. Membaginya dengan −100 tanpa
       nilai mutlak memberi −50%, yang terbaca sebagai memburuk. */
    const r = compareLines([l("x", "x", -50)], [l("x", "x", -100)]);
    expect(r[0].delta).toBe(50);
    expect(r[0].percent).toBe(50);
  });
});

describe("rentang pembanding", () => {
  const dari = new Date(2026, 0, 1, 0, 0, 0, 0);
  const sampai = new Date(2026, 0, 31, 23, 59, 59, 999);

  it("`previous_year` menggeser tahunnya, bukan panjangnya", () => {
    const r = comparisonRange(dari, sampai, "previous_year");
    expect(r.from.getFullYear()).toBe(2025);
    expect(r.from.getMonth()).toBe(0);
    expect(r.from.getDate()).toBe(1);
    expect(r.to.getFullYear()).toBe(2025);
    expect(r.to.getDate()).toBe(31);
  });

  it("`preceding` berakhir tepat satu milidetik sebelum rentang berjalan", () => {
    /* Tanpa satu hari pun bertumpang tindih atau terlewat. */
    const r = comparisonRange(dari, sampai, "preceding");
    expect(dari.getTime() - r.to.getTime()).toBe(1);
  });

  it("⚠ `preceding` memakai PANJANG rentangnya, bukan bulan kalender", () => {
    /* Rentang 45 hari dibandingkan dengan 45 hari sebelumnya. Membandingkannya
       dengan satu bulan kalender menghasilkan selisih yang seluruhnya artefak
       panjang periode, dan pembacanya tidak punya cara mengetahuinya. */
    const r = comparisonRange(dari, sampai, "preceding");
    expect(r.to.getTime() - r.from.getTime()).toBe(sampai.getTime() - dari.getTime());
  });
});

describe("tanggal pembanding untuk Neraca", () => {
  const asOf = new Date(2026, 11, 31, 23, 59, 59, 999);

  it("`previous_year` = tanggal yang sama tahun lalu", () => {
    const d = comparisonDate(asOf, "previous_year");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
  });

  it("`preceding` = tepat sebelum periode berjalan dimulai", () => {
    const from = new Date(2026, 0, 1);
    expect(from.getTime() - comparisonDate(asOf, "preceding", from).getTime()).toBe(1);
  });

  it("`preceding` tanpa `from` jatuh ke tahun lalu, bukan menebak sebulan", () => {
    /* Menebak "sebulan" akan salah untuk rentang panjang mana pun, dan
       neraca yang salah tanggal tetap seimbang — jadi tak ada yang berbunyi. */
    expect(comparisonDate(asOf, "preceding").getFullYear()).toBe(2025);
  });
});
