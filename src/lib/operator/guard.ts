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
 *   5. (sejak migration kendali 0004) Identitas yang BERLAKU SEKARANG: akun
 *      env masih ada di `OPERATOR_USERS`; akun basis data masih aktif dan
 *      versi sesinya sama (`identity.ts`). Perannya dibaca dari sumbernya,
 *      bukan dari token.
 *
 * DILARANG mengimpor `lib/platform-db.ts` dari sini (doktrin #137): penjaga
 * berjalan pada setiap permintaan halaman operator; penagihan yang mati tidak
 * boleh mematikan gerbangnya. Data platform dibaca halaman lewat
 * `lib/operator/store.ts`. Basis data KENDALI boleh — dan hanya untuk akun
 * basis data; akun env tidak menyentuhnya sama sekali.
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
import { parseOperatorAccounts } from "./credentials";
import { resolveOperatorIdentity, type OperatorIdentity } from "./identity";
import { lookupDbOperatorState } from "./operator-accounts";
import { operatorCan, type OperatorPermission } from "./roles";
import { controlDb } from "@sai/core/control-db";

export interface OperatorPageSession {
  operator: OperatorIdentity;
  session: OperatorSessionPayload;
}

/** Token di cookie → identitas yang berlaku sekarang, atau null. */
async function currentOperator(): Promise<OperatorPageSession | null> {
  const session = verifyOperatorToken(await readOperatorCookie());
  if (!session) return null;
  const operator = await resolveOperatorIdentity(session, {
    envAccounts: parseOperatorAccounts(process.env.OPERATOR_USERS),
    lookupDb: (name) => lookupDbOperatorState({ control: controlDb }, name),
  });
  return operator ? { operator, session } : null;
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

  const current = await currentOperator();
  if (!current) redirect("/operator/login");

  return current;
}

/**
 * Sesi operator BILA ADA — untuk chrome (nama di header, tombol keluar) yang
 * tidak boleh mengalihkan; keputusan akses tetap milik `requireOperatorPage`
 * di halamannya.
 */
export async function optionalOperatorSession(): Promise<OperatorPageSession | null> {
  if ((await operatorPlaneViolation()) !== null) return null;
  return currentOperator();
}

/**
 * Penjaga SERVER ACTION bidang operator (issue #155) — pemeriksaan yang sama
 * dengan `requireOperatorPage` (host + IP + cookie + MFA + identitas), tetapi
 * jawabannya `null`, bukan redirect/404: action menjawab lewat state form, dan
 * jawaban gagalnya SERAGAM (pola action login #154).
 *
 * `permission` WAJIB (migration kendali 0004): setiap action tulis menyebut
 * izin yang dituntutnya, dan peran yang tidak memegangnya mendapat `null` yang
 * sama dengan sesi yang habis. Ditegakkan sapuan sumber di
 * `tests/operator-roles.test.ts`.
 */
export async function requireOperatorActionSession(
  permission: OperatorPermission
): Promise<OperatorPageSession | null> {
  const current = await optionalOperatorSession();
  if (!current || !operatorCan(current.operator.role, permission)) return null;
  return current;
}

/**
 * Penjaga ROUTE HANDLER bidang operator (unduhan berkas): pemeriksaan yang
 * sama dengan `requireOperatorActionSession(izin)`, dengan jawaban HTTP yang
 * tidak membedakan alasannya — 404 untuk semua kegagalan, pola penjaga
 * halaman untuk pelanggaran bidang. Unduhan tidak punya formulir untuk
 * memajang "ditolak", dan 401/403 yang berbeda akan memberi tahu pemindai
 * bahwa rutenya ada.
 */
export async function requireOperatorRoute(
  permission: OperatorPermission
): Promise<OperatorPageSession | null> {
  return requireOperatorActionSession(permission);
}
