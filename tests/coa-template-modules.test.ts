/**
 * Bagan akun mengikuti MODUL yang dipakai (issue #99/#104).
 *
 * ══ YANG SEBENARNYA DIJAGA DI SINI ═════════════════════════════════════════
 * Memangkas bagan akun itu mudah; yang sulit adalah memangkasnya tanpa
 * mematahkan mesin posting. Setiap aturan posting menuntut SLOT AKUN
 * (`MAPPING_KEYS`), dan slot yang tidak menemukan akunnya melempar
 * `PostingRuleError` — bukan saat penyiapan, melainkan saat seseorang mencoba
 * membukukan sesuatu di tengah pekerjaannya.
 *
 * Jadi tes ini tidak bertanya "apakah akunnya lebih sedikit". Ia bertanya:
 * untuk SETIAP kategori usaha, apakah setiap slot yang mungkin dibutuhkan
 * modul-modulnya benar-benar punya akun di template yang disemai untuknya?
 */
import { describe, expect, it } from "vitest";

import { COA_TEMPLATE } from "@/lib/accounting";
import { coaTemplateFor } from "@/lib/coa-template";
import {
  BUSINESS_CATEGORIES,
  BUSINESS_MODULES,
  CORE_MODULE,
  modulesForCategory,
  type BusinessModule,
} from "@/lib/business-modules";
import { DEFAULT_MAPPINGS, MAPPING_KEYS } from "@/lib/posting/mapping";

/**
 * Slot yang dibutuhkan tiap modul. Ditulis TANGAN dengan sengaja: kalau
 * diturunkan dari kode yang sama dengan yang diuji, tesnya hanya akan
 * mengulang kesalahan yang sama.
 */
const SLOTS_NEEDED: Partial<Record<BusinessModule, string[]>> = {
  cash_bank: [
    MAPPING_KEYS.CASH_BANK,
    MAPPING_KEYS.CASH_KAS_BESAR,
    MAPPING_KEYS.CASH_KAS_KECIL,
    MAPPING_KEYS.CASH_DEFAULT,
  ],
  sales: [MAPPING_KEYS.AR_DEFAULT, MAPPING_KEYS.SALES_DEFAULT],
  purchasing: [MAPPING_KEYS.AP_DEFAULT, MAPPING_KEYS.PURCHASE_EXPENSE],
  inventory: [MAPPING_KEYS.INVENTORY, MAPPING_KEYS.COGS, MAPPING_KEYS.INVENTORY_ADJUSTMENT],
  tax_id: [MAPPING_KEYS.VAT_IN, MAPPING_KEYS.VAT_OUT],
  fixed_assets: [
    MAPPING_KEYS.FIXED_ASSET,
    MAPPING_KEYS.ACCUM_DEPRECIATION,
    MAPPING_KEYS.DEPRECIATION_EXPENSE,
  ],
};

/** Kode akun yang menopang sebuah slot, menurut mapping bawaan. */
function codesForSlot(slot: string): string[] {
  return DEFAULT_MAPPINGS.filter((m) => m.key === slot).map((m) => m.code);
}

describe("tag modul di template tetap sahih", () => {
  /*
   * `COA_TEMPLATE.module` bertipe `string`, bukan `BusinessModule` — sebab
   * `accounting.ts` DILARANG mengimpor `business-modules.ts` (lihat
   * business-modules-ledger.test.ts: angka laporan tidak boleh bisa berubah
   * mengikuti modul yang menyala). Tipe yang hilang itu diganti tes ini: salah
   * ketik nama modul akan membuat akunnya tidak pernah disemai untuk siapa pun,
   * diam-diam.
   */
  it("setiap nilai `module` adalah modul yang benar-benar ada", () => {
    const known = new Set<string>(BUSINESS_MODULES);
    const unknown = COA_TEMPLATE.filter((r) => r.module && !known.has(r.module)).map(
      (r) => `${r.code} → "${r.module}"`
    );
    expect(unknown, "Tag modul tak dikenal di COA_TEMPLATE:\n  " + unknown.join("\n  ")).toEqual(
      []
    );
  });

  it("tidak ada modul yang menandai akun tapi tak pernah dipakai kategori mana pun", () => {
    const tagged = new Set(COA_TEMPLATE.map((r) => r.module).filter(Boolean) as string[]);
    const used = new Set(BUSINESS_CATEGORIES.flatMap((c) => modulesForCategory(c)) as string[]);
    // `custom` kini minimal, jadi pembandingnya kategori LAIN — tag yang tak
    // pernah dipakai kategori mana pun berarti akunnya tak pernah lahir.
    for (const tag of tagged) expect(used.has(tag), `modul "${tag}"`).toBe(true);
  });
});

