/**
 * `prisma` — klien basis data PERUSAHAAN YANG SEDANG DIBUKA (issue #104).
 *
 * Bentuk impornya sengaja tidak berubah sedikit pun:
 *
 *     import { prisma } from "@/lib/prisma";
 *
 * 120 berkas menulis baris itu. Mengganti semuanya menjadi "oper klien sebagai
 * parameter" bukan pekerjaan yang sepadan, dan setiap berkas yang terlewat akan
 * menjadi jalur yang diam-diam menulis ke basis data yang salah. Jadi yang
 * berubah bukan pemanggilnya, melainkan apa yang mereka pegang: `prisma` kini
 * sebuah **Proxy** yang mencari kliennya SAAT QUERY DIPANGGIL.
 *
 * ══ KENAPA SAAT DIPANGGIL, BUKAN SAAT AKSES PROPERTI ═══════════════════════
 * Penyelesaiannya butuh SESI sebagai sumber kedua (lihat `current-company.ts`),
 * dan membaca sesi itu async. Akses properti tidak bisa menunggu; pemanggilan
 * bisa. Sumber kedua itu bukan kemewahan: route self-scoped seperti
 * `/api/user/permissions` dan `/api/user/companies` sengaja tidak melewati
 * penjaga — merekalah yang menyusun menu dan pemilih perusahaan — jadi tanpa
 * sesi sebagai sumber, keduanya gagal persis saat paling dibutuhkan.
 *
 * ══ SATU BENTUK YANG TIDAK DIDUKUNG ════════════════════════════════════════
 * `$transaction` bentuk ARRAY (`prisma.$transaction([a, b])`) tidak bisa lewat
 * proxy ini: bentuk itu menuntut `PrismaPromise` yang belum dijalankan,
 * sedangkan setiap panggilan di sini sudah menjadi Promise biasa begitu
 * dipanggil. Bentuk CALLBACK (`prisma.$transaction(async (tx) => …)`) bekerja
 * penuh, dan seluruh 40 transaksi di kode ini memang memakainya. Kalau nanti
 * ada yang butuh bentuk array, ambil kliennya dulu dengan
 * `await currentCompanyClient()` lalu panggil di klien itu.
 *
 * ══ TIDAK ADA BASIS DATA BAWAAN. TITIK. ════════════════════════════════════
 * Tidak ada `?? defaultCompany`, tidak ada "kalau cuma satu perusahaan pakai
 * yang itu", dan `DATABASE_URL` lama tidak pernah menjadi jawaban. Alasannya
 * layak diulang: jatuh ke basis data bawaan berarti transaksi PT A tertulis ke
 * buku PT B tanpa galat dan tanpa jejak, lalu ketahuan berbulan-bulan kemudian
 * sebagai neraca yang tidak cocok. Halaman yang gagal terbuka hari ini jauh
 * lebih murah daripada itu.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { getCompanyClient } from "@/lib/company-clients";
import { currentCompany } from "@/lib/current-company";

/** Klien milik perusahaan yang sedang dibuka — atau melempar. */
export async function currentCompanyClient(): Promise<PrismaClient> {
  const { databaseName } = await currentCompany();
  return getCompanyClient(databaseName);
}

/** Properti klien yang BUKAN model — dipanggil langsung pada objek `prisma`. */
const CLIENT_METHODS = new Set([
  "$transaction",
  "$queryRaw",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
  "$connect",
  "$disconnect",
  "$extends",
  "$on",
]);

/** Delegate model (`prisma.invoice`) — tiap methodnya menyelesaikan kliennya. */
function modelProxy(model: string) {
  return new Proxy(
    {},
    {
      get(_t, method) {
        if (typeof method !== "string") return undefined;
        return async (...args: unknown[]) => {
          const client = await currentCompanyClient();
          const delegate = (client as unknown as Record<string, Record<string, unknown>>)[model];
          const fn = delegate?.[method];
          if (typeof fn !== "function") {
            throw new TypeError(`prisma.${model}.${String(method)} bukan sebuah fungsi`);
          }
          return (fn as (...a: unknown[]) => unknown).apply(delegate, args);
        };
      },
    }
  );
}

const modelCache = new Map<string, unknown>();

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    if (typeof property !== "string") return undefined;

    if (CLIENT_METHODS.has(property)) {
      return async (...args: unknown[]) => {
        const client = await currentCompanyClient();
        const fn = (client as unknown as Record<string, unknown>)[property];
        return (fn as (...a: unknown[]) => unknown).apply(client, args);
      };
    }

    /*
     * Properti internal & `then` sengaja dijawab `undefined`.
     *
     * Kalau `then` dianggap ada, objek ini terlihat seperti Promise: satu
     * `await prisma` yang tidak sengaja akan menggantung selamanya, dan bug
     * seperti itu tidak menghasilkan pesan apa pun untuk dilacak.
     */
    if (property.startsWith("_") || property === "then" || property === "toJSON") {
      return undefined;
    }

    let cached = modelCache.get(property);
    if (!cached) {
      cached = modelProxy(property);
      modelCache.set(property, cached);
    }
    return cached;
  },
});
