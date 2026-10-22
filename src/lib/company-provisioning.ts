/**
 * Menyediakan PERUSAHAAN BARU (issue #104) — dikerjakan PEKERJA LATAR.
 *
 * Buat basis data, terapkan migration, hibahkan hak peran aplikasi, daftarkan
 * di registry — sambil melaporkan kemajuannya langkah demi langkah, sebab yang
 * menunggu adalah orang yang menatap layar `/companies/new`.
 *
 * ══ KENAPA DI PEKERJA LATAR, BUKAN DI PERMINTAAN HTTP (Okt 2026) ═══════════
 * Sampai Okt 2026 modul ini berjalan di dalam `POST /api/companies`, dan
 * alasannya waktu itu masuk akal: server Node yang hidup terus, pekerjaan
 * puluhan detik, kemajuan dialirkan NDJSON. Yang mengubah jawabannya bukan
 * waktu, melainkan HAK: sejak peran PostgreSQL hak minimum (`sai_owner` /
 * `sai_app`), membuat basis data menuntut kredensial PEMILIK
 * (`PROVISION_DATABASE_URL`) — dan selama penyediaan hidup di permintaan HTTP,
 * kredensial itu harus hidup di `app-customer`, satu-satunya container yang
 * menghadap internet. RCE di sana = DDL di setiap buku PT.
 *
 * Kini `app-customer` hanya MENERBITKAN pekerjaan `company.provision`
 * (`company-provisioning-queue.ts`) dan menanyakan statusnya; modul ini
 * dijalankan pelari jalur `interactive` di `svc-worker`
 * (`workers/company-provision.ts`), satu-satunya layanan yang hidup terus dan
 * memegang `PROVISION_DATABASE_URL`. Dijaga
 * `tests/provisioning-off-app-customer.test.ts`.
 *
 * ══ URUTAN: BUAT → MIGRASI → DAFTARKAN ═════════════════════════════════════
 * Registry ditulis PALING AKHIR — aturan yang sama dengan skrip CLI, dan
 * alasannya sama: perusahaan yang terdaftar lebih dulu lalu gagal dimigrasi
 * akan muncul di pemilih perusahaan, bisa dibuka, dan menyambut penggunanya
 * dengan galat yang tidak menjelaskan apa pun. Dengan urutan ini, kegagalan di
 * tengah hanya meninggalkan basis data yatim yang tidak terlihat siapa pun.
 *
 * ══ PENGULANGAN MELANJUTKAN, TIDAK MENIMPA ═════════════════════════════════
 * Pekerja bisa mati di tengah (rilis, OOM). Basis data yatim yang ditinggalkan
 * membawa TANDA di komentarnya (`provisioningMarker`) selama ia belum
 * terdaftar, dan setiap migration diterapkan BERSAMA catatannya dalam satu
 * transaksi. Pengulangan atas permintaan yang sama (tenant + slug) karena itu
 * bisa membuktikan buku itu miliknya dan melanjutkan dari migration terakhir
 * yang tercatat (`resumeIndex`). Basis data berisi TANPA tanda itu — mis. buku
 * PT terhapus yang disimpan untuk retensi — tetap ditolak `database_not_empty`.
 *
 * ══ KENAPA MIGRATION DITERAPKAN SENDIRI, BUKAN LEWAT PRISMA CLI ════════════
 * Image produksi sengaja ramping: ia memuat berkas `prisma/postgresql/**` TAPI
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

/* Operasi tingkat server hidup di `@sai/db/server` — berkas ini tidak memegang
   SQL tingkat server sendiri. */
import {
  appRoleGrantSql,
  bukaServer,
  bukaBasisData,
  DDL_PEMBUKUAN,
  DIREKTORI_MIGRATION_PERUSAHAAN,
  type ServerBasisData,
} from "@sai/db/server";

import { controlDb } from "@sai/core/control-db";
import {
  appRoleForNewBook,
  DEFAULT_DB_INSTANCE_LABEL,
  findDbInstance,
  instanceServerUrl,
  type DbInstanceRef,
} from "@sai/db/company-url";
import { invalidateCompany } from "@/lib/company-registry";
import {
  assertSafeDatabaseName,
  firstConflict,
  isAccessDeniedError,
  normalizeSlug,
  ProvisionError,
  provisioningMarker,
  resolveDatabaseName,
  resumeIndex,
  type ProvisionEvent,
  type ProvisionPhase,
} from "@/lib/company-provisioning-shared";

