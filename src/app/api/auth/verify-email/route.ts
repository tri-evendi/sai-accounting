/**
 * Memakai tautan verifikasi email (issue #138) — langkah 3 perjalanan §7.1:
 * DI SINILAH Tenant + User(owner) + TenantMembership(owner) lahir, dalam satu
 * transaksi (`registration-store.ts`). Basis data perusahaan TIDAK disentuh —
 * itu baru terjadi ketika pemilik akun sendiri menekan "buat perusahaan"
 * (/companies/new, dijaga kuota).
 *
 * PUBLIK (dilepas `proxy.ts`; pengecualian beralasan di
 * tests/authz-coverage.test.ts) — kredensialnya token acak 256 bit sekali
 * pakai di badan POST. Halaman /verify-email memanggil POST ini lewat tombol,
 * BUKAN mengonsumsi token pada GET: pemindai tautan surel (SafeLinks dkk.)
 * membuka setiap URL yang lewat, dan token yang terbakar oleh robot adalah
 * pendaftar yang tidak pernah bisa masuk.
 */
import { NextResponse } from "next/server";

import { verifyEmailSchema } from "@/lib/validations/auth";
import {
  PERSISTENT_RATE_LIMITS,
  checkPersistentRateLimit,
} from "@/lib/rate-limit-persistent";
import { consumeVerificationToken } from "@/lib/registration-store";
import { createInitialSubscription } from "@/lib/subscription-store";
import { writeTenantAuditLog } from "@/lib/tenant-audit";
import { reportError } from "@/lib/alert";
import { getRequestI18n } from "@/lib/i18n/server";
import { clientIpFrom } from "@/lib/client-ip";

function clientIp(request: Request): string {
  /*
   * `clientIpFrom` — entri ke-N dari KANAN, bukan yang paling kiri (issue
   * #372). Yang paling kiri bisa diketik klien, dan kunci pembatas laju
   * yang bisa diketik klien bukan pembatas laju: satu header acak per
   * permintaan membuat setiap permintaan tampak datang dari alamat baru.
   *
   * `null` (rantai lebih pendek dari topologi yang dikonfigurasi) menjadi
   * "unknown", yaitu SATU ember bersama — gagal-tertutup: permintaan yang
   * asal-usulnya tidak bisa dipastikan berbagi jatah, tidak mendapat jatah
   * tak terbatas masing-masing.
   */
  return clientIpFrom(request.headers) ?? "unknown";
}

export async function POST(request: Request) {
  const { t } = await getRequestI18n();

  const perIp = await checkPersistentRateLimit(
    `verify:ip:${clientIp(request)}`,
    PERSISTENT_RATE_LIMITS.verifyEmailIp
  );
  if (!perIp.allowed) {
    return NextResponse.json({ error: t("auth.forgotPassword.tooMany") }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  const result = await consumeVerificationToken(parsed.data.token);

  if (!result.ok) {
    return result.reason === "already_registered"
      ? // Yang membaca adalah pemilik email (ia memegang tautannya); jalan
        // keluarnya berbeda dari token basi — masuk atau atur ulang sandi.
        NextResponse.json(
          { error: t("auth.register.alreadyRegistered"), code: "already_registered" },
          { status: 409 }
        )
      : NextResponse.json(
          { error: t("auth.register.invalidToken"), code: "invalid_token" },
          { status: 400 }
        );
  }

  /*
   * Kelahiran tenant DICATAT di jejaknya sendiri (issue #142) — peristiwa yang
   * dulu tidak punya tempat: belum ada satu pun PT, jadi jejak per-PT mustahil.
   */
  await writeTenantAuditLog({
    tenantId: result.tenantId,
    tenantSlug: result.tenantSlug,
    username: result.email,
    tenantRole: "owner",
    action: "tenant.register",
    details: {
      email: result.email,
      name: result.name,
      /* Persetujuan S&K + privasi BESERTA VERSINYA (issue #142) — jejak audit
       * tenant menjadi catatan persetujuan yang bertahan; baris registrations
       * boleh dibersihkan kapan pun tanpa kehilangan bukti. */
      termsAcceptedAt: result.termsAcceptedAt.toISOString(),
      termsVersion: result.termsVersion,
      privacyVersion: result.privacyVersion,
    },
    request,
  });

  /*
   * Langganan lahir BERSAMA tenant (issue #152): tanpa baris `subscriptions`
   * di platform, penjadwal tidak pernah melihat tenant ini — trial tak pernah
   * berakhir, tagihan pertama tak pernah terbit, tanpa galat di mana pun.
   * Helper-nya tidak pernah melempar (penagihan mati ≠ pendaftaran mati);
   * try/catch di sini pagar kedua — apa pun yang terjadi, jawabannya tetap
   * 200: tenant sudah lahir, dan putaran adopsi yatim penjadwal (#152)
   * menyembuhkan langganan yang belum sempat lahir.
   */
  try {
    await createInitialSubscription(result.tenantId);
  } catch (error) {
    /* Tenant tetap lahir; putaran adopsi penjadwal yang menyembuhkan (#152).
       Tapi "disembuhkan oleh putaran berikutnya" hanya benar selama penjadwalnya
       hidup — jadi kegagalannya harus terdengar, bukan berhenti di log. */
    await reportError("verify_email.initial_subscription_failed", error, {
      tenantId: result.tenantId,
      tenantSlug: result.tenantSlug,
    });
  }

  return NextResponse.json({ ok: true });
}
