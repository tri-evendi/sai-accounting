/**
 * OPERASI TINGKAT SERVER, DUA MESIN — satu antarmuka semantik
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase D butir 4)
 *
 * == KENAPA ANTARMUKA SEMANTIK, BUKAN "JALANKAN SQL INI" ===================
 * Penyediaan perusahaan (`company-provisioning.ts`) adalah SATU-SATUNYA tempat
 * yang bekerja di tingkat SERVER: ia membuat basis data, menghitung tabel di
 * dalamnya, lalu menjalankan berkas migration utuh. Itu juga satu-satunya tempat
 * yang memakai driver basis data LANGSUNG, bukan lewat Prisma.
 *
 * Abstraksi yang hanya meneruskan SQL tidak akan menolong: perbedaannya BUKAN
 * sintaksis kecil, melainkan konsep.
 *
 *   • MySQL "database" ≈ PostgreSQL "database", tapi `information_schema.SCHEMATA`
 *     di PostgreSQL berisi **skema di dalam satu basis data** — bukan daftar
 *     basis data. Query yang sama BERHASIL dan memulangkan jawaban yang SALAH.
 *     Itu bentuk kegagalan terburuk yang mungkin di jalur penyediaan.
 *   • `DROP DATABASE` di PostgreSQL DITOLAK bila masih ada koneksi; di MySQL
 *     tidak. Jadi "hapus" bukan satu pernyataan, melainkan dua.
 *   • Penanda bawaan (`utf8mb4`/`utf8mb4_unicode_ci`) tidak ada padanannya;
 *     PostgreSQL memakai `ENCODING`/`LC_COLLATE` lewat `TEMPLATE`.
 *
 * Maka yang diabstraksi adalah MAKSUDNYA — "apakah basis data ini ada",
 * "buat", "hitung tabelnya" — dan tiap mesin menjawab dengan caranya sendiri.
 * Pemanggilnya berhenti menulis SQL sama sekali, jadi tidak ada SQL MySQL yang
 * bisa tertinggal di sana.
 *
 * == NAMA BASIS DATA TIDAK BISA DIPARAMETERKAN =============================
 * Tidak di mesin mana pun: `CREATE DATABASE ?` bukan SQL yang sah. Jadi namanya
 * mau tak mau ditanam sebagai teks — dan satu-satunya yang menjaganya adalah
 * `assertSafeDatabaseName` di pemanggilnya. Dipertegas di sini dengan pemeriksaan
 * KEDUA: berkas ini menolak nama yang tidak cocok pola, apa pun yang dikirim
 * pemanggil. Dua lapis untuk satu titik injeksi yang tidak bisa dihilangkan.
 */
import { createPool, type Pool } from "mariadb";
import { Client as PgClient } from "pg";
import { uraikanUrl, type DbEngine } from "@/lib/db-engine";

/**
 * Pola nama basis data yang diizinkan — lapis KEDUA, sengaja diulang.
 *
 * Pemanggil sudah memvalidasi (`assertSafeDatabaseName`). Pemeriksaan ini tetap
 * ada karena nama basis data adalah satu-satunya nilai di berkas ini yang
 * ditanam sebagai teks, dan satu pemanggil baru yang lupa memvalidasi akan
 * mengubahnya menjadi injeksi SQL dengan hak `CREATE DATABASE`.
 */
const NAMA_AMAN = /^[a-z][a-z0-9_]{0,62}$/;

function pastikanNamaAman(nama: string): void {
  if (!NAMA_AMAN.test(nama)) {
    throw new Error(`Nama basis data tidak sah: ${JSON.stringify(nama)}`);
  }
}

/** Operasi tingkat server — tidak terikat pada satu basis data. */
export interface ServerBasisData {
  readonly mesin: DbEngine;
  /** Apakah basis data bernama ini sudah ada. */
  adakah(nama: string): Promise<boolean>;
  /** Berapa tabel di dalamnya. Dipakai untuk menolak menimpa yang sudah berisi. */
  jumlahTabel(nama: string): Promise<number>;
  buat(nama: string): Promise<void>;
  /** Hapus. Di PostgreSQL koneksi lain diputus lebih dulu — lihat implementasinya. */
  hapus(nama: string): Promise<void>;
  tutup(): Promise<void>;
}

/** Operasi di DALAM satu basis data: menjalankan berkas migration. */
export interface KoneksiBasisData {
  readonly mesin: DbEngine;
  /** Jalankan SQL apa adanya — satu berkas migration bisa banyak pernyataan. */
  jalankan(sql: string): Promise<void>;
  /** Catat satu migration sebagai diterapkan di tabel pembukuan Prisma. */
  catatMigration(input: {
    id: string;
    checksum: string;
    nama: string;
    mulai: Date;
    selesai: Date;
  }): Promise<void>;
  tutup(): Promise<void>;
}

// ── MariaDB ────────────────────────────────────────────────────────────────

