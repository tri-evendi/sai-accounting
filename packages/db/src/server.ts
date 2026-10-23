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
  /**
   * Komentar basis data (`COMMENT ON DATABASE`) — `null` bila tidak ada.
   * Dipakai penyediaan sebagai TANDA "buku ini sedang disediakan dan belum
   * terdaftar", supaya pengulangan bisa membedakan buku setengah jadi miliknya
   * dari basis data lain yang kebetulan bernama sama (lihat
   * `src/lib/company-provisioning.ts`).
   */
  catatan(nama: string): Promise<string | null>;
  /** Setel (atau hapus, dengan `null`) komentar basis data. Menuntut pemiliknya. */
  setelCatatan(nama: string, teks: string | null): Promise<void>;
  tutup(): Promise<void>;
}

/** Operasi di DALAM satu basis data: menjalankan berkas migration. */
export interface KoneksiBasisData {
  readonly mesin: DbEngine;
  /** Jalankan SQL apa adanya — satu berkas migration bisa banyak pernyataan. */
  jalankan(sql: string): Promise<void>;
  /**
   * Jalankan satu berkas migration DAN catatannya di `_prisma_migrations`
   * dalam SATU transaksi. Tanpa ini, mati di antara keduanya meninggalkan
   * skema yang sudah berubah tanpa catatan — dan pengulangan menerapkannya
   * dua kali (`relation already exists`).
   */
  terapkanMigration(sql: string, catatan: { id: string; checksum: string; nama: string }): Promise<void>;
  /**
   * Isi `_prisma_migrations` berurutan nama: nama, checksum, dan apakah ia
   * SELESAI (bukan menggantung/dibatalkan). Tabel yang belum ada → `null`.
   */
  daftarMigration(): Promise<{ nama: string; checksum: string; selesai: boolean }[] | null>;
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
  /** Sambungan e-Faktur buku ini. Buku yang belum bermigrasi 0004 MELEMPAR. */
  ringkasanEfaktur(): Promise<RingkasanEfaktur>;
  tutup(): Promise<void>;
}

export interface RingkasanMigrasi {
  terapan: number;
  menggantung: number;
  terakhir: string | null;
}

/**
 * Keadaan sambungan e-Faktur sebuah buku untuk konsol operator
 * (docs/EFAKTUR.md). TANPA rahasia: yang dibaca hanya ADA-TIDAKNYA kredensial,
 * tidak pernah isinya — operator tidak butuh kredensial PJAP milik PT.
 */
export interface RingkasanEfaktur {
  penyedia: string | null;
  produksi: boolean;
  adaKredensial: boolean;
  /** Jumlah kiriman per status. */
  status: Record<string, number>;
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

/**
 * Bentuk nama PERAN yang boleh ditanam sebagai teks SQL. Sama dengan
 * `ROLE_NAME` di `scripts/postgres-roles.py` — keduanya menanam nama yang sama.
 */
export const SAFE_ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * HAK PERAN APLIKASI ATAS SATU BUKU — hak minimum (Okt 2026).
 *
 * Aplikasi tidak lagi menyambung sebagai superuser. Basis data dan setiap
 * objeknya dimiliki peran PEMILIK (`sai_owner`, NOSUPERUSER CREATEDB — dipakai
 * `migrate` dan penyediaan), dan peran APLIKASI (`sai_app`) hanya mendapat DML:
 * baca-tulis baris, tanpa DDL, tanpa `CREATE DATABASE`, tanpa membaca berkas
 * server atau menjalankan program di sana (yang dimungkinkan superuser).
 *
 * Dijalankan SEBAGAI PEMILIK, di dalam buku itu: `ALTER DEFAULT PRIVILEGES`
 * tanpa `FOR ROLE` berlaku untuk peran yang menjalankannya — yaitu peran yang
 * kelak juga menjalankan migration berikutnya, jadi tabel yang lahir di rilis
 * mendatang langsung terbaca aplikasi. `scripts/postgres-roles.py` menjalankan
 * baris yang SAMA PERSIS (sesudah `SET ROLE` ke pemilik) untuk buku yang sudah
 * ada; `tests/postgres-least-privilege.test.ts` menolak bila keduanya menyimpang.
 *
 * Idempoten: GRANT yang sudah ada tidak berubah apa pun.
 *
 * `%DB%` / `%ROLE%` diganti nama yang sudah divalidasi — nama tidak bisa menjadi
 * parameter di pernyataan DDL/DCL.
 */
export const APP_ROLE_GRANT_TEMPLATE: readonly string[] = [
  'GRANT CONNECT, TEMPORARY ON DATABASE "%DB%" TO "%ROLE%";',
  'GRANT USAGE ON SCHEMA public TO "%ROLE%";',
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "%ROLE%";',
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "%ROLE%";',
  'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "%ROLE%";',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "%ROLE%";',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "%ROLE%";',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "%ROLE%";',
];

/** SQL hibah peran aplikasi untuk satu buku (lihat `APP_ROLE_GRANT_TEMPLATE`). */
export function appRoleGrantSql(databaseName: string, appRole: string): string {
  pastikanNamaAman(databaseName);
  if (!SAFE_ROLE_NAME.test(appRole)) {
    throw new Error(`Nama peran tidak sah: ${JSON.stringify(appRole)}`);
  }
  return APP_ROLE_GRANT_TEMPLATE.map((l) => l.replaceAll("%DB%", databaseName).replaceAll("%ROLE%", appRole)).join(
    "\n"
  );
}

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

