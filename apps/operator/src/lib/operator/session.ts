/**
 * Sesi OPERATOR (issue #154) — token bertanda-tangan sendiri, SENGAJA bukan
 * NextAuth: bidang operator punya penyimpanan kredensial sendiri (env, bukan
 * tabel `users` pelanggan), dan sesinya tidak boleh berbagi rahasia, nama
 * cookie, maupun format dengan sesi pelanggan — token pelanggan yang dicuri
 * tidak boleh punya arti apa pun di bidang ini, dan sebaliknya.
 *
 * Bentuk token: `base64url(payload-JSON) + "." + base64url(HMAC-SHA256)`,
 * kunci dari `OPERATOR_SESSION_SECRET`. Stateless dengan kedaluwarsa pendek.
 *
 * Pencabutan (sejak migration kendali 0004): token akun BASIS DATA membawa
 * `ver` = `operator_accounts.session_version` saat terbit; penjaga menolak
 * token yang versinya tidak lagi sama, jadi "cabut sesi" = naikkan satu
 * angka. Akun ENV (darurat) tetap dicabut dengan mengganti rahasia — atau
 * dengan MENGHAPUS entrinya dari `OPERATOR_USERS`, yang kini juga menolak
 * tokennya (penjaga memeriksa akunnya masih ada).
 *
 * GAGAL-TERTUTUP: rahasia tidak diset / terlalu pendek → tidak ada token yang
 * bisa dibuat MAUPUN diverifikasi; konsol menolak semua orang, bukan
 * menerima siapa pun.
 *
 * Tanpa `server-only` supaya bisa diuji unit (pola `mailer-core.ts`); yang
 * mengimpornya hanya kode server (guard, server action) — TIDAK PERNAH proxy
 * (proxy hanya melihat ADA/TIDAKNYA cookie untuk pengalaman redirect;
 * keputusan keamanannya di penjaga halaman).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Umur sesi operator: 8 jam — satu hari kerja, bukan "ingat saya". */
export const OPERATOR_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Rahasia HMAC di bawah 32 karakter = rahasia yang bisa ditebak mesin. */
const MIN_SECRET_LENGTH = 32;

export interface OperatorSessionPayload {
  /** Nama akun operator (dari `OPERATOR_USERS`) — aktor untuk jejak audit. */
  sub: string;
  /** Terbit (ms epoch). */
  iat: number;
  /** Kedaluwarsa (ms epoch). */
  exp: number;
  /** Penanda MFA sudah lewat. Selalu true — login tanpa TOTP tidak ada. */
  mfa: true;
  /**
   * Asal akun. TIDAK ADA = token terbit sebelum migration kendali 0004, yang
   * hanya mengenal akun env — dibaca sebagai `env`, supaya sesi yang sedang
   * berjalan tidak putus saat rilis.
   */
  src?: "env" | "db";
  /** Versi sesi akun basis data saat token terbit (wajib bila `src: "db"`). */
  ver?: number;
}

function resolveSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.OPERATOR_SESSION_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  return secret;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Buat token sesi. null = rahasia tidak layak (gagal-tertutup, tanpa sesi). */
export function issueOperatorToken(
  operatorName: string,
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env,
  account: { source: "env" | "db"; sessionVersion: number | null } = {
    source: "env",
    sessionVersion: null,
  }
): string | null {
  const secret = resolveSecret(env);
  if (!secret) return null;
  /* Token db tanpa versi tidak bisa dicabut — tidak diterbitkan sama sekali. */
  if (account.source === "db" && !Number.isInteger(account.sessionVersion)) return null;

  const payload: OperatorSessionPayload = {
    sub: operatorName,
    iat: now.getTime(),
    exp: now.getTime() + OPERATOR_SESSION_TTL_MS,
    mfa: true,
    src: account.source,
    ...(account.source === "db" ? { ver: account.sessionVersion as number } : {}),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verifikasi token sesi. null untuk SEMUA kegagalan — rusak, dipalsukan,
 * kedaluwarsa, tanpa penanda MFA, atau rahasia tidak terpasang. Pemanggil
 * tidak perlu (dan tidak boleh) membedakan alasannya.
 */
export function verifyOperatorToken(
  token: string | null | undefined,
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env
): OperatorSessionPayload | null {
  if (!token) return null;
  const secret = resolveSecret(env);
  if (!secret) return null;

  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(body, secret);

  const provided = Buffer.from(providedSig);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Partial<OperatorSessionPayload>;
  if (
    typeof candidate.sub !== "string" ||
    candidate.sub.length === 0 ||
    typeof candidate.iat !== "number" ||
    typeof candidate.exp !== "number" ||
    candidate.mfa !== true ||
    (candidate.src !== undefined && candidate.src !== "env" && candidate.src !== "db") ||
    (candidate.src === "db" && !Number.isInteger(candidate.ver))
  ) {
    return null;
  }
  if (candidate.exp <= now.getTime()) return null;

  return candidate as OperatorSessionPayload;
}

/* ══ SESI PEMASANGAN (pemasangan authenticator wajib saat masuk) ═══════════
 *
 * Terbit ketika MFA hidup, kata sandinya benar, dan akunnya BELUM
 * terkonfirmasi untuk rahasia yang berlaku. Ia bukan sesi konsol dan tidak
 * bisa menjadi sesi konsol:
 *
 *   • cookie-nya lain (`enrolment-gate.ts`), dan penjaga halaman, action, serta
 *     route hanya membaca cookie sesi biasa;
 *   • tanda tangannya dipisah domain (`enrol.` di depan badan yang
 *     ditandatangani), jadi token ini tidak lolos `verifyOperatorToken`
 *     sekalipun disalin ke cookie sesi, dan sebaliknya;
 *   • badannya memuat `pur: "enrol"` dan tidak memuat `mfa: true`.
 *
 * Umurnya 10 menit: cukup untuk membuka aplikasi, memindai, dan mengetik satu
 * kode. Sidik rahasia (`fp`) mengikatnya pada rahasia yang dipajang saat
 * terbit; rahasia yang berganti di tengah jalan membatalkannya.
 */

export const OPERATOR_ENROLMENT_TTL_MS = 10 * 60 * 1000;

export interface OperatorEnrolmentPayload {
  pur: "enrol";
  sub: string;
  src: "env" | "db";
  /** Hanya akun db. */
  id?: number;
  /** Hanya akun db: versi sesi saat terbit. */
  ver?: number;
  /** Sidik rahasia TOTP yang dipajang (`secretFingerprint`). */
  fp: string;
  iat: number;
  exp: number;
}

function signEnrolment(body: string, secret: string): string {
  return sign(`enrol.${body}`, secret);
}

export function issueEnrolmentToken(
  account: { name: string; source: "env" | "db"; id: number | null; sessionVersion: number | null },
  fingerprint: string,
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env
): string | null {
  const secret = resolveSecret(env);
  if (!secret || !fingerprint) return null;
  if (
    account.source === "db" &&
    (!Number.isInteger(account.id) || !Number.isInteger(account.sessionVersion))
  ) {
    return null;
  }
  const payload: OperatorEnrolmentPayload = {
    pur: "enrol",
    sub: account.name,
    src: account.source,
    ...(account.source === "db" ? { id: account.id as number, ver: account.sessionVersion as number } : {}),
    fp: fingerprint,
    iat: now.getTime(),
    exp: now.getTime() + OPERATOR_ENROLMENT_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signEnrolment(body, secret)}`;
}

/** Verifikasi token pemasangan. null untuk SEMUA kegagalan, termasuk kedaluwarsa. */
export function verifyEnrolmentToken(
  token: string | null | undefined,
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env
): OperatorEnrolmentPayload | null {
  if (!token) return null;
  const secret = resolveSecret(env);
  if (!secret) return null;

  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signEnrolment(body, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const c = payload as Partial<OperatorEnrolmentPayload> & { mfa?: unknown };
  if (
    c.pur !== "enrol" ||
    c.mfa !== undefined ||
    typeof c.sub !== "string" ||
    c.sub.length === 0 ||
    (c.src !== "env" && c.src !== "db") ||
    (c.src === "db" && (!Number.isInteger(c.id) || !Number.isInteger(c.ver))) ||
    typeof c.fp !== "string" ||
    c.fp.length === 0 ||
    typeof c.iat !== "number" ||
    typeof c.exp !== "number"
  ) {
    return null;
  }
  if (c.exp <= now.getTime()) return null;
  if (c.exp - c.iat > OPERATOR_ENROLMENT_TTL_MS) return null;
  return c as OperatorEnrolmentPayload;
}
