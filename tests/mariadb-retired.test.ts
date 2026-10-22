/**
 * MariaDB SUDAH DICABUT — DAN TIDAK BOLEH HIDUP KEMBALI DIAM-DIAM (#636)
 *
 * Produksi pindah ke PostgreSQL pada 15 Okt 2026; MariaDB dibiarkan hidup
 * tujuh hari sebagai jalan mundur, lalu dicabut di Fase E (22 Okt 2026): dump
 * terakhirnya dibuktikan terpulihkan ke `mariadb:11` sekali pakai, dan image
 * `sha-c9b5d9c` (v0.12.0) adalah yang terakhir masih membawa jalurnya.
 *
 * == KENAPA PENJAGA, BUKAN SEKADAR PENGHAPUSAN ============================
 * Sisa MariaDB yang tertinggal tidak gagal keras — ia gagal SENYAP, dan repo
 * ini sudah mengalaminya dua kali sesudah penukaran:
 *
 *   • `makeLatestJournalDateReader` memaku driver `mariadb` terhadap URL
 *     PostgreSQL. Setiap pembacaan gagal tersambung, galatnya ditelan, dan
 *     jangkar retensi UU KUP hapus-tenant jatuh ke "hari ini".
 *   • `scripts/backup.sh` memakai perkakas yang benar terhadap host `db` milik
 *     MariaDB: nol cadangan otomatis, sementara container tetap "Up".
 *
 * Jadi yang dijaga di sini adalah setiap pintu yang bisa membawanya kembali:
 * impor driver, dependensi paket, URL `mysql://` di berkas penyebaran, klien
 * MariaDB di image, dan riwayat migration MariaDB di jalur yang dibaca perkakas.
 *
 * Komentar dan prosa SENGAJA tidak dihukum: banyak berkas mencatat sejarah
 * MariaDB dengan alasan yang baik (bug kolasi di `ledger.ts`, angka koneksi di
 * compose). Yang dicari adalah KODE dan URL berkredensial, bukan kata.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { AKAR_REPO, akarSumber, tanpaKomentar } from "./akar-sumber";

const INI = "tests/mariadb-retired.test.ts";

function telusuri(dir: string, akhiran: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  const keluar: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name === "node_modules" || d.name === "generated" || d.name === ".next") continue;
    const penuh = join(dir, d.name);
    if (d.isDirectory()) keluar.push(...telusuri(penuh, akhiran));
    else if (akhiran.some((a) => d.name.endsWith(a))) keluar.push(penuh);
  }
  return keluar;
}

const rel = (p: string) => relative(AKAR_REPO, p).split(sep).join("/");
const baca = (p: string) => readFileSync(join(AKAR_REPO, p), "utf8");

/** Setiap berkas kode TS/JS: akar sumber (src + packages/* + apps/*), skrip, tes, config akar. */
const KODE = [
  ...akarSumber().flatMap((a) => telusuri(a, [".ts", ".tsx", ".mts", ".js", ".mjs"])),
  ...telusuri(join(AKAR_REPO, "scripts"), [".ts", ".mts", ".js", ".mjs"]),
  ...telusuri(join(AKAR_REPO, "tests"), [".ts", ".tsx"]),
  ...readdirSync(AKAR_REPO)
    .filter((n) => /\.(ts|mts|mjs)$/.test(n))
    .map((n) => join(AKAR_REPO, n)),
]
  .map(rel)
  .filter((f) => f !== INI);

/** Impor modul `mariadb` / `@prisma/adapter-mariadb` dalam bentuk apa pun. */
const IMPOR_MARIADB =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|vi\.mock\s*\(\s*|import\s+)["'](?:mariadb|@prisma\/adapter-mariadb)(?:\/[^"']*)?["']/;

