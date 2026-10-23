/**
 * PENJAGA kontrak akuntansi lintas bahasa — `contract/accounting.yaml` (tahap 1d).
 *
 * Tiga sifat yang hilangnya tidak menghasilkan satu galat kompilasi pun:
 *
 *   1. berkas bangkitan yang basi (semuanya tetap mengompilasi);
 *   2. daftar KEDUA yang ditulis tangan di salah satu bahasa — ia menyimpang
 *      pada tipe akun berikutnya, dan Go yang tidak mengenal satu tipe
 *      melaporkannya sebagai "asing" padahal TS menerimanya;
 *   3. konstanta di kontrak yang TIDAK punya pembaca Go (09 §3.5): kontrak
 *      untuk nol pembaca menyimpang tanpa sisi kedua yang bisa membantahnya.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import {
  ACCOUNT_TYPE_VALUES as CONTRACT_TYPES,
  MONEY_SCALE,
  isAccountType,
} from "@sai/core/generated/accounting";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_VALUES } from "@/lib/accounting";
import { AKAR_REPO, berkasGo } from "./akar-sumber";

const baca = (...p: string[]) => readFileSync(join(AKAR_REPO, ...p), "utf8");
const GEN_GO = "services/integrator/internal/contract/accounting_gen.go";
const GO = berkasGo();
/** Go tulisan tangan, bukan tes, bukan bangkitan. */
const GO_PRODUKSI = GO.filter(
  (b) => !b.rel.endsWith("_test.go") && !b.rel.includes("/internal/contract/")
);

describe("kontrak akuntansi: bangkitan sinkron", () => {
  it("`contract:gen --cek` lolos", () => {
    expect(() =>
      execFileSync("bun", ["scripts/contract-generate.ts", "--cek"], {
        cwd: AKAR_REPO,
        stdio: "pipe",
      })
    ).not.toThrow();
  });

  it("YAML dan bangkitan TS menyatakan hal yang sama", () => {
    const y = load(baca("contract", "accounting.yaml")) as {
      money: { scale: number };
      account_types: string[];
    };
    expect(MONEY_SCALE).toBe(y.money.scale);
    expect([...CONTRACT_TYPES]).toEqual(y.account_types);
  });
});

describe("kontrak akuntansi: TS tidak punya daftar kedua", () => {
  it("ACCOUNT_TYPES aplikasi = kontrak, dalam URUTAN kontrak", () => {
    /* Urutan bermakna: entri pertama bawaan formulir bagan akun. */
    expect(ACCOUNT_TYPES.map((t) => t.value)).toEqual([...CONTRACT_TYPES]);
    expect(ACCOUNT_TYPE_VALUES).toEqual([...CONTRACT_TYPES]);
  });

  it("src/lib/accounting.ts tidak menulis nilai tipe sebagai daftar `value:`", () => {
    const src = baca("src", "lib", "accounting.ts");
    expect(src).toContain('from "@sai/core/generated/accounting"');
    for (const t of CONTRACT_TYPES) {
      expect(src, t).not.toMatch(new RegExp(`value:\\s*"${t}"`));
    }
  });

  it("cek seimbang laporan memakai skala kontrak, bukan `* 100`", () => {
    const reports = baca("src", "lib", "reports.ts");
    expect(reports).toContain("MONEY_SCALE");
    /* `eq` adalah vonis seimbang Neraca Saldo — yang dibandingkan paritas. */
    const eq = /const eq = [\s\S]*?;\n/.exec(reports)?.[0] ?? "";
    expect(eq).toContain("UNITS_PER_RUPIAH");
    expect(eq).not.toContain("100");
  });

  it("penjaga tipe menolak nilai asing", () => {
    expect(isAccountType("cash_bank")).toBe(true);
    expect(isAccountType("liabilitas_aneh")).toBe(false);
  });
});

