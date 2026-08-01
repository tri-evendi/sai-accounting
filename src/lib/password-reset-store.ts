/**
 * Sambungan basis data alur atur-ulang kata sandi (issue #136).
 * Logika keputusannya murni di `password-reset.ts`; berkas ini hanya
 * menuliskan keputusan itu ke basis data kendali.
 */

import "server-only";

import { controlDb } from "@/lib/control-db";
import {
  hashResetToken,
  mintResetToken,
  verdictForToken,
  type ResetTokenVerdict,
} from "@/lib/password-reset";

/**
 * Terbitkan token untuk sebuah email — atau `null` bila emailnya tidak
 * terdaftar. PEMANGGIL yang menjaga keseragaman jawaban ke luar (jawaban HTTP
 * sama persis ada/tiadanya akun); di lapisan ini kejujuran justru perlu.
 */
export async function issueResetTokenForEmail(
  email: string
): Promise<{ token: string; userId: number; name: string | null } | null> {
  const user = await controlDb.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, username: true },
  });
  if (!user) return null;

  const minted = mintResetToken();

  await controlDb.$transaction(async (tx) => {
    /*
     * Token lama yang belum terpakai DIMATIKAN, bukan dibiarkan berdampingan:
     * hanya tautan termuda yang hidup. Ditandai `usedAt` alih-alih dihapus —
     * baris yang tersisa adalah jejak bahwa permintaan pernah terjadi, dan
     * pembersihan berkala boleh membuangnya kapan saja tanpa kehilangan apa pun.
     */
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt },
    });
  });

  return { token: minted.token, userId: user.id, name: user.name ?? user.username };
}

/**
 * Pakai sebuah token: bila sah, ganti kata sandi + tandai terpakai + cabut
 * seluruh sesi berjalan — SATU transaksi, supaya dua permintaan serentak
 * dengan token yang sama tidak pernah dua-duanya berhasil.
 */
export async function consumeResetToken(
  token: string,
  newPasswordHash: string
): Promise<ResetTokenVerdict> {
  const tokenHash = hashResetToken(token);

  return controlDb.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    const verdict = verdictForToken(row);
    if (verdict !== "valid" || !row) return verdict;

    await tx.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    await tx.user.update({
      where: { id: row.userId },
      data: {
        password: newPasswordHash,
        /*
         * Kata sandi ini DIPILIH pemiliknya sendiri — berbeda dari reset oleh
         * admin (yang mengetikkan sandi sementara), tidak ada alasan
         * memaksanya mengganti lagi di login berikutnya.
         */
        mustChangePassword: false,
        passDate: new Date(),
        /* Cabut semua sesi berjalan (audit RBAC fase 3). */
        sessionVersion: { increment: 1 },
      },
    });

    return verdict;
  });
}
