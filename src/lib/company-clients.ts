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

import { PrismaClient } from "@sai/db/client/company";
import { buatAdapter } from "@sai/db/adapter";

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

function createClient(databaseName: string, base: URL = templateUrl()): PrismaClient {
  if (!SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error(`Nama basis data tidak sah: ${JSON.stringify(databaseName)}`);
  }

  /* URL template dipakai untuk kredensial & host; nama basis datanya DIGANTI
     per perusahaan — itu inti model satu-basis-data-per-PT (#104). */
  const url = new URL(base.toString());
  url.pathname = `/${databaseName}`;
  const adapter = buatAdapter(url.toString(), { batasKoneksi: CONNECTION_LIMIT });

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
function evictIfNeeded(target: Map<string, PoolEntry> = pool): void {
  while (target.size > POOL_MAX) {
    const oldestKey = target.keys().next().value;
    if (oldestKey === undefined) return;
    const evicted = target.get(oldestKey)!;
    target.delete(oldestKey);
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

/* ══ REPLIKA BACA (rancangan 09 §9, tahap 3) ═══════════════════════════════
 *
 * Kolam KEDUA, terpisah dari kolam primary, dengan kunci yang sama
 * (`databaseName` — satu-satu dengan `companyId`, jadi isi satu PT tidak
 * pernah tersaji untuk PT lain). Terpisah, bukan satu peta berkunci ganda:
 * penggusuran klien replika tidak boleh menggusur klien primary yang sedang
 * dipakai menulis, dan sebaliknya.
 *
 * Kosong selamanya bila `COMPANY_DATABASE_READ_URL_TEMPLATE` tidak disetel —
 * keadaan produksi satu-VM hari ini. Pemakainya HANYA `@/lib/read-replica`,
 * yang memutuskan kapan replika boleh dipakai (kesegaran) dan menolak tulisan;
 * jalur lain yang memanggil `getCompanyReadClient` langsung ditolak
 * `tests/read-replica.test.ts`.
 */
const readPool: Map<string, PoolEntry> = new Map();

/** URL template replika, atau `null` bila replika baca tidak dipasang. */
export function readTemplateUrl(): URL | null {
  const raw = process.env.COMPANY_DATABASE_READ_URL_TEMPLATE;
  return raw ? new URL(raw) : null;
}

/**
 * Klien REPLIKA untuk satu basis data perusahaan, atau `null` bila replika
 * baca tidak dipasang. Kredensial & host dari env, nama basis data dari
 * registry — aturan yang sama dengan primary.
 */
export function getCompanyReadClient(databaseName: string): PrismaClient | null {
  const base = readTemplateUrl();
  if (!base) return null;
  const existing = readPool.get(databaseName);
  if (existing) {
    readPool.delete(databaseName);
    readPool.set(databaseName, existing);
    return existing.client;
  }
  const client = createClient(databaseName, base);
  readPool.set(databaseName, { client });
  evictIfNeeded(readPool);
  return client;
}

/**
 * Lepaskan SATU klien perusahaan dari kolam, dan tutup koneksinya.
 *
 * ══ KENAPA INI ADA — ditemukan 12 Okt 2026 saat menguji PostgreSQL ═════════
 * PostgreSQL MENOLAK `DROP DATABASE` selama masih ada koneksi, jadi
 * `@sai/db/server#hapus` memutus koneksi lain lebih dulu dengan
 * `pg_terminate_backend`. Dan koneksi yang diputus dari sisi server membuat
 * klien `pg` memancarkan event `error` — yang kalau tidak ada yang
 * mendengarnya, MENJATUHKAN PROSESNYA.
 *
 * Terbukti di percobaan pertama: proses mati dengan "Connection terminated
 * unexpectedly" tepat setelah penghapusan berhasil. Di penghapusan tenant yang
 * punya beberapa buku, itu berarti buku pertama terhapus lalu skripnya mati —
 * meninggalkan tenant separuh terhapus, keadaan yang paling sulit dibaca orang
 * berikutnya.
 *
 * Maka urutan yang benar: lepaskan klien DULU, baru hapus basis datanya. Di
 * MariaDB langkah ini tidak dibutuhkan, tetapi tidak merugikan — dan satu urutan
 * untuk kedua mesin lebih mudah dipercaya daripada dua.
 */
export async function releaseCompanyClient(databaseName: string): Promise<void> {
  /* Klien replika ikut dilepas: basis data yang dihapus di primary lenyap juga
     di replika begitu WAL-nya diputar, dan klien yang tertinggal hanya
     menunggu galat. */
  const read = readPool.get(databaseName);
  if (read) {
    readPool.delete(databaseName);
    await read.client.$disconnect().catch(() => {});
  }
  const entry = pool.get(databaseName);
  if (!entry) return;
  pool.delete(databaseName);
  await entry.client.$disconnect().catch(() => {});
}

/** Untuk tes & pematian proses: putus semuanya dan kosongkan peta. */
export async function disconnectAllCompanyClients(): Promise<void> {
  const entries = [...pool.values(), ...readPool.values()];
  pool.clear();
  readPool.clear();
  await Promise.allSettled(entries.map((e) => e.client.$disconnect()));
}

/** Keadaan pool — untuk diagnosis & tes, bukan untuk logika aplikasi. */
export function companyPoolStats(): { size: number; max: number; databases: string[] } {
  return { size: pool.size, max: POOL_MAX, databases: [...pool.keys()] };
}
