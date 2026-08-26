/**
 * BEBAN MENURUT SIFAT (issue #446).
 *
 * Yang diuji di sini adalah SIFAT-SIFAT yang membuat laporan ini boleh dipakai
 * sebagai bahan CALK — bukan sekadar bahwa fungsinya memulangkan angka.
 */
import { describe, expect, it } from "vitest";

import {
  buildExpenseByNature,
  UNASSIGNED_NATURE_LABEL,
  type ExpenseLineInput,
} from "@/lib/expense-nature-report";
import { EXPENSE_NATURES } from "@/lib/accounting";

/** Baris beban seperti yang dipulangkan `getIncomeStatement().expense`. */
const BEBAN: ExpenseLineInput[] = [
  { code: "610101", name: "Beban Gaji & Tunjangan", amount: 50_000_000 },
  { code: "610102", name: "Beban Sewa", amount: 12_000_000 },
  { code: "610103", name: "Beban Penyusutan", amount: 8_000_000 },
  { code: "610104", name: "Beban Administrasi & Umum", amount: 3_000_000 },
  { code: "5100", name: "Harga Pokok Penjualan", amount: 400_000_000 },
];

const SIFAT = new Map<string, string | null>([
  ["610101", "salary"],
  ["610102", "rent"],
  ["610103", "depreciation"],
  ["610104", null], // sengaja belum ditandai
  ["5100", "materials"],
]);

describe("totalnya sama dengan total beban Laba Rugi", () => {
  it("menjumlah baris MASUKAN, bukan hasil pengelompokannya", () => {
    /*
     * Syarat paling keras issue ini. Dua laporan yang menjumlah beban dengan
     * hasil berbeda adalah cacat yang paling mahal — bukan karena salah satunya
     * salah, melainkan karena tidak ada yang tahu yang mana.
     */
    const r = buildExpenseByNature(BEBAN, SIFAT);
    const totalLabaRugi = BEBAN.reduce((s, l) => s + l.amount, 0);
    expect(r.total).toBe(totalLabaRugi);
  });

  it("jumlah seluruh barisnya juga menutup ke total yang sama", () => {
    const r = buildExpenseByNature(BEBAN, SIFAT);
    expect(r.rows.reduce((s, x) => s + x.amount, 0)).toBe(r.total);
  });

  it("beban KOSONG memulangkan nol, bukan NaN", () => {
    const r = buildExpenseByNature([], SIFAT);
    expect(r.total).toBe(0);
    expect(r.rows).toEqual([]);
    expect(r.unassignedAmount).toBe(0);
  });
});

describe('"Belum ditetapkan" ditampilkan apa adanya', () => {
  it("punya barisnya sendiri, tidak dilebur ke sifat lain", () => {
    const r = buildExpenseByNature(BEBAN, SIFAT);
    const row = r.rows.find((x) => x.nature === null);
    expect(row?.label).toBe(UNASSIGNED_NATURE_LABEL);
    expect(row?.amount).toBe(3_000_000);
  });

  it("nilainya juga dipulangkan terpisah — ukuran seberapa bisa dipercaya sisanya", () => {
    expect(buildExpenseByNature(BEBAN, SIFAT).unassignedAmount).toBe(3_000_000);
  });

  it("akun yang TIDAK ADA di peta sifat ikut ke sana, bukan hilang", () => {
    /* Baris yang ada di buku tetapi tidak di peta adalah baris yang tetap harus
       terhitung; menghilangkannya akan membuat totalnya berbeda dari Laba Rugi. */
    const r = buildExpenseByNature(BEBAN, new Map());
    expect(r.unassignedAmount).toBe(r.total);
    expect(r.rows).toHaveLength(1);
  });

  it("nilai sifat yang tidak dikenal diperlakukan sebagai belum ditetapkan", () => {
    /* Data lama atau hasil impor bisa membawa nilai di luar taksonomi. Ia tidak
       boleh melahirkan baris berlabel kosong di laporan resmi. */
    const r = buildExpenseByNature(
      [{ code: "610199", name: "Beban Aneh", amount: 1_000 }],
      new Map([["610199", "sifat_yang_tidak_pernah_ada"]])
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].nature).toBeNull();
  });

  it("klasifikasi yang LENGKAP tidak memunculkan barisnya sama sekali", () => {
    const lengkap = BEBAN.filter((l) => l.code !== "610104");
    const r = buildExpenseByNature(lengkap, SIFAT);
    expect(r.rows.some((x) => x.nature === null)).toBe(false);
    expect(r.unassignedAmount).toBe(0);
  });
});

describe("urutan barisnya stabil antar-periode", () => {
  it("mengikuti taksonomi, bukan nominal", () => {
    /*
     * Pembaca CALK membandingkan laporan antar-periode; baris yang berpindah
     * tempat setiap bulan memaksa ia mencari alih-alih membaca.
     */
    const r = buildExpenseByNature(BEBAN, SIFAT);
    const urutTaksonomi = EXPENSE_NATURES.map((n) => n.value);
    const urutHasil = r.rows.filter((x) => x.nature != null).map((x) => x.nature as string);
    const seharusnya = urutTaksonomi.filter((v) => urutHasil.includes(v));
    expect(urutHasil).toEqual(seharusnya);
  });

  it('"Belum ditetapkan" selalu PALING AKHIR', () => {
    const r = buildExpenseByNature(BEBAN, SIFAT);
    expect(r.rows[r.rows.length - 1].nature).toBeNull();
  });

  it("sifat yang tak dipakai tidak muncul sebagai baris nol", () => {
    const r = buildExpenseByNature(BEBAN, SIFAT);
    expect(r.rows.some((x) => x.nature === "interest")).toBe(false);
  });
});

describe("beberapa akun bersifat sama digabung", () => {
  it("nominalnya dijumlah dan akunnya dihitung", () => {
    const r = buildExpenseByNature(
      [
        { code: "610101", name: "Gaji", amount: 10_000_000 },
        { code: "610105", name: "THR", amount: 4_000_000 },
      ],
      new Map([
        ["610101", "salary"],
        ["610105", "salary"],
      ])
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].amount).toBe(14_000_000);
    expect(r.rows[0].accountCount).toBe(2);
  });
});