describe("kontrak akuntansi: Go membaca kontrak, bukan salinannya", () => {
  it("bangkitan Go memuat setiap tipe dan skalanya", () => {
    const gen = GO.find((b) => b.rel === GEN_GO);
    expect(gen, GEN_GO).toBeDefined();
    expect(gen!.isi).toContain(`const MoneyScale = ${MONEY_SCALE}`);
    for (const t of CONTRACT_TYPES) expect(gen!.isi, t).toContain(`"${t}"`);
  });

  it("tidak ada tipe akun yang ditulis sebagai teks di Go tulisan tangan", () => {
    /* Tag struct (`json:"equity"`) DIKECUALIKAN: ia nama MEDAN JSON yang harus
       sama dengan bentuk TS (Neraca punya medan `equity`, Laba Rugi `revenue`,
       `expense`, `cogs`), bukan nilai `accounts.type`. Yang dikecualikan hanya
       isi backtick yang berbentuk tag — literal string biasa tetap ditolak. */
    const tanpaTag = (isi: string) => isi.replace(/`(?:[a-z]+:"[^"]*"\s*)+`/g, "``");
    const pelanggar: string[] = [];
    for (const b of GO_PRODUKSI) {
      const isi = tanpaTag(b.isi);
      for (const t of CONTRACT_TYPES) {
        if (isi.includes(`"${t}"`)) pelanggar.push(`${b.rel}: "${t}"`);
      }
    }
    expect(pelanggar).toEqual([]);
    /* Penyaringnya tidak menelan literal biasa. */
    expect(tanpaTag('x := "equity"')).toContain('"equity"');
    expect(tanpaTag('Equity []L `json:"equity"`')).not.toContain('"equity"');
  });

  it("setiap konstanta kontrak PUNYA pembaca Go (09 §3.5)", () => {
    /* Kontrak untuk nol pembaca tidak punya sisi kedua yang bisa
       membantahnya. Menambah kunci ke `accounting.yaml` tanpa pembaca Go
       gagal di sini — tambahkan kuncinya bersama laporan Go pertama yang
       memakainya, dalam commit yang sama. */
    const semua = GO_PRODUKSI.map((b) => b.isi).join("\n");
    expect(semua).toMatch(/contract\.MoneyScale/);
    expect(semua).toMatch(/contract\.(IsAccountType|AccountTypes)\b/);
    /* Laba Rugi & Neraca Go (tahap 1d, `statements.go`). */
    expect(semua, "account_categories / account_type_categories").toMatch(/contract\.CategoryOf\b/);
    expect(semua, "category_statement_side").toMatch(/contract\.CategoryStatementSide\b/);
    expect(semua, "income_statement.type_sections").toMatch(/contract\.IncomeStatementTypeSections\b/);
    expect(semua, "income_statement.category_default_sections").toMatch(
      /contract\.IncomeStatementCategoryDefaultSections\b/
    );
    expect(semua, "closing_journal_type").toMatch(/contract\.ClosingJournalType\b/);
    /* Arus Kas Go (tahap 1d, `cash_flow.go`, 23 Okt 2026). */
    expect(semua, "cash_flow.cash_account_type").toMatch(/contract\.CashAccountType\b/);
    expect(semua, "cash_flow.categories").toMatch(/contract\.CashFlowCategories\b/);
    expect(semua, "cash_flow.fallback_category").toMatch(/contract\.CashFlowFallbackCategory\b/);
    expect(semua, "cash_flow.type_categories").toMatch(/contract\.CashFlowCategoryOf\b/);
    /* `currencies.base` — pembaca Go PERTAMA dari pengecualian 23 Okt 2026:
       baris "valas berkurs 1" Arus Kas. Dicoret dari pengecualian di bawah. */
    expect(semua, "currencies.base").toMatch(/contract\.BaseCurrency\b/);

    const y = load(baca("contract", "accounting.yaml")) as Record<string, unknown>;
    expect(Object.keys(y).sort(), "kunci baru butuh pembaca Go + baris di tes ini").toEqual(
      [
        "account_categories",
        "account_type_categories",
        "account_types",
        "cash_flow",
        "category_statement_side",
        "closing_journal_type",
        "contract_statuses",
        "currencies",
        "income_statement",
        "invoice_statuses",
        "money",
        "version",
      ]
    );
  });

  /*
   * PENGECUALIAN YANG DISEBUT dari aturan "nol pembaca" — keputusan pemilik
   * 23 Okt 2026: mata uang & status dokumen dibangkitkan SEBELUM pembaca Go
   * pertamanya, supaya pemeriksa kesesuaian data yang kelak pindah ke Go
   * mewarisi kosakata zod, bukan salinan ketiga. Sisi keduanya hari ini TS
   * (zod + `check-data-conformance`).
   *
   * Tes ini sengaja menjadi PEMICU: begitu Go tulisan tangan memakai salah satu
   * kunci ini, ia merah — coret kuncinya dari daftar, dan pindahkan ke
   * `expect(...).toMatch` di tes di atas, supaya pembacanya ikut dijaga.
   */
  it("pengecualian tanpa-pembaca-Go masih benar-benar tanpa pembaca", () => {
    const semua = GO_PRODUKSI.map((b) => b.isi).join("\n");
    /* `currencies` DICORET 23 Okt 2026: Arus Kas Go membaca
       `contract.BaseCurrency` (baris valas berkurs 1) — pembacanya kini dijaga
       di tes di atas. */
    const tanpaPembaca: Record<string, RegExp> = {
      invoice_statuses: /contract\.(InvoiceStatuses|InvoiceStatus[A-Z]\w*)\b/,
      contract_statuses: /contract\.(ContractStatuses|IsContractStatus|ContractStatus[A-Z]\w*)\b/,
    };
    for (const [kunci, pola] of Object.entries(tanpaPembaca)) {
      expect(semua, `\`${kunci}\` kini punya pembaca Go — coret dari pengecualian`).not.toMatch(pola);
    }
  });
});

