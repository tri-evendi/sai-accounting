/**
 * `colorError` AntD TIDAK dipakai sebagai warna TEKS (temuan T1, audit D5 #205).
 *
 * ── Angkanya ───────────────────────────────────────────────────────────────
 * `colorError` bawaan sebagai teks 14px: **3,00:1** (terang) / **3,89:1**
 * (gelap) — gagal 4,5:1 di KEDUA tema. Penggantinya
 * `var(--ant-color-money-negative)` — token yang dipakai `FormMessage` —
 * **6,00:1 / 7,86:1**. Ini kelas kegagalan yang seluruh #186 dibuat untuk
 * mencegah; D5 masih menemukannya di 11 tempat, semuanya ditulis sebaris dan
 * melewati primitifnya.
 *
 * ── Yang ditolak ───────────────────────────────────────────────────────────
 * Properti `color:` (persis `color`, bukan `borderColor`/`background`) yang
 * nilainya `token.colorError` / `colorError` atau `var(--ant-color-error)`.
 *
 * ── Yang SAH, dan sengaja tidak ditolak ────────────────────────────────────
 * - `colorErrorText` / `--ant-color-error-text`: sejak #355
 *   (`statusTextTokens()` di `antd-tokens.ts`) token itu DIALIASKAN ke
 *   `colorMoneyNegative`, jadi ia lolos 4,5:1. Pola `colorError\b` tidak
 *   mencocokinya.
 * - `colorError` di luar `color:` — batas isian bergalat, isian `Progress`,
 *   ikon status besar: grafis non-teks, ambangnya 3:1.
 * - `color: token.colorError` pada **tombol ikon** (`size="icon"`, mis. tombol
 *   hapus baris): yang diwarnainya ikon, bukan teks — non-teks, 3:1. Pengecualian
 *   ini dibaca dari TAG pembukanya, bukan dari daftar berkas, supaya tombol
 *   ikon baru tidak perlu didaftarkan dan teks baru tidak bisa menyelinap
 *   lewat daftar.
 */
import { describe, expect, it } from "vitest";
import { berkasSumber, tanpaKomentar } from "./akar-sumber";

/** Nilai `color:` yang mendaratkan merah bawaan AntD sebagai teks. */
const NILAI_TERLARANG = /(?:\bcolorError\b|var\(--ant-color-error\))/;

/** Setiap `color: <nilai>` — `(?<![\w-])` menyingkirkan `borderColor:` dll. */
const PROPERTI_COLOR = /(?<![\w-])color\s*:\s*([^,}\n]*)/g;

/**
 * Pelanggaran di satu teks sumber (sudah tanpa komentar). Mengembalikan
 * nomor baris 1-based.
 */
function pelanggaranTeksGalat(isi: string): number[] {
  const hasil: number[] = [];
  for (const m of isi.matchAll(PROPERTI_COLOR)) {
    if (!NILAI_TERLARANG.test(m[1])) continue;
    const pos = m.index ?? 0;
    /* Tag pembuka yang memuatnya: `<` terakhir yang diikuti huruf. */
    const sebelum = isi.slice(0, pos);
    const awalTag = Math.max(sebelum.lastIndexOf("<"), 0);
    const tag = sebelum.slice(awalTag);
    if (/^<[A-Za-z]/.test(tag) && /\bsize=["{]\s*"?icon"?/.test(tag)) continue;
    hasil.push(sebelum.split("\n").length);
  }
  return hasil;
}

/**
 * `tanpaKomentar()` membuang komentar blok beserta baris barunya; dikosongkan
 * dulu di sini supaya nomor baris di pesan galat menunjuk baris yang benar.
 */
function tanpaKomentarJagaBaris(isi: string): string {
  return tanpaKomentar(isi.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")));
}

describe("detektor teks colorError", () => {
  it("menolak teks merah bawaan, dalam tiga bentuknya", () => {
    expect(pelanggaranTeksGalat(`<p style={{ color: token.colorError }}>x</p>`)).toEqual([1]);
    expect(pelanggaranTeksGalat(`<span style={{ color: "var(--ant-color-error)" }}>x</span>`)).toEqual([1]);
    expect(
      pelanggaranTeksGalat(`<span style={{\n  color: over ? token.colorError : token.colorText,\n}}>`),
    ).toEqual([2]);
  });

  it("membiarkan yang sah: token *Text, batas, dan tombol ikon", () => {
    expect(pelanggaranTeksGalat(`<b style={{ color: token.colorErrorText }}>x</b>`)).toEqual([]);
    expect(pelanggaranTeksGalat(`<b style={{ color: "var(--ant-color-error-text)" }}>x</b>`)).toEqual([]);
    expect(pelanggaranTeksGalat(`<div style={{ borderColor: token.colorError }} />`)).toEqual([]);
    expect(
      pelanggaranTeksGalat(
        `<Button\n  variant="ghost"\n  size="icon"\n  style={{ color: token.colorError }}\n>`,
      ),
    ).toEqual([]);
    expect(pelanggaranTeksGalat(`<span style={{ color: "var(--ant-color-money-negative)" }}>x</span>`)).toEqual([]);
  });
});

describe("teks galat memakai colorMoneyNegative, bukan colorError (T1 #205)", () => {
  it("tidak ada `color: colorError` sebagai teks di seluruh akar sumber", () => {
    const berkas = berkasSumber([".tsx", ".ts"]).filter(
      (b) => !b.rel.endsWith("packages/ui/src/theme/antd-tokens.ts"),
    );
    /* Penjaga yang memindai nol berkas lulus dengan nol pelanggar. */
    expect(berkas.length).toBeGreaterThan(100);

    const pelanggar = berkas.flatMap((b) =>
      pelanggaranTeksGalat(tanpaKomentarJagaBaris(b.isi)).map((n) => `${b.rel}:${n}`),
    );
    expect(
      pelanggar,
      "Teks berwarna `colorError` = 3,00:1 (terang) / 3,89:1 (gelap), gagal 4,5:1. " +
        'Pakai `color: "var(--ant-color-money-negative)"` (6,00 / 7,86) seperti `FormMessage`.',
    ).toEqual([]);
  });
});
