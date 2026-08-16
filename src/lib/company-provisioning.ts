/**
 * Menyediakan PERUSAHAAN BARU dari dalam aplikasi (issue #104).
 *
 * Sampai sekarang ini pekerjaan baris perintah (`scripts/create-company.ts`):
 * buat basis data, terapkan migration, daftarkan di registry. Modul ini
 * melakukan hal yang sama dari proses web, sambil melaporkan kemajuannya
 * langkah demi langkah — sebab yang menunggu adalah orang yang menatap layar,
 * bukan terminal yang mencetak baris.
 *
 * ══ KENAPA TANPA PEKERJA LATAR (WORKER) ════════════════════════════════════
 * Pertanyaannya wajar: ini pekerjaan puluhan detik. Tiga fakta membuat pekerja
 * latar tidak sepadan di sini:
 *
 *  1. Aplikasinya server Node yang hidup terus, BUKAN fungsi tanpa-server —
 *     tidak ada batas waktu permintaan yang memutus pekerjaan di tengah.
 *  2. Pekerjaannya DDL di basis data kosong: puluhan detik, bukan menit.
 *  3. Urutannya membuat kegagalan tidak berbahaya (lihat di bawah), jadi tidak
 *     ada state setengah jadi yang perlu dijaga pekerja latar.
 *
 * Yang dibutuhkan hanyalah cara MELAPORKAN kemajuan, dan itu dipenuhi respons
 * streaming. Pekerja latar baru sepadan bila penyediaan tumbuh jadi hitungan
 * menit, atau harus selamat ketika peramban ditutup.
 *
 * ══ URUTAN: BUAT → MIGRASI → DAFTARKAN ═════════════════════════════════════
 * Registry ditulis PALING AKHIR — aturan yang sama dengan skrip CLI, dan
 * alasannya sama: perusahaan yang terdaftar lebih dulu lalu gagal dimigrasi
 * akan muncul di pemilih perusahaan, bisa dibuka, dan menyambut penggunanya
 * dengan galat yang tidak menjelaskan apa pun. Dengan urutan ini, kegagalan di
 * tengah hanya meninggalkan basis data yatim yang tidak terlihat siapa pun.
 *
 * ══ KENAPA MIGRATION DITERAPKAN SENDIRI, BUKAN LEWAT PRISMA CLI ════════════
 * Image produksi sengaja ramping: ia memuat berkas `prisma/migrations/**` TAPI
 * TIDAK memuat Prisma CLI (lihat tahap `runner` di Dockerfile). Memasukkan CLI
 * beserta seluruh node_modules ke sana akan melipatgandakan ukuran image demi
 * satu operasi yang jarang.
 *
 * Jadi SQL-nya dijalankan langsung, lalu pembukuannya ditulis ke tabel
 * `_prisma_migrations` dengan bentuk yang PERSIS sama seperti buatan Prisma —
 * `checksum` = sha256 isi berkas migration.sql. Itu bukan tebakan: kecocokannya
 * diperiksa terhadap basis data produksi yang selama ini dimigrasi CLI
 * (`tests/company-provisioning.test.ts` menjaga bentuknya). Konsekuensinya
 * penting: `prisma migrate deploy` berikutnya — yang tetap dipakai saat rilis —
 * membaca baris-baris ini sebagai SUDAH diterapkan dan tidak mengulanginya.
 */
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { createPool, type Pool } from "mariadb";

import { controlDb } from "@/lib/control-db";
import { invalidateCompany } from "@/lib/company-registry";
import {
  assertSafeDatabaseName,
  firstConflict,
  isAccessDeniedError,
  normalizeSlug,
  ProvisionError,
  resolveDatabaseName,
  type ProvisionEvent,
  type ProvisionPhase,
} from "@/lib/company-provisioning-shared";

