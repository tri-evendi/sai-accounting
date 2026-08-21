/**
 * Pemeriksa kesesuaian data tidak boleh punya kosakata SENDIRI.
 *
 * `scripts/check-data-conformance.ts` ada untuk menemukan data yang menyimpang
 * dari aturan kode — status di luar enum, mata uang tak dikenal, dan seterusnya.
 * Nilai pembandingnya karena itu WAJIB datang dari konstanta yang sama dengan
 * yang dipakai zod di jalur tulis. Begitu ia menyalin daftarnya sendiri, ia
 * berhenti memeriksa "apakah data sesuai kode" dan mulai memeriksa "apakah data
 * sesuai salinan lama" — yaitu persis kelas cacat yang ia cari, kini di dalam
 * dirinya sendiri.
 *
 * Tesnya statis (membaca berkasnya) sebab isinya SQL terhadap basis data
 * sungguhan: yang bisa dijaga tanpa DB adalah bentuknya, dan bentuk itulah yang
 * paling mudah membusuk diam-diam.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONTRACT_STATUSES, CURRENCIES } from "@/lib/constants";

const SOURCE = readFileSync(join(process.cwd(), "scripts/check-data-conformance.ts"), "utf8");
/** Hanya badan skrip — kepala & komentar memang menyebut nilai contoh. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("kosakata pemeriksa datang dari konstanta, bukan salinan", () => {
  it("mengimpor daftar status & mata uang dari sumber yang dipakai zod", () => {
    expect(CODE).toMatch(/import \{[^}]*CONTRACT_STATUSES[^}]*\} from "\.\.\/src\/lib\/constants"/);
    expect(CODE).toMatch(/import \{[^}]*CURRENCIES[^}]*\} from "\.\.\/src\/lib\/constants"/);
    expect(CODE).toMatch(/ACCOUNT_TYPE_VALUES/);
  });

  it("tidak menuliskan satu pun nilai status sebagai literal", () => {
    const offenders = CONTRACT_STATUSES.filter((s) => CODE.includes(`'${s}'`));
    expect(
      offenders,
      "Nilai status ditulis langsung di SQL. Pakai `list(CONTRACT_STATUSES)` supaya " +
        "pemeriksa ikut berubah saat enum-nya berubah."
    ).toEqual([]);
  });

  it("tidak menuliskan mata uang asing sebagai literal", () => {
    /* `'IDR'` DIKECUALIKAN dengan sengaja: ia bukan anggota daftar yang bisa
       berubah, melainkan MATA UANG DASAR buku besar — dipakai untuk menurunkan
       nilai IDR (`toBase`), bukan untuk memeriksa keanggotaan enum. */
    const offenders = CURRENCIES.filter((c) => c !== "IDR" && CODE.includes(`'${c}'`));
    expect(offenders).toEqual([]);
  });
});

describe("bentuk daftar pemeriksaan", () => {
  const keys = [...CODE.matchAll(/^\s*key: "([a-z0-9-]+)",$/gm)].map((m) => m[1]);
  const judul = [...CODE.matchAll(/^\s*judul: "/gm)].length;

  it("ada beberapa pemeriksaan, masing-masing berkunci unik", () => {
    expect(keys.length).toBeGreaterThanOrEqual(8);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("setiap pemeriksaan punya judul yang bisa dibaca manusia", () => {
    expect(judul).toBe(keys.length);
  });

  it("setiap SQL memulangkan kolom `label` yang dicetak pelapor", () => {
    const sqlCount = [...CODE.matchAll(/^\s*sql: `/gm)].length;
    const labelCount = [...CODE.matchAll(/AS label/g)].length;
    expect(sqlCount).toBe(keys.length);
    expect(labelCount).toBeGreaterThanOrEqual(keys.length);
  });
});

describe("pemeriksa tidak boleh menulis apa pun", () => {
  it("tidak memuat pernyataan yang mengubah data", () => {
    /* Keputusan "angka mana yang benar" hampir selalu butuh dokumen fisik atau
       pemilik datanya. Yang boleh diotomatiskan hanya MENEMUKANNYA. */
    for (const kata of ["UPDATE ", "DELETE ", "INSERT ", "DROP ", "TRUNCATE "]) {
      expect(CODE.toUpperCase()).not.toContain(kata);
    }
  });
});
