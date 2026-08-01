/**
 * Meminta tautan atur-ulang kata sandi (issue #136).
 *
 * PUBLIK (tanpa sesi — orang yang lupa kata sandinya jelas belum masuk;
 * dilepas `proxy.ts` sebagai bagian `/api/auth/*`, dan terdaftar sebagai
 * pengecualian beralasan di tests/authz-coverage.test.ts).
 *
 * ══ JAWABAN SERAGAM — ATURAN UTAMANYA ═══════════════════════════════════════
 * Respons SELALU 200 dengan isi yang sama, ada ataupun tiada akunnya. Jawaban
 * yang berbeda adalah kebocoran enumerasi: penyisir alamat bisa membaca dari
 * respons email mana yang punya akun. Konsekuensinya waktu eksekusi pun tidak
 * boleh berteriak — pekerjaan mahal (kirim surel) TIDAK ditunggu respons.
 *
 * ══ PEMBATAS LAJU ═══════════════════════════════════════════════════════════
 * Dua kunci: per-EMAIL (spam ke satu kotak masuk) dan per-IP (menyisir banyak
 * alamat). 429 untuk keduanya; masih penghitung memori (`lib/rate-limit.ts`) —
 * penghitung PERSISTEN adalah pekerjaan #138 dan tercatat di sana.
 */
import { NextResponse } from "next/server";

import { forgotPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { issueResetTokenForEmail } from "@/lib/password-reset-store";
import { sendMail } from "@/lib/mailer";
import { getRequestI18n } from "@/lib/i18n/server";

/** Alamat aplikasi untuk tautan di surel — AUTH_URL adalah sumber yang sama
 *  yang dipakai Auth.js, jadi tautannya menunjuk host yang benar di belakang
 *  proxy; origin permintaan hanyalah cadangan pengembangan. */
function appOrigin(request: Request): string {
  return process.env.AUTH_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(request: Request) {
  const { t } = await getRequestI18n();

  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  const perIp = checkRateLimit(`pwreset:ip:${clientIp(request)}`, RATE_LIMITS.passwordResetIp);
  const perEmail = checkRateLimit(`pwreset:email:${email}`, RATE_LIMITS.passwordResetEmail);
  if (!perIp.allowed || !perEmail.allowed) {
    return NextResponse.json({ error: t("auth.forgotPassword.tooMany") }, { status: 429 });
  }

  const origin = appOrigin(request);

  /*
   * Kerja sesudah titik ini TIDAK ditunggu dan galatnya tidak mengubah
   * respons: keberadaan akun tidak boleh terbaca dari status, isi, MAUPUN
   * lamanya jawaban. Kegagalan kirim dicatat di log server — satu-satunya
   * tempat yang memang boleh tahu.
   */
  void (async () => {
    try {
      const issued = await issueResetTokenForEmail(email);
      if (!issued) return; // email tak terdaftar — selesai, tanpa jejak keluar

      const link = `${origin}/reset-password?token=${issued.token}`;
      await sendMail({
        to: email,
        subject: "Atur ulang kata sandi — SAI Accounting",
        text:
          `Halo ${issued.name ?? ""},\n\n` +
          "Seseorang (semoga Anda) meminta pengaturan ulang kata sandi untuk akun ini.\n" +
          "Buka tautan berikut untuk membuat kata sandi baru — berlaku 60 menit,\n" +
          "sekali pakai:\n\n" +
          `  ${link}\n\n` +
          "Bukan Anda yang meminta? Abaikan surel ini; kata sandi Anda tidak berubah.\n\n" +
          "— SAI Accounting",
      });
    } catch (error) {
      console.error("[forgot-password] gagal menerbitkan/mengirim tautan:", error);
    }
  })();

  return NextResponse.json({ ok: true, message: t("auth.forgotPassword.sentBody") });
}