describe("template mengikuti modul", () => {
  it("tanpa modul apa pun, yang tersisa hanya akun inti", () => {
    const core = coaTemplateFor([CORE_MODULE]);
    expect(core.length).toBeGreaterThan(0);
    expect(core.length).toBeLessThan(COA_TEMPLATE.length);
    // Modal & laba ditahan adalah milik pembukuan itu sendiri, bukan modul.
    expect(core.map((r) => r.code)).toContain("3101");
    expect(core.map((r) => r.code)).toContain("3102");
  });

  it("perusahaan jasa tidak mendapat akun persediaan & HPP", () => {
    // Inilah keluhan yang memulai perubahan ini: akun yang selamanya nol tapi
    // ikut memenuhi setiap pemilih akun dan setiap laporan.
    const codes = coaTemplateFor(modulesForCategory("services")).map((r) => r.code);
    expect(codes).not.toContain("1104"); // Persediaan Barang Dagang
    expect(codes).not.toContain("5101"); // Beban Pokok Penjualan
    expect(codes).not.toContain("610105"); // Selisih Persediaan
  });

  it("perdagangan komoditas mendapat template penuh KECUALI akun modul opt-in", () => {
    /*
     * Dulu ini menuntut SELURUH template. Yang berubah bukan kelengkapannya
     * melainkan apa artinya "penuh": sejak #495 butir 3 ada modul OPT-IN, dan
     * akun miliknya (1106 Barang Dalam Proses, 5103, 5104) memang tidak boleh
     * lahir di perusahaan yang tidak memproduksi apa pun — tiga akun bersaldo
     * nol selamanya adalah persis yang diperingatkan `coa-seeding.ts`.
     *
     * Maksud tesnya tetap: perdagangan komoditas adalah preset TERLUAS, dan
     * tidak boleh kehilangan satu akun pun yang memang miliknya.
     */
    const dagang = coaTemplateFor(modulesForCategory("commodity_trading"));
    const pabrik = coaTemplateFor(modulesForCategory("manufacturing"));

    expect(dagang).toHaveLength(pabrik.length - 3);
    for (const kode of ["1106", "5103", "5104"]) {
      expect(dagang.map((r) => r.code), kode).not.toContain(kode);
      expect(pabrik.map((r) => r.code), kode).toContain(kode);
    }
    // Selain ketiganya, keduanya identik — pabrik adalah superset.
    for (const row of dagang) expect(pabrik.map((r) => r.code)).toContain(row.code);
  });

  it("akun manufaktur lahir TEPAT saat modulnya dinyalakan, bukan sebelumnya", () => {
    /*
     * Cacat yang ini perbaiki, ditemukan saat hendak menyalakan modulnya di
     * buku produksi sungguhan: ketiga akun semula ditandai `inventory`, jadi
     * `seedCoaForModules(["manufacturing"])` tidak menyemai satu pun — dan
     * perintah produksi PERTAMA akan berhenti dengan `MissingMappingError`,
     * di tengah pekerjaan orang alih-alih di layar tempat ia menyalakannya.
     */
    const hanyaStok = coaTemplateFor(["inventory"]).map((r) => r.code);
    for (const kode of ["1106", "5103", "5104"]) {
      expect(hanyaStok, kode).not.toContain(kode);
    }
    expect(coaTemplateFor(["manufacturing"]).map((r) => r.code)).toEqual(
      expect.arrayContaining(["1106", "5103", "5104"])
    );
  });

  it("`custom` mulai minimal — sama dengan inti saja", () => {
    expect(coaTemplateFor(modulesForCategory("custom"))).toEqual(coaTemplateFor([CORE_MODULE]));
  });

  it("akun anak tidak pernah disemai tanpa induknya", () => {
    // `parentId` diisi dari induk yang sudah dibuat; anak yatim akan tersemai
    // tanpa induk dan merusak hierarki laporan.
    for (const businessModule of BUSINESS_MODULES) {
      const rows = coaTemplateFor([CORE_MODULE, businessModule]);
      const codes = new Set(rows.map((r) => r.code));
      for (const row of rows) {
        if (row.parent) expect(codes.has(row.parent), `${row.code} → ${row.parent}`).toBe(true);
      }
    }
  });

  it("induk selalu mendahului anaknya (urutan penyemaian)", () => {
    const rows = coaTemplateFor(BUSINESS_MODULES);
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.parent) expect(seen.has(row.parent), `${row.code} sebelum ${row.parent}`).toBe(true);
      seen.add(row.code);
    }
  });
});

describe("setiap kategori tetap bisa memposting", () => {
  for (const category of BUSINESS_CATEGORIES) {
    it(`"${category}": setiap slot yang dibutuhkan modulnya punya akun`, () => {
      const modules = modulesForCategory(category);
      const codes = new Set(coaTemplateFor(modules).map((r) => r.code));

      const missing: string[] = [];
      for (const businessModule of modules) {
        for (const slot of SLOTS_NEEDED[businessModule] ?? []) {
          const supported = codesForSlot(slot);
          // Slot dianggap terpenuhi bila SATU saja akun penopangnya ada —
          // slot bermata-uang punya beberapa kode (IDR/USD/CNY).
          if (supported.length > 0 && !supported.some((code) => codes.has(code))) {
            missing.push(`${businessModule} → ${slot} (butuh salah satu dari ${supported.join(", ")})`);
          }
        }
      }

      expect(
        missing,
        "Modul aktif tapi akunnya tidak ikut disemai. Pemakaian pertama modul " +
          "ini akan berhenti dengan PostingRuleError di tengah pekerjaan " +
          "pengguna. Tandai akunnya dengan `module` di COA_TEMPLATE:\n  " +
          missing.join("\n  ")
      ).toEqual([]);
    });
  }
});
