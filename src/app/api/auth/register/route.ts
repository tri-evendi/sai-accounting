/**
 * Pendaftaran mandiri (issue #138) — langkah 1–2 perjalanan §7.1.
 *
 * PUBLIK (dilepas `proxy.ts`; pengecualian beralasan di
 * tests/authz-coverage.test.ts) — pendaftar jelas belum punya sesi.
 *
 * ══ YANG SENGAJA TIDAK TERJADI DI SINI ══════════════════════════════════════
 * Tidak ada basis data dibuat, tidak ada Tenant, tidak ada User: hanya sebuah
 * baris `registrations` (kata sandi langsung di-bcrypt) dan satu surel
 * verifikasi. Penyediaan apa pun yang terjangkau permintaan ANONIM adalah
 * pintu penyalahgunaan (§9) — semuanya baru lahir saat tautan diklik.
 *
 * ══ JAWABAN SERAGAM ═════════════════════════════════════════════════════════
 * Respons SELALU 200 dengan isi sama, terdaftar ataupun belum emailnya; yang
 * berbeda ISI SURELNYA (pola §7.3): email baru menerima tautan verifikasi,
 * email yang sudah berakun menerima "Anda sudah punya akun — masuk / atur
 * ulang kata sandi". Kerja mahal tidak ditunggu respons supaya lamanya pun
 * tidak berbicara.
 *
 * ══ PEMBATAS LAJU: PERSISTEN ════════════════════════════════════════════════
 * Bukan `rate-limit.ts` (memori): endpoint ini terbuka ke internet, dan
 * penghitung yang hilang saat restart adalah jendela yang membuka sendiri.
 * `checkPersistentRateLimit` menghitung di basis data kendali — selamat dari
 * restart, terbagi antar-instance (issue #138).
 */
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

import { registerSchema } from "@/lib/validations/auth";
import {
  PERSISTENT_RATE_LIMITS,
  checkPersistentRateLimit,
} from "@/lib/rate-limit-persistent";
import { createRegistration, emailHasAccount } from "@/lib/registration-store";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { sendMail } from "@/lib/mailer";
import { reportError } from "@/lib/alert";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { clientIpFrom } from "@/lib/client-ip";

function appOrigin(request: Request): string {
  return process.env.AUTH_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
}

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
  const { dictionary, t } = await getRequestI18n();

  const perIp = await checkPersistentRateLimit(
    `register:ip:${clientIp(request)}`,
    PERSISTENT_RATE_LIMITS.registerIp
  );
  if (!perIp.allowed) {
    return NextResponse.json({ error: t("auth.forgotPassword.tooMany") }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const perEmail = await checkPersistentRateLimit(
    `register:email:${email}`,
    PERSISTENT_RATE_LIMITS.registerEmail
  );
  if (!perEmail.allowed) {
    return NextResponse.json({ error: t("auth.forgotPassword.tooMany") }, { status: 429 });
  }

  // Hash DI DALAM permintaan (bukan pekerjaan latar): begitu 200 terkirim,
  // nilai mentah kata sandi tidak boleh masih hidup di mana pun.
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const termsAcceptedAt = new Date();
  const origin = appOrigin(request);
  const name = parsed.data.name;

  /*
   * Kerja sesudah titik ini tidak ditunggu dan galatnya tidak mengubah
   * respons — keberadaan akun tidak boleh terbaca dari status, isi, maupun
   * lamanya jawaban. Kegagalan dicatat di log server.
   */
  void (async () => {
    try {
      if (await emailHasAccount(email)) {
        await sendMail({
          to: email,
          /* Membawa/menyiratkan AKSES AKUN — tidak pernah disalin ke alamat arsip (#BCC): lihat `MailMessage.sensitive`. */
          sensitive: true,
          subject: "Anda sudah punya akun — SAI Accounting",
          text:
            `Halo,\n\n` +
            "Seseorang (semoga Anda) mencoba mendaftar dengan alamat email ini,\n" +
            "tetapi akunnya SUDAH ADA. Tidak ada yang berubah.\n\n" +
            `  Masuk:                 ${origin}/login\n` +
            `  Lupa kata sandi:       ${origin}/forgot-password\n\n` +
            "Bukan Anda yang mencoba? Abaikan surel ini.\n\n— SAI Accounting",
        });
        return;
      }

      const { token } = await createRegistration({
        email,
        name,
        passwordHash,
        termsAcceptedAt,
        // Versi dokumen yang TAMPIL saat mendaftar (issue #142) — bukti
        // persetujuan tanpa versi tidak membuktikan apa-apa.
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });
      const link = `${origin}/verify-email?token=${token}`;
      await sendMail({
        to: email,
        /* Membawa/menyiratkan AKSES AKUN — tidak pernah disalin ke alamat arsip (#BCC): lihat `MailMessage.sensitive`. */
        sensitive: true,
        subject: "Verifikasi email Anda — SAI Accounting",
        text:
          `Halo ${name},\n\n` +
          "Terima kasih sudah mendaftar. Buka tautan berikut untuk mengaktifkan\n" +
          "akun Anda — berlaku 24 jam, sekali pakai:\n\n" +
          `  ${link}\n\n` +
          "Setelah aktif, Anda bisa masuk dan membuat perusahaan pertama Anda.\n" +
          "Bukan Anda yang mendaftar? Abaikan surel ini; tidak ada akun yang dibuat.\n\n" +
          "— SAI Accounting",
      });
    } catch (error) {
      /*
       * Jalur ini SENGAJA tidak bisa mengubah respons (§ jawaban seragam di
       * kepala berkas), jadi pendaftar yang surelnya gagal terkirim tidak
       * melihat apa pun yang salah — ia hanya tidak pernah menerima tautannya,
       * lalu pergi. Sampai #374 kegagalan itu berhenti di `console.error` yang
       * tidak dibaca siapa pun. Sekarang ia mengetuk pintu (teredam satu surel
       * per jam per jenis galat).
       */
      await reportError("register.verification_mail_failed", error, { email });
    }
  })();

  return NextResponse.json({ ok: true, message: t("auth.register.sentBody") });
}