/** Direktori migration di dalam image produksi maupun saat pengembangan. */
const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/** Checksum yang DICOCOKKAN Prisma: sha256 atas isi berkas migration.sql. */
export function migrationChecksum(sql: string | Buffer): string {
  return createHash("sha256").update(sql).digest("hex");
}

/** Nama migration terurut — urutannya menentukan hasil akhir skema. */
export async function migrationNames(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Kredensial penyedia. Bawaannya kredensial basis data KENDALI — pemakainya
 * sama-sama "di luar satu perusahaan". `PROVISION_DATABASE_URL` disediakan
 * supaya hak `CREATE DATABASE` bisa dipisahkan ke kredensial tersendiri tanpa
 * mengubah kode, bila suatu saat itu dikehendaki.
 */
function provisioningUrl(): URL {
  const raw = process.env.PROVISION_DATABASE_URL ?? process.env.CONTROL_DATABASE_URL;
  if (!raw) {
    throw new ProvisionError(
      "CONTROL_DATABASE_URL belum diset — tidak tahu di server mana basis data dibuat.",
      "validate",
      { code: "config_missing" }
    );
  }
  return new URL(raw);
}

function poolFor(url: URL, database?: string): Pool {
  return createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ...(database ? { database } : {}),
    connectionLimit: 1,
    // Satu berkas migration = banyak pernyataan. Menjalankannya sebagai satu
    // perintah jauh lebih jujur daripada memecah teks SQL sendiri — pemecah
    // buatan tangan akan tersandung titik koma di dalam string atau komentar.
    multipleStatements: true,
  });
}

export interface ProvisionInput {
  slug: string;
  name: string;
  /** Opsional — diturunkan dari slug bila tidak diisi. */
  databaseName?: string;
  /** Pengguna yang membuat; ia menjadi anggota pertama perusahaan itu. */
  createdByUserId: number;
  /** Peran yang diberikan ke pembuatnya di perusahaan baru. */
  role: string;
  /**
   * Tenant PEMILIK perusahaan baru (issue #135) — WAJIB: sejak migration 0003
   * basis data menolak perusahaan tanpa tenant, dan menebak tenant adalah
   * dosa yang sama dengan menebak perusahaan (#104). Nilainya datang dari
   * keanggotaan tenant PEMBUATNYA (`requireTenantPermission`), tidak pernah
   * dari input klien.
   */
  tenantId: number;
}

/**
 * Buat basis data + skema + daftarkan. `onProgress` dipanggil di setiap
 * langkah; pemanggil yang memutuskan cara menampilkannya.
 */
