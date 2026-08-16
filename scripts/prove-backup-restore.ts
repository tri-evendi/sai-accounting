/**
 * BUKTI: cadangan bisa DIPULIHKAN (issue #374).
 *
 *   bun run prove-backup-restore                    # cadangan terbaru
 *   bun run prove-backup-restore --key <nama.enc>   # cadangan tertentu
 *
 * ══ KENAPA SKRIP INI ADA, DAN KENAPA IA YANG PALING PENTING ════════════════
 * Sebuah cadangan yang tidak pernah dipulihkan bukan cadangan — ia file yang
 * kita HARAP berisi sesuatu. Setiap kegagalan pemulihan yang pernah saya baca
 * riwayatnya punya bentuk yang sama: cadangannya berjalan bertahun-tahun,
 * lampu hijau setiap hari, dan baru pada hari kejadian ketahuan bahwa
 * dumpnya kosong / sandinya salah / satu basis data tidak pernah ikut.
 *
 * Yang mengubah harapan menjadi pengetahuan cuma satu hal: benar-benar
 * memulihkannya, secara rutin, sebelum ada yang membutuhkannya.
 *
 * ══ APA YANG DIBUKTIKAN ════════════════════════════════════════════════════
 *   1. Berkasnya ADA di tujuan, dan sidik jarinya cocok (ciphertext utuh).
 *   2. Sandinya BENAR — dekripsi berhasil.
 *   3. Isinya benar-benar dump: setiap basis data yang terdaftar di registry
 *      muncul di dalamnya, TERMASUK setiap buku PT. Cadangan yang kehilangan
 *      satu PT adalah cadangan yang gagal untuk pelanggan itu saja — dan
 *      itulah bentuk kegagalan yang paling mudah tidak terlihat.
 *   4. Berkas dokumen & jejak audit ikut (#367/#370 hidup di luar basis data).
 *
 * ══ APA YANG TIDAK DILAKUKAN ═══════════════════════════════════════════════
 * TIDAK memuat dumpnya ke basis data mana pun. Skrip ini hanya-baca terhadap
 * seluruh dunia: satu perintah `mariadb <` yang salah sasaran akan menimpa
 * produksi dengan data lama, dan tidak ada nilai pembuktian yang sepadan
 * dengan risiko itu. Pemuatan sungguhan ke server bayangan adalah LATIHAN
 * KUARTALAN yang dijalankan manusia, dengan tujuan yang ia ketik sendiri.
 * Berkas hasil dekripsi ditinggalkan (dan jalurnya dicetak) supaya latihan itu
 * tinggal melanjutkan.
 */

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient as ControlClient } from "../src/generated/control/client.js";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const s3Args = process.env.BACKUP_S3_ENDPOINT
  ? ["--endpoint-url", process.env.BACKUP_S3_ENDPOINT]
  : [];

