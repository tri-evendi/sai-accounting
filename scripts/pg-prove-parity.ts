/**
 * MEMBUKTIKAN SATU BASIS DATA PINDAH UTUH: MariaDB vs PostgreSQL
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10)
 *
 *     bun run pg:prove --source <mysql-url> --target <postgres-url>
 *
 * == KENAPA JUMLAH BARIS TIDAK CUKUP ======================================
 * `pg-migrate-data.ts` sudah membandingkan jumlah baris, dan itu memang
 * menangkap tabel yang tidak terbawa. Yang TIDAK ia tangkap adalah kerusakan
 * yang jumlahnya tetap sama:
 *
 *   • Uang yang kehilangan presisi. `Decimal(15,2)` yang melewati `Number`
 *     membulat di atas 2^53 — jumlah barisnya sempurna, angkanya salah.
 *   • Boolean yang terbalik. `"0"` bernilai BENAR di JavaScript, jadi setiap
 *     master data nonaktif bisa hidup kembali tanpa satu pun galat.
 *   • Tanggal yang bergeser satu hari karena zona waktu.
 *
 * Ketiganya tidak melempar apa pun. Maka pembuktiannya harus berupa ANGKA yang
 * dibandingkan, bukan skrip yang melaporkan "berhasil" — aturan yang sama
 * dengan `prove-backup-restore.ts`.
 *
 * Keluar 1 kalau ada satu saja beda. Tidak pernah menulis ke mana pun.
 */
import "dotenv/config";
import { createConnection } from "mariadb";
import { Client as PgClient } from "pg";

