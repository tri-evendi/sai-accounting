/**
 * Kumpulan klien basis data PERUSAHAAN (issue #104) — satu klien per PT, dengan
 * batas jumlah.
 *
 * ══ KENAPA BUKAN SATU KLIEN HIDUP PER PERUSAHAAN SELAMANYA ═════════════════
 * Setiap `PrismaClient` memegang pool koneksinya sendiri. Dengan bawaan lama
 * (`DB_CONNECTION_LIMIT` = 3), sepuluh perusahaan berarti 30 koneksi yang
 * dipesan permanen — di mesin ~1,9 GB dengan `max_connections` MariaDB bawaan,
 * itu bukan angka teoretis, itu kehabisan koneksi. Jadi klien di sini
 * DIBATASI JUMLAHNYA dan yang paling lama tak dipakai dibuang (LRU).
 *
 * Angka bawaannya juga diturunkan: 2 koneksi per klien, bukan 3. Satu
 * perusahaan yang sedang dipakai satu-dua orang tidak butuh lebih, dan
 * anggarannya kini dibagi ke banyak perusahaan.
 *
 * ══ KENAPA PEMUTUSAN DITUNDA, BUKAN SEKETIKA ═══════════════════════════════
 * Klien yang tergusur langsung dikeluarkan dari peta — sejak detik itu tak ada
 * pekerjaan BARU yang mengalir ke sana. Tapi `$disconnect()`-nya ditunda
 * (`POOL_DISCONNECT_GRACE_MS`), sebab mungkin masih ada query yang sedang
 * berjalan di klien itu, dan memutusnya di tengah jalan akan menggagalkan
 * permintaan yang tidak melakukan kesalahan apa pun. Menunda beberapa belas
 * detik jauh lebih murah daripada satu transaksi yang gagal di tengah.
 *
 * ══ KREDENSIAL TIDAK PERNAH DIAMBIL DARI BASIS DATA ════════════════════════
 * `companies.database_name` hanya menyimpan NAMA basis data. Host, pengguna,
 * dan kata sandinya selalu dari environment — menyimpan URL lengkap di tabel
 * berarti satu SELECT bisa membawa pergi kredensial setiap perusahaan.
 */

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

/** Berapa klien perusahaan boleh hidup bersamaan. */
const POOL_MAX = Number(process.env.COMPANY_CLIENT_POOL_MAX) || 4;
/** Koneksi per klien. Lebih kecil dari bawaan lama karena kini dibagi-bagi. */
const CONNECTION_LIMIT = Number(process.env.DB_CONNECTION_LIMIT) || 2;
/** Jeda sebelum klien tergusur benar-benar diputus. */
const DISCONNECT_GRACE_MS = Number(process.env.POOL_DISCONNECT_GRACE_MS) || 15_000;

/**
 * Urutan "paling lama tidak dipakai" diambil dari URUTAN KUNCI `Map`, bukan dari
 * stempel waktu: `Date.now()` beresolusi milidetik, dan beberapa permintaan
 * dalam milidetik yang sama akan terlihat sama tuanya — lalu yang tergusur
 * justru klien yang baru saja dipakai. Menyentuh sebuah klien memindahkannya ke
 * BELAKANG peta; yang tergusur selalu yang paling depan.
 */
interface PoolEntry {
  client: PrismaClient;
}

const globalForPool = globalThis as unknown as {
  companyClientPool: Map<string, PoolEntry> | undefined;
};

const pool: Map<string, PoolEntry> = globalForPool.companyClientPool ?? new Map();
if (process.env.NODE_ENV !== "production") globalForPool.companyClientPool = pool;

/**
 * URL contoh yang kredensialnya dipinjam untuk setiap perusahaan. `DATABASE_URL`
 * lama tetap dipakai sebagai cadangan supaya pemasangan yang sudah ada tidak
 * perlu mengubah `.env` sebelum sempat mendaftarkan perusahaan pertamanya.
 */
function templateUrl(): URL {
  const raw =
    process.env.COMPANY_DATABASE_URL_TEMPLATE ??
    process.env.DATABASE_URL ??
    process.env.CONTROL_DATABASE_URL;
  if (!raw) {
    throw new Error(
      "Tidak ada sumber kredensial basis data perusahaan. Set " +
        "COMPANY_DATABASE_URL_TEMPLATE (atau DATABASE_URL) di .env — nama basis " +
        "datanya sendiri diambil dari companies.database_name, bukan dari URL ini."
    );
  }
  return new URL(raw);
}

/**
 * Nama basis data hanya boleh berupa identifier MySQL yang wajar. Nilainya
 * berasal dari tabel `companies`, jadi ia bukan masukan pengguna langsung —
 * tapi ia ikut menyusun string koneksi, dan sesuatu yang menyusun string
 * koneksi layak diperiksa apa pun asalnya.
 */
const SAFE_DATABASE_NAME = /^[A-Za-z0-9_]{1,64}$/;

function createClient(databaseName: string): PrismaClient {
  if (!SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error(`Nama basis data tidak sah: ${JSON.stringify(databaseName)}`);
  }

  const url = templateUrl();
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: databaseName,
    connectionLimit: CONNECTION_LIMIT,
  });

  return new PrismaClient({ adapter });
}

function scheduleDisconnect(entry: PoolEntry): void {
  const timer = setTimeout(() => {
    void entry.client.$disconnect().catch(() => {
      // Memutus koneksi yang sudah mati bukan kejadian yang perlu diributkan.
    });
  }, DISCONNECT_GRACE_MS);
  // Jangan menahan proses tetap hidup hanya demi menunggu pemutusan ini.
  timer.unref?.();
}

/** Buang yang paling depan (paling lama tak dipakai) sampai muat dalam batas. */
function evictIfNeeded(): void {
  while (pool.size > POOL_MAX) {
    const oldestKey = pool.keys().next().value;
    if (oldestKey === undefined) return;
    const evicted = pool.get(oldestKey)!;
    pool.delete(oldestKey);
    scheduleDisconnect(evicted);
  }
}

/** Klien untuk satu basis data perusahaan, dibuat bila perlu. */
export function getCompanyClient(databaseName: string): PrismaClient {
  const existing = pool.get(databaseName);
  if (existing) {
    // Dipakai = pindah ke belakang antrean penggusuran.
    pool.delete(databaseName);
    pool.set(databaseName, existing);
    return existing.client;
  }

  const client = createClient(databaseName);
  pool.set(databaseName, { client });
  evictIfNeeded();
  return client;
}

/** Untuk tes & pematian proses: putus semuanya dan kosongkan peta. */
export async function disconnectAllCompanyClients(): Promise<void> {
  const entries = [...pool.values()];
  pool.clear();
  await Promise.allSettled(entries.map((e) => e.client.$disconnect()));
}

/** Keadaan pool — untuk diagnosis & tes, bukan untuk logika aplikasi. */
export function companyPoolStats(): { size: number; max: number; databases: string[] } {
  return { size: pool.size, max: POOL_MAX, databases: [...pool.keys()] };
}
