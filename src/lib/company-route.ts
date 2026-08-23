/**
 * Dari URL ke KONTEKS PERUSAHAAN (issue #157) — pengganti perusahaan-dari-sesi
 * di jalur halaman, dan sejak #158 juga di jalur API (lewat
 * `lib/company-request.ts`).
 *
 * ══ MASALAH YANG DISELESAIKAN ══════════════════════════════════════════════
 * Sampai issue ini, perusahaan yang sedang dibuka hidup di SESI (cookie JWT),
 * bukan di URL. Dua akibatnya nyata, dan keduanya kelas kesalahan yang sama —
 * "yang dilihat bukan yang ditulis":
 *
 *   1. Cookie itu satu untuk SELURUH TAB. Berganti perusahaan di tab A juga
 *      mengganti tab B: layarnya masih memperlihatkan buku PT lama, sementara
 *      tindakan berikutnya menulis ke PT baru. Tidak ada galat, tidak ada
 *      jejak — persis kegagalan yang dilarang docs/MULTI-COMPANY.md, hanya
 *      saja ia masuk lewat antarmuka, bukan lewat lapisan basis data.
 *   2. Tautan dalam tidak bisa dibagikan. `/invoices/12` menunjuk faktur yang
 *      BERBEDA bagi setiap penerimanya, tergantung PT aktif masing-masing.
 *
 * Obatnya bukan menambah pemeriksaan, melainkan MEMINDAHKAN sumber kebenaran:
 * perusahaan datang dari jalur URL, diverifikasi ulang ke basis data kendali
 * pada SETIAP permintaan. Sesi turun pangkat menjadi "yang terakhir dibuka" —
 * dipakai untuk menjawab `/dashboard` telanjang dan `/select-company`, tidak
 * pernah untuk otorisasi.
 *
 * ══ KENAPA 404, BUKAN 403 ══════════════════════════════════════════════════
 * Perusahaan milik tenant lain dijawab 404 yang sama persis dengan slug yang
 * tidak pernah ada. 403 mengakui "ini ada, tapi bukan hakmu" — dan pengakuan
 * itu sendiri sudah kebocoran: seseorang bisa menghitung pelanggan dan menebak
 * nama PT mereka hanya dari selisih 403 dan 404 (kelas kebocoran §4.4
 * docs/MULTI-TENANT.md). Karena itu SEMUA kegagalan di sini — slug tidak ada,
 * perusahaan nonaktif, bukan anggota, tenant lain — memakai satu jawaban.
 *
 * ══ KEANGGOTAAN DIBACA ULANG, SELALU ═══════════════════════════════════════
 * Peran TIDAK diambil dari JWT. JWT menyimpan peran untuk perusahaan yang
 * terakhir dibuka; halaman yang dibuka lewat URL bisa menyangkut perusahaan
 * LAIN, dan memakai peran dari sesi di sana berarti memberi hak PT A di buku
 * PT B. `membershipFor()` dibaca setiap permintaan (satu query ke basis data
 * kendali, indeks unik `(user_id, company_id)`).
 */

import "server-only";

import { enterCompanyContext } from "@/lib/company-context";
import { routeCompany, setRouteCompany } from "@/lib/current-company";
import { controlDb } from "@/lib/control-db";
import { membershipFor } from "@/lib/company-registry";
import { isValidSlug } from "@/lib/tenant-routes";
import { tenantIdUntukSlugLama } from "@/lib/tenant-slug";

export type RouteCompanyResult =
  | {
      ok: true;
      companyId: number;
      tenantSlug: string;
      companySlug: string;
      companyName: string;
      role: string;
      accountantMode: boolean | null;
    }
  /**
   * Slug tenant di jalur ini adalah slug LAMA milik tenant pemanggil sendiri
   * (#458 lingkup 3) — alamatnya pindah, bukan hilang. Pemanggil memantulkan
   * PERMANEN ke `tenantSlug` kanonik di bawah.
   */
  | { ok: false; reason: "moved"; tenantSlug: string; companySlug: string }
  | { ok: false; reason: "no-session" | "not-found" };

export interface TenantRouteParams {
  tenantSlug: string;
  companySlug: string;
}

/**
 * Cache slug → (id tenant, id perusahaan).
 *
 * Berdiri di atas keputusan "slug itu TETAP" (lihat `tenant-routes.ts`): kalau
 * slug boleh berubah, cache ini akan menunjuk perusahaan yang salah sampai TTL
 * habis — dan "perusahaan yang salah" adalah satu-satunya hal yang tidak boleh
 * terjadi di sini. Yang di-cache HANYA pemetaan nama→id; keanggotaan, keaktifan,
 * dan peran tetap dibaca ulang setiap permintaan di bawah.
 *
 * TTL pendek dan sengaja tanpa invalidasi eksplisit: baris yang dipetakan tidak
 * pernah berubah, hanya lahir.
 */
const TTL_MS = 60_000;

