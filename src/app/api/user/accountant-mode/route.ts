import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { setAccountantMode } from "@/lib/users-directory";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

/**
 * Mode Akuntan toggle (issue #11).
 *
 * PATCH updates ONLY the current user's `accountant_mode` display preference.
 * The target row is always `session.user.id` — never a caller-supplied id — so a
 * user can only flip their OWN preference. `role` is never read from or written
 * to the body, so this can never escalate authorisation: a `warehouse_head`
 * user stays `warehouse_head`; this only changes what THEY see.
 */
const bodySchema = z.object({
  // true/false = explicit override; null = clear back to the role default.
  accountantMode: z.boolean().nullable(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.sessionExpired") }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
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

  // Preferensi ini milik KEANGGOTAAN, bukan identitas (issue #104): bawaannya
  // diturunkan dari peran, dan peran berbeda per perusahaan — orang yang sama
  // bisa butuh permukaan akuntansi di PT A dan tidak di PT B. Ditulis hanya
  // untuk pengguna yang sedang masuk di perusahaan yang sedang dibuka; tidak
  // ada id yang datang dari badan permintaan.
  await setAccountantMode(parseInt(session.user.id), parsed.data.accountantMode);

  return NextResponse.json({ accountantMode: parsed.data.accountantMode });
}
