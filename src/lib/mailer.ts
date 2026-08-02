/**
 * Pengirim surel untuk KODE APLIKASI — pembungkus `server-only` di atas
 * `mailer-core.ts`. Pemisahan ini lahir di issue #140: skrip penjadwal (tsx,
 * di luar Next) butuh `sendMail` tapi tidak bisa memuat `server-only`;
 * kode aplikasi tetap wajib lewat sini supaya kredensial SMTP tidak pernah
 * tersentuh bundel client.
 */

import "server-only";

export {
  resolveMailConfig,
  sendMail,
  type MailConfig,
  type MailConfigSource,
  type MailMessage,
  type MailResult,
} from "@/lib/mailer-core";
