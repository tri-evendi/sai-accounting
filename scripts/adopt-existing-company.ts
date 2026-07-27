/**
 * Daftarkan pemasangan SATU perusahaan yang sudah berjalan sebagai perusahaan
 * pertama di basis data kendali (issue #104).
 *
 *   npx tsx scripts/adopt-existing-company.ts --slug pt-sai [--name "PT Subur Anugerah"]
 *
 * ══ URUTAN YANG WAJIB ══════════════════════════════════════════════════════
 *   1. npm run db:migrate:control          — siapkan basis data kendali
 *   2. npx tsx scripts/adopt-existing-company.ts   ← SKRIP INI
 *   3. npm run db:migrate:companies        — migration 0042 membuang `users`
 *
 * Skrip ini MEMBACA tabel `users` yang dibuang langkah 3. Kalau langkah 3
 * terlanjur jalan lebih dulu, seluruh akun beserta hash kata sandinya hilang
 * dan hanya bisa dipulihkan dari cadangan. Karena itu skrip ini menolak
 * berjalan bila tabelnya sudah tidak ada, dengan pesan yang menyebutkan
 * cadangan — bukan diam-diam membuat basis data kendali yang kosong.
 *
 * ══ ID PENGGUNA DIPERTAHANKAN ══════════════════════════════════════════════
 * Pengguna disalin DENGAN ID YANG SAMA. Ini bukan kerapian: `periods.
 * closed_by_id` dan `user_permission_overrides.user_id` di basis data
 * perusahaan menyimpan id itu, dan sejak 0042 tidak ada lagi foreign key yang
 * bisa ikut memperbaikinya. Id yang berubah = riwayat "ditutup oleh" menunjuk
 * orang yang salah, diam-diam.
 *
 * Kata sandi ikut pindah apa adanya (hash bcrypt disalin) — tidak ada yang
 * perlu login ulang dengan kata sandi baru.
 */

import "dotenv/config";
import { rename, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaClient as CompanyClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

interface LegacyUser {
  id: number;
  username: string;
  password: string;
  name: string | null;
  role: string;
  /**
   * Dua nama untuk satu fakta, dan keduanya harus bisa dibaca — lihat
   * `mustChangePasswordColumn()`.
   */
  must_change_password?: number | boolean;
  status?: number;
  pass_date: Date | null;
  accountant_mode: number | boolean | null;
  session_version: number;
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]?.startsWith("--") && argv[i + 1]) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function clientFor(rawUrl: string, Ctor: typeof ControlClient | typeof CompanyClient) {
  const url = new URL(rawUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 2,
  });
  // Dua kelas klien yang berbeda skema; konstruktornya sama bentuknya.
  return new (Ctor as typeof ControlClient)({ adapter });
}

const bool = (v: number | boolean | null): boolean => v === true || v === 1;

