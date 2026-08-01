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
import { getRequestI18n } from "@/lib/i18n/server";

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
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

  return NextResponse.json({ ok: true });
}