  async catatan(nama: string): Promise<string | null> {
    pastikanNamaAman(nama);
    const r = await this.c.query<{ c: string | null }>(
      "SELECT shobj_description(oid, 'pg_database') AS c FROM pg_database WHERE datname = $1",
      [nama]
    );
    return r.rows[0]?.c ?? null;
  }

  async setelCatatan(nama: string, teks: string | null): Promise<void> {
    pastikanNamaAman(nama);
    /* `COMMENT ON` tidak menerima parameter; teksnya dikutip sebagai literal
       dengan `format('%L')` di server, bukan dirakit di sini. */
    if (teks === null) {
      await this.c.query(`COMMENT ON DATABASE "${nama}" IS NULL`);
      return;
    }
    const r = await this.c.query<{ q: string }>("SELECT format('%L', $1::text) AS q", [teks]);
    await this.c.query(`COMMENT ON DATABASE "${nama}" IS ${r.rows[0]!.q}`);
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

  async terapkanMigration(
    sql: string,
    i: { id: string; checksum: string; nama: string }
  ): Promise<void> {
    const mulai = new Date();
    await this.c.query("BEGIN");
    try {
      await this.c.query(sql);
      await this.catatMigration({ ...i, mulai, selesai: new Date() });
      await this.c.query("COMMIT");
    } catch (error) {
      await this.c.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }

  async daftarMigration(): Promise<{ nama: string; checksum: string; selesai: boolean }[] | null> {
    const ada = await this.c.query<{ t: string | null }>(
      `SELECT to_regclass('public."_prisma_migrations"')::text AS t`
    );
    if (!ada.rows[0]?.t) return null;
    const r = await this.c.query<{ nama: string; checksum: string; selesai: boolean }>(
      `SELECT migration_name AS nama, checksum,
              (finished_at IS NOT NULL AND rolled_back_at IS NULL) AS selesai
         FROM "_prisma_migrations" ORDER BY migration_name`
    );
    return r.rows;
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

  async ringkasanEfaktur(): Promise<RingkasanEfaktur> {
    const s = await this.c.query<{ penyedia: string | null; produksi: boolean; ada: boolean }>(
      `SELECT efaktur_provider AS penyedia, efaktur_is_production AS produksi,
              (efaktur_secret_ciphertext IS NOT NULL) AS ada
         FROM company_settings ORDER BY id ASC LIMIT 1`
    );
    const k = await this.c.query<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM efaktur_submissions GROUP BY status`
    );
    const baris = s.rows[0];
    return {
      penyedia: baris?.penyedia ?? null,
      produksi: baris?.produksi ?? false,
      adaKredensial: baris?.ada ?? false,
      status: Object.fromEntries(k.rows.map((r) => [r.status, r.n])),
    };
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
