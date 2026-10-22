/**
 * OPERASI TINGKAT SERVER — satu antarmuka semantik
 * (migrasi PostgreSQL — docs/arsitektur/07-RIWAYAT.md)
 *
 * == KENAPA ANTARMUKA SEMANTIK, BUKAN "JALANKAN SQL INI" ===================
 * Penyediaan perusahaan (`company-provisioning.ts`) adalah tempat utama yang
 * bekerja di tingkat SERVER: ia membuat basis data, menghitung tabel di
 * dalamnya, lalu menjalankan berkas migration utuh. Itu juga tempat yang
 * memakai driver basis data LANGSUNG, bukan lewat Prisma.
 *
 * Berkas ini lahir untuk melayani DUA mesin selama penukaran ke PostgreSQL;
 * implementasi MariaDB-nya dicabut di Fase E (#636, 22 Okt 2026). Antarmukanya
 * dipertahankan karena perbedaan yang dulu ia sembunyikan tetap berlaku sebagai
 * jebakan bagi siapa pun yang menulis SQL tingkat server dengan kebiasaan lama:
 *
 *   • `information_schema.SCHEMATA` di PostgreSQL berisi **skema di dalam satu
 *     basis data** — bukan daftar basis data. Query gaya MySQL BERHASIL dan
 *     memulangkan jawaban yang SALAH. Yang benar: `pg_database`.
 *   • `DROP DATABASE` DITOLAK bila masih ada koneksi. Jadi "hapus" bukan satu
 *     pernyataan, melainkan dua.
 *   • Penanda bawaan memakai `ENCODING`/`LC_COLLATE` lewat `TEMPLATE`.
 *
 * Maka yang diabstraksi adalah MAKSUDNYA — "apakah basis data ini ada",
 * "buat", "hitung tabelnya" — dan pemanggilnya berhenti menulis SQL sama sekali.
 *
 * == NAMA BASIS DATA TIDAK BISA DIPARAMETERKAN =============================
 * `CREATE DATABASE $1` bukan SQL yang sah. Jadi namanya mau tak mau ditanam
 * sebagai teks — dan satu-satunya yang menjaganya adalah
 * `assertSafeDatabaseName` di pemanggilnya. Dipertegas di sini dengan
 * pemeriksaan KEDUA: berkas ini menolak nama yang tidak cocok pola, apa pun
 * yang dikirim pemanggil. Dua lapis untuk satu titik injeksi yang tidak bisa
 * dihilangkan.
 */
import { Client as PgClient } from "pg";
import { uraikanUrl, type DbEngine } from "./engine";

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
  /**
   * `MAX(journals.date)`: jangkar retensi UU KUP sebuah buku
   * (`executeTenantDeletion`). `null` = buku tanpa jurnal; buku yang tak
   * terjangkau MELEMPAR, supaya pemanggil bisa membedakan keduanya.
   */
  jurnalTermuda(): Promise<Date | null>;
  /**
   * Ringkasan `_prisma_migrations`: yang TERAPAN (selesai, tidak dibatalkan),
   * yang MENGGANTUNG (mulai tapi tidak selesai — `migrate deploy` berikutnya
   * akan menolak berjalan), dan nama terapan terakhir. Tabel yang belum ada
   * MELEMPAR: "belum pernah dimigrasikan" bukan "nol migration".
   */
  ringkasanMigrasi(): Promise<RingkasanMigrasi>;
  tutup(): Promise<void>;
}

export interface RingkasanMigrasi {
  terapan: number;
  menggantung: number;
  terakhir: string | null;
}

// ── PostgreSQL ─────────────────────────────────────────────────────────────

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

/** DDL tabel pembukuan Prisma (`_prisma_migrations`) untuk buku baru. */
export const DDL_PEMBUKUAN = DDL_PEMBUKUAN_POSTGRES;

