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
 * Rancangan pertama menanam konteks di penjaga (`AsyncLocalStorage.enterWith`)
 * lalu membacanya secara SINKRON di sini. Itu tidak bekerja, dan tesnya yang
 * membuktikan: `enterWith` yang dipanggil di dalam fungsi async tidak merambat
 * ke KELANJUTAN pemanggilnya — kode halaman sesudah
 * `await requirePagePermission()` berjalan di konteks async yang sudah dibuat
 * sebelum penjaga menanam apa pun. Kalau kekeliruan itu dibiarkan, gejalanya
 * bukan galat melainkan halaman yang membaca basis data yang salah. Karena itu
 * penyelesaiannya dipindah ke saat pemanggilan, di mana ia boleh async.
 *
 * Urutan sumbernya:
 *   1. Konteks `AsyncLocalStorage` — dipakai skrip, cron, seed, dan tes yang
 *      membungkus pekerjaannya dengan `runWithCompany()`.
 *   2. SESI permintaan — perusahaan aktif milik pengguna yang sedang masuk.
 *      Inilah jalur normal setiap halaman dan setiap route.
 *   3. Tidak keduanya → MELEMPAR.
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
import { MissingCompanyContextError, getCompanyContext } from "@/lib/company-context";

/**
 * Perusahaan menurut SESI permintaan yang sedang berjalan.
 *
 * `auth` diimpor secara dinamis, bukan di puncak berkas: modul ini dipakai
 * hampir setiap berkas lib, dan menarik NextAuth ke dalam graf impor mereka
 * membuat skrip biasa (seed, migrasi, tes) ikut memuat seluruh mesin
 * autentikasi yang tidak pernah mereka butuhkan.
 */
async function companyFromSession() {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  const companyId = session?.user?.companyId ?? null;
  if (companyId == null) return null;

  const { getCompany } = await import("@/lib/company-registry");
  const company = await getCompany(companyId);
  if (!company || !company.isActive) return null;

  return company;
}

/** Klien milik perusahaan yang sedang dibuka — atau melempar. */
export async function currentCompanyClient(): Promise<PrismaClient> {
  const context = getCompanyContext();
  if (context) return getCompanyClient(context.databaseName);

  const fromSession = await companyFromSession();
  if (fromSession) return getCompanyClient(fromSession.databaseName);

  throw new MissingCompanyContextError();
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
