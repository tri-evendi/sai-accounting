/**
 * MEMINDAHKAN DATA SATU BASIS DATA: MariaDB -> PostgreSQL
 * (migrasi PostgreSQL — docs/arsitektur/07-RIWAYAT.md)
 *
 *     bun run pg:data --source <mysql-url> --target <postgres-url>
 *     bun run pg:data --source ... --target ... --dry-run
 *
 * == GENERIK, BUKAN PER-TABEL ==============================================
 * 1.084 tabel di 19 basis data. Kode per-tabel akan tertinggal pada tabel
 * ke-1.085, dan "hampir semua data" adalah janji yang diingkari diam-diam —
 * aturan yang sama dengan `--all-databases` di `scripts/backup.sh`. Jadi daftar
 * tabel dan kolomnya dibaca dari `information_schema`, bukan diketik.
 *
 * == URUTAN FK: DIMATIKAN, BUKAN DIPECAHKAN ================================
 * 74 FK di buku perusahaan membuat urutan pemuatan menjadi soal topologi, dan
 * siklus (`journals.reversal_of_id` menunjuk `journals`) membuatnya tak
 * terpecahkan sama sekali. PostgreSQL punya jawaban baku:
 * `SET session_replication_role = replica` menunda SELURUH pemeriksaan FK dan
 * trigger selama sesi.
 *
 * Menunda pemeriksaan BUKAN melewatinya, dan bedanya harus dibuktikan: sesudah
 * pemuatan, `session_replication_role` dikembalikan ke `origin` lalu setiap FK
 * dihitung baris yatimnya satu per satu (§6 di bawah). Satu baris yatim saja
 * menggagalkan skripnya.
 *
 * Itu lebih kuat daripada membiarkan PostgreSQL memeriksa saat `INSERT`: kalau
 * pemeriksaannya hanya terjadi per baris saat dimuat, FK yang menunjuk tabel
 * yang belum dimuat akan gagal karena URUTAN, bukan karena datanya salah — dan
 * kegagalan karena urutan menggoda orang untuk mematikan pemeriksaannya dan
 * lupa menyalakannya kembali.
 *
 * == TIDAK PERNAH MENULIS KE MariaDB =======================================
 * Sumbernya dibuka hanya-baca secara perilaku: satu-satunya pernyataan yang
 * dikirim ke sana adalah `SELECT`. Dijaga `tests/pg-migrate-data.test.ts`.
 */
import "dotenv/config";
/* `import mariadb from "mariadb"` GAGAL di bun: paket itu tidak punya ekspor
   `default` pada API promise-nya. Impor bernama yang benar — dan ia gagal saat
   dijalankan, bukan saat `tsc`, jadi hanya menjalankannya yang membuktikannya. */
import { createConnection } from "mariadb";
import { Client as PgClient } from "pg";
import { pgTypeDari, sesuaikan, sqlGeserSequence, type PgType } from "../src/lib/pg-coerce";

const DRY_RUN = process.argv.includes("--dry-run");

