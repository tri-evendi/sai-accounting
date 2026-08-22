/**
 * Pagar materialitas akun penampung beban (issue #444) — aturan murni.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATCH_ALL_THRESHOLD,
  assessCatchAllExpenses,
  describeCatchAllFinding,
  describeUntaggedExpense,
  findUntaggedMaterialExpenses,
  isCatchAllName,
  type ExpenseAccountTotal,
} from "@/lib/materiality";

/** Alias baca-enak; ambangnya bawaan (5%). */
const assessUntagged = (rows: ExpenseAccountTotal[]) => findUntaggedMaterialExpenses(rows);

const akun = (
  code: string,
  name: string,
  amount: number,
  type = "expense"
): ExpenseAccountTotal => ({ code, name, type, amount });

describe("isCatchAllName", () => {
  it("mengenali nama yang menyatakan dirinya penampung", () => {
    for (const nama of [
      "Beban Lain-lain",
      "Beban Lain Lain",
      "Beban Operasional Lainnya",
      "Serba Serbi",
      "Serba-serbi Kantor",
      "Biaya dll",
      "Miscellaneous Expense",
      "Other Expenses",
    ]) {
      expect(isCatchAllName(nama), nama).toBe(true);
    }
  });

  it("TIDAK menuduh akun beban yang namanya spesifik", () => {
    for (const nama of [
      "Beban Gaji & Tunjangan",
      "Beban Sewa",
      "Beban Penyusutan",
      "Beban Bunga & Administrasi Bank",
      "Beban Pokok Penjualan",
      "Beban Administrasi & Umum",
    ]) {
      expect(isCatchAllName(nama), nama).toBe(false);
    }
  });
});

describe("assessCatchAllExpenses", () => {
  it("menandai akun penampung yang melewati ambang, dengan pangsanya", () => {
    const { totalExpense, findings } = assessCatchAllExpenses([
      akun("610101", "Beban Gaji & Tunjangan", 700),
      akun("610199", "Beban Lain-lain", 300),
    ]);
    expect(totalExpense).toBe(1000);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      reason: "name",
      code: "610199",
      amount: 300,
    });
    expect(findings[0].share).toBeCloseTo(0.3, 5);
  });

  it("mendiamkan penampung yang memang kecil", () => {
    const { findings } = assessCatchAllExpenses([
      akun("610101", "Beban Gaji & Tunjangan", 990),
      akun("610199", "Beban Lain-lain", 10), // 1%
    ]);
    expect(findings).toEqual([]);
  });

  it("ambangnya bisa ditimpa pemanggil", () => {
    const rows = [akun("610101", "Beban Gaji", 900), akun("610199", "Beban Lain-lain", 100)];
    expect(assessCatchAllExpenses(rows, { threshold: 0.2 }).findings).toEqual([]);
    expect(assessCatchAllExpenses(rows, { threshold: 0.05 }).findings).toHaveLength(1);
  });

  it("TIDAK menuduh akun spesifik hanya karena tipenya other_expense", () => {
    // 7201 adalah beban bunga — sangat spesifik, dan besar. Ia tidak boleh
    // disebut "penampung"; yang boleh disebut hanyalah band-nya.
    const { findings } = assessCatchAllExpenses([
      akun("610101", "Beban Gaji & Tunjangan", 700),
      akun("7201", "Beban Bunga & Administrasi Bank", 300, "other_expense"),
    ]);
    expect(findings.map((f) => f.reason)).toEqual(["band"]);
    expect(findings[0].code).toBe("");
  });

  it("menandai band lain-lain yang gemuk terpisah dari akunnya", () => {
    const { findings } = assessCatchAllExpenses([
      akun("610101", "Beban Gaji", 600),
      akun("7201", "Beban Bunga", 200, "other_expense"),
      akun("7299", "Beban Lain-lain", 200, "other_expense"),
    ]);
    // satu temuan nama (7299 = 20%) + satu temuan band (400/1000 = 40%)
    expect(findings.map((f) => f.reason)).toEqual(["band", "name"]);
    expect(findings[0].amount).toBe(400);
    expect(findings[1].code).toBe("7299");
  });

  it("mengurutkan yang paling besar lebih dulu", () => {
    const { findings } = assessCatchAllExpenses([
      akun("1", "Beban Gaji", 400),
      akun("2", "Beban Lain-lain", 100),
      akun("3", "Serba Serbi", 500),
    ]);
    expect(findings.map((f) => f.code)).toEqual(["3", "2"]);
  });

  it("total beban nol tidak menghasilkan persentase yang tak berarti", () => {
    const { totalExpense, findings } = assessCatchAllExpenses([akun("1", "Beban Lain-lain", 0)]);
    expect(totalExpense).toBe(0);
    expect(findings).toEqual([]);
  });

  it("melewati akun beban bersaldo kredit alih-alih membalik tandanya", () => {
    const { findings } = assessCatchAllExpenses([
      akun("610101", "Beban Gaji", 1000),
      akun("610199", "Beban Lain-lain", -500),
    ]);
    expect(findings).toEqual([]);
  });

  it("ambang bawaannya 5%", () => {
    expect(DEFAULT_CATCH_ALL_THRESHOLD).toBe(0.05);
    const tepatDiAmbang = assessCatchAllExpenses([
      akun("1", "Beban Gaji", 950),
      akun("2", "Beban Lain-lain", 50), // tepat 5% — bukan "melewati"
    ]);
    expect(tepatDiAmbang.findings).toEqual([]);
  });
});

