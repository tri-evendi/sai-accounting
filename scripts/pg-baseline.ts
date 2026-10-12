/**
 * MEMBANGKITKAN SKEMA & BASELINE PostgreSQL DARI SKEMA KANONIK
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10)
 *
 *     bun run pg:baseline            # tulis prisma/postgresql/**
 *     bun run pg:baseline --check    # bandingkan saja; keluar 1 bila beda
 *
 * ══ KENAPA DIBANGKITKAN, BUKAN DISALIN ════════════════════════════════════
 * Migrasi mesin yang menyimpan DUA skema tulisan tangan akan punya dua skema
 * yang berbeda dalam dua minggu. Yang satu dapat kolom baru, yang lain tidak,
 * dan ketidaksamaannya baru terlihat pada hari penukaran — yaitu hari paling
 * buruk untuk menemukannya.
 *
 * Maka skema PostgreSQL di sini **bukan berkas yang disunting manusia**: ia
 * diturunkan dari `prisma/*.prisma` dengan SATU perubahan — baris `provider`.
 * `tests/pg-baseline-parity.test.ts` membangkitkannya ulang di memori dan
 * menolak kalau hasilnya berbeda dari yang ter-commit.
 *
 * ══ SATU PERUBAHAN, DAN ITU SEKALIGUS PEMBUKTIAN ══════════════════════════
 * Kalau menurunkannya menuntut lebih dari mengganti `provider`, maka klaim
 * "skema ini portabel" (audit §1.5) salah, dan tes paritas akan menyatakannya.
 * Sejauh diukur 12 Okt 2026: empat keluarga tipe native, semuanya setara di
 * kedua mesin, jadi satu baris memang cukup.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const AKAR = process.cwd();
const CEK = process.argv.includes("--check");

interface Target {
  /** Skema kanonik (MariaDB) — satu-satunya yang disunting manusia. */
  sumber: string;
  /** Skema turunan (PostgreSQL) — DIBANGKITKAN. */
  turunan: string;
  /** Baseline SQL PostgreSQL. */
  baseline: string;
  label: string;
}

const TARGET: Target[] = [
  {
    sumber: "prisma/schema.prisma",
    turunan: "prisma/postgresql/company.prisma",
    baseline: "prisma/postgresql/company/0001_baseline/migration.sql",
    label: "perusahaan",
  },
  {
    sumber: "prisma/control/schema.prisma",
    turunan: "prisma/postgresql/control.prisma",
    baseline: "prisma/postgresql/control/0001_baseline/migration.sql",
    label: "kendali",
  },
  {
    sumber: "prisma/platform/schema.prisma",
    turunan: "prisma/postgresql/platform.prisma",
    baseline: "prisma/postgresql/platform/0001_baseline/migration.sql",
    label: "platform",
  },
];

const KEPALA = (sumber: string) =>
  `// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DIBANGKITKAN — JANGAN DISUNTING                                     ║
// ║  Sumber : ${sumber.padEnd(58)}║
// ║  Perintah: bun run pg:baseline                                       ║
// ║                                                                      ║
// ║  Satu-satunya perbedaan dari sumbernya adalah baris \`provider\`.       ║
// ║  Kalau kelak dibutuhkan lebih dari itu, klaim portabilitas skema      ║
// ║  (docs/arsitektur/13-AUDIT-SKEMA.md §1.5) sudah tidak benar lagi —    ║
// ║  dan yang harus diperbaiki adalah skema kanoniknya, bukan berkas ini. ║
// ╚══════════════════════════════════════════════════════════════════════╝

`;

/** Turunan = sumber dengan `provider = "mysql"` → `"postgresql"`. Titik. */
export function turunkan(isiSumber: string, namaSumber: string): string {
  const diubah = isiSumber.replace(/provider\s*=\s*"mysql"/g, 'provider = "postgresql"');
  if (diubah === isiSumber) {
    throw new Error(`${namaSumber}: tidak ada \`provider = "mysql"\` untuk diubah.`);
  }
  if (/"mysql"/.test(diubah)) {
    throw new Error(`${namaSumber}: masih ada penyebutan "mysql" setelah penurunan.`);
  }
  return KEPALA(namaSumber) + diubah;
}

