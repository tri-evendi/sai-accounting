/**
 * Sambungan basis data pendaftaran mandiri (issue #138). Logika keputusannya
 * murni di `registration.ts`; berkas ini menuliskan keputusan itu ke basis
 * data KENDALI — dan hanya kendali: tidak ada satu pun basis data perusahaan
 * yang disentuh sebelum verifikasi selesai DAN pengguna sendiri menekan
 * "buat perusahaan" (gerbang §9).
 */

import "server-only";

import { controlDb } from "@/lib/control-db";
import { TENANT_ROLES } from "@/lib/constants";
import {
  STATUS_AFTER_VERIFICATION,
  hashVerificationToken,
  mintVerificationToken,
  tenantSlugCandidates,
  trialEndsAtFrom,
  usernameFromEmail,
  verdictForVerification,
} from "@/lib/registration";

/**
 * Catat pendaftaran baru dan terbitkan token verifikasinya.
 *
 * Pendaftaran lama yang belum terpakai untuk email yang sama DIMATIKAN — hanya
 * tautan termuda yang hidup, surel lama yang tercecer tidak membuka apa pun.
 * Pemanggil yang menjaga keseragaman jawaban ke luar; di sini kejujuran perlu.
 */
export async function createRegistration(input: {
  email: string;
  name: string;
  passwordHash: string;
  termsAcceptedAt: Date;
}): Promise<{ token: string }> {
  const email = input.email.trim().toLowerCase();
  const minted = mintVerificationToken();

  await controlDb.$transaction(async (tx) => {
    await tx.registration.updateMany({
      where: { email, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.registration.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash: input.passwordHash,
        tokenHash: minted.tokenHash,
        expiresAt: minted.expiresAt,
        termsAcceptedAt: input.termsAcceptedAt,
      },
    });
  });

  return { token: minted.token };
}

/** Adakah AKUN sungguhan dengan email ini? (Untuk memilih isi surel — bukan
 *  isi respons HTTP, yang selalu seragam.) */
export async function emailHasAccount(email: string): Promise<boolean> {
  const user = await controlDb.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  return user !== null;
}

export type VerificationResult =
  | { ok: true; email: string; tenantSlug: string }
  | { ok: false; reason: "invalid_token" | "already_registered" };

/**
 * Pakai token verifikasi: lahirkan Tenant + User(owner) +
 * TenantMembership(owner) dalam SATU transaksi (§4A — kegagalan di tengah
 * tidak pernah menyisakan akun tanpa tenant atau tenant setengah jadi), tandai
 * pendaftarannya terpakai, dan JANGAN sentuh basis data perusahaan mana pun.
 *
 * Kegagalan token (tak dikenal / kedaluwarsa / sudah dipakai) dijawab SATU
 * sebab `invalid_token` — membedakannya memberi penyisir konfirmasi gratis.
 * `already_registered` sengaja DIBEDAKAN: yang membacanya adalah pemilik email
 * itu sendiri (ia memegang tautannya), dan jalan keluarnya berbeda — masuk
 * atau atur ulang kata sandi, bukan mendaftar ulang.
 */
export async function consumeVerificationToken(token: string): Promise<VerificationResult> {
  const tokenHash = hashVerificationToken(token);

  return controlDb.$transaction(async (tx) => {
    const row = await tx.registration.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (verdictForVerification(row) !== "valid" || !row) {
      return { ok: false as const, reason: "invalid_token" as const };
    }

    // Email keburu dipakai akun lain (mendaftar dua kali, atau diundang di
    // sela waktu). Tokennya ikut dimatikan — tautan yang sama tidak perlu
    // mengulang jawaban ini selamanya.
    const taken = await tx.user.findUnique({ where: { email: row.email }, select: { id: true } });
    if (taken) {
      await tx.registration.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      return { ok: false as const, reason: "already_registered" as const };
    }

    // Slug anti-tabrakan: kandidat deterministik dulu, akhiran acak terakhir.
    const existing = await tx.tenant.findMany({
      where: { slug: { in: tenantSlugCandidates(row.name) } },
      select: { slug: true },
    });
    const takenSlugs = new Set(existing.map((t) => t.slug));
    const slug = tenantSlugCandidates(row.name).find((c) => !takenSlugs.has(c))!;

    const now = new Date();
    const tenant = await tx.tenant.create({
      data: {
        slug,
        name: row.name,
        status: STATUS_AFTER_VERIFICATION,
        planKey: "trial",
        trialEndsAt: trialEndsAtFrom(now),
        // Kuota memakai bawaan kolom (#134): max_companies 1, max_users 3 —
        // snapshot paket trial; naik kelas = pekerjaan #140.
      },
    });
    const user = await tx.user.create({
      data: {
        username: usernameFromEmail(row.email),
        email: row.email,
        emailVerifiedAt: now,
        password: row.passwordHash,
        name: row.name,
        tenantId: tenant.id,
        // Kata sandi DIPILIH pemiliknya saat mendaftar — tidak ada alasan
        // memaksanya mengganti di login pertama.
        mustChangePassword: false,
      },
    });
    await tx.tenantMembership.create({
      data: { tenantId: tenant.id, userId: user.id, role: TENANT_ROLES.OWNER },
    });
    await tx.registration.update({ where: { id: row.id }, data: { usedAt: now } });

    return { ok: true as const, email: row.email, tenantSlug: slug };
  });
}