/** URL MariaDB yang BERBENTUK sungguhan (berkredensial/host), bukan sebutan di prosa. */
const URL_MARIADB = /\b(?:mysql|mariadb):\/\/[^\s"'`]*@/i;

/** Berkas penyebaran: compose (semua profil), Dockerfile, contoh env, config tes. */
const PENYEBARAN = [
  ...readdirSync(AKAR_REPO).filter((n) => /^docker-compose.*\.ya?ml$/.test(n)),
  "Dockerfile",
  ...readdirSync(AKAR_REPO).filter((n) => /^\.env.*\.example$/.test(n)),
  "vitest.config.mts",
];

describe("kode tidak mengimpor driver MariaDB (#636)", () => {
  it("ada berkas untuk diperiksa — penjaga atas tes ini sendiri", () => {
    expect(KODE.length).toBeGreaterThan(300);
    expect(KODE).toContain("packages/db/src/server.ts");
    expect(KODE.some((f) => f.startsWith("apps/operator/"))).toBe(true);
    expect(KODE.some((f) => f.startsWith("scripts/"))).toBe(true);
  });

  it("pola impornya benar-benar menangkap kelima bentuk", () => {
    for (const contoh of [
      'import { createPool } from "mariadb";',
      "const m = await import('mariadb');",
      'const m = require("mariadb");',
      'vi.mock("@prisma/adapter-mariadb", () => ({}));',
      'import "@prisma/adapter-mariadb";',
    ]) {
      expect(IMPOR_MARIADB.test(contoh), contoh).toBe(true);
    }
    expect(IMPOR_MARIADB.test('import { Client } from "pg";')).toBe(false);
  });

  it("nol impor `mariadb` / `@prisma/adapter-mariadb` di src, packages, apps, scripts, tests", () => {
    const pelanggar = KODE.filter((f) => IMPOR_MARIADB.test(tanpaKomentar(baca(f))));
    expect(
      pelanggar,
      "MariaDB dicabut di #636. Sambungan mentah: `bukaBasisData`/`bukaServer` dari " +
        "`@sai/db/server`; klien Prisma: `buatAdapter` dari `@sai/db/adapter`."
    ).toEqual([]);
  });

  it("tidak ada manifes yang memasang paket MariaDB", () => {
    const manifes = [
      "package.json",
      ...["packages", "apps"].flatMap((induk) =>
        readdirSync(join(AKAR_REPO, induk))
          .map((n) => `${induk}/${n}/package.json`)
          .filter((p) => existsSync(join(AKAR_REPO, p)))
      ),
    ];
    expect(manifes.length).toBeGreaterThan(5);
    for (const m of manifes) {
      const j = JSON.parse(baca(m)) as Record<string, Record<string, string> | undefined>;
      const semua = { ...j.dependencies, ...j.devDependencies, ...j.optionalDependencies };
      expect(Object.keys(semua), m).not.toContain("mariadb");
      expect(Object.keys(semua), m).not.toContain("@prisma/adapter-mariadb");
    }
  });

  it("bun.lock tidak lagi memuat paket MariaDB", () => {
    /* Manifes yang bersih dengan lockfile basi berarti `bun install --frozen-lockfile`
       di CI gagal — atau lebih buruk, image yang masih membawa driver lama. */
    const lock = baca("bun.lock");
    expect(lock).not.toMatch(/"@prisma\/adapter-mariadb"/);
    expect(lock).not.toMatch(/"mariadb@/);
  });
});

describe("berkas penyebaran tidak menunjuk MariaDB (#636)", () => {
  it("pola URL-nya menangkap URL sungguhan, bukan sebutan di prosa", () => {
    expect(URL_MARIADB.test('DATABASE_URL="mysql://sai:x@db:3306/sai"')).toBe(true);
    expect(URL_MARIADB.test("# PLATFORM_DATABASE_URL=mariadb://u:p@db/x")).toBe(true);
    expect(URL_MARIADB.test("# `mysql://` URLs are REJECTED at start-up")).toBe(false);
  });

  it.each(PENYEBARAN)("%s: nol URL `mysql://` / `mariadb://`", (berkas) => {
    /* Teks MENTAH, komentar ikut: contoh URL yang dikomentari di `.env.example`
       adalah yang disalin orang. */
    expect(baca(berkas)).not.toMatch(URL_MARIADB);
  });

  it("daftar berkas penyebarannya lengkap — penjaga atas tes ini sendiri", () => {
    expect(PENYEBARAN).toEqual(
      expect.arrayContaining([
        "docker-compose.yml",
        "docker-compose.onprem.yml",
        "Dockerfile",
        ".env.example",
        ".env.docker.example",
      ])
    );
  });

  it("tidak ada service ber-image MariaDB dan tidak ada klien MariaDB di image", () => {
    for (const b of PENYEBARAN.filter((n) => n.startsWith("docker-compose"))) {
      expect(tanpaKomentar(baca(b)), b).not.toMatch(/image:\s*["']?(?:mariadb|mysql)\b/);
    }
    const dockerfile = tanpaKomentar(baca("Dockerfile"));
    expect(dockerfile).not.toMatch(/mariadb-client|mysql-client|default-mysql-client/);
  });
});

describe("riwayat migration MariaDB hanya hidup di ARSIP (#636)", () => {
  it("jalur lama tidak ada lagi — tidak ada perkakas yang bisa membacanya sebagai riwayat aktif", () => {
    for (const lama of ["prisma/migrations", "prisma/control/migrations", "prisma/platform/migrations"]) {
      expect(existsSync(join(AKAR_REPO, lama)), `${lama} hidup kembali`).toBe(false);
    }
  });

  it("arsipnya ada, lengkap untuk ketiga basis data, dan memang MariaDB", () => {
    for (const t of ["company", "control", "platform"]) {
      const lock = join(AKAR_REPO, "prisma/_arsip-mariadb", t, "migration_lock.toml");
      expect(existsSync(lock), `arsip ${t} hilang`).toBe(true);
      expect(readFileSync(lock, "utf8")).toMatch(/provider = "mysql"/);
    }
  });

  it.each(["prisma.config.ts", "prisma.control.config.ts", "prisma.platform.config.ts"])(
    "%s menerapkan migration dari prisma/postgresql/, bukan dari arsip",
    (cfg) => {
      const kode = tanpaKomentar(baca(cfg));
      expect(kode).toMatch(/path:\s*"prisma\/postgresql\/(?:company|control|platform)"/);
      expect(kode).not.toMatch(/_arsip-mariadb/);
    }
  );
});