export async function provisionCompany(
  input: ProvisionInput,
  onProgress: (event: ProvisionEvent) => void | Promise<void>
): Promise<{ companyId: number; databaseName: string }> {
  const slug = normalizeSlug(input.slug);
  const name = input.name.trim();
  // Turunan memuat id tenant (`sai_t{tenantId}_{slug}`, issue #153); eksplisit
  // (jalur adopsi pemasangan lama) dipakai apa adanya.
  const databaseName = resolveDatabaseName(input.tenantId, slug, input.databaseName);

  const emit = async (event: ProvisionEvent) => {
    await onProgress(event);
  };

  // ── 1. Validasi ────────────────────────────────────────────
  await emit({ phase: "validate", message: "Memeriksa nama dan ketersediaan…" });

  if (!slug) throw new ProvisionError("Slug tidak boleh kosong.", "validate");
  if (!name) throw new ProvisionError("Nama perusahaan tidak boleh kosong.", "validate");
  // (Keduanya sudah ditolak zod di route; tanpa kode, pesannya untuk log.)
  assertSafeDatabaseName(databaseName);

  /*
   * ── Ketersediaan nama (issue #153) ────────────────────────
   * Query-nya SATU dan bentuknya sama apa pun kenyataannya — slug bebas, slug
   * milik tenant lain, atau slug kembar di tenant sendiri — supaya waktu
   * respons tidak membedakan ketiganya. KEPUTUSANNYA murni (`firstConflict`,
   * teruji): slug hanya berbenturan di dalam tenant pemanggil; slug tenant
   * lain tak terlihat dan penyediaan berjalan seperti biasa (nama basis
   * datanya toh berbeda — id tenant ada di awalan). Nama basis data tetap
   * dijaga GLOBAL: ia ruang nama fisik server.
   */
  const existing = await controlDb.company.findMany({
    where: { OR: [{ slug }, { databaseName }] },
    select: { tenantId: true, slug: true, databaseName: true },
  });
  const conflict = firstConflict(existing, { tenantId: input.tenantId, slug, databaseName });
  if (conflict) {
    throw new ProvisionError(
      conflict === "slug"
        ? `Slug "${slug}" sudah dipakai perusahaan lain.`
        : `Basis data "${databaseName}" sudah terdaftar untuk perusahaan lain.`,
      "validate",
      conflict === "slug"
        ? { code: "slug_taken", values: { slug } }
        : { code: "database_taken", values: { database: databaseName } }
    );
  }

  const url = provisioningUrl();
  const server = poolFor(url);

  let companyId: number;
  /* Tahap yang sedang berjalan — dipakai jaring pengaman di `catch` bawah. */
  let phase: ProvisionPhase = "create_database";
  try {
    // ── 2. Basis data ────────────────────────────────────────
    await emit({ phase: "create_database", message: `Membuat basis data ${databaseName}…` });

    const already = await server.query(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [databaseName]
    );
    if (already.length > 0) {
      /*
       * Basis data sudah ada tapi TIDAK terdaftar. Ini justru jalur yang
       * dipakai pemasangan yang penggunanya tidak boleh `CREATE DATABASE`:
       * administrator membuatnya manual, lalu penyediaan tinggal mengisi.
       * Yang tidak boleh: menimpa basis data yang sudah ada isinya.
       */
      const tables = await server.query(
        "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
        [databaseName]
      );
      if (Number(tables[0].n) > 0) {
        throw new ProvisionError(
          `Basis data "${databaseName}" sudah ada DAN sudah berisi ${tables[0].n} tabel. ` +
            "Penyediaan dihentikan supaya tidak menimpa data yang mungkin masih dipakai.",
          "create_database",
          {
            code: "database_not_empty",
            values: { database: databaseName, tables: Number(tables[0].n) },
          }
        );
      }
      await emit({
        phase: "create_database",
        message: `Basis data ${databaseName} sudah ada dan masih kosong — dipakai apa adanya.`,
      });
    } else {
      try {
        // Nama tidak bisa jadi parameter; keamanannya dari assertSafeDatabaseName.
        await server.query(
          `CREATE DATABASE \`${databaseName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
      } catch (error) {
        /*
         * ── KEGAGALAN YANG PALING SERING, DAN SATU-SATUNYA YANG BUKAN BUG ───
         * Galat 1044/1045: pengguna basis data aplikasi tidak berhak membuat
         * basis data baru. Itu keadaan PEMASANGAN — banyak hosting memang
         * tidak memberikannya, dan hak itu diberikan sekali lewat pola nama
         * (docs/MULTI-COMPANY.md §3), bukan lewat kode.
         *
         * Yang dilempar karena itu kode, bukan kalimat, dan galat aslinya
         * dititipkan sebagai `cause` supaya ia sampai ke LOG SERVER tanpa
         * pernah melewati layar: pesan mentah mariadb membawa nomor koneksi,
         * SQLState, pernyataan `CREATE DATABASE` utuh, dan nama pengguna basis
         * datanya — empat hal yang tidak menolong pemilik PT dan tidak boleh
         * dibaca orang lain.
         */
        if (isAccessDeniedError(error)) {
          throw new ProvisionError(
            `CREATE DATABASE \`${databaseName}\` ditolak server basis data ` +
              "(galat 1044/1045) — pengguna basis datanya tidak berhak membuat basis data baru.",
            "create_database",
            { code: "database_permission_denied", cause: error }
          );
        }
        throw error;
      }
    }

    // ── 3. Skema ─────────────────────────────────────────────
    phase = "migrate";
    const names = await migrationNames();
    const db = poolFor(url, databaseName);
    try {
      await db.query(BOOKKEEPING_TABLE_DDL);

      for (const [index, migration] of names.entries()) {
        await emit({
          phase: "migrate",
          message: `Menerapkan skema (${index + 1}/${names.length})`,
          detail: migration,
          progress: (index + 1) / names.length,
        });

        const file = join(MIGRATIONS_DIR, migration, "migration.sql");
        const sql = await readFile(file);
        const startedAt = new Date();
        await db.query(sql.toString("utf8"));
        await db.query(
          "INSERT INTO `_prisma_migrations` " +
            "(`id`, `checksum`, `migration_name`, `started_at`, `finished_at`, `applied_steps_count`) " +
            "VALUES (?, ?, ?, ?, ?, 1)",
          [randomUUID(), migrationChecksum(sql), migration, startedAt, new Date()]
        );
      }
    } finally {
      await db.end();
    }

    // ── 4. Registry — PALING AKHIR ───────────────────────────
    phase = "register";
    await emit({ phase: "register", message: "Mendaftarkan perusahaan…" });

    const company = await controlDb.company.create({
      data: {
        slug,
        name,
        databaseName,
        tenantId: input.tenantId,
        isActive: true,
        memberships: {
          create: {
            userId: input.createdByUserId,
            role: input.role,
            isActive: true,
          },
        },
      },
      select: { id: true },
    });
    companyId = company.id;
    invalidateCompany(companyId);
  } catch (error) {
    /*
     * Jaring pengaman untuk "tidak berhak" yang datang dari LUAR pernyataan
     * `CREATE DATABASE`: kredensial yang ditolak saat menyambung (1045), atau
     * basis data yang bisa dibuat tapi tidak boleh diisi (1044 di tahap
     * skema). Ketiganya satu tindak lanjut bagi yang menunggu, dan ketiganya
     * tidak boleh muncul sebagai teks mariadb.
     */
    if (!(error instanceof ProvisionError) && isAccessDeniedError(error)) {
      throw new ProvisionError(
        `Server basis data menolak akses (galat 1044/1045) pada tahap "${phase}" ` +
          `untuk basis data ${databaseName}.`,
        phase,
        { code: "database_permission_denied", cause: error }
      );
    }
    throw error;
  } finally {
    await server.end();
  }

  await emit({
    phase: "done",
    message: `${name} siap dibuka.`,
    detail: databaseName,
    progress: 1,
    /* Ikut di peristiwa terakhir supaya pembuatnya bisa langsung MEMILIH
     * perusahaan ini di sesinya (issue #339) — lihat `ProvisionEvent`. */
    companyId,
  });

  return { companyId, databaseName };
}

/**
 * DDL tabel pembukuan Prisma — disalin PERSIS dari basis data yang selama ini
 * dimigrasi Prisma CLI (`SHOW CREATE TABLE`), bukan ditulis dari ingatan.
 * Perbedaan sekecil tipe kolom akan membuat `migrate deploy` berikutnya
 * mengeluh tentang tabel yang bukan miliknya.
 */
const BOOKKEEPING_TABLE_DDL = `CREATE TABLE IF NOT EXISTS \`_prisma_migrations\` (
  \`id\` varchar(36) NOT NULL,
  \`checksum\` varchar(64) NOT NULL,
  \`finished_at\` datetime(3) DEFAULT NULL,
  \`migration_name\` varchar(255) NOT NULL,
  \`logs\` text DEFAULT NULL,
  \`rolled_back_at\` datetime(3) DEFAULT NULL,
  \`started_at\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  \`applied_steps_count\` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
