"use server";

/**
 * Server action bidang OPERATOR (issue #154) — masuk & keluar konsol.
 *
 * SENGAJA server action, bukan route API: route baru di `src/app/api` wajib
 * masuk daftar `tests/authz-coverage.test.ts` sebagai permukaan pelanggan —
 * padahal ini bukan permukaan pelanggan sama sekali. Server action menempel
 * pada halaman /operator/login, yang tembok host + IP-nya sudah berdiri di
 * proxy DAN diperiksa ulang di sini (`operatorPlaneViolation`) — action tidak
 * boleh bisa dipanggil dari host pelanggan sekalipun proxy berubah.
 *
 * Kredensial dari `OPERATOR_USERS` (env), MFA TOTP wajib, jawaban gagal
 * SERAGAM (tidak membedakan "akun tidak ada" dari "kode salah"), dibatasi
 * laju per-IP (penghitung memori cukup: permukaannya sudah di belakang
 * IP-allowlist), dan setiap percobaan — berhasil maupun gagal — tercatat di
 * jejak audit operator.
 */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { writeOperatorAuditLog } from "@/lib/operator/audit";
import { verifyOperatorLogin } from "@/lib/operator/credentials";
import { operatorPlaneViolation } from "@/lib/operator/guard";
import { clientIpFrom, operatorCookieName } from "@/lib/operator/plane";
import {
  OPERATOR_SESSION_TTL_MS,
  issueOperatorToken,
  verifyOperatorToken,
} from "@/lib/operator/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { getT } from "@/lib/i18n/server";

export interface OperatorLoginState {
  error: string | null;
}

export async function operatorLogin(
  _previous: OperatorLoginState,
  formData: FormData
): Promise<OperatorLoginState> {
  const t = await getT();

  /* Tembok bidang: host salah / IP tak terdaftar → jawaban seragam, tanpa
   * membocorkan bahwa konsolnya ada. */
  if ((await operatorPlaneViolation()) !== null) {
    return { error: t("operator.login.failed") };
  }

  const headerStore = await headers();
  const ip = clientIpFrom(headerStore) ?? "unknown";

  const limit = checkRateLimit(`operator-login:${ip}`, {
    windowMs: 15 * 60 * 1000,
    maxAttempts: 10,
  });
  if (!limit.allowed) {
    return { error: t("operator.login.rateLimited") };
  }

  const username = String(formData.get("username") ?? "").trim();
  const account = await verifyOperatorLogin({
    username,
    password: String(formData.get("password") ?? ""),
    totpCode: String(formData.get("totp") ?? ""),
  });

  if (!account) {
    await writeOperatorAuditLog({
      operator: username || "(kosong)",
      action: "operator.login.failed",
      ipAddress: ip,
    });
    return { error: t("operator.login.failed") };
  }

  const token = issueOperatorToken(account.name);
  if (!token) {
    /* OPERATOR_SESSION_SECRET tidak layak → gagal-tertutup: tidak ada sesi
     * untuk siapa pun, dan alasannya hanya di log server. */
    console.error(
      "[operator] OPERATOR_SESSION_SECRET tidak diset / kurang dari 32 karakter — konsol menolak semua login."
    );
    return { error: t("operator.login.failed") };
  }

  const secure = headerStore.get("x-forwarded-proto") === "https";
  const cookieStore = await cookies();
  cookieStore.set(operatorCookieName(secure), token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(OPERATOR_SESSION_TTL_MS / 1000),
  });

  await writeOperatorAuditLog({ operator: account.name, action: "operator.login", ipAddress: ip });

  redirect("/operator");
}

export async function operatorLogout(): Promise<void> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(operatorCookieName(true))?.value ??
    cookieStore.get(operatorCookieName(false))?.value;
  const session = verifyOperatorToken(token);

  /* Hapus KEDUA varian nama — `__Host-` menuntut Secure + Path=/ agar
   * penghapusannya diterima browser. */
  cookieStore.set(operatorCookieName(true), "", { httpOnly: true, secure: true, path: "/", maxAge: 0 });
  cookieStore.set(operatorCookieName(false), "", { httpOnly: true, path: "/", maxAge: 0 });

  if (session) {
    await writeOperatorAuditLog({
      operator: session.sub,
      action: "operator.logout",
      ipAddress: clientIpFrom(await headers()),
    });
  }

  redirect("/operator/login");
}