/**
 * Direktori migration buku baru: `prisma/postgresql/company` — SATU-SATUNYA.
 *
 * Buku baru mendapat baseline PostgreSQL (dibangkitkan dari skema saat
 * penukaran 15 Okt 2026) plus migration tambahan tulis-tangan. Riwayat 65
 * migration MariaDB sejak #636 hidup di `prisma/_arsip-mariadb/` dan tidak ada
 * jalur kode yang bisa menunjuknya — dulu sebuah parameter `mesin = "mariadb"`
 * masih bisa.
 */
function akarMigration(): string {
  return join(process.cwd(), ...DIREKTORI_MIGRATION_PERUSAHAAN.split("/"));
}

/** Checksum yang DICOCOKKAN Prisma: sha256 atas isi berkas migration.sql. */
export function migrationChecksum(sql: string | Buffer): string {
  return createHash("sha256").update(sql).digest("hex");
}

/** Nama migration terurut — urutannya menentukan hasil akhir skema. */
export async function migrationNames(): Promise<string[]> {
  const entries = await readdir(akarMigration(), { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Kredensial penyedia untuk instans sasaran. Instans bawaan: kredensial basis
 * data KENDALI (`PROVISION_DATABASE_URL` → `CONTROL_DATABASE_URL`), persis
 * seperti sebelum tahap 4. Instans lain: template-nya sendiri — keputusannya
 * di `@sai/db/company-url`, satu penyelesai untuk semua pembuka buku.
 */
function provisioningUrl(instance: DbInstanceRef | null): URL {
  try {
    return instanceServerUrl(instance);
  } catch (error) {
    throw new ProvisionError(
      error instanceof Error ? error.message : String(error),
      "validate",
      { code: "config_missing", cause: error }
    );
  }
}

/**
 * Instans sasaran penyediaan. Tanpa pilihan eksplisit: instans BAWAAN — bukan
 * "instans yang paling longgar", karena penempatan otomatis adalah keputusan
 * kapasitas yang belum ada pemiliknya. Kunci yang disebut WAJIB terdaftar dan
 * aktif; kunci tak dikenal MELEMPAR, tidak pernah jatuh ke bawaan.
 */
async function targetInstance(key: string | null | undefined): Promise<DbInstanceRef | null> {
  if (key == null || key === "" || key === DEFAULT_DB_INSTANCE_LABEL) return null;
  const rows = await controlDb.dbInstance.findMany({
    where: { isActive: true },
    select: { key: true, urlEnvVar: true },
  });
  try {
    return findDbInstance(key, rows);
  } catch (error) {
    throw new ProvisionError(
      error instanceof Error ? error.message : String(error),
      "validate",
      { code: "config_missing", cause: error }
    );
  }
}

/**
 * Dari migration ke-berapa buku yang SUDAH berisi boleh dilanjutkan — atau
 * `null` bila ia bukan buku setengah jadi milik permintaan ini.
 *
 * Dua bukti, dua-duanya wajib: tanda di komentar basis data SAMA dengan tanda
 * permintaan ini, DAN `_prisma_migrations` adalah awalan persis daftar
 * migration kita (`resumeIndex`). Gagal membaca = `null` — tidak pernah
 * "anggap saja milik kita".
 */
async function titikLanjut(
  server: ServerBasisData,
  url: URL,
  databaseName: string,
  tanda: string,
  ours: ReadonlyArray<{ nama: string; checksum: string }>
): Promise<number | null> {
  try {
    if ((await server.catatan(databaseName)) !== tanda) return null;
    const db = await bukaBasisData(url.toString(), databaseName);
    try {
      const applied = await db.daftarMigration();
      return applied === null ? null : resumeIndex(applied, ours);
    } finally {
      await db.tutup();
    }
  } catch (error) {
    console.error(`[penyediaan] ${databaseName}: gagal memeriksa buku setengah jadi:`, error);
    return null;
  }
}

/**
 * Pasang/cabut tanda "sedang disediakan". BEST-EFFORT dengan sengaja: basis
 * data yang dibuat administrator lebih dulu (jalur pemasangan tanpa
 * `CREATEDB`) bisa dimiliki peran lain, dan `COMMENT ON DATABASE` menuntut
 * pemiliknya. Tanpa tanda, penyediaan tetap berjalan — yang hilang hanya
 * kemampuan MELANJUTKAN bila ia mati di tengah (gagal tertutup).
 */
async function setelTanda(server: ServerBasisData, databaseName: string, teks: string | null): Promise<void> {
  try {
    await server.setelCatatan(databaseName, teks);
  } catch (error) {
    console.warn(
      `[penyediaan] ${databaseName}: tanda penyediaan tidak bisa ${teks === null ? "dicabut" : "dipasang"}:`,
      error
    );
  }
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
  /**
   * Instans `db-postgres` sasaran (tahap 4, rancangan 09 §9). Kosong/`null`/
   * `"default"` = instans bawaan — perilaku sebelum tahap 4. Selain itu WAJIB
   * kunci `db_instances` yang aktif.
   */
  dbInstanceKey?: string | null;
}

/**
 * Buat basis data + skema + daftarkan. `onProgress` dipanggil di setiap
 * langkah; pemanggil yang memutuskan cara menampilkannya.
 */
export async function provisionCompany(
  input: ProvisionInput,
  onProgress: (event: ProvisionEvent) => void | Promise<void>
): Promise<{ companyId: number; databaseName: string; dbInstance: DbInstanceRef | null }> {
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

  const dbInstance = await targetInstance(input.dbInstanceKey);
  const url = provisioningUrl(dbInstance);
  /* Mesinnya diputuskan dari URL (`@sai/db/engine`). Penyediaan tidak pernah tahu
     mesin apa yang dipakainya, dan itu disengaja: satu pemanggil yang tahu akan
     segera punya cabang `if` yang kelak menyimpang dari yang lain. */
  const server = await bukaServer(url.toString());

  let companyId: number;
  /* Tahap yang sedang berjalan — dipakai jaring pengaman di `catch` bawah. */
  let phase: ProvisionPhase = "create_database";
  try {
    // ── 2. Basis data ────────────────────────────────────────
    await emit({ phase: "create_database", message: `Membuat basis data ${databaseName}…` });

    /* Seluruh berkas migration dibaca LEBIH DULU: checksum-nya dibutuhkan
       untuk memutuskan apakah buku setengah jadi boleh dilanjutkan. */
    const ours = await Promise.all(
      (await migrationNames()).map(async (nama) => {
        const sql = await readFile(join(akarMigration(), nama, "migration.sql"));
        return { nama, sql: sql.toString("utf8"), checksum: migrationChecksum(sql) };
      })
    );
    const tanda = provisioningMarker(input.tenantId, slug);
    /* Migration pertama yang BELUM diterapkan — 0 untuk buku baru. */
    let mulaiDari = 0;

    const already = await server.adakah(databaseName);
    if (already) {
      /*
       * Basis data sudah ada tapi TIDAK terdaftar. Ini justru jalur yang
       * dipakai pemasangan yang penggunanya tidak boleh `CREATE DATABASE`:
       * administrator membuatnya manual, lalu penyediaan tinggal mengisi.
       * Yang tidak boleh: menimpa basis data yang sudah ada isinya.
       */
      const tables = await server.jumlahTabel(databaseName);
      /* Buku setengah jadi dari percobaan sebelumnya ATAS PERMINTAAN YANG SAMA
         — dibuktikan tanda di komentarnya, lalu isi `_prisma_migrations`-nya. */
      const titik = tables > 0 ? await titikLanjut(server, url, databaseName, tanda, ours) : null;
      if (tables > 0 && titik === null) {
        throw new ProvisionError(
          `Basis data "${databaseName}" sudah ada DAN sudah berisi ${tables} tabel. ` +
            "Penyediaan dihentikan supaya tidak menimpa data yang mungkin masih dipakai.",
          "create_database",
          {
            code: "database_not_empty",
            values: { database: databaseName, tables },
          }
        );
      }
      if (titik !== null) mulaiDari = titik;
      await emit({
        phase: "create_database",
        message:
          titik !== null
            ? `Basis data ${databaseName} dari percobaan sebelumnya — dilanjutkan dari migration ke-${titik + 1}.`
            : `Basis data ${databaseName} sudah ada dan masih kosong — dipakai apa adanya.`,
      });
    } else {
      try {
        /* Nama tidak bisa jadi parameter; keamanannya dari
           `assertSafeDatabaseName` di sini DAN pemeriksaan kedua di
           `@sai/db/server`. Sintaksisnya hidup di sana — penyediaan ini tidak
           menulis satu baris SQL tingkat server pun. */
        await server.buat(databaseName);
      } catch (error) {
        /*
         * ── KEGAGALAN YANG PALING SERING, DAN SATU-SATUNYA YANG BUKAN BUG ───
         * SQLSTATE 42501: role basis data aplikasi tidak berhak membuat basis
         * data baru (tanpa `CREATEDB`). Itu keadaan PEMASANGAN — banyak hosting
         * memang tidak memberikannya, dan hak itu diberikan sekali
         * (docs/MULTI-COMPANY.md §3), bukan lewat kode.
         *
         * Yang dilempar karena itu kode, bukan kalimat, dan galat aslinya
         * dititipkan sebagai `cause` supaya ia sampai ke LOG SERVER tanpa
         * pernah melewati layar: pesan mentah driver basis data membawa
         * SQLSTATE, nama basis data, dan nama role-nya — hal yang tidak
         * menolong pemilik PT dan tidak boleh dibaca orang lain. (Di masa
         * MariaDB pesan itu sempat sampai ke layar utuh, Agt 2026.)
         */
        if (isAccessDeniedError(error)) {
          throw new ProvisionError(
            `CREATE DATABASE "${databaseName}" ditolak server basis data ` +
              "(SQLSTATE 42501) — role basis datanya tidak berhak membuat basis data baru.",
            "create_database",
            { code: "database_permission_denied", cause: error }
          );
        }
        throw error;
      }
    }

    /* Tanda "sedang disediakan" — SEBELUM tabel pertama lahir, supaya setiap
       keadaan setengah jadi sesudah titik ini bisa dilanjutkan. */
    await setelTanda(server, databaseName, tanda);

    // ── 3. Skema ─────────────────────────────────────────────
    phase = "migrate";
    const db = await bukaBasisData(url.toString(), databaseName);
    try {
      await db.jalankan(DDL_PEMBUKUAN);

      for (const [index, migration] of ours.entries()) {
        if (index < mulaiDari) continue;
        await emit({
          phase: "migrate",
          message: `Menerapkan skema (${index + 1}/${ours.length})`,
          detail: migration.nama,
          progress: (index + 1) / ours.length,
        });

        /* Berkas + catatannya dalam SATU transaksi — lihat kepala berkas. */
        await db.terapkanMigration(migration.sql, {
          id: randomUUID(),
          checksum: migration.checksum,
          nama: migration.nama,
        });
      }

      /*
       * ── 3b. Hak peran aplikasi (hak minimum, Okt 2026) ─────────────────
       * Basis data ini baru saja dibuat oleh peran PEMILIK, jadi peran
       * aplikasi — yang akan membukanya di setiap permintaan — belum berhak
       * atas satu tabel pun. Tanpa langkah ini PT baru lahir "siap dibuka"
       * lalu setiap halamannya gagal 42501. Dijalankan SEBELUM registry:
       * buku yang tidak bisa dibaca aplikasi tidak boleh terdaftar.
       *
       * `null` = pemilik dan aplikasi peran yang sama (sebelum peralihan),
       * tidak ada yang perlu dihibahkan.
       */
      const appRole = appRoleForNewBook(dbInstance);
      if (appRole) {
        await emit({ phase: "migrate", message: "Menghibahkan hak peran aplikasi…", detail: appRole, progress: 1 });
        await db.jalankan(appRoleGrantSql(databaseName, appRole));
      }
    } finally {
      await db.tutup();
    }

    // ── 4. Registry — PALING AKHIR ───────────────────────────
    phase = "register";
    await emit({ phase: "register", message: "Mendaftarkan perusahaan…" });

    /* Tanda dicabut SEBELUM registry: buku yang pernah terdaftar tidak boleh
       membawanya, sebab kelak (dihapus dari registry, disimpan untuk retensi)
       tanda itu akan mengizinkan penyediaan lain "melanjutkannya". Mati tepat
       di antara keduanya meninggalkan buku lengkap tanpa tanda dan tanpa
       registry — ditolak `database_not_empty` dan dilaporkan deteksi yatim
       penjadwal: gagal TERTUTUP, bukan terbuka. */
    await setelTanda(server, databaseName, null);

    const company = await controlDb.company.create({
      data: {
        slug,
        name,
        databaseName,
        dbInstanceKey: dbInstance?.key ?? null,
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
     * `CREATE DATABASE`: kredensial yang ditolak saat menyambung (28P01/28000),
     * atau basis data yang bisa dibuat tapi tidak boleh diisi (42501 di tahap
     * skema). Semuanya satu tindak lanjut bagi yang menunggu, dan semuanya
     * tidak boleh muncul sebagai teks mentah driver.
     */
    if (!(error instanceof ProvisionError) && isAccessDeniedError(error)) {
      throw new ProvisionError(
        `Server basis data menolak akses (SQLSTATE ${String((error as { code?: unknown }).code)}) pada tahap "${phase}" ` +
          `untuk basis data ${databaseName}.`,
        phase,
        { code: "database_permission_denied", cause: error }
      );
    }
    throw error;
  } finally {
    await server.tutup();
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

  return { companyId, databaseName, dbInstance };
}