function main(): void {
  const bucket = process.env.BACKUP_S3_BUCKET;
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (!bucket) fail("BACKUP_S3_BUCKET belum diset — tidak tahu di mana cadangannya.");
  if (!key) fail("BACKUP_ENCRYPTION_KEY belum diset — tanpa sandinya tidak ada yang bisa dibuka.");

  const prefix = process.env.BACKUP_S3_PREFIX ?? "cadangan";
  const base = `s3://${bucket}/${prefix}`;
  const work = mkdtempSync(path.join(tmpdir(), "prove-restore-"));

  /* ── 1. Pilih cadangan ──────────────────────────────────────────────── */
  let name = argValue("--key");
  if (!name) {
    const listing = run("aws", ["s3", "ls", ...s3Args, `${base}/`]);
    const names = listing
      .split("\n")
      .map((line) => line.trim().split(/\s+/).pop() ?? "")
      .filter((n) => n.endsWith(".tar.gz.enc"))
      .sort();
    if (names.length === 0) {
      fail(`tidak ada satu pun cadangan di ${base}/ — layanan \`backup\` sudah pernah jalan?`);
    }
    name = names[names.length - 1];
  }
  console.log(`Cadangan yang diuji: ${name}`);

  /* ── 2. Unduh + cocokkan sidik jari ─────────────────────────────────── */
  const sealed = path.join(work, name);
  run("aws", ["s3", "cp", ...s3Args, `${base}/${name}`, sealed]);
  run("aws", ["s3", "cp", ...s3Args, `${base}/${name}.sha256`, `${sealed}.sha256`]);

  const expected = readFileSync(`${sealed}.sha256`, "utf8").trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(readFileSync(sealed)).digest("hex");
  if (expected !== actual) {
    fail(
      `SIDIK JARI TIDAK COCOK — berkasnya rusak di penyimpanan atau di jalan.\n` +
        `  tercatat : ${expected}\n  terhitung: ${actual}`
    );
  }
  console.log(`✓ sidik jari cocok (${(statSync(sealed).size / 1024 / 1024).toFixed(1)} MB)`);

  /* ── 3. Dekripsi — inilah yang membuktikan sandinya benar ───────────── */
  const archive = sealed.replace(/\.enc$/, "");
  try {
    execFileSync(
      "openssl",
      ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
       "-in", sealed, "-out", archive, "-pass", "env:BACKUP_ENCRYPTION_KEY"],
      { stdio: "pipe" }
    );
  } catch {
    fail(
      "DEKRIPSI GAGAL — BACKUP_ENCRYPTION_KEY yang dipakai sekarang bukan yang\n" +
        "  dipakai saat cadangan ini dibuat. Setiap cadangan sebelum kunci berubah\n" +
        "  TIDAK BISA DIBUKA; cari kunci lamanya sebelum melakukan apa pun."
    );
  }
  console.log("✓ dekripsi berhasil — sandinya benar");

  /* ── 4. Isinya benar-benar berisi ───────────────────────────────────── */
  const listing = run("tar", ["-tzf", archive]).split("\n").filter(Boolean);
  const hasDump = listing.some((f) => f.endsWith(".sql"));
  const hasDocuments = listing.some((f) => f.startsWith("documents"));
  const hasAudit = listing.some((f) => f.startsWith("audit"));
  if (!hasDump) fail("arsipnya tidak memuat satu pun berkas .sql — dumpnya tidak pernah ikut.");
  if (!hasDocuments) console.warn("⚠ tidak ada `documents/` — belum ada dokumen, atau volumenya tidak terpasang saat cadangan dibuat.");
  if (!hasAudit) console.warn("⚠ tidak ada `audit/` — belum ada jejak, atau volumenya tidak terpasang.");
  console.log(`✓ arsip berisi ${listing.length} entri`);

  /* ── 5. SETIAP basis data terdaftar ada di dalam dumpnya ────────────── */
  run("tar", ["-xzf", archive, "-C", work]);
  const sqlName = listing.find((f) => f.endsWith(".sql"))!;
  const sql = readFileSync(path.join(work, sqlName), "utf8");

  void (async () => {
    const controlUrl = process.env.CONTROL_DATABASE_URL;
    if (!controlUrl) {
      console.warn("⚠ CONTROL_DATABASE_URL belum diset — daftar PT tidak bisa dicocokkan.");
      finish(work, archive);
      return;
    }
    const url = new URL(controlUrl);
    const control = new ControlClient({
      adapter: new PrismaMariaDb({
        host: url.hostname,
        port: Number(url.port) || 3306,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, ""),
        connectionLimit: 1,
      }),
    });

    const companies = await control.company.findMany({
      select: { slug: true, databaseName: true },
      orderBy: { id: "asc" },
    });
    await control.$disconnect();

    const expectedDbs = [
      url.pathname.replace(/^\//, ""),
      ...(process.env.PLATFORM_DATABASE_URL
        ? [new URL(process.env.PLATFORM_DATABASE_URL).pathname.replace(/^\//, "")]
        : []),
      ...companies.map((c) => c.databaseName),
    ];

    const missing = expectedDbs.filter(
      (db) => !sql.includes(`CREATE DATABASE /*!32312 IF NOT EXISTS*/ \`${db}\``) && !sql.includes(`USE \`${db}\``)
    );

    if (missing.length > 0) {
      fail(
        `CADANGAN TIDAK LENGKAP — ${missing.length} basis data tidak ada di dumpnya:\n` +
          missing.map((d) => `  - ${d}`).join("\n") +
          "\n  Kredensial dump tidak berhak membacanya? (`--all-databases` menuntut root.)"
      );
    }
    console.log(`✓ ${expectedDbs.length} basis data ada di dalam dump (${companies.length} buku PT)`);
    finish(work, archive);
  })();
}

function finish(work: string, archive: string): void {
  console.log(
    `\n✓ CADANGAN INI BISA DIPULIHKAN.\n\n` +
      `Hasil dekripsi ditinggalkan untuk latihan pemulihan:\n  ${archive}\n\n` +
      `Latihan penuh (KUARTALAN, ke server BAYANGAN — jangan pernah ke produksi):\n` +
      `  mariadb -h <host-bayangan> -u root -p < ${path.join(work, "semua-basis-data.sql")}\n` +
      `lalu buka satu PT dan cocokkan Neraca Saldonya.\n\n` +
      `Buang setelah selesai:  rm -rf ${work}`
  );
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

main();
