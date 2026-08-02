/**
 * Dari PERMINTAAN ke konteks perusahaan (issue #158) — pengganti terakhir
 * `enterCompanyFromSession`.
 *
 * `company-route.ts` menjawab "sepasang slug ini menunjuk perusahaan mana, dan
 * apakah pemanggilnya anggota di sana". Modul ini menjawab pertanyaan sebelumnya:
 * "sepasang slug itu datang dari mana". Jawabannya SELALU permintaan yang sedang
 * berjalan — header yang disuntikkan `apiFetch()`, atau jalur untuk route
 * `/api/t/…` — dan TIDAK PERNAH sesi.
 *
 * ══ KENAPA TIDAK ADA CADANGAN SESI ═════════════════════════════════════════
 * Inilah hadiah sesungguhnya dari seluruh Fase 2. Selama masih ada cadangan,
 * setiap route baru yang lupa membawa lingkupnya akan tetap BEKERJA — dengan
 * perusahaan yang kebetulan terakhir dibuka di tab mana pun — dan bekerja
 * dengan diam adalah cara kesalahan ini bertahan hidup. Tanpa cadangan,
 * permintaan tanpa lingkup tidak bisa mendarat di perusahaan bawaan karena
 * TIDAK ADA perusahaan bawaan untuk didarati. Doktrin #104 berhenti menjadi
 * kedisiplinan yang harus diingat setiap penulis route dan menjadi sifat
 * strukturnya.
 *
 * Pemakainya dua rombongan:
 *   • penjaga API (`auth-guard.ts`) — hampir semua route;
 *   • route SELF-SCOPED yang sengaja tanpa izin (`/api/user/permissions`,
 *     `/api/user/accountant-mode`, `/api/company/identity`). Mereka tetap butuh
 *     konteks perusahaan untuk membaca datanya, dan sejak modul ini ada mereka
 *     mendapatkannya dari tempat yang sama — bukan dari cookie.
 */

import "server-only";

import { headers } from "next/headers";

import { companyScopeFromHeaders } from "@/lib/company-scope";
import { enterCompanyFromRoute, type RouteCompanyResult } from "@/lib/company-route";
import type { TenantScopedParams } from "@/lib/tenant-routes";

export type RequestCompanyResult = RouteCompanyResult | { ok: false; reason: "no-scope" };

/**
 * Lingkup perusahaan yang DIBAWA permintaan ini, atau `null`.
 *
 * `headers()` MELEMPAR di luar lingkup permintaan (skrip, cron, tes unit yang
 * memanggil penjaga langsung). Itu bukan kegagalan melainkan jawaban: di sana
 * memang tidak ada permintaan yang bisa membawa lingkup, dan pemanggilnya
 * ditolak — bukan diberi perusahaan tebakan. Skrip & cron menyebut
 * perusahaannya sendiri lewat `runWithCompany()`, seperti sejak #104.
 */
export async function companyScopeFromRequest(): Promise<TenantScopedParams | null> {
  try {
    const requestHeaders = await headers();
    return companyScopeFromHeaders((name) => requestHeaders.get(name));
  } catch {
    return null;
  }
}

/**
 * Tanamkan konteks perusahaan dari permintaan yang sedang berjalan.
 *
 * `scope` boleh disebut eksplisit oleh route yang perusahaannya ada di JALUR
 * (`/api/t/{tenant}/{company}/…`, dipakai unduhan `<a href>` yang tidak
 * melewati `apiFetch`). Jalur MENGALAHKAN header: sebuah alamat unduhan tidak
 * boleh bisa dibelokkan oleh header yang kebetulan ikut terbawa peramban.
 */
export async function enterCompanyFromRequest(
  userId: number | string | null | undefined,
  scope?: TenantScopedParams | null
): Promise<RequestCompanyResult> {
  const resolved = scope ?? (await companyScopeFromRequest());
  if (!resolved) return { ok: false, reason: "no-scope" };

  return enterCompanyFromRoute({
    tenantSlug: resolved.tenantSlug,
    companySlug: resolved.companySlug,
    userId,
  });
}