const globalForRoute = globalThis as unknown as {
  tenantRouteCache: Map<string, { companyId: number; tenantId: number; at: number }> | undefined;
};

const cache = globalForRoute.tenantRouteCache ?? new Map();
if (process.env.NODE_ENV !== "production") globalForRoute.tenantRouteCache = cache;

async function resolveIds(
  tenantSlug: string,
  companySlug: string
): Promise<{ companyId: number; tenantId: number } | null> {
  const key = `${tenantSlug}/${companySlug}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { companyId: hit.companyId, tenantId: hit.tenantId };
  }

  const row = await controlDb.company.findFirst({
    where: { slug: companySlug, tenant: { slug: tenantSlug } },
    select: { id: true, tenantId: true },
  });
  if (!row || row.tenantId == null) {
    cache.delete(key);
    return null;
  }

  cache.set(key, { companyId: row.id, tenantId: row.tenantId, at: Date.now() });
  return { companyId: row.id, tenantId: row.tenantId };
}

/**
 * Id perusahaan menurut jalur — TANPA memeriksa keanggotaan dan TANPA menanam
 * konteks apa pun.
 *
 * Dipakai HANYA oleh tata letak bertenant, yang butuh angkanya untuk
 * menyamakan cookie sesi (`CompanySessionSync`) dan tidak menyentuh satu pun
 * data perusahaan. Otorisasinya tetap milik `enterCompanyFromRoute` di penjaga
 * halaman di bawahnya — memindahkannya ke sini akan membuat tata letak menjadi
 * pagar kedua yang bisa menyimpang dari yang pertama.
 *
 * Karena tidak ada data yang dibuka, membocorkan "slug ini ada" pun tidak
 * terjadi: yang menerima jawabannya hanya render server, dan halamannya sendiri
 * tetap 404 bila pemanggilnya bukan anggota.
 */
export async function companyIdForRoute(
  tenantSlug: string,
  companySlug: string
): Promise<number | null> {
  if (!isValidSlug(tenantSlug) || !isValidSlug(companySlug)) return null;
  const ids = await resolveIds(tenantSlug, companySlug);
  return ids?.companyId ?? null;
}

/**
 * Kebalikan `resolveIds`: dari id perusahaan ke sepasang slug jalurnya.
 *
 * Dipakai satu pemanggil — `/dashboard` telanjang — dan justru untuk keadaan
 * yang paling mudah terlewat: sesi yang terbit SEBELUM #157 membawa `companyId`
 * tanpa `tenantSlug`, sehingga tidak ada bahan untuk menyusun jalur kanonik.
 * Tanpa jalan keluar ini, halaman itu akan mengarahkan ke dirinya sendiri tanpa
 * henti. Membacanya dari basis data mengubah keadaan "tidak tahu" menjadi
 * "cari tahu", dan itu satu query yang hanya terjadi sekali per sesi lama.
 */
export async function routeForCompany(
  companyId: number
): Promise<{ tenantSlug: string; companySlug: string } | null> {
  const row = await controlDb.company.findUnique({
    where: { id: companyId },
    select: { slug: true, isActive: true, tenant: { select: { slug: true } } },
  });
  if (!row || !row.isActive || !row.tenant) return null;
  return { tenantSlug: row.tenant.slug, companySlug: row.slug };
}

/** Buang satu pemetaan slug (dipakai saat perusahaan baru lahir/berganti nama basis data). */
export function invalidateTenantRoute(tenantSlug: string, companySlug: string): void {
  cache.delete(`${tenantSlug}/${companySlug}`);
}

/**
 * Tanamkan konteks perusahaan dari JALUR URL. Setelah ini berhasil, `prisma` di
 * seluruh permintaan menunjuk basis data perusahaan tersebut — dan `currentCompany()`
 * tidak akan pernah jatuh ke perusahaan yang tersimpan di sesi (lihat
 * `setRouteCompany`).
 */
export async function enterCompanyFromRoute(params: {
  tenantSlug: string;
  companySlug: string;
  userId: number | string | null | undefined;
}): Promise<RouteCompanyResult> {
  const userId =
    typeof params.userId === "number"
      ? params.userId
      : Number.parseInt(String(params.userId ?? ""), 10);
  if (!Number.isInteger(userId)) return { ok: false, reason: "no-session" };

  /*
   * Bentuk slug diperiksa SEBELUM query: jalur seperti `/t/../..` atau slug
   * sepanjang satu kilobyte tidak layak menjadi query, dan menolaknya di sini
   * membuat satu-satunya jalan masuk ke `resolveIds` selalu berbentuk waras.
   */
  if (!isValidSlug(params.tenantSlug) || !isValidSlug(params.companySlug)) {
    return { ok: false, reason: "not-found" };
  }

  const ids = await resolveIds(params.tenantSlug, params.companySlug);

  /*
   * ── Slug tenant yang SUDAH BERGANTI (#458 lingkup 3) ─────────────────────
   *
   * Alamat lama hidup di bookmark, di surel undangan yang sudah terkirim, dan
   * di tautan yang dibagikan ke akuntan eksternal. Sebelum menjawab 404, jalur
   * ini menanyakan riwayat slug.
   *
   * ⚠ Pantulannya hanya diberikan kepada ANGGOTA tenant itu. Tanpa syarat itu,
   * siapa pun bisa menukar-nukar slug untuk memetakan "akun lama X kini
   * bernama Y" — kebocoran yang tidak terlihat sebagai kebocoran, dan yang
   * membatalkan alasan 404 di bawah ditulis seragam sejak awal. Bukan anggota
   * = 404 yang sama persis dengan slug yang tidak pernah ada.
   */
  if (!ids) {
    const tenantIdLama = await tenantIdUntukSlugLama(params.tenantSlug);
    if (tenantIdLama !== null) {
      const [aktor, tenant] = await Promise.all([
        controlDb.user.findUnique({ where: { id: userId }, select: { tenantId: true } }),
        controlDb.tenant.findUnique({ where: { id: tenantIdLama }, select: { slug: true } }),
      ]);
      if (aktor?.tenantId === tenantIdLama && tenant) {
        return {
          ok: false,
          reason: "moved",
          tenantSlug: tenant.slug,
          companySlug: params.companySlug,
        };
      }
    }
    return { ok: false, reason: "not-found" };
  }

  /*
   * Keanggotaan = otorisasi. `membershipFor` sudah menolak keanggotaan nonaktif
   * DAN perusahaan nonaktif, jadi tautan dalam ke PT yang dinonaktifkan dijawab
   * 404 — bukan 500 dari query ke basis data yang tak lagi dibuka.
   */
  const membership = await membershipFor(userId, ids.companyId);
  if (!membership) return { ok: false, reason: "not-found" };

  /*
   * Satu pengguna milik TEPAT SATU tenant (docs/MULTI-TENANT.md §2), jadi
   * cabang ini secara teori tak terjangkau — keanggotaan lintas tenant tidak
   * bisa lahir. Ia tetap ditulis karena "tak terjangkau" adalah klaim tentang
   * kode LAIN: satu keanggotaan yatim yang dibuat skrip perbaikan data sudah
   * cukup untuk membuka buku pelanggan lain. Biayanya satu perbandingan angka;
   * yang dijaga adalah pemisahan pelanggan. (Diuji di tests/tenant-routes.test.ts.)
   */
  const actor = await controlDb.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  if (!actor || actor.tenantId == null || actor.tenantId !== ids.tenantId) {
    return { ok: false, reason: "not-found" };
  }

  const context = {
    companyId: membership.company.companyId,
    slug: membership.company.slug,
    databaseName: membership.company.databaseName,
  };
  enterCompanyContext(context);
  await setRouteCompany(context);

  /*
   * DIBUKTIKAN, bukan diasumsikan — dan sejak #333 dibuktikan pada sabuk yang
   * BENAR.
   *
   * Bentuk lamanya `getCompanyContext() ?? routeCompany()`, dan itulah cacat
   * yang membuat #333 bisa hidup delapan bulan tanpa terlihat: `enterWith` yang
   * baru saja dipanggil SELALU terbaca di frame yang sama, jadi cabang pertama
   * lulus tanpa syarat dan cabang kedua — satu-satunya sabuk yang benar-benar
   * bertahan sampai badan route — tidak pernah diperiksa sama sekali. Sebuah
   * pembuktian yang selalu lulus bukan pembuktian.
   *
   * Yang diperiksa sekarang adalah penyimpan per-permintaan, yaitu persis apa
   * yang akan dibaca `currentCompany()` di query pertama. Diukur di route
   * handler Next yang sungguhan (lihat kepala `current-company.ts`): konteks ALS
   * yang ditanam penjaga terbaca `null` baik di badan route maupun di komponen
   * halaman, sebab penjaga selalu menanamnya SESUDAH sebuah `await`. Karena itu
   * ia tidak lagi boleh menjadi bukti bahwa konteksnya mendarat.
   *
   * Satu pembacaan murah di sini mengubah kegagalan dari sunyi menjadi berisik:
   * halaman gagal terbuka hari ini, alih-alih pembukuan tercampur yang baru
   * ketahuan berbulan-bulan kemudian (doktrin docs/MULTI-COMPANY.md §2).
   */
  const planted = await routeCompany();
  if (planted?.companyId !== context.companyId) {
    throw new Error(
      `Konteks perusahaan dari jalur gagal ditanam (${params.tenantSlug}/${params.companySlug}). ` +
        "Query dibatalkan sebelum satu pun berjalan — lihat lib/company-route.ts."
    );
  }

  return {
    ok: true,
    companyId: membership.company.companyId,
    tenantSlug: params.tenantSlug,
    companySlug: membership.company.slug,
    companyName: membership.company.name,
    role: membership.role,
    accountantMode: membership.accountantMode,
  };
}
