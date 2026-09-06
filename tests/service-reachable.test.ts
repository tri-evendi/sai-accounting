/**
 * LAYANAN YANG TIDAK PUNYA PINTU (issue #555).
 *
 * ══ KEJADIAN YANG MELAHIRKAN BERKAS INI ════════════════════════════════════
 * `year-close-service.ts` mendarat lengkap dengan penjaganya — 19 tes hijau,
 * `verify` EXIT=0, `build` EXIT=0 — lalu DIGELAR KE PRODUKSI tanpa satu pun
 * pemanggil. Tidak ada route, tidak ada tombol. `closeYear()` dan
 * `reverseYearClose()` benar, teruji, dan tak terjangkau: kode mati yang
 * terlihat persis seperti fitur.
 *
 * Ketahuannya bukan dari tes melainkan dari menyapu bundel yang benar-benar
 * digelar (`grep -rl "yearClose" /app/.next/server` → kosong).
 *
 * ══ KENAPA TIDAK ADA PENJAGA YANG MENANGKAPNYA ═════════════════════════════
 * `rsc-boundary` menangkap HALAMAN baru. `authz-coverage` menangkap ROUTE baru.
 * Keduanya menjaga permukaan yang ADA — dan yang terjadi di sini adalah
 * permukaan yang TIDAK PERNAH DIBUAT. Sebuah fungsi ber-`export` yang tak
 * pernah dipanggil tidak melanggar tipe apa pun, tidak menyentuh satu penjaga
 * pun, dan tidak menghasilkan satu peringatan pun.
 *
 * Berkas ini menutup celah itu dengan satu pertanyaan yang sangat murah:
 * **adakah yang memanggilnya.**
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(__dirname, "..", "src");
const TESTS = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    /* Klien Prisma hasil generate — bukan kode kita, dan memuat ribuan nama
       yang akan mencocoki apa pun. */
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Modul yang namanya menyatakan dirinya LAYANAN — jalur tulis, bukan pembaca. */
const services = readdirSync(join(SRC, "lib"))
  .filter((f) => f.endsWith("-service.ts"))
  .map((f) => join(SRC, "lib", f));

/*
 * Disapu SRC **dan** tests/. Sebuah fungsi yang diekspor semata-mata supaya
 * bisa diuji adalah ekspor yang SAH, dan penjaga yang menolaknya akan
 * memerah untuk kode yang benar — lalu dilonggarkan tanpa dibaca.
 *
 * Yang dicari bukan "dipakai aplikasi" melainkan "dipakai SIAPA PUN". Itu tetap
 * menangkap kejadian yang melahirkan berkas ini: `closeYear()` tidak dipanggil
 * dari src/ maupun dari satu tes pun.
 */
const allFiles = [...sourceFiles(SRC), ...sourceFiles(TESTS)];

/**
 * Buang komentar sebelum menyapu.
 *
 * ⚠ Tanpa ini penjaga ini tertipu oleh DOKUMENTASINYA SENDIRI: kepala berkas
 * ini menyebut `closeYear()` dan `reverseYearClose()` lengkap dengan tanda
 * kurung, dan penyapuan mentah membacanya sebagai PEMANGGILAN. Akibatnya kedua
 * fungsi itu tampak punya pintu justru pada saat mereka tidak punya — penjaga
 * yang dilucuti oleh keterangan tentang dirinya sendiri.
 *
 * Kesalahan yang sama sudah terjadi sekali di `year-close-reversal.test.ts`
 * (penjaga "tidak memakai reverseJournal" memerah karena komentar yang
 * menjelaskan kenapa ia tidak dipakai), dan terulang di sini. Yang dijaga
 * PEMANGGILAN, bukan penyebutan.
 */
const bersih = (kode: string) =>
  kode.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Nama fungsi yang diekspor sebuah modul. */
function exportedFunctions(code: string): string[] {
  return [...code.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map((m) => m[1]);
}

describe("setiap layanan punya pintu", () => {
  it("ada modul `*-service.ts` untuk dijaga — kalau nol, berkas ini tidak menjaga apa pun", () => {
    expect(services.length).toBeGreaterThan(0);
  });

  it.each(services.map((f) => [relative(SRC, f).split(sep).join("/"), f]))(
    "%s: setiap fungsi yang diekspornya dipanggil dari luar berkasnya",
    (_nama, file) => {
      const code = bersih(readFileSync(file, "utf8"));
      const fns = exportedFunctions(code);
      expect(fns.length, "layanan tanpa fungsi terekspor").toBeGreaterThan(0);

      const lain = allFiles.filter((f) => f !== file);
      const yatim = fns.filter((fn) => {
        const dipakai = new RegExp(`\\b${fn}\\s*\\(`);
        return !lain.some((f) => dipakai.test(bersih(readFileSync(f, "utf8"))));
      });

      expect(
        yatim,
        `Fungsi berikut diekspor tetapi TIDAK dipanggil dari mana pun di src/ maupun tests/. ` +
          `Sebuah layanan tanpa pintu adalah kode mati yang terlihat seperti fitur: ` +
          `ia lolos tsc, lolos setiap penjaga, dan digelar ke produksi tanpa bisa ` +
          `dijalankan siapa pun. Buatkan route/halamannya, atau cabut fungsinya.`
      ).toEqual([]);
    }
  );
});

describe("pendeteksinya benar-benar bisa merah — dibuktikan di sini, bukan diandaikan", () => {
  it("fungsi terekspor yang tak dipanggil memang terdeteksi", () => {
    /* Penjaga yang tidak pernah dilihat merah bukan penjaga. Di sini
       kemerahannya dibuktikan atas kode contoh, tanpa harus merusak berkas
       sungguhan. */
    /* Namanya DIRAKIT, bukan ditulis utuh: berkas ini ikut disapu, jadi nama
       yang ditulis apa adanya akan mencocoki dirinya sendiri dan membuat
       pembuktian ini selalu lulus — persis jenis penjaga-palsu yang sudah
       sekali tertangkap di repo ini. */
    const nama = "tidakAda" + "YangMemanggilku";
    const contoh = `export async function ${nama}() { return 1; }`;
    expect(exportedFunctions(contoh)).toEqual([nama]);

    const dipakai = new RegExp(`\\b${nama}\\s*\\(`);
    expect(allFiles.some((f) => dipakai.test(bersih(readFileSync(f, "utf8"))))).toBe(false);
  });
});
