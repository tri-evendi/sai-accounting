import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { auth } from "@/lib/auth";
import { controlDb } from "@/lib/control-db";
import { changePasswordApiSchema } from "@/lib/validations/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.sessionExpired") }, { status: 401 });
  }

  const rateKey = `change-password:${session.user.id}`;
  const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.changePassword);
  if (!rateCheck.allowed) {
    const minutes = Math.ceil((rateCheck.retryAfterMs ?? 0) / 60_000);
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.tooManyAttempts", { minutes: minutes || 1 }) },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }

  const parsed = changePasswordApiSchema.safeParse(body);
  if (!parsed.success) {
    // ── Pola baku jawaban 400 (fase A; disalin ke seluruh route di fase B) ──
    // Skema membawa KUNCI kamus, bukan kalimat (pesan zod dipanggang saat modul
    // dimuat dan tidak bisa ikut berganti bahasa — lihat lib/i18n/validation.ts).
    // Route handler boleh membaca cookie bahasa persis seperti server component,
    // jadi DI SINILAH kunci itu kembali menjadi kalimat, dalam bahasa pengguna.
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  // Kata sandi milik IDENTITAS, bukan salah satu perusahaan (issue #104):
  // satu sandi berlaku untuk semua PT yang dipegang orang ini.
  const user = await controlDb.user.findUnique({
    where: { id: parseInt(session.user.id) },
  });

  if (!user) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.userNotFound") }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.currentPasswordWrong") }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await controlDb.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      mustChangePassword: false,
      passDate: new Date(),
    },
  });

  await writeAuditLog({
    userId: session.user.id,
    username: session.user.email || user.username,
    action: "auth.password_change",
    entity: "user",
    entityId: user.id,
    request,
  });

  return NextResponse.json({ success: true });
}
