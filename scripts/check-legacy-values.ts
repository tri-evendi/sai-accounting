/**
 * Periksa nilai enum-like di SETIAP basis data perusahaan (issue #111).
 *
 * ══ KENAPA SKRIP, BUKAN CUKUP MIGRATION ════════════════════════════════════
 * Migration `0043` memperbaiki nilai yang sudah ada, tapi ia bekerja diam-diam:
 * `migrate deploy` tidak melaporkan berapa baris yang berubah, dan sejak #104
 * ia dijalankan ke N basis data sekaligus. Skrip ini yang memberi angkanya —
 * jalankan SEBELUM migration untuk tahu apa yang akan diperbaiki, dan SESUDAH
 * untuk membuktikan tidak ada yang tersisa.
 *
 * ══ KENAPA PERBANDINGANNYA BINARY ══════════════════════════════════════════
 * Collation `utf8mb4_unicode_ci` membuat `type = 'in'` COCOK dengan 'IN'. Itu
 * persis sebabnya masalah ini tidak pernah terlihat lewat SQL selama bertahun-
 * tahun. Skrip yang memeriksa dengan `=` biasa akan melaporkan "semuanya
 * bersih" untuk data yang justru sedang rusak — jadi seluruh perbandingan di
 * sini dilakukan BINARY, sama seperti `===` di JavaScript yang menghitung saldo.
 *
 *   bun run check:legacy-values
 *
 * Read-only: tidak ada satu pun UPDATE. Exit code bukan nol bila ada nilai yang
 * tidak baku, supaya bisa dipakai sebagai penjaga di gladi resik rilis.
 */

import "dotenv/config";
import { createPool } from "mariadb";
import { PrismaClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { CASH_TYPES, STOCK_MOVEMENT_TYPES } from "../src/lib/constants";

function controlClient(): PrismaClient {
  const raw = process.env.CONTROL_DATABASE_URL;
  if (!raw) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(1);
  }
  const url = new URL(raw);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 2,
    }),
  });
}

/** Kredensial dari template, nama basis data dari registry — sama seperti `db:migrate:companies`. */
function companyConnection(databaseName: string) {
  const raw =
    process.env.COMPANY_DATABASE_URL_TEMPLATE ??
    process.env.DATABASE_URL ??
    process.env.CONTROL_DATABASE_URL!;
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: databaseName,
    connectionLimit: 1,
  };
}

type Offender = { table: string; value: string; rows: number };

async function inspect(databaseName: string): Promise<Offender[]> {
  const pool = createPool(companyConnection(databaseName));
  try {
    const found: Offender[] = [];
    const checks: { table: string; allowed: readonly string[] }[] = [
      { table: "stock_movements", allowed: STOCK_MOVEMENT_TYPES },
      { table: "cash_movements", allowed: CASH_TYPES },
    ];

    for (const { table, allowed } of checks) {
      const rows: { value: string | Buffer; total: number | bigint }[] = await pool.query(
        `SELECT CAST(type AS BINARY) AS value, COUNT(*) AS total FROM ${table} GROUP BY 1`
      );
      for (const row of rows) {
        const value = row.value.toString();
        if (allowed.includes(value)) continue;
        found.push({ table, value, rows: Number(row.total) });
      }
    }
    return found;
  } finally {
    await pool.end();
  }
}

async function main() {
  const control = controlClient();
  const companies = await control.company.findMany({
    orderBy: { id: "asc" },
    select: { slug: true, databaseName: true, isActive: true },
  });
  await control.$disconnect();

  if (companies.length === 0) {
    console.error("Belum ada perusahaan terdaftar — tidak ada yang bisa diperiksa.");
    process.exit(1);
  }

  let dirty = 0;
  for (const company of companies) {
    const label = `${company.slug} (${company.databaseName})${company.isActive ? "" : " [nonaktif]"}`;
    let offenders: Offender[];
    try {
      offenders = await inspect(company.databaseName);
    } catch (error) {
      console.error(`\n✗ ${label}: gagal diperiksa — ${(error as Error).message}`);
      dirty++;
      continue;
    }

    if (offenders.length === 0) {
      console.log(`✓ ${label}: seluruh nilai sudah baku`);
      continue;
    }

    dirty++;
    console.log(`\n✗ ${label}`);
    for (const o of offenders) {
      console.log(`    ${o.table.padEnd(16)} "${o.value}"  ${o.rows} baris`);
    }
  }

  if (dirty > 0) {
    console.error(
      `\n${dirty} dari ${companies.length} perusahaan masih menyimpan nilai tak baku.\n` +
        "Nilai seperti ini TIDAK menimbulkan galat — ia menghasilkan angka yang salah:\n" +
        "  * gerakan stok di luar in/out/process → saldo barang terbaca nol;\n" +
        "  * jenis kas di luar bank/kas_besar/kas_kecil → jurnal memakai akun kas bawaan.\n" +
        "Terapkan migration 0043 (`bun run db:migrate:all`); bila masih tersisa, nilainya\n" +
        "belum punya pemetaan — putuskan artinya lalu tambahkan di src/lib/legacy-values.ts."
    );
    process.exit(1);
  }

  console.log(`\n═══ ${companies.length}/${companies.length} perusahaan bersih`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
