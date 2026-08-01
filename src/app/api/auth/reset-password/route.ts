/**
 * Memakai tautan atur-ulang kata sandi (issue #136).
 *
 * PUBLIK (tanpa sesi; dilepas `proxy.ts` sebagai bagian `/api/auth/*`,
 * pengecualian beralasan di tests/authz-coverage.test.ts) — yang menjadi
 * kredensial DI SINI adalah tokennya sendiri: 256 bit acak, berbatas waktu,
 * sekali pakai, tersimpan ter-hash.
 *
 * SEMUA kegagalan token dijawab SATU kalimat yang sama (`invalidToken`):
 * membedakan "tak dikenal" / "kedaluwarsa" / "sudah dipakai" memberi penyisir
 * konfirmasi gratis bahwa token itu pernah hidup. Sukses = kata sandi baru +
 * `session_version` naik (seluruh sesi lama tercabut) — di SATU transaksi
 * dengan penandaan terpakainya (lib/password-reset-store.ts).
 */
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

import { resetPasswordApiSchema } from "@/lib/validations/auth";
import {
  PERSISTENT_RATE_LIMITS,
  checkPersistentRateLimit,
} from "@/lib/rate-limit-persistent";
import { consumeResetToken } from "@/lib/password-reset-store";
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

  // Persisten sejak issue #138 — lihat catatan di forgot-password/route.ts.
  const perIp = await checkPersistentRateLimit(
    `pwreset:consume:${clientIp(request)}`,
    PERSISTENT_RATE_LIMITS.passwordResetIp
  );
  if (!perIp.allowed) {
    return NextResponse.json({ error: t("auth.forgotPassword.tooMany") }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = resetPasswordApiSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, 12);
  const verdict = await consumeResetToken(parsed.data.token, hash);

  if (verdict !== "valid") {
    // Satu kalimat untuk semua kegagalan — lihat kepala berkas.
    return NextResponse.json(
      { error: t("auth.resetPassword.invalidToken"), code: "invalid_token" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