function baselineSql(schemaPath: string): string {
  const keluar = execFileSync(
    path.join(AKAR, "node_modules/.bin/prisma"),
    ["migrate", "diff", "--from-empty", "--to-schema", schemaPath, "--script"],
    { encoding: "utf8", cwd: AKAR, maxBuffer: 64 * 1024 * 1024 }
  );
  /* Baris "Loaded Prisma config" ikut ke stdout dan BUKAN SQL — kalau ia
     tersimpan, `psql -f` akan gagal di baris pertama. */
  return keluar
    .split("\n")
    .filter((b) => !/^Loaded Prisma config/.test(b.trim()))
    .join("\n")
    .replace(/^\s+/, "");
}

function main(): void {
  let beda = 0;
  for (const t of TARGET) {
    const isi = readFileSync(path.join(AKAR, t.sumber), "utf8");
    const turunan = turunkan(isi, t.sumber);
    const jalurTurunan = path.join(AKAR, t.turunan);
    const jalurBaseline = path.join(AKAR, t.baseline);

    if (CEK) {
      const adaT = existsSync(jalurTurunan) ? readFileSync(jalurTurunan, "utf8") : "";
      if (adaT !== turunan) {
        console.error(`✗ ${t.label}: ${t.turunan} TIDAK sesuai sumbernya — jalankan \`bun run pg:baseline\``);
        beda++;
      } else {
        console.log(`✓ ${t.label}: skema turunan sesuai`);
      }
      continue;
    }

    mkdirSync(path.dirname(jalurTurunan), { recursive: true });
    writeFileSync(jalurTurunan, turunan);

    const sql = baselineSql(jalurTurunan);
    if (!/CREATE TABLE/.test(sql)) {
      throw new Error(`${t.label}: baseline tidak memuat CREATE TABLE — keluaran prisma tak terduga.`);
    }
    mkdirSync(path.dirname(jalurBaseline), { recursive: true });
    writeFileSync(
      jalurBaseline,
      `-- DIBANGKITKAN dari ${t.turunan} oleh \`bun run pg:baseline\` — JANGAN DISUNTING.\n` +
        `-- Baseline PostgreSQL. Riwayat migration MariaDB (prisma/**/migrations) TIDAK\n` +
        `-- diport: skema adalah sumber kebenarannya, dan 5.241 baris SQL MariaDB tidak\n` +
        `-- punya nilai di mesin baru. Lihat docs/arsitektur/11-RENCANA-POSTGRESQL.md §9.2.\n\n` +
        sql
    );
    const tabel = (sql.match(/CREATE TABLE/g) ?? []).length;
    const indeks = (sql.match(/CREATE INDEX|CREATE UNIQUE INDEX/g) ?? []).length;
    const fk = (sql.match(/ADD CONSTRAINT .* FOREIGN KEY/g) ?? []).length;
    console.log(`✓ ${t.label}: ${tabel} tabel · ${indeks} indeks · ${fk} FK → ${t.baseline}`);
  }
  if (CEK && beda > 0) process.exit(1);
}

/*
 * Dijalankan HANYA sebagai perintah, bukan saat diimpor.
 *
 * `tests/pg-baseline-parity.test.ts` mengimpor `turunkan()` dari berkas ini. Tanpa
 * penjaga ini, mengimpornya akan MENJALANKAN pembangkitnya — sebuah tes yang
 * menulis berkas ke dalam repo, lalu "lulus" dengan membandingkan hasil kerjanya
 * sendiri. Itu tes yang tidak pernah bisa gagal.
 */
/* `import.meta.main` milik Bun belum ada di tipe bawaan TypeScript. Diberi tipe
   di sini, bukan dimatikan dengan `@ts-ignore`: yang dibutuhkan satu properti
   boolean, dan menuliskannya tetap membuat `tsc` memeriksa sisanya. */
const dijalankanLangsung = Boolean((import.meta as unknown as { main?: boolean }).main);

if (dijalankanLangsung) main();
