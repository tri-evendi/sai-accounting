/**
 * Sesi OPERATOR (issue #154) — token bertanda-tangan sendiri, SENGAJA bukan
 * NextAuth: bidang operator punya penyimpanan kredensial sendiri (env, bukan
 * tabel `users` pelanggan), dan sesinya tidak boleh berbagi rahasia, nama
 * cookie, maupun format dengan sesi pelanggan — token pelanggan yang dicuri
 * tidak boleh punya arti apa pun di bidang ini, dan sebaliknya.
 *
 * Bentuk token: `base64url(payload-JSON) + "." + base64url(HMAC-SHA256)`,
 * kunci dari `OPERATOR_SESSION_SECRET`. Stateless dengan kedaluwarsa pendek;
 * pencabutan = mengganti rahasia (satu-dua akun operator, bukan ribuan
 * pelanggan — daftar sesi tersimpan belum membayar harganya).
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
  env: Record<string, string | undefined> = process.env
): string | null {
  const secret = resolveSecret(env);
  if (!secret) return null;

  const payload: OperatorSessionPayload = {
    sub: operatorName,
    iat: now.getTime(),
    exp: now.getTime() + OPERATOR_SESSION_TTL_MS,
    mfa: true,
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
    candidate.mfa !== true
  ) {
    return null;
  }
  if (candidate.exp <= now.getTime()) return null;

  return candidate as OperatorSessionPayload;
}
