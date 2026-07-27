/**
 * Klien BASIS DATA KENDALI (issue #104) — pengguna, perusahaan, keanggotaan.
 *
 * Singleton tingkat modul, sama seperti `lib/prisma.ts` dulu, dan di sini pola
 * itu memang benar: basis data kendali cuma SATU untuk seluruh pemasangan.
 * Yang jamak dan berpindah-pindah per permintaan adalah basis data PERUSAHAAN
 * (lihat `lib/company-clients.ts`), bukan yang ini.
 *
 * TIDAK ADA SATU PUN ANGKA AKUNTANSI DI SINI. Kalau suatu saat ada yang tergoda
 * menaruh tabel transaksi di basis data kendali, seluruh janji isolasi fisik
 * issue #104 batal pada saat itu juga.
 */

import { PrismaClient } from "@/generated/control/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForControl = globalThis as unknown as {
  controlPrisma: PrismaClient | undefined;
};

/**
 * Batas koneksi kendali dibuat KECIL dengan sengaja. Query ke sini hanya terjadi
 * saat masuk, saat berganti perusahaan, dan saat revalidasi sesi berkala — bukan
 * di jalur panas. Setiap koneksi yang dipesan di sini adalah koneksi yang tidak
 * bisa dipakai basis data perusahaan, dan `max_connections` MariaDB di mesin
 * ~1,9 GB adalah anggaran yang benar-benar terbatas.
 */
const CONTROL_CONNECTION_LIMIT = Number(process.env.CONTROL_DB_CONNECTION_LIMIT) || 2;

function createControlClient(): PrismaClient {
  const databaseUrl = process.env.CONTROL_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "CONTROL_DATABASE_URL is not set. Multi-perusahaan (issue #104) menyimpan " +
        "pengguna, daftar perusahaan, dan keanggotaan di basis data kendali yang " +
        "terpisah dari buku besar. Tambahkan ke .env di direktori aplikasi."
    );
  }

  const url = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: CONTROL_CONNECTION_LIMIT,
  });

  return new PrismaClient({ adapter });
}

export const controlDb: PrismaClient = globalForControl.controlPrisma ?? createControlClient();

if (process.env.NODE_ENV !== "production") globalForControl.controlPrisma = controlDb;
