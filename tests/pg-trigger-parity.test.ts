/**
 * SETIAP TRIGGER MariaDB HARUS PUNYA PADANAN PostgreSQL
 * (migrasi PostgreSQL — docs/arsitektur/07-RIWAYAT.md)
 *
 * == CACAT YANG DIJAGA =====================================================
 * Baseline PostgreSQL DIBANGKITKAN Prisma dari skema, dan Prisma tidak tahu
 * apa pun tentang trigger — ia bukan bagian dari model. Diperiksa 12 Okt 2026:
 * baseline PostgreSQL memuat **nol** trigger, sementara MariaDB punya satu.
 *
 * Trigger `companies_slug_immutable` ada justru untuk menjaga jalur yang BELUM
 * TERBAYANG — skrip perbaikan sekali pakai, terminal jam 2 pagi, migration orang
 * lain. Kehilangannya saat pindah mesin tidak akan menghasilkan galat, baris
 * log, atau gejala apa pun; ia akan terlihat pada hari sebuah `UPDATE` mengubah
 * slug dan memutus setiap tautan yang pernah dibagikan.
 *
 * Maka tes ini membandingkan DAFTARNYA, bukan isinya: setiap `CREATE TRIGGER`
 * di migration MariaDB harus punya berkas padanan di `prisma/postgresql/`.
 * Isinya tidak bisa dibandingkan otomatis — sintaksisnya memang berbeda — tapi
 * yang paling mungkin terjadi bukan terjemahan yang salah, melainkan terjemahan
 * yang TIDAK ADA.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const AKAR = process.cwd();

/** Semua berkas migration MariaDB, dari ketiga basis data. */
function migrationMariaDb(): { path: string; isi: string }[] {
  const akar = ["prisma/_arsip-mariadb/company", "prisma/_arsip-mariadb/control", "prisma/_arsip-mariadb/platform"];
  const keluar: { path: string; isi: string }[] = [];
  for (const dir of akar) {
    const penuh = join(AKAR, dir);
    if (!existsSync(penuh)) continue;
    for (const sub of readdirSync(penuh)) {
      const f = join(penuh, sub, "migration.sql");
      if (existsSync(f)) keluar.push({ path: `${dir}/${sub}`, isi: readFileSync(f, "utf8") });
    }
  }
  return keluar;
}

/** Nama trigger yang dibuat sebuah berkas SQL (komentar dibuang lebih dulu). */
function triggerDi(sql: string): string[] {
  const tanpaKomentar = sql.replace(/--.*$/gm, "");
  return [...tanpaKomentar.matchAll(/CREATE\s+TRIGGER\s+`?(\w+)`?/gi)].map((m) => m[1]!);
}

function sqlPostgres(): string {
  const dir = join(AKAR, "prisma/postgresql");
  if (!existsSync(dir)) return "";
  let isi = "";
  const telusuri = (p: string) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const anak = join(p, e.name);
      if (e.isDirectory()) telusuri(anak);
      else if (e.name.endsWith(".sql")) isi += readFileSync(anak, "utf8") + "\n";
    }
  };
  telusuri(dir);
  /* Komentar dibuang SEBELUM dipindai. Tanpa ini, berkas padanan yang
     MENJELASKAN perbedaannya ("`RAISE EXCEPTION` menggantikan `SIGNAL
     SQLSTATE`") akan gagal pada pemeriksaan yang melarang `SIGNAL SQLSTATE` —
     yaitu tes yang menghukum dokumentasi yang baik. Ketahuan saat tes ini
     pertama dijalankan. */
  return isi.replace(/--.*$/gm, "");
}

describe("paritas trigger: Prisma tidak membangkitkannya, jadi ia mudah hilang", () => {
  const diMariaDb = [...new Set(migrationMariaDb().flatMap((m) => triggerDi(m.isi)))];

  it("MariaDB memang punya trigger — kalau tidak, tes ini kosong tanpa ada yang tahu", () => {
    /* Penjaga atas tes ini sendiri: kalau pembacanya rusak dan memulangkan
       daftar kosong, seluruh pemeriksaan di bawah akan HIJAU tanpa memeriksa
       apa pun. */
    expect(diMariaDb.length).toBeGreaterThan(0);
    expect(diMariaDb).toContain("companies_slug_immutable");
  });

  it("setiap trigger MariaDB punya padanan di prisma/postgresql/", () => {
    const pg = sqlPostgres();
    const kurang = diMariaDb.filter((t) => !new RegExp(`CREATE\\s+TRIGGER\\s+${t}\\b`, "i").test(pg));
    expect(
      kurang,
      "Trigger ini ada di MariaDB tapi TIDAK di baseline PostgreSQL. Prisma tidak " +
        "membangkitkan trigger — tulis padanannya sebagai migration tambahan di " +
        "prisma/postgresql/<db>/NNNN_<nama>/migration.sql. Lihat " +
        "docs/arsitektur/07-RIWAYAT.md"
    ).toEqual([]);
  });

  it("padanannya memakai bentuk PostgreSQL, bukan SQL MariaDB yang disalin", () => {
    /* Terjemahan yang disalin mentah akan "ada" menurut tes di atas tapi gagal
       saat diterapkan — dan gagalnya terjadi saat penukaran. */
    const pg = sqlPostgres();
    expect(pg).toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(pg).toMatch(/EXECUTE FUNCTION/i);
    expect(pg, "SIGNAL SQLSTATE milik MySQL — PostgreSQL memakai RAISE EXCEPTION").not.toMatch(
      /SIGNAL\s+SQLSTATE/i
    );
    expect(pg, "operator <=> milik MySQL — PostgreSQL memakai IS DISTINCT FROM").not.toMatch(/<=>/);
  });

  it("pesan galatnya SAMA di kedua mesin", () => {
    /* Pesannya menyebut alasan, dan itu disengaja: galat generik membuat orang
       berikutnya mengira ini bug lalu mencari cara melewatinya. Kalau kedua
       mesin berbunyi berbeda, salah satunya akan membusuk tanpa ada yang tahu
       yang mana. */
    const pesan = "slug perusahaan permanen (#161)";
    const my = migrationMariaDb().some((m) => m.isi.includes(pesan));
    expect(my, "pesan tidak ditemukan di migration MariaDB").toBe(true);
    expect(sqlPostgres()).toContain(pesan);
  });
});