const DDL_PEMBUKUAN_MARIADB = `CREATE TABLE IF NOT EXISTS \`_prisma_migrations\` (
  \`id\` varchar(36) NOT NULL,
  \`checksum\` varchar(64) NOT NULL,
  \`finished_at\` datetime(3) DEFAULT NULL,
  \`migration_name\` varchar(255) NOT NULL,
  \`logs\` text DEFAULT NULL,
  \`rolled_back_at\` datetime(3) DEFAULT NULL,
  \`started_at\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  \`applied_steps_count\` int unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

/**
 * Padanan PostgreSQL tabel pembukuan Prisma.
 *
 * Bentuknya harus SAMA dengan yang dibuat `prisma migrate` sendiri, sebab
 * `migrate deploy` berikutnya akan membacanya. `timestamptz` BUKAN pilihan di
 * sini meski ia pilihan yang lebih baik secara umum: yang menentukan bukan
 * selera kita, melainkan apa yang Prisma harapkan.
 */
const DDL_PEMBUKUAN_POSTGRES = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" varchar(36) NOT NULL,
  "checksum" varchar(64) NOT NULL,
  "finished_at" timestamptz,
  "migration_name" varchar(255) NOT NULL,
  "logs" text,
  "rolled_back_at" timestamptz,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "applied_steps_count" integer NOT NULL DEFAULT 0,
  CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
)`;

export function ddlPembukuan(mesin: DbEngine): string {
  return mesin === "postgresql" ? DDL_PEMBUKUAN_POSTGRES : DDL_PEMBUKUAN_MARIADB;
}

function poolMariaDb(url: string, database?: string): Pool {
  const b = uraikanUrl(url);
  return createPool({
    host: b.host,
    port: b.port,
    user: b.user,
    password: b.password,
    ...(database ? { database } : {}),
    connectionLimit: 1,
    /* Satu berkas migration = banyak pernyataan. Menjalankannya sebagai satu
       perintah jauh lebih jujur daripada memecah teks SQL sendiri — pemecah
       buatan tangan akan tersandung titik koma di dalam string atau komentar. */
    multipleStatements: true,
  });
}

class ServerMariaDb implements ServerBasisData {
  readonly mesin: DbEngine = "mariadb";
  constructor(private pool: Pool) {}

  async adakah(nama: string): Promise<boolean> {
    pastikanNamaAman(nama);
    const r = (await this.pool.query(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [nama]
    )) as unknown[];
    return r.length > 0;
  }

  async jumlahTabel(nama: string): Promise<number> {
    pastikanNamaAman(nama);
    const r = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
      [nama]
    )) as { n: unknown }[];
    return Number(r[0]?.n ?? 0);
  }

  async buat(nama: string): Promise<void> {
    pastikanNamaAman(nama);
    await this.pool.query(
      `CREATE DATABASE \`${nama}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  }

  async hapus(nama: string): Promise<void> {
    pastikanNamaAman(nama);
    await this.pool.query(`DROP DATABASE IF EXISTS \`${nama}\``);
  }

  async tutup(): Promise<void> {
    await this.pool.end();
  }
}

class KoneksiMariaDb implements KoneksiBasisData {
  readonly mesin: DbEngine = "mariadb";
  constructor(private pool: Pool) {}

  async jalankan(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async catatMigration(i: {
    id: string;
    checksum: string;
    nama: string;
    mulai: Date;
    selesai: Date;
  }): Promise<void> {
    await this.pool.query(
      "INSERT INTO `_prisma_migrations` " +
        "(`id`, `checksum`, `migration_name`, `started_at`, `finished_at`, `applied_steps_count`) " +
        "VALUES (?, ?, ?, ?, ?, 1)",
      [i.id, i.checksum, i.nama, i.mulai, i.selesai]
    );
  }

  async tutup(): Promise<void> {
    await this.pool.end();
  }
}

// ── PostgreSQL ─────────────────────────────────────────────────────────────

async function klienPg(url: string, database?: string): Promise<PgClient> {
  const b = uraikanUrl(url);
  const c = new PgClient({
    host: b.host,
    port: b.port,
    user: b.user,
    password: b.password,
    /* Tanpa `database`, sambung ke `postgres` — PostgreSQL MENUNTUT sebuah basis
       data untuk disambungi, bahkan untuk pekerjaan tingkat server. MySQL tidak,
       dan perbedaan itulah kenapa `poolFor(url)` tanpa database bekerja di sana. */
    database: database ?? "postgres",
  });
  await c.connect();
  return c;
}

class ServerPostgres implements ServerBasisData {
  readonly mesin: DbEngine = "postgresql";
  /**
   * `url` ikut disimpan karena `jumlahTabel` HARUS membuka koneksi baru ke basis
   * data yang ditanyakan — katalog tabel PostgreSQL bersifat per-basis-data, dan
   * tidak ada tampilan lintas-basis-data seperti `information_schema.TABLES`
   * milik MySQL. Itu perbedaan konsep, bukan perbedaan sintaksis.
   */
  constructor(
    private c: PgClient,
    private url: string
  ) {}

