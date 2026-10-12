/**
 * SKEMA PostgreSQL HARUS TETAP TURUNAN, BUKAN SALINAN YANG MENYIMPANG
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10)
 *
 * ══ CACAT YANG DIJAGA ═════════════════════════════════════════════════════
 * Migrasi mesin yang menyimpan DUA skema tulisan tangan akan punya dua skema
 * yang berbeda dalam dua minggu: yang satu dapat kolom baru, yang lain tidak.
 * Ketidaksamaannya tidak terlihat sampai hari penukaran — hari paling buruk
 * untuk menemukannya.
 *
 * Maka `prisma/postgresql/*.prisma` DIBANGKITKAN dari skema kanonik dengan satu
 * perubahan: baris `provider`. Tes ini membangkitkannya ulang di memori dan
 * menolak kalau yang ter-commit berbeda.
 *
 * ══ IA JUGA MEMBUKTIKAN KLAIM PORTABILITAS ════════════════════════════════
 * Kalau menurunkan skema PostgreSQL kelak menuntut lebih dari mengganti satu
 * baris, maka klaim "skema ini portabel" (audit §1.5) sudah tidak benar — dan
 * tes ini yang akan menyatakannya, bukan seseorang yang menemukannya saat
 * migrasi berjalan.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { turunkan } from "../scripts/pg-baseline";

const PASANGAN = [
  ["perusahaan", "prisma/schema.prisma", "prisma/postgresql/company.prisma"],
  ["kendali", "prisma/control/schema.prisma", "prisma/postgresql/control.prisma"],
  ["platform", "prisma/platform/schema.prisma", "prisma/postgresql/platform.prisma"],
] as const;

const BASELINE = [
  ["perusahaan", "prisma/postgresql/company/0001_baseline/migration.sql"],
  ["kendali", "prisma/postgresql/control/0001_baseline/migration.sql"],
  ["platform", "prisma/postgresql/platform/0001_baseline/migration.sql"],
] as const;

describe("paritas skema PostgreSQL: turunan, bukan salinan", () => {
  for (const [label, sumber, turunanPath] of PASANGAN) {
    it(`${label}: skema turunan sama dengan hasil pembangkitan ulang`, () => {
      const isi = readFileSync(join(process.cwd(), sumber), "utf8");
      const harusnya = turunkan(isi, sumber);
      const ada = readFileSync(join(process.cwd(), turunanPath), "utf8");
      expect(
        ada,
        `${turunanPath} tidak sesuai sumbernya. Jalankan \`bun run pg:baseline\`. ` +
          `JANGAN menyunting berkas turunan — perbaiki ${sumber}.`
      ).toBe(harusnya);
    });
  }

  it("penurunannya MENOLAK skema yang tidak punya provider mysql", () => {
    /* Kalau sumbernya kelak sudah PostgreSQL, menurunkan lagi akan menghasilkan
       berkas identik tanpa satu pun tanda — dan skrip yang "berhasil" tanpa
       mengerjakan apa pun adalah cara termudah kehilangan langkah. */
    expect(() => turunkan('datasource db {\n provider = "postgresql"\n}', "uji")).toThrow(/mysql/);
  });

  it("penurunannya menolak kalau masih ada sisa penyebutan mysql", () => {
    expect(() =>
      turunkan('datasource db {\n provider = "mysql"\n}\n// catatan: "mysql" lama', "uji")
    ).toThrow(/masih ada penyebutan/);
  });

  for (const [label, path] of BASELINE) {
    it(`${label}: baseline PostgreSQL ada dan berisi DDL, bukan pesan CLI`, () => {
      const p = join(process.cwd(), path);
      expect(existsSync(p), `${path} belum dibangkitkan — jalankan \`bun run pg:baseline\``).toBe(true);
      const sql = readFileSync(p, "utf8");
      expect(sql).toMatch(/CREATE TABLE/);
      /* Prisma menulis "Loaded Prisma config…" ke stdout. Kalau ia ikut
         tersimpan, `psql -f` gagal di baris pertama — dan gagalnya terjadi saat
         penukaran, bukan saat pembangkitan. */
      expect(sql, "baris pesan CLI ikut tersimpan ke dalam SQL").not.toMatch(/Loaded Prisma config/);
      expect(sql).not.toMatch(/AUTO_INCREMENT|ENGINE=InnoDB|utf8mb4/);
    });
  }
});
