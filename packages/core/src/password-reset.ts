/**
 * Atur-ulang kata sandi mandiri (issue #136) — token berbatas waktu, sekali
 * pakai, disimpan TER-HASH.
 *
 * ══ BENTUK TOKENNYA ═════════════════════════════════════════════════════════
 * 32 byte acak (crypto) → hex 64 karakter, dikirim UTUH lewat surel dan TIDAK
 * PERNAH disimpan: yang duduk di `password_reset_tokens` hanyalah SHA-256-nya.
 * Bocornya isi tabel karena itu tidak cukup untuk mengatur ulang satu akun pun
 * — pola yang sama dengan kata sandi ber-bcrypt, dengan hash cepat karena
 * inputnya sudah 256 bit acak (bcrypt di sini hanya memperlambat tanpa
 * menambah apa pun).
 *
 * ══ SIFAT YANG DIJAGA (dan diuji di tests/password-reset.test.ts) ═══════════
 *   • kedaluwarsa: `expires_at` lewat = tidak berlaku (60 menit);
 *   • sekali pakai: `used_at` terisi saat dipakai, DI DALAM transaksi yang
 *     sama dengan penggantian kata sandinya;
 *   • meminta token baru MEMATIKAN token lama yang belum dipakai — hanya
 *     tautan termuda yang hidup, surel lama yang tercecer tidak membuka pintu;
 *   • sukses menaikkan `session_version` → seluruh sesi berjalan akun itu
 *     dicabut (fase 3): siapa pun yang memegang sesi curian kehilangan
 *     pegangannya begitu pemilik akun mengganti kunci.
 *
 * Logika keputusan MURNI dipisah (`verdictForToken`) supaya kedaluwarsa &
 * sekali-pakai teruji tanpa basis data; penulisan lewat `controlDb`.
 */

import { createHash, randomBytes } from "node:crypto";

/** Umur token: 60 menit — cukup untuk membuka surel, terlalu pendek untuk
 *  surel yang tercecer berbulan-bulan di kotak masuk. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** SHA-256 hex — bentuk yang disimpan; token mentah tidak pernah menyentuh DB. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token mentah baru (untuk surel) + jadwal kedaluwarsanya. */
export function mintResetToken(now: Date = new Date()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
  };
}

export type ResetTokenVerdict = "valid" | "not_found" | "used" | "expired";

/** Keputusan MURNI atas satu baris token (atau ketiadaannya). */
export function verdictForToken(
  row: { expiresAt: Date; usedAt: Date | null } | null,
  now: Date = new Date()
): ResetTokenVerdict {
  if (!row) return "not_found";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}
