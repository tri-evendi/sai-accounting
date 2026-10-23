/**
 * Gerbang cookie konsol: siapa boleh membuka jalur mana, dilihat dari cookie
 * yang ADA (bukan yang sah). Dipakai `proxy.ts`.
 *
 * Ada dua cookie:
 *   • sesi konsol (`operatorCookieName`) — semua jalur terlindungi;
 *   • sesi PEMASANGAN (`enrolmentCookieName`) — HANYA `ENROLMENT_PATH`.
 *
 * Ini tembok terluar dan pengalaman redirect saja. Keputusan keamanannya tetap
 * di penjaga: `requireOperatorPage` / `requireOperatorActionSession` /
 * `requireOperatorRoute` hanya membaca cookie sesi konsol dan memverifikasi
 * tanda tangannya, jadi cookie pemasangan tidak membuka apa pun di sana
 * sekalipun proxy diubah. Halaman pemasangan memverifikasi tokennya sendiri.
 *
 * MURNI, tanpa `node:crypto`: proxy tidak memverifikasi tanda tangan.
 */

/** Satu-satunya halaman yang bisa dibuka dengan sesi pemasangan. */
export const ENROLMENT_PATH = "/login/authenticator";

/** Nama cookie sesi pemasangan; `__Host-` dengan HTTPS (pola `operatorCookieName`). */
export function enrolmentCookieName(secure: boolean): string {
  return secure ? "__Host-sai_operator_enrol" : "sai_operator_enrol";
}

export type ConsoleGateDecision = { kind: "next" } | { kind: "redirect"; to: string };

/**
 * Putusan untuk jalur konsol TERLINDUNGI (bukan jalur publik `/login` dkk.).
 *
 *   • Halaman pemasangan: butuh cookie pemasangan. Yang sudah bersesi pulang
 *     ke `/`; yang tidak punya keduanya ke `/login`.
 *   • Jalur lain: butuh cookie sesi. Yang hanya membawa cookie pemasangan
 *     dikembalikan ke halaman pemasangan, bukan diloloskan.
 */
export function decideConsoleGate(
  pathname: string,
  cookies: { session: boolean; enrolment: boolean }
): ConsoleGateDecision {
  if (pathname === ENROLMENT_PATH) {
    if (cookies.enrolment) return { kind: "next" };
    return { kind: "redirect", to: cookies.session ? "/" : "/login" };
  }
  if (cookies.session) return { kind: "next" };
  return { kind: "redirect", to: cookies.enrolment ? ENROLMENT_PATH : "/login" };
}
