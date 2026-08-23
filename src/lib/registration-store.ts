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
  slugAcak,
  tenantSlugCandidates,
  SIGNUP_MAX_COMPANIES,
  SIGNUP_MAX_USERS,
  SIGNUP_PLAN_KEY,
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
  /** Nama ORANG. */
  name: string;
  /** Nama AKUN (#458) — dasar `tenants.name` & slug-nya. */
  accountName: string;
  passwordHash: string;
  termsAcceptedAt: Date;
  /** Versi dokumen yang TAMPIL saat kotaknya dicentang (issue #142). */
  termsVersion: string;
  privacyVersion: string;
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
        accountName: input.accountName.trim(),
        passwordHash: input.passwordHash,
        tokenHash: minted.tokenHash,
        expiresAt: minted.expiresAt,
        termsAcceptedAt: input.termsAcceptedAt,
        termsVersion: input.termsVersion,
        privacyVersion: input.privacyVersion,
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
  | {
      ok: true;
      email: string;
      name: string;
      tenantId: number;
      tenantSlug: string;
      /** Jejak persetujuan yang dibawa dari pendaftaran (issue #142). */
      termsAcceptedAt: Date;
      termsVersion: string | null;
      privacyVersion: string | null;
    }
  | { ok: false; reason: "invalid_token" | "already_registered" };

/**
 * Pakai token verifikasi: lahirkan Tenant + User(owner) +
 * TenantMembership(owner) dalam SATU transaksi (§4A — kegagalan di tengah
 * tidak pernah menyisakan akun tanpa tenant atau tenant setengah jadi), tandai
 * pendaftarannya terpakai, dan JANGAN sentuh basis data perusahaan mana pun.
 *
 * Langganan platform-nya (issue #152) lahir SESUDAH transaksi ini, di route
 * verifikasi lewat `createInitialSubscription` (`subscription-store.ts`) —
 * modul ini tetap murni kendali, dan `sai_platform` yang mati tidak pernah
 * menggagalkan verifikasi.
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
        accountName: true,
        passwordHash: true,
        expiresAt: true,
        usedAt: true,
        termsAcceptedAt: true,
        termsVersion: true,
        privacyVersion: true,
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

    /*
     * Nama AKUN, bukan nama orang (#458).
     *
     * `accountName` NULL hanya pada baris yang dibuat sebelum kolomnya ada —
     * tautan verifikasi yang sudah telanjur ada di kotak masuk seseorang.
     * Baris itu jatuh ke perilaku LAMA dengan sengaja: mematikan tautan yang
     * sudah dikirim demi kerapian data adalah menghukum orang yang tidak
     * melakukan kesalahan apa pun. Pendaftaran baru selalu mengisinya.
     */
    const namaAkun = row.accountName?.trim() || row.name;

    // Slug anti-tabrakan: kandidat deterministik dulu, akhiran acak terakhir.
    const kandidat = tenantSlugCandidates(namaAkun);
    const existing = await tx.tenant.findMany({
      where: { slug: { in: kandidat } },
      select: { slug: true },
    });
    const takenSlugs = new Set(existing.map((t) => t.slug));
    /* Ketiga kandidat acak pun tertabrak = peluang ±2^-120; kalau itu terjadi,
       indeks unik DB yang menolak, bukan slug diam-diam kembar. */
    const slug = kandidat.find((c) => !takenSlugs.has(c)) ?? slugAcak();

    const now = new Date();
    const tenant = await tx.tenant.create({
      data: {
        slug,
        name: namaAkun,
        status: STATUS_AFTER_VERIFICATION,
        planKey: SIGNUP_PLAN_KEY,
        trialEndsAt: trialEndsAtFrom(now),
        /* Kuota DITULIS EKSPLISIT, tidak lagi mengandalkan bawaan kolom
         * (1 PT / 3 pengguna). Sejak uji coba menjadi uji coba paket PRO,
         * bawaan kolom adalah kuota paket yang salah — pendaftar akan melihat
         * halaman harga menjanjikan 3 PT lalu ditolak di PT kedua, tanpa satu
         * pun galat yang menjelaskan sebabnya. */
        maxCompanies: SIGNUP_MAX_COMPANIES,
        maxUsers: SIGNUP_MAX_USERS,
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

    return {
      ok: true as const,
      email: row.email,
      name: row.name,
      tenantId: tenant.id,
      tenantSlug: slug,
      termsAcceptedAt: row.termsAcceptedAt,
      termsVersion: row.termsVersion,
      privacyVersion: row.privacyVersion,
    };
  });
}