function arg(nama: string): string | undefined {
  const i = process.argv.indexOf(nama);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function log(...p: unknown[]) {
  console.log("[pg:data]", ...p);
}

function mati(pesan: string): never {
  console.error(`[pg:data] GAGAL: ${pesan}`);
  process.exit(1);
}

/** Baris dimuat per kelompok. 500 dipilih dari ukuran data, bukan dari selera:
 *  tabel terbesar 18.396 baris, jadi ini 37 perjalanan — cukup sedikit untuk
 *  cepat, cukup kecil untuk tidak menahan 3,6 GB memori kotak ini. */
const UKURAN_KELOMPOK = 500;

interface Kolom {
  nama: string;
  tipe: PgType;
}

async function main() {
  const sumber = arg("--source") ?? process.env.PG_MIGRATE_SOURCE;
  const target = arg("--target") ?? process.env.PG_MIGRATE_TARGET;
  if (!sumber) mati("--source <mysql-url> wajib.");
  if (!target) mati("--target <postgres-url> wajib.");

  const su = new URL(sumber);
  const my = await createConnection({
    host: su.hostname,
    port: Number(su.port) || 3306,
    user: decodeURIComponent(su.username),
    password: decodeURIComponent(su.password),
    database: su.pathname.slice(1),
    /* Decimal & BigInt sebagai STRING: lihat `pg-coerce.ts` — presisi uang tidak
       boleh melewati `Number`. */
    decimalAsNumber: false,
    bigIntAsNumber: false,
    dateStrings: false,
  });
  const pg = new PgClient({ connectionString: target });
  await pg.connect();

  const namaSumber = su.pathname.slice(1);
  log(`sumber=${namaSumber} target=${new URL(target).pathname.slice(1)} dry-run=${DRY_RUN}`);

  try {
    /* ── 1. Tabel mana saja ────────────────────────────────────────────────
       Diambil dari TARGET, bukan dari sumber: yang menentukan adalah tabel apa
       yang ada di skema baru. Tabel sumber yang tidak ada di target (mis.
       `_prisma_migrations` MariaDB) memang tidak boleh ikut pindah. */
    const tTarget = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    const tabelTarget = tTarget.rows.map((r) => r.table_name);
    if (tabelTarget.length === 0) mati("target kosong — baseline belum diterapkan?");

    const tSumber = await my.query(
      `SELECT table_name AS t FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
      [namaSumber]
    );
    const tabelSumber = new Set((tSumber as { t: string }[]).map((r) => r.t));

    const hilang = tabelTarget.filter((t) => !tabelSumber.has(t));
    if (hilang.length > 0) {
      log(`⚠ ${hilang.length} tabel ada di target tapi tidak di sumber (akan dibiarkan kosong):`);
      for (const h of hilang) log(`    ${h}`);
    }

    /* ── 2. Matikan pemeriksaan FK & trigger selama pemuatan ──────────────── */
    if (!DRY_RUN) {
      await pg.query("SET session_replication_role = replica");
    }

    /* ── 3. Pindahkan, tabel demi tabel ──────────────────────────────────── */
    const jumlah: Record<string, number> = {};
    let totalBaris = 0;

    for (const tabel of tabelTarget) {
      if (!tabelSumber.has(tabel)) continue;

      const kTarget = await pg.query<{ column_name: string; udt_name: string; data_type: string }>(
        `SELECT column_name, udt_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [tabel]
      );
      const kSumber = await my.query(
        `SELECT column_name AS c FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?`,
        [namaSumber, tabel]
      );
      const adaDiSumber = new Set((kSumber as { c: string }[]).map((r) => r.c));

      const kolom: Kolom[] = kTarget.rows
        .filter((k) => adaDiSumber.has(k.column_name))
        .map((k) => ({ nama: k.column_name, tipe: pgTypeDari(k.udt_name, k.data_type) }));

      const kolomHilang = kTarget.rows
        .map((k) => k.column_name)
        .filter((c) => !adaDiSumber.has(c));
      if (kolomHilang.length > 0) {
        log(`  ⚠ ${tabel}: kolom target tanpa pasangan di sumber → ${kolomHilang.join(", ")}`);
      }
      if (kolom.length === 0) {
        log(`  — ${tabel}: nol kolom yang cocok, dilewati`);
        continue;
      }

      const daftar = kolom.map((k) => `\`${k.nama}\``).join(", ");
      const baris = (await my.query(
        `SELECT ${daftar} FROM \`${tabel}\``
      )) as Record<string, unknown>[];

      jumlah[tabel] = baris.length;
      totalBaris += baris.length;
      if (baris.length === 0) continue;

      if (DRY_RUN) {
        log(`  (dry-run) ${tabel}: ${baris.length} baris`);
        continue;
      }

      const namaKolomPg = kolom.map((k) => `"${k.nama}"`).join(", ");
      for (let i = 0; i < baris.length; i += UKURAN_KELOMPOK) {
        const potong = baris.slice(i, i + UKURAN_KELOMPOK);
        const nilai: unknown[] = [];
        const tanda: string[] = [];
        let n = 1;
        for (const r of potong) {
          tanda.push(`(${kolom.map(() => `$${n++}`).join(", ")})`);
          for (const k of kolom) {
            try {
              nilai.push(sesuaikan(r[k.nama], k.tipe));
            } catch (e) {
              mati(`${tabel}.${k.nama}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
        await pg.query(
          `INSERT INTO "${tabel}" (${namaKolomPg}) VALUES ${tanda.join(", ")}`,
          nilai
        );
      }
      log(`  ✓ ${tabel}: ${baris.length} baris`);
    }

    if (DRY_RUN) {
      log(`(dry-run) ${Object.keys(jumlah).length} tabel · ${totalBaris} baris · nol tulisan`);
      return;
    }

    /* ── 4. Nyalakan kembali pemeriksaan ─────────────────────────────────── */
    await pg.query("SET session_replication_role = origin");

    /* ── 5. Geser sequence ───────────────────────────────────────────────── */
    const seq = await pg.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`
    );
    for (const s of seq.rows) {
      await pg.query(sqlGeserSequence(s.table_name, s.column_name));
    }
    log(`  ✓ ${seq.rows.length} sequence digeser ke max(id)`);

    /* ── 6. Integritas FK diperiksa ULANG, bukan dipercaya ───────────────── */
    const fk = await pg.query<{
      tabel: string; kolom: string; ref_tabel: string; ref_kolom: string;
    }>(
      `SELECT tc.table_name AS tabel, kcu.column_name AS kolom,
              ccu.table_name AS ref_tabel, ccu.column_name AS ref_kolom
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
    );
    let yatim = 0;
    for (const f of fk.rows) {
      const r = await pg.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM "${f.tabel}" a
         WHERE a."${f.kolom}" IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM "${f.ref_tabel}" b WHERE b."${f.ref_kolom}" = a."${f.kolom}")`
      );
      const n = Number(r.rows[0]?.n ?? 0);
      if (n > 0) {
        console.error(`[pg:data] ⚠ YATIM ${n} baris: ${f.tabel}.${f.kolom} -> ${f.ref_tabel}.${f.ref_kolom}`);
        yatim += n;
      }
    }
    if (yatim > 0) {
      mati(`${yatim} baris yatim sesudah pemuatan — FK tidak utuh, JANGAN dipakai.`);
    }
    log(`  ✓ ${fk.rows.length} FK diperiksa, nol baris yatim`);

    /* ── 7. Jumlah baris per tabel harus SAMA ────────────────────────────── */
    let beda = 0;
    for (const [tabel, n] of Object.entries(jumlah)) {
      const r = await pg.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM "${tabel}"`);
      const m = Number(r.rows[0]?.n ?? -1);
      if (m !== n) {
        console.error(`[pg:data] ⚠ ${tabel}: sumber ${n} baris, target ${m}`);
        beda++;
      }
    }
    if (beda > 0) mati(`${beda} tabel jumlah barisnya tidak sama.`);

    log(`SELESAI — ${Object.keys(jumlah).length} tabel · ${totalBaris} baris · jumlah baris SAMA`);
  } finally {
    await my.end().catch(() => {});
    await pg.end().catch(() => {});
  }
}

/* `import.meta.main` milik Bun belum ada di tipe bawaan TypeScript. Diberi tipe
   di sini, bukan dimatikan dengan `@ts-ignore`: yang dibutuhkan satu properti
   boolean, dan menuliskannya tetap membuat `tsc` memeriksa sisanya. */
const dijalankanLangsung = Boolean((import.meta as unknown as { main?: boolean }).main);

if (dijalankanLangsung) {
  main().catch((e) => {
    console.error("[pg:data] GAGAL:", e instanceof Error ? e.stack : e);
    process.exit(1);
  });
}
