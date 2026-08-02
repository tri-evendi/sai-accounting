/**
 * Penjaga HALAMAN bidang operator (issue #154) — pasangan
 * `requireTenantPagePermission` untuk bidang autentikasi yang TERPISAH.
 *
 * Setiap halaman di grup `(operator)` WAJIB memanggil `requireOperatorPage()`
 * (kecuali /operator/login) — ditegakkan `tests/authz-coverage.test.ts`, pola
 * yang sama dengan grup `(dashboard)`/`(tenant)`.
 *
 * Empat pemeriksaan, SEMUANYA gagal-tertutup, dan tidak satu pun bergantung
 * pada proxy: proxy adalah tembok terluar (404 lintas-bidang + redirect
 * login), penjaga ini tembok yang menanggung keputusan keamanannya sendiri —
 * konfigurasi matcher yang bergeser tidak boleh membuka konsol.
 *
 *   1. `OPERATOR_HOST` terkonfigurasi DAN host permintaan cocok — kalau tidak,
 *      404 (halaman ini "tidak ada" di host pelanggan).
 *   2. IP klien lolos `OPERATOR_IP_ALLOWLIST` (kosong = tolak semua).
 *   3. Cookie sesi operator ada dan tanda tangannya sah (`session.ts`) —
 *      cookie sesi PELANGGAN tidak pernah lolos: beda nama, beda rahasia,
 *      beda format.
 *   4. Sesi memuat penanda MFA (selalu — token tanpa `mfa: true` ditolak).
 *
 * DILARANG mengimpor `lib/platform-db.ts` dari sini (doktrin #137): penjaga
 * berjalan pada setiap permintaan halaman operator; penagihan yang mati tidak
 * boleh mematikan gerbangnya. Data platform dibaca halaman lewat
 * `lib/operator/store.ts`.
 */

import "server-only";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  clientIpFrom,
  configuredOperatorHost,
  ipAllowed,
  normalizeHost,
  operatorCookieName,
} from "./plane";
import { verifyOperatorToken, type OperatorSessionPayload } from "./session";

export interface OperatorPageSession {
  operator: { name: string };
  session: OperatorSessionPayload;
}

/** Baca token sesi operator dari cookie (kedua nama — lihat `plane.ts`). */
async function readOperatorCookie(): Promise<string | null> {
  const store = await cookies();
  return (
    store.get(operatorCookieName(true))?.value ??
    store.get(operatorCookieName(false))?.value ??
    null
  );
}

/**
 * Pemeriksaan host + IP — dipakai penjaga halaman DAN server action login
 * (action juga permukaan bidang operator; ia tidak boleh terpanggil dari host
 * pelanggan). `null` = lolos; selain itu alasan penolakan.
 */
export async function operatorPlaneViolation(): Promise<"host" | "ip" | null> {
  const headerStore = await headers();

  const operatorHost = configuredOperatorHost();
  if (!operatorHost) return "host";
  if (normalizeHost(headerStore.get("host")) !== operatorHost) return "host";

  if (!ipAllowed(clientIpFrom(headerStore), process.env.OPERATOR_IP_ALLOWLIST)) return "ip";

  return null;
}

/**
 * Penjaga halaman operator. Pelanggaran bidang (host/IP) → 404 tanpa
 * penjelasan; tanpa sesi sah → /operator/login.
 */
export async function requireOperatorPage(): Promise<OperatorPageSession> {
  if ((await operatorPlaneViolation()) !== null) notFound();

  const session = verifyOperatorToken(await readOperatorCookie());
  if (!session) redirect("/operator/login");

  return { operator: { name: session.sub }, session };
}

/**
 * Sesi operator BILA ADA — untuk chrome (nama di header, tombol keluar) yang
 * tidak boleh mengalihkan; keputusan akses tetap milik `requireOperatorPage`
 * di halamannya.
 */
export async function optionalOperatorSession(): Promise<OperatorPageSession | null> {
  if ((await operatorPlaneViolation()) !== null) return null;
  const session = verifyOperatorToken(await readOperatorCookie());
  return session ? { operator: { name: session.sub }, session } : null;
}
