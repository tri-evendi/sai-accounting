/**
 * Slug perusahaan PERMANEN (issue #161) — penjaga di tingkat sumber.
 *
 * Penegakan yang sebenarnya ada di basis data: trigger
 * `companies_slug_immutable` (migration kendali 0010) menolak setiap UPDATE
 * yang mengubah NILAI `slug`, dari jalur mana pun — termasuk `mariadb` di
 * terminal dan skrip perbaikan sekali pakai. Tes ini tidak menggantikannya; ia
 * menjawab pertanyaan yang tidak bisa dijawab trigger:
 *
 *   • Trigger berbunyi saat kode DIJALANKAN, dan jalur pembaruan perusahaan
 *     tidak punya tes end-to-end yang menyentuh basis data kendali. Kode yang
 *     mencoba `UPDATE slug` karena itu bisa lolos review, lolos CI, dan baru
 *     gagal di tangan pengguna pertama yang mencobanya.
 *   • Trigger juga bisa hilang tanpa suara: satu migration berikutnya yang
 *     me-rebuild tabel `companies` membawanya serta. Kalau tidak ada yang
 *     memeriksa keberadaannya, hilangnya hanya ketahuan pada hari sebuah slug
 *     benar-benar berubah — yaitu terlambat.
 *
 * Jadi yang dijaga di sini dua: **tidak ada kode yang menulis `slug` ke baris
 * yang sudah ada**, dan **triggernya masih tertulis di pohon migration**.
 *
 * Yang SENGAJA tidak dijaga: `create`. Slug memang ditulis sekali saat
 * perusahaan lahir — itu bukan perubahan, itu kelahirannya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..");
const SRC_DIR = join(ROOT, "src");
const SCRIPTS_DIR = join(ROOT, "scripts");
/** Klien Prisma hasil generate — bukan kode kita, dan penuh contoh di JSDoc. */
const GENERATED_DIR = join(SRC_DIR, "generated");

const MIGRATION = join(
  ROOT,
  "prisma",
  "control",
  "migrations",
  "0010_companies_slug_immutable",
  "migration.sql"
);

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return full === GENERATED_DIR ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function label(file: string): string {
  return relative(ROOT, file).split(sep).join("/");
}

/**
 * Satu pengecualian, dan hanya satu: PEMBUKTIANNYA sendiri harus mencoba
 * mengganti slug — mencoba lalu ditolak adalah seluruh isi pembuktian itu.
 * Percobaannya berjalan di dalam transaksi yang SELALU di-rollback dan skrip
 * itu memeriksa sendiri bahwa barisnya tidak berubah.
 *
 * Menambah baris di sini berarti mengaku ada kode yang menulis slug ke baris
 * yang sudah ada. Sertakan alasannya, dan ingat trigger di basis data tetap
 * akan menolaknya saat dijalankan — daftar ini hanya membungkam tes, bukan
 * aturannya.
 */
const ALLOWLIST = new Set(["scripts/prove-company-slug-immutable.ts"]);

/**
 * `.company.update(...)` / `.updateMany(...)` — apa pun nama kliennya
 * (`controlDb`, `control`, `tx`, `prisma`). Yang diperiksa adalah 600 karakter
 * SESUDAH pemanggilan: cukup untuk memuat `data: { … }` pada gaya penulisan
 * yang dipakai repo ini, dan cukup pendek untuk tidak menyeret pemanggilan
 * berikutnya.
 */
const UPDATE_CALL = /\.company\.(update|updateMany|upsert)\s*\(/g;
/**
 * Hanya isi `data:` yang dilihat, bukan seluruh pemanggilan — `where: { slug }`
 * adalah PENCARIAN menurut slug dan sepenuhnya sah; yang terlarang adalah
 * menuliskannya.
 */
const DATA_ARG = /\bdata\s*:/;
/**
 * `slug: x`, `slug,` dan `slug }` sekaligus. Versi pertama penjaga ini hanya
 * mencari `slug:` — dan tes negatifnya membuktikan properti singkat
 * (`data: { slug, name }`) lolos begitu saja. Penjaga yang tidak pernah
 * dicoba gagal adalah penjaga yang belum diketahui rusak.
 */
const SLUG_PROPERTY = /\bslug\b\s*[:,}]/;
/** Pembaruan lewat SQL mentah, yang tidak akan tertangkap pola di atas. */
const RAW_SQL_UPDATE = /UPDATE\s+`?companies`?[\s\S]{0,300}?\bset\b[\s\S]{0,200}?\bslug\b\s*=/gi;