describe("kontrak akuntansi: mata uang & status dokumen (23 Okt 2026)", () => {
  it("YAML, bangkitan TS, dan re-ekspor @sai/core/constants sepakat", async () => {
    const gen = await import("@sai/core/generated/accounting");
    const constants = await import("@sai/core/constants");
    const y = load(baca("contract", "accounting.yaml")) as {
      currencies: { base: string; values: string[] };
      invoice_statuses: string[];
      contract_statuses: string[];
    };
    expect([...gen.CURRENCIES]).toEqual(y.currencies.values);
    expect(gen.BASE_CURRENCY).toBe(y.currencies.base);
    expect([...gen.INVOICE_STATUSES]).toEqual(y.invoice_statuses);
    expect([...gen.CONTRACT_STATUSES]).toEqual(y.contract_statuses);
    expect(constants.CONTRACT_STATUSES).toBe(gen.CONTRACT_STATUSES);
    expect(constants.INVOICE_STATUSES).toBe(gen.INVOICE_STATUSES);
    expect(constants.CURRENCIES).toBe(gen.CURRENCIES);
  });

  it("status kontrak DIAWALI status faktur, `completed` di belakang", () => {
    const gen = { c: ["signed", "pending", "canceled", "completed"] };
    const y = load(baca("contract", "accounting.yaml")) as {
      invoice_statuses: string[];
      contract_statuses: string[];
    };
    expect(y.contract_statuses.slice(0, y.invoice_statuses.length)).toEqual(y.invoice_statuses);
    expect(y.contract_statuses).toEqual(gen.c);
  });

  it("bangkitan Go memuat setiap mata uang dan status", () => {
    const go = baca(GEN_GO);
    for (const c of ["USD", "CNY", "IDR"]) expect(go).toContain(`Currency = "${c}"`);
    expect(go).toContain("const BaseCurrency = CurrencyIDR");
    expect(go).toContain('ContractStatusCompleted ContractStatus = "completed"');
    expect(go).not.toContain('InvoiceStatus = "completed"');
  });

  it("zod & pemeriksa kesesuaian membaca daftar bangkitan, bukan salinan", () => {
    const fx = baca("src", "lib", "validations", "fx.ts");
    expect(fx).not.toMatch(/\[\s*"USD",\s*"CNY",\s*"IDR"\s*\]/);
    for (const f of ["contract.ts", "invoice.ts"]) {
      expect(baca("src", "lib", "validations", f)).not.toMatch(/z\.enum\(\[\s*"signed"/);
    }
  });
});

describe("kontrak akuntansi: kategori, sisi, band, jurnal penutup (Laba Rugi & Neraca)", () => {
  it("TS membaca kategori & band dari bangkitan, bukan daftar sendiri", () => {
    const accounting = baca("src", "lib", "accounting.ts");
    expect(accounting).toContain("ACCOUNT_TYPE_CATEGORIES");
    expect(accounting, "kategori diketik ulang di ACCOUNT_TYPE_TRAITS").not.toMatch(/category:\s*"/);
    const reports = baca("src", "lib", "reports.ts");
    expect(reports).toContain("CATEGORY_STATEMENT_SIDE");
    expect(reports).toContain("INCOME_STATEMENT_TYPE_SECTIONS");
    /* Band dan sisi tidak ditulis sebagai cabang tipe di reports.ts lagi. */
    expect(reports).not.toMatch(/type === "(other_income|cogs|other_expense)"/);
    const yearClose = baca("src", "lib", "year-close.ts");
    expect(yearClose).not.toMatch(/CLOSING_JOURNAL_TYPE = "/);
  });

  it("YAML dan bangkitan TS sepakat", async () => {
    const gen = await import("@sai/core/generated/accounting");
    const y = load(baca("contract", "accounting.yaml")) as {
      account_categories: string[];
      account_type_categories: Record<string, string>;
      category_statement_side: Record<string, string>;
      closing_journal_type: string;
    };
    expect([...gen.ACCOUNT_CATEGORY_VALUES]).toEqual(y.account_categories);
    expect(gen.ACCOUNT_TYPE_CATEGORIES).toEqual(y.account_type_categories);
    expect(gen.CATEGORY_STATEMENT_SIDE).toEqual(y.category_statement_side);
    expect(gen.CLOSING_JOURNAL_TYPE).toBe(y.closing_journal_type);
    /* Kontra-aset: aset, tetapi saldo normal KREDIT — bukti bahwa sisi
       laporan per kategori BUKAN saldo normal per tipe. */
    expect(gen.ACCOUNT_TYPE_CATEGORIES.accumulated_depreciation).toBe("asset");
  });
});
