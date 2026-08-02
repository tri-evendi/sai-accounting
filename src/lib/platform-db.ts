/**
 * Klien BASIS DATA PLATFORM (issue #137) — paket, langganan, pembayaran,
 * tagihan platform, penghitung pemakaian. Data bisnis KAMI sebagai penyedia
 * SaaS; nol angka akuntansi pelanggan.
 *
 * Singleton tingkat modul, pola yang sama dengan `lib/control-db.ts`, dan di
 * sini juga benar: basis data platform cuma SATU untuk seluruh pemasangan.
 *
 * ══ JANGAN IMPOR DARI JALUR PANAS ══════════════════════════════════════════
 * Penagihan mati TIDAK BOLEH berarti login mati. Modul ini hanya boleh diimpor
 * oleh kode yang memang mengurus penagihan — halaman tagihan tenant, webhook
 * pembayaran, penjadwal (#140), skrip rekonsiliasi — BUKAN oleh penjaga,
 * middleware, sesi, atau apa pun yang berjalan pada setiap permintaan.
 * Keputusan yang dibutuhkan jalur panas (status tenant, kuota) dibaca dari
 * basis data KENDALI, tempat nilainya disalin (pola snapshot,
 * docs/MULTI-TENANT.md §5) — bukan dari sini.
 *
 * ══ URUTAN TULIS (docs/MULTI-TENANT.md §4A) ════════════════════════════════
 * FK dan transaksi tidak menyeberangi basis data. Setiap alur yang menulis ke
 * platform DAN kendali wajib menulis ke PLATFORM DULU, kendali belakangan —
 * kegagalan di tengah lalu meninggalkan pembayaran tercatat tanpa tenant naik
 * kelas (bisa direkonsiliasi: `bun run reconcile:platform`), bukan tenant naik
 * kelas tanpa pembayaran (tidak akan pernah ketahuan).
 *
 * ══ CACHE ══════════════════════════════════════════════════════════════════
 * Cache tingkat modul yang isinya data platform milik satu tenant WAJIB
 * dikunci per `tenantId` — aturan #104 (cache per perusahaan) diperluas ke
 * tenant. Pakai `TenantKeyedCache` dari `lib/tenant-cache.ts`.
 */

import { PrismaClient } from "@/generated/platform/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPlatform = globalThis as unknown as {
  platformPrisma: PrismaClient | undefined;
};

/**
 * Batas koneksi platform KECIL dengan sengaja — lebih kecil dari kendali.
 * Query ke sini hanya terjadi saat pendaftaran, siklus tagih, webhook
 * pembayaran, dan rekonsiliasi; `max_connections` MariaDB di mesin ~1,9 GB
 * adalah anggaran yang benar-benar terbatas (lihat `lib/company-clients.ts`).
 */
const PLATFORM_CONNECTION_LIMIT = Number(process.env.PLATFORM_DB_CONNECTION_LIMIT) || 1;

function createPlatformClient(): PrismaClient {
  const databaseUrl = process.env.PLATFORM_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "PLATFORM_DATABASE_URL is not set. Data langganan & penagihan (issue #137) " +
        "hidup di basis data platform yang terpisah dari basis data kendali dan " +
        "buku besar. Tambahkan ke .env — lihat .env.docker.example. Galat ini " +
        "hanya boleh muncul dari kode penagihan; login dan buku besar tidak " +
        "pernah menyentuh basis data platform."
    );
  }

  const url = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: PLATFORM_CONNECTION_LIMIT,
  });

  return new PrismaClient({ adapter });
}

/**
 * Klien dibuat SAAT DIPAKAI, bukan saat modul dimuat — alasan yang sama dengan
 * `control-db.ts` (build tidak boleh menuntut env basis data), ditambah satu
 * yang khusus platform: aplikasi HARUS tetap bisa boot, melayani login, dan
 * membuka buku besar ketika `sai_platform` mati atau belum disediakan.
 * Ketiadaan/matinya basis data platform baru berbunyi pada query platform
 * pertama yang sungguhan — di dalam kode penagihan, tempat galatnya memang
 * berguna dan bisa ditangani.
 */
function resolvePlatformClient(): PrismaClient {
  if (!globalForPlatform.platformPrisma) {
    globalForPlatform.platformPrisma = createPlatformClient();
  }
  return globalForPlatform.platformPrisma;
}

export const platformDb: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolvePlatformClient();
    const value = Reflect.get(client as object, property);
    // Method klien (`$transaction`, `$queryRaw`, …) harus tetap terikat pada
    // kliennya; delegate model dikembalikan apa adanya.
    return typeof value === "function" ? value.bind(client) : value;
  },
});
