/**
 * PENJAGA #331 — nama tab mengikuti judul dokumennya, kecuali bila mustahil.
 *
 * == Yang salah sebelum ini ================================================
 * Tujuh nama tab berbeda dari judul dokumennya, **tanpa satu pun alasan
 * tertulis**. Dan sejak #328 perbedaan itu dipatok tes — jadi ia menjadi
 * keputusan yang tak pernah diambil siapa pun tetapi tak bisa lagi berubah.
 *
 * Issue #331 menyebutnya tepat: *"ini bukan cacat"*. Ia keputusan penamaan yang
 * belum pernah diputuskan.
 *
 * == Aturannya, sekarang ===================================================
 * Nama tab SAMA dengan judul dokumennya, dan boleh berbeda HANYA bila judul itu
 * tidak sah sebagai nama tab Excel: lebih dari 31 huruf, atau memuat salah satu
 * dari `/ \ ? * [ ] :`
 *
 * == Kenapa berbentuk ATURAN, bukan daftar pengecualian ====================
 * Daftar pengecualian membeku: ia tetap benar bunyinya lama sesudah alasannya
 * hilang. Aturan tidak — judul yang suatu hari dipendekkan membuat tabnya WAJIB
 * ikut berubah, dan berkas ini yang menagihnya.
 *
 * Ketiga nama yang tetap berbeda karena itu tidak didaftar di sini; mereka
 * DITURUNKAN dari aturannya.
 */
import { describe, expect, it } from "vitest";

import {
  SHEET_NAMES,
  STATEMENT_TITLES,
  SHEET_NAME_MAX,
  SHEET_NAME_FORBIDDEN,
  titleFitsSheetName,
} from "@/lib/statement-layout";

const KINDS = Object.keys(STATEMENT_TITLES) as (keyof typeof STATEMENT_TITLES)[];

describe("nama tab mengikuti judulnya bila judulnya sah", () => {
  it.each(KINDS.filter((k) => titleFitsSheetName(STATEMENT_TITLES[k])))(
    "%s",
    (kind) => {
      /* Judulnya muat dan tidak memuat karakter terlarang — tidak ada satu pun
         alasan tabnya berbunyi lain. */
      expect(SHEET_NAMES[kind]).toBe(STATEMENT_TITLES[kind]);
    }
  );
});

describe("yang berbeda, berbeda karena judulnya MUSTAHIL — bukan karena selera", () => {
  const berbeda = KINDS.filter((k) => SHEET_NAMES[k] !== STATEMENT_TITLES[k]);

  it("setiap yang berbeda punya judul yang memang tidak sah", () => {
    for (const kind of berbeda) {
      const title = STATEMENT_TITLES[kind];
      expect(
        titleFitsSheetName(title),
        `${kind}: tabnya berbeda ("${SHEET_NAMES[kind]}") padahal judulnya ` +
          `("${title}") SAH dipakai apa adanya. Samakan, atau tulis alasannya ` +
          `sebagai aturan — bukan sebagai pengecualian diam (#331).`
      ).toBe(false);
    }
  });

  it("dan tepat tiga — kalau berubah, itu keputusan yang harus disengaja", () => {
    /* Angka ini bukan patokan estetika: ia membuat sebuah nama tab yang
       diam-diam menyimpang menjadi merah, meski aturannya kebetulan masih
       terpenuhi untuk yang lain. */
    expect(berbeda.sort()).toEqual(
      ["income-statement", "opname-history", "stock-movement"].sort()
    );
  });
});

describe("setiap nama tab sah menurut Excel", () => {
  it.each(KINDS)("%s muat dan tanpa karakter terlarang", (kind) => {
    const name = SHEET_NAMES[kind];
    expect(name.length, `${kind}: "${name}" ${name.length} huruf`).toBeLessThanOrEqual(
      SHEET_NAME_MAX
    );
    expect(SHEET_NAME_FORBIDDEN.test(name), `${kind}: "${name}"`).toBe(false);
  });

  it("aturannya sendiri benar — `/` dan 32 huruf ditolak", () => {
    /* Penjaga yang aturannya salah akan meloloskan segalanya dengan tenang. */
    expect(titleFitsSheetName("Laporan Laba / Rugi")).toBe(false);
    expect(titleFitsSheetName("x".repeat(SHEET_NAME_MAX + 1))).toBe(false);
    expect(titleFitsSheetName("x".repeat(SHEET_NAME_MAX))).toBe(true);
    expect(titleFitsSheetName("Laporan Kas & Bank")).toBe(true);
  });
});