  async adakah(nama: string): Promise<boolean> {
    pastikanNamaAman(nama);
    /* `pg_database`, BUKAN `information_schema.SCHEMATA`: di PostgreSQL SCHEMATA
       berisi skema di dalam basis data yang sedang disambungi, jadi query gaya
       MySQL akan berhasil dan memulangkan jawaban yang salah. */
    const r = await this.c.query("SELECT 1 FROM pg_database WHERE datname = $1", [nama]);
    return r.rowCount !== null && r.rowCount > 0;
  }

  async jumlahTabel(nama: string): Promise<number> {
    pastikanNamaAman(nama);
    const c = await klienPg(this.url, nama);
    try {
      const r = await c.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public'"
      );
      return Number(r.rows[0]?.n ?? 0);
    } finally {
      await c.end().catch(() => {});
    }
  }

  async buat(nama: string): Promise<void> {
    pastikanNamaAman(nama);
    /* `TEMPLATE template0` + ENCODING eksplisit: tanpa itu basis data baru
       mewarisi collation `template1` milik server, yang bisa berbeda per
       pemasangan — dan collation yang berbeda antar buku PT berarti pengurutan
       nama pelanggan berbeda antar PT, tanpa satu pun galat. */
    await this.c.query(
      `CREATE DATABASE "${nama}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`
    );
  }

  async hapus(nama: string): Promise<void> {
    pastikanNamaAman(nama);
    /*
     * PostgreSQL MENOLAK `DROP DATABASE` selama masih ada satu koneksi ke sana —
     * tidak seperti MySQL. Jadi koneksi lain diputus lebih dulu.
     *
     * `pid <> pg_backend_pid()` supaya sesi ini tidak memutus dirinya sendiri.
     * Dan pemutusan dijalankan SEBELUM drop, bukan sebagai penanganan galat:
     * menangani galat berarti mencoba-lalu-gagal-lalu-coba-lagi, dan di jalur
     * penghapusan tenant itu meninggalkan keadaan setengah yang sulit dibaca.
     */
    await this.c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [nama]
    );
    await this.c.query(`DROP DATABASE IF EXISTS "${nama}"`);
  }

  async tutup(): Promise<void> {
    await this.c.end().catch(() => {});
  }
}

class KoneksiPostgres implements KoneksiBasisData {
  readonly mesin: DbEngine = "postgresql";
  constructor(private c: PgClient) {}

  async jalankan(sql: string): Promise<void> {
    /* `pg` menjalankan banyak pernyataan dalam satu `query()` secara bawaan —
       tidak perlu bendera seperti `multipleStatements` milik MariaDB. */
    await this.c.query(sql);
  }

  async catatMigration(i: {
    id: string;
    checksum: string;
    nama: string;
    mulai: Date;
    selesai: Date;
  }): Promise<void> {
    await this.c.query(
      `INSERT INTO "_prisma_migrations"
         ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
       VALUES ($1, $2, $3, $4, $5, 1)`,
      [i.id, i.checksum, i.nama, i.mulai, i.selesai]
    );
  }

  async tutup(): Promise<void> {
    await this.c.end().catch(() => {});
  }
}

// ── Pabrik ─────────────────────────────────────────────────────────────────

export async function bukaServer(url: string): Promise<ServerBasisData> {
  const { mesin } = uraikanUrl(url);
  if (mesin === "postgresql") {
    return new ServerPostgres(await klienPg(url), url);
  }
  return new ServerMariaDb(poolMariaDb(url));
}

export async function bukaBasisData(url: string, nama: string): Promise<KoneksiBasisData> {
  pastikanNamaAman(nama);
  const { mesin } = uraikanUrl(url);
  if (mesin === "postgresql") {
    return new KoneksiPostgres(await klienPg(url, nama));
  }
  return new KoneksiMariaDb(poolMariaDb(url, nama));
}

/**
 * Direktori migration mana yang dipakai mesin ini — relatif terhadap akar repo.
 *
 * ══ INI BUKAN DETAIL ══════════════════════════════════════════════════════
 * PostgreSQL TIDAK memakai 65 migration MariaDB. Ia memakai **baseline** yang
 * dibangkitkan dari skema (`bun run pg:baseline`) plus migration tambahan
 * tulis-tangan — sebab 5.241 baris SQL MariaDB tidak punya nilai di mesin baru,
 * dan menjalankannya di sana akan gagal pada pernyataan pertama.
 *
 * Perusahaan BARU yang disediakan setelah penukaran mendapat baseline itu, dan
 * karena baseline diturunkan dari skema yang sama, hasilnya identik dengan buku
 * yang bermigrasi lewat 65 langkah.
 */
export function direktoriMigration(mesin: DbEngine): string[] {
  /* Jalur `mariadb` menunjuk ARSIP. Sejak 15 Okt 2026 ia tidak lagi terjangkau
     lewat jalur normal — klien Prisma dibangkitkan untuk PostgreSQL, jadi
     `uraikanUrl` pada URL produksi selalu memulangkan `postgresql`. Ia
     dipertahankan supaya fungsi ini tetap jujur tentang kedua mesin, bukan
     karena ada yang memakainya. */
  return mesin === "postgresql"
    ? ["prisma/postgresql/company"]
    : ["prisma/migrations"];
}