describe("describeCatchAllFinding", () => {
  it("menyebut kode, nama, nominal, DAN pangsanya", () => {
    const { findings } = assessCatchAllExpenses([
      akun("610101", "Beban Gaji", 700_000),
      akun("610199", "Beban Lain-lain", 300_000),
    ]);
    const kalimat = describeCatchAllFinding(findings[0]);
    expect(kalimat).toContain("610199");
    expect(kalimat).toContain("Beban Lain-lain");
    expect(kalimat).toContain("300.000");
    expect(kalimat).toContain("30.0%");
  });

  it("temuan band tidak berpura-pura punya kode akun", () => {
    const { findings } = assessCatchAllExpenses([
      akun("610101", "Beban Gaji", 700),
      akun("7201", "Beban Bunga", 300, "other_expense"),
    ]);
    expect(describeCatchAllFinding(findings[0])).toMatch(/^seluruh band "Beban Lain-lain"/);
  });
});

describe("findUntaggedMaterialExpenses", () => {
  it("menyebut beban besar yang belum ditandai sifatnya", () => {
    const { findings } = assessUntagged([
      { ...akun("610101", "Beban Gaji", 700), nature: "salary" },
      { ...akun("610104", "Beban Administrasi & Umum", 300), nature: null },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("610104");
    expect(findings[0].share).toBeCloseTo(0.3, 5);
  });

  it("mendiamkan beban kecil yang belum ditandai", () => {
    const { findings } = assessUntagged([
      { ...akun("610101", "Beban Gaji", 990), nature: "salary" },
      { ...akun("610104", "Beban Serba Serbi Kecil", 10), nature: null },
    ]);
    expect(findings).toEqual([]);
  });

  it("akun yang sudah bersifat tidak pernah disebut, sebesar apa pun", () => {
    const { findings } = assessUntagged([
      { ...akun("610101", "Beban Gaji", 990), nature: "salary" },
      { ...akun("610102", "Beban Sewa", 10), nature: "rent" },
    ]);
    expect(findings).toEqual([]);
  });

  it("mengurutkan yang paling besar lebih dulu", () => {
    const { findings } = assessUntagged([
      { ...akun("1", "A", 200), nature: null },
      { ...akun("2", "B", 500), nature: null },
      { ...akun("3", "C", 300), nature: null },
    ]);
    expect(findings.map((f) => f.code)).toEqual(["2", "3", "1"]);
  });

  it("kalimatnya menyebut kode, nama, nominal, dan pangsa", () => {
    const { findings } = assessUntagged([
      { ...akun("610101", "Beban Gaji", 700_000), nature: "salary" },
      { ...akun("610104", "Beban Administrasi & Umum", 300_000), nature: null },
    ]);
    const kalimat = describeUntaggedExpense(findings[0]);
    expect(kalimat).toContain("610104");
    expect(kalimat).toContain("300.000");
    expect(kalimat).toContain("30.0%");
  });
});