function arg(nama: string): string | undefined {
  const i = process.argv.indexOf(nama);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function mati(pesan: string): never {
  console.error(`[pg:prove] GAGAL: ${pesan}`);
  process.exit(1);
}

interface Beda {
  apa: string;
  mariadb: string;
  postgres: string;
}

async function main() {
  const sumber = arg("--source") ?? process.env.PG_MIGRATE_SOURCE;
  const target = arg("--target") ?? process.env.PG_MIGRATE_TARGET;
  if (!sumber || !target) mati("--source dan --target wajib.");

  const su = new URL(sumber);
  const nama = su.pathname.slice(1);
  const my = await createConnection({
    host: su.hostname,
    port: Number(su.port) || 3306,
    user: decodeURIComponent(su.username),
    password: decodeURIComponent(su.password),
    database: nama,
    decimalAsNumber: false,
    bigIntAsNumber: false,
  });
  const pg = new PgClient({ connectionString: target });
  await pg.connect();

  const beda: Beda[] = [];
  let diperiksa = 0;

  try {
    /* ── 1. Jumlah baris per tabel ──────────────────────────────────────── */
    const tabel = (
      await pg.query<{ t: string }>(
        `SELECT table_name AS t FROM information_schema.tables
         WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
      )
    ).rows.map((r) => r.t);

    for (const t of tabel) {
      const m = (await my.query(`SELECT COUNT(*) AS n FROM \`${t}\``)) as { n: unknown }[];
      const p = await pg.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM "${t}"`);
      const a = String(m[0]?.n ?? "?");
      const b = String(p.rows[0]?.n ?? "?");
      diperiksa++;
      if (a !== b) beda.push({ apa: `${t} (jumlah baris)`, mariadb: a, postgres: b });
    }

    /* ── 2. Jumlah setiap kolom UANG, sebagai TEKS ──────────────────────────
       Sebagai teks, bukan angka: perbandingan angka di JavaScript akan
       menyamakan dua nilai yang berbeda di sen ke-15, yaitu persis kerusakan
       yang dicari di sini. */
    const desimal = (
      await pg.query<{ t: string; c: string }>(
        `SELECT table_name AS t, column_name AS c FROM information_schema.columns
         WHERE table_schema='public' AND data_type='numeric' ORDER BY 1,2`
      )
    ).rows;

    for (const { t, c } of desimal) {
      const m = (await my.query(
        `SELECT COALESCE(CAST(SUM(\`${c}\`) AS CHAR), 'NULL') AS s FROM \`${t}\``
      )) as { s: string }[];
      const p = await pg.query<{ s: string }>(
        `SELECT COALESCE(SUM("${c}")::text, 'NULL') AS s FROM "${t}"`
      );
      const a = m[0]?.s ?? "?";
      const b = p.rows[0]?.s ?? "?";
      diperiksa++;
      if (a !== b) beda.push({ apa: `${t}.${c} (jumlah uang)`, mariadb: a, postgres: b });
    }

    /* ── 3. Setiap kolom BOOLEAN: berapa benar, berapa salah ───────────────
       Keduanya dihitung, bukan hanya yang benar: tabel yang seluruhnya `false`
       akan tampak cocok kalau hanya `true` yang dihitung (0 = 0), padahal
       pembalikan total justru yang paling mungkin terjadi. */
    const boolean_ = (
      await pg.query<{ t: string; c: string }>(
        `SELECT table_name AS t, column_name AS c FROM information_schema.columns
         WHERE table_schema='public' AND udt_name='bool' ORDER BY 1,2`
      )
    ).rows;

    for (const { t, c } of boolean_) {
      const m = (await my.query(
        `SELECT CONCAT(COALESCE(SUM(\`${c}\`=1),0),'/',COALESCE(SUM(\`${c}\`=0),0),'/',COALESCE(SUM(\`${c}\` IS NULL),0)) AS s FROM \`${t}\``
      )) as { s: string }[];
      const p = await pg.query<{ s: string }>(
        `SELECT COUNT(*) FILTER (WHERE "${c}")||'/'||COUNT(*) FILTER (WHERE NOT "${c}")||'/'||COUNT(*) FILTER (WHERE "${c}" IS NULL) AS s FROM "${t}"`
      );
      const a = m[0]?.s ?? "?";
      const b = p.rows[0]?.s ?? "?";
      diperiksa++;
      if (a !== b) beda.push({ apa: `${t}.${c} (benar/salah/null)`, mariadb: a, postgres: b });
    }

    /* ── 4. Rentang setiap kolom WAKTU ──────────────────────────────────────
       Min & maks, bukan seluruh barisnya: pergeseran zona waktu menggeser
       SEMUANYA dengan jumlah yang sama, jadi dua ujungnya sudah cukup untuk
       menangkapnya — dan jauh lebih murah. */
    const waktu = (
      await pg.query<{ t: string; c: string }>(
        `SELECT table_name AS t, column_name AS c FROM information_schema.columns
         WHERE table_schema='public' AND data_type IN ('timestamp without time zone','date')
         ORDER BY 1,2`
      )
    ).rows;

    for (const { t, c } of waktu) {
      const m = (await my.query(
        `SELECT CONCAT(COALESCE(DATE_FORMAT(MIN(\`${c}\`),'%Y-%m-%d %H:%i:%s'),'-'),'|',COALESCE(DATE_FORMAT(MAX(\`${c}\`),'%Y-%m-%d %H:%i:%s'),'-')) AS s FROM \`${t}\``
      )) as { s: string }[];
      const p = await pg.query<{ s: string }>(
        `SELECT COALESCE(to_char(MIN("${c}"),'YYYY-MM-DD HH24:MI:SS'),'-')||'|'||COALESCE(to_char(MAX("${c}"),'YYYY-MM-DD HH24:MI:SS'),'-') AS s FROM "${t}"`
      );
      const a = m[0]?.s ?? "?";
      const b = p.rows[0]?.s ?? "?";
      diperiksa++;
      if (a !== b) beda.push({ apa: `${t}.${c} (rentang waktu)`, mariadb: a, postgres: b });
    }
  } finally {
    await my.end().catch(() => {});
    await pg.end().catch(() => {});
  }

  console.log(`[pg:prove] ${nama}: ${diperiksa} pembandingan`);
  if (beda.length === 0) {
    console.log(`[pg:prove] ✓ IDENTIK — jumlah baris, uang, boolean, dan rentang waktu semuanya cocok.`);
    return;
  }
  console.error(`[pg:prove] ✗ ${beda.length} BEDA:`);
  for (const b of beda.slice(0, 40)) {
    console.error(`    ${b.apa}\n       MariaDB  : ${b.mariadb}\n       Postgres : ${b.postgres}`);
  }
  if (beda.length > 40) console.error(`    … dan ${beda.length - 40} lagi`);
  process.exit(1);
}

/* `import.meta.main` milik Bun belum ada di tipe bawaan TypeScript. Diberi tipe
   di sini, bukan dimatikan dengan `@ts-ignore`: yang dibutuhkan satu properti
   boolean, dan menuliskannya tetap membuat `tsc` memeriksa sisanya. */
const dijalankanLangsung = Boolean((import.meta as unknown as { main?: boolean }).main);

if (dijalankanLangsung) {
  main().catch((e) => {
    console.error("[pg:prove] GAGAL:", e instanceof Error ? e.stack : e);
    process.exit(1);
  });
}