async function main() {
  const { slug, name } = parseArgs(process.argv.slice(2));

  if (!slug || !/^[a-z0-9][a-z0-9-]{0,49}$/.test(slug)) {
    console.error(
      'Usage: npx tsx scripts/adopt-existing-company.ts --slug <slug> [--name "Nama PT"]\n' +
        "  slug: huruf kecil, angka, dan tanda hubung (mis. pt-sai)"
    );
    process.exit(1);
  }

  const companyUrl = process.env.DATABASE_URL;
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!companyUrl || !controlUrl) {
    console.error("ERROR: DATABASE_URL dan CONTROL_DATABASE_URL keduanya harus diset di .env");
    process.exit(1);
  }

  const databaseName = new URL(companyUrl).pathname.slice(1);
  const control = clientFor(controlUrl, ControlClient);
  const company = clientFor(companyUrl, CompanyClient) as unknown as CompanyClient;

  // ── Penjaga urutan: `users` harus masih ada di basis data perusahaan ──────
  const tables = await company.$queryRawUnsafe<{ c: bigint }[]>(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'"
  );
  if (Number(tables[0]?.c ?? 0) === 0) {
    console.error(
      `ERROR: tabel 'users' sudah tidak ada di ${databaseName}.\n` +
        "Migration 0042 tampaknya sudah dijalankan sebelum adopsi. Akun lama hanya\n" +
        "bisa dipulihkan dari cadangan basis data — pulihkan dulu, baru jalankan\n" +
        "skrip ini, baru migration perusahaan."
    );
    process.exit(1);
  }

  const existing = await control.company.findFirst({
    where: { OR: [{ slug }, { databaseName }] },
  });
  if (existing) {
    console.error(
      `ERROR: sudah terdaftar sebagai "${existing.slug}" → ${existing.databaseName}. ` +
        "Tidak ada yang diubah."
    );
    process.exit(1);
  }

  // Nama perusahaan diambil dari wizard penyiapan bila ada — di sanalah
  // pengguna sudah pernah mengetikkannya.
  const settings = await company.companySetting.findFirst({
    orderBy: { id: "asc" },
    select: { name: true },
  });
  const companyName = name || settings?.name?.trim() || slug;

  /*
   * ══ SKRIP INI BERJALAN SEBELUM MIGRATION PERUSAHAAN ════════════════════════
   * Urutan rilisnya: migrate:control → adopsi → migrate:companies. Artinya saat
   * skrip ini jalan, basis data perusahaan MASIH memakai skema lama: kolomnya
   * bernama `status` (Int, 1 = wajib ganti sandi), bukan `must_change_password`
   * (Boolean) yang baru lahir di migration 0041.
   *
   * Menyebut satu nama saja akan menggagalkan langkah kedua dengan "Unknown
   * column" — dan yang membaca pesan itu akan menyangka basis datanya rusak,
   * padahal semuanya normal. Jadi kolomnya dideteksi, bukan diasumsikan. Ini
   * juga membuat skrip tetap benar bila dijalankan pada basis data yang
   * kebetulan sudah dimigrasikan.
   */
  const columns = await company.$queryRawUnsafe<{ column_name: string }[]>(
    "SELECT column_name FROM information_schema.columns " +
      "WHERE table_schema = DATABASE() AND table_name = 'users' " +
      "AND column_name IN ('status','must_change_password')"
  );
  const names = new Set(columns.map((c) => String(c.column_name).toLowerCase()));
  const mustChangeColumn = names.has("must_change_password") ? "must_change_password" : "status";

  const users = await company.$queryRawUnsafe<LegacyUser[]>(
    `SELECT id, username, password, name, role, ${mustChangeColumn}, pass_date, accountant_mode, session_version FROM users ORDER BY id`
  );

  console.log(`Mengadopsi ${databaseName} sebagai "${companyName}" (${slug})`);
  console.log(`  ${users.length} pengguna akan dipindahkan ke basis data kendali`);

  await control.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: { slug, name: companyName, databaseName },
    });

    for (const u of users) {
      // ID DIPERTAHANKAN — lihat komentar kepala berkas.
      await tx.user.create({
        data: {
          id: u.id,
          username: u.username,
          password: u.password,
          name: u.name,
          // `status` lama: 1 = wajib ganti sandi, selain itu tidak — pemetaan
          // yang sama persis dengan migration 0041.
          mustChangePassword:
            mustChangeColumn === "must_change_password"
              ? bool(u.must_change_password ?? false)
              : Number(u.status) === 1,
          passDate: u.pass_date,
          sessionVersion: u.session_version,
        },
      });
      await tx.membership.create({
        data: {
          userId: u.id,
          companyId: created.id,
          role: u.role,
          accountantMode:
            u.accountant_mode === null || u.accountant_mode === undefined
              ? null
              : bool(u.accountant_mode),
        },
      });
    }
  });

  // Jejak audit lama milik perusahaan ini — dipindahkan ke foldernya supaya
  // tetap terbaca di layar Audit (sejak #104 jejak dipisah per perusahaan).
  const auditRoot = path.join(process.cwd(), "data", "audit");
  const legacyAudit = path.join(auditRoot, "audit.jsonl");
  try {
    await access(legacyAudit);
    await mkdir(path.join(auditRoot, slug), { recursive: true });
    await rename(legacyAudit, path.join(auditRoot, slug, "audit.jsonl"));
    console.log(`  jejak audit lama dipindahkan ke data/audit/${slug}/audit.jsonl`);
  } catch {
    // Tidak ada jejak lama — pemasangan yang belum pernah menulis audit.
  }

  console.log("\nSelesai. Langkah berikutnya:");
  console.log("  npm run db:migrate:companies    # menerapkan 0042 (membuang tabel users)");

  await control.$disconnect();
  await company.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