describe("slug perusahaan permanen (#161)", () => {
  const files = [...sourceFiles(SRC_DIR), ...sourceFiles(SCRIPTS_DIR)];

  it("menemukan berkas sumber untuk diperiksa", () => {
    // Penjaga bagi penjaga: kalau penelusurannya kosong, dua tes di bawah lulus
    // tanpa memeriksa apa pun.
    expect(files.length).toBeGreaterThan(200);
  });

  it("tidak ada jalur kode yang menulis `slug` ke perusahaan yang sudah ada", () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (ALLOWLIST.has(label(file))) continue;
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(UPDATE_CALL)) {
        const start = match.index ?? 0;
        const window = source.slice(start, start + 600);
        const data = DATA_ARG.exec(window);
        if (!data) continue;

        if (SLUG_PROPERTY.test(window.slice(data.index, data.index + 400))) {
          const line = source.slice(0, start).split("\n").length;
          offenders.push(`${label(file)}:${line}`);
        }
      }

      for (const match of source.matchAll(RAW_SQL_UPDATE)) {
        const line = source.slice(0, match.index ?? 0).split("\n").length;
        offenders.push(`${label(file)}:${line} (SQL mentah)`);
      }
    }

    expect(
      offenders,
      "Slug perusahaan permanen (#161): ia menyusun nama basis data " +
        "(`sai_t{tenantId}_{slug}`) dan duduk di URL, jadi menggantinya " +
        "me-rename basis data hidup DAN mematikan setiap tautan yang pernah " +
        "dibagikan — tanpa satu pun galat, hanya `not-found`. Yang boleh " +
        "berubah adalah `name`. Kalau penggantian nama memang dibutuhkan, " +
        "jalurnya bukan `UPDATE slug` melainkan alias lama yang disimpan dan " +
        "tetap dilayani. Basis data akan menolak ini lewat trigger " +
        "`companies_slug_immutable`; tes ini hanya memberitahumu lebih awal."
    ).toEqual([]);
  });

  it("daftar pengecualian tidak menyimpan nama berkas yang sudah tiada", () => {
    // Entri basi diam-diam melebarkan penjaga: berkas baru dengan nama yang
    // sama akan lahir sudah kebal.
    const stale = [...ALLOWLIST].filter((path) => !existsSync(join(ROOT, path)));
    expect(stale, "hapus entri yang berkasnya sudah tidak ada").toEqual([]);
  });

  it("trigger `companies_slug_immutable` masih ada di pohon migration", () => {
    // Migration yang dihapus atau tabel yang di-rebuild membawa triggernya
    // serta, dan hilangnya tidak berbunyi di mana pun sampai ada slug yang
    // benar-benar berubah.
    expect(existsSync(MIGRATION), `${label(MIGRATION)} hilang`).toBe(true);

    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/CREATE TRIGGER `companies_slug_immutable` BEFORE UPDATE ON `companies`/);
    expect(sql).toMatch(/SIGNAL SQLSTATE '45000'/);
    // Perbandingan NILAI, bukan kehadiran kolom di SET — `SET slug = slug` dan
    // penulisan baris penuh harus tetap lolos.
    expect(sql).toMatch(/NEW\.`slug` <=> OLD\.`slug`/);
  });

  it("pesan galatnya menyebut alasan dan muat dalam batas MESSAGE_TEXT", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const message = /MESSAGE_TEXT = '([^']+)'/.exec(sql)?.[1];

    expect(message, "pesan SIGNAL tidak ditemukan di migration").toBeTruthy();
    // MariaDB memotong MESSAGE_TEXT di 128 karakter TANPA memperingatkan —
    // pesan yang terpotong berhenti tepat sebelum bagian yang menjelaskan.
    expect(message!.length).toBeLessThanOrEqual(128);
    // Galat generik membuat pembacanya mengira ini bug dan mencari jalan
    // memutar; yang menahannya adalah kalimat yang menyebut sebab DAN
    // menunjukkan apa yang boleh diubah sebagai gantinya.
    expect(message).toMatch(/#161/);
    expect(message!.toLowerCase()).toMatch(/nama/);
  });
});
