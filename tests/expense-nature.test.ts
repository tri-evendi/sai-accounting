/**
 * Sifat Beban pada akun (issue #445) — taksonomi & aturan penyimpanannya.
 */
import { describe, it, expect } from "vitest";
import {
  ACCOUNT_TYPES,
  COA_TEMPLATE,
  EXPENSE_NATURES,
  EXPENSE_NATURE_VALUES,
  EXPENSE_ACCOUNT_TYPE_VALUES,
  acceptsExpenseNature,
  expenseNatureLabel,
  resolveExpenseNature,
} from "@/lib/accounting";
import { expenseNatureLabels } from "@/lib/i18n/labels";
import id from "@/lib/i18n/dictionaries/id.json";
import en from "@/lib/i18n/dictionaries/en.json";
import zh from "@/lib/i18n/dictionaries/zh.json";
import { accountSchema } from "@/lib/validations/account";

describe("taksonomi sifat beban", () => {
  it("nilainya snake_case dan unik", () => {
    for (const n of EXPENSE_NATURES) expect(n.value).toMatch(/^[a-z][a-z_]*$/);
    expect(new Set(EXPENSE_NATURE_VALUES).size).toBe(EXPENSE_NATURE_VALUES.length);
  });

  it("memuat keempat sifat yang disebut PSAK 118 secara eksplisit", () => {
    // gaji, sewa, penyusutan, imbalan jasa profesional (Pajakku hal. 4)
    for (const wajib of ["salary", "rent", "depreciation", "professional_services"]) {
      expect(EXPENSE_NATURE_VALUES, wajib).toContain(wajib);
    }
  });

  it("SENGAJA tidak menyediakan ember 'lainnya'", () => {
    /* Seluruh alasan penanda ini lahir adalah melawan penampung (#444).
       Menyediakan penampung di dalam penandanya sendiri membatalkan dirinya —
       akun yang tak masuk sifat mana pun cukup dibiarkan KOSONG. */
    for (const buruk of ["other", "others", "lain", "lain_lain", "misc", "miscellaneous"]) {
      expect(EXPENSE_NATURE_VALUES, buruk).not.toContain(buruk);
    }
  });

  it("punya label bahasa Indonesia untuk setiap nilai", () => {
    for (const n of EXPENSE_NATURES) expect(expenseNatureLabel(n.value)).toBe(n.label);
  });

  it("nilai tak dikenal memulangkan dirinya sendiri, bukan melempar", () => {
    expect(expenseNatureLabel("tidak-ada")).toBe("tidak-ada");
  });
});

describe("terjemahan tiga bahasa", () => {
  for (const [nama, dict] of [
    ["id", id],
    ["en", en],
    ["zh", zh],
  ] as const) {
    it(`"${nama}" punya label untuk setiap sifat, tanpa yang kosong`, () => {
      const labels = expenseNatureLabels(dict);
      for (const n of EXPENSE_NATURES) {
        expect(labels[n.value], `${nama}.${n.value}`).toBeTruthy();
      }
      expect(Object.keys(labels).sort()).toEqual([...EXPENSE_NATURE_VALUES].sort());
    });
  }

  it("tanpa kamus, jatuh ke label bahasa Indonesia di modul akuntansi", () => {
    const labels = expenseNatureLabels(null);
    expect(labels.salary).toBe("Gaji & Imbalan Kerja");
  });
});

describe("acceptsExpenseNature", () => {
  it("hanya tipe berkategori beban yang menerimanya", () => {
    for (const type of EXPENSE_ACCOUNT_TYPE_VALUES) {
      expect(acceptsExpenseNature(type), type).toBe(true);
    }
    const bukanBeban = ACCOUNT_TYPES.filter((t) => t.category !== "expense");
    for (const t of bukanBeban) expect(acceptsExpenseNature(t.value), t.value).toBe(false);
  });

  it("daftar tipe beban diturunkan, bukan diketik ulang", () => {
    const dari = ACCOUNT_TYPES.filter((t) => t.category === "expense").map((t) => t.value);
    expect([...EXPENSE_ACCOUNT_TYPE_VALUES]).toEqual(dari);
  });
});