async function klienPg(url: string, database?: string): Promise<PgClient> {
  const b = uraikanUrl(url);
  const c = new PgClient({
    host: b.host,
    port: b.port,
    user: b.user,
    password: b.password,
    /* Tanpa `database`, sambung ke `postgres` — PostgreSQL MENUNTUT sebuah basis
       data untuk disambungi, bahkan untuk pekerjaan tingkat server. */
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
   * tidak ada tampilan lintas-basis-data.
   */
  constructor(
    private c: PgClient,
    private url: string
  ) {}

  async adakah(nama: string): Promise<boolean> {
    pastikanNamaAman(nama);
    /* `pg_database`, BUKAN `information_schema.SCHEMATA`: di PostgreSQL SCHEMATA
       berisi skema di dalam basis data yang sedang disambungi, jadi query gaya
       MySQL akan berhasil dan memulangkan jawaban yang salah (lihat kepala berkas). */
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
     * PostgreSQL MENOLAK `DROP DATABASE` selama masih ada satu koneksi ke sana.
     * Jadi koneksi lain diputus lebih dulu.
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
    /* `pg` menjalankan banyak pernyataan dalam satu `query()` secara bawaan
       (protokol query sederhana, karena tanpa parameter). */
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

  async jurnalTermuda(): Promise<Date | null> {
    /* `journals.date` adalah `TIMESTAMP(3)` TANPA zona, berisi UTC (cara Prisma
       menyimpannya). Driver `pg` mengurai tipe itu sebagai waktu LOKAL proses,
       jadi tanpa `AT TIME ZONE 'UTC'` hasilnya bergeser sejauh TZ container.
       Dengan itu nilainya menjadi `timestamptz` dan terurai apa adanya. */
    const r = await this.c.query<{ latest: Date | null }>(
      `SELECT MAX("date") AT TIME ZONE 'UTC' AS latest FROM journals`
    );
    return r.rows[0]?.latest ?? null;
  }

  async ringkasanMigrasi(): Promise<RingkasanMigrasi> {
    /* `FILTER`, bukan `SUM(boolean)`: PostgreSQL tidak menjumlah boolean —
       idiom MySQL yang sudah sekali mematahkan sapuan kesesuaian sesudah
       penukaran (docs/arsitektur/07-RIWAYAT.md). `::int` karena `count` adalah bigint,
       yang diurai `pg` sebagai TEKS. */
    const r = await this.c.query<RingkasanMigrasi>(
      `SELECT
         count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS terapan,
         count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS menggantung,
         max(migration_name) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS terakhir
       FROM "_prisma_migrations"`
    );
    return r.rows[0] ?? { terapan: 0, menggantung: 0, terakhir: null };
  }

  async tutup(): Promise<void> {
    await this.c.end().catch(() => {});
  }
}

// ── Pabrik ─────────────────────────────────────────────────────────────────

/* `klienPg` mengurai URL lebih dulu, dan `uraikanUrl` MELEMPAR untuk
   `mysql://`/`mariadb://` (dicabut, #636) maupun skema tak dikenal — tidak ada
   URL yang bisa diam-diam jatuh ke mesin lain. */
export async function bukaServer(url: string): Promise<ServerBasisData> {
  return new ServerPostgres(await klienPg(url), url);
}

export async function bukaBasisData(url: string, nama: string): Promise<KoneksiBasisData> {
  pastikanNamaAman(nama);
  return new KoneksiPostgres(await klienPg(url, nama));
}

/**
 * Direktori migration buku PERUSAHAAN baru — relatif terhadap akar repo.
 *
 * ══ INI BUKAN DETAIL ══════════════════════════════════════════════════════
 * Buku baru dibangun dari **baseline** PostgreSQL yang dibangkitkan sekali dari
 * skema saat penukaran (15 Okt 2026) plus migration tambahan tulis-tangan —
 * bukan dari 65 migration MariaDB, yang sejak #636 hidup di
 * `prisma/_arsip-mariadb/` dan tidak dibaca perkakas apa pun. Karena baseline
 * diturunkan dari skema yang sama, hasilnya identik dengan buku yang dulu
 * bermigrasi lewat 65 langkah.
 */
export const DIREKTORI_MIGRATION_PERUSAHAAN = "prisma/postgresql/company";
