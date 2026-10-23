/**
 * Menulis & menghapus cookie konsol dari server action: sesi konsol dan sesi
 * pemasangan. Satu tempat, supaya login dan pemasangan tidak pelan-pelan
 * berbeda atribut cookie (`httpOnly`, `sameSite: strict`, `__Host-` + Secure
 * dengan HTTPS).
 */
import "server-only";

import { cookies, headers } from "next/headers";

import { operatorCookieName } from "@sai/core/operator-plane";
import { enrolmentCookieName } from "./enrolment-gate";
import { OPERATOR_ENROLMENT_TTL_MS, OPERATOR_SESSION_TTL_MS } from "./session";

async function isSecure(): Promise<boolean> {
  return (await headers()).get("x-forwarded-proto") === "https";
}

export async function setOperatorSessionCookie(token: string): Promise<void> {
  const secure = await isSecure();
  (await cookies()).set(operatorCookieName(secure), token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(OPERATOR_SESSION_TTL_MS / 1000),
  });
}

export async function setEnrolmentCookie(token: string): Promise<void> {
  const secure = await isSecure();
  (await cookies()).set(enrolmentCookieName(secure), token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(OPERATOR_ENROLMENT_TTL_MS / 1000),
  });
}

/** Token pemasangan dari cookie (kedua nama). */
export async function readEnrolmentCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(enrolmentCookieName(true))?.value ?? store.get(enrolmentCookieName(false))?.value ?? null;
}

/** Hapus KEDUA varian — `__Host-` menuntut Secure + Path=/ agar penghapusannya diterima. */
export async function clearEnrolmentCookies(): Promise<void> {
  const store = await cookies();
  store.set(enrolmentCookieName(true), "", { httpOnly: true, secure: true, path: "/", maxAge: 0 });
  store.set(enrolmentCookieName(false), "", { httpOnly: true, path: "/", maxAge: 0 });
}