describe("resolveExpenseNature", () => {
  it("menyimpan sifat pada akun beban", () => {
    expect(resolveExpenseNature("expense", "salary")).toBe("salary");
    expect(resolveExpenseNature("cogs", "materials")).toBe("materials");
  });

  it("kosong tetap kosong — 'belum ditetapkan' jawaban yang sah", () => {
    expect(resolveExpenseNature("expense", null)).toBeNull();
    expect(resolveExpenseNature("expense", undefined)).toBeNull();
  });

  it("MEMBUANG sifat pada akun yang bukan beban", () => {
    // Ini bukan kerapian: akun beban yang KEMUDIAN diubah jadi aset akan
    // meninggalkan sifat lamanya menempel, lalu ikut terjumlah ke rincian
    // CALK dari baris yang bukan beban sama sekali.
    expect(resolveExpenseNature("cash_bank", "salary")).toBeNull();
    expect(resolveExpenseNature("equity", "rent")).toBeNull();
    expect(resolveExpenseNature("revenue", "materials")).toBeNull();
  });
});

describe("templat COA bawaan", () => {
  it("menyemai sifat untuk beban yang namanya memang menyatakannya", () => {
    const byCode = new Map(COA_TEMPLATE.map((r) => [r.code, r]));
    expect(byCode.get("610101")?.nature).toBe("salary"); // Beban Gaji & Tunjangan
    expect(byCode.get("610102")?.nature).toBe("rent"); // Beban Sewa
    expect(byCode.get("610103")?.nature).toBe("depreciation"); // Beban Penyusutan
    expect(byCode.get("5101")?.nature).toBe("materials"); // Beban Pokok Penjualan
    expect(byCode.get("7201")?.nature).toBe("interest"); // Beban Bunga
  });

  it("tidak menebak sifat untuk akun yang isinya memang campur", () => {
    const byCode = new Map(COA_TEMPLATE.map((r) => [r.code, r]));
    // "Beban Administrasi & Umum" bukan satu sifat — dibiarkan kosong, bukan
    // ditebak, dan pemeriksa kesesuaian yang akan menagihnya bila ia membesar.
    expect(byCode.get("610104")?.nature).toBeUndefined();
  });

  it("tidak pernah menyemai sifat pada baris yang bukan beban", () => {
    const salah = COA_TEMPLATE.filter((r) => r.nature && !acceptsExpenseNature(r.type));
    expect(salah.map((r) => r.code)).toEqual([]);
  });

  it("setiap sifat yang disemai ada di daftar", () => {
    const asing = COA_TEMPLATE.filter(
      (r) => r.nature && !EXPENSE_NATURE_VALUES.includes(r.nature)
    );
    expect(asing.map((r) => `${r.code}:${r.nature}`)).toEqual([]);
  });
});

describe("skema validasi akun", () => {
  const dasar = { code: "610199", name: "Beban Uji", type: "expense", currency: "IDR" };

  it("menerima sifat yang dikenal", () => {
    expect(accountSchema.safeParse({ ...dasar, expenseNature: "salary" }).success).toBe(true);
  });

  it("menerima kosong / null / tak disebut", () => {
    expect(accountSchema.safeParse({ ...dasar, expenseNature: null }).success).toBe(true);
    expect(accountSchema.safeParse(dasar).success).toBe(true);
  });

  it("MENOLAK sifat yang tidak dikenal", () => {
    // Sifat salah eja akan menghilang dari rincian CALK tanpa satu galat pun.
    expect(accountSchema.safeParse({ ...dasar, expenseNature: "gaji" }).success).toBe(false);
    expect(accountSchema.safeParse({ ...dasar, expenseNature: "" }).success).toBe(false);
  });
});
