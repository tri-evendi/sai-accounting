/**
 * Apakah surel benar-benar bisa keluar dari pemasangan ini (issue #317).
 *
 * ══ KEJADIAN YANG MELAHIRKANNYA ═════════════════════════════════════════════
 * Seseorang mendaftar di produksi. Halaman menjawab "cek email Anda". Surelnya
 * ditulis ke `data/mail-outbox/` empat belas milidetik kemudian, dan tidak
 * seorang pun pernah membuka direktori itu. Tidak ada galat di mana pun —
 * karena tidak ada satu baris kode pun yang menganggap keadaan itu salah.
 *
 * Asimetri yang diperbaiki di sini: `guardNonProduction` sudah BERTERIAK untuk
 * kasus yang jauh lebih ringan (seseorang meminta `smtp` di laptopnya),
 * sementara keadaan yang berbahaya — PRODUKSI yang menulis setiap surel ke
 * cakram — diam total. Sebuah pemasangan bisa hidup berbulan-bulan tanpa
 * mengirim satu surel pun: verifikasi pendaftaran, atur-ulang kata sandi,
 * undangan staf, semuanya menumpuk sebagai berkas `.eml`.
 *
 * ══ TIGA KEADAAN, DAN HANYA SATU YANG SALAH ═════════════════════════════════
 *   • `ok`                  — transport `smtp`; surel benar-benar berangkat.
 *   • `capturing_to_file`   — `file` DI LUAR produksi. Ini keadaan yang SAH,
 *                             dan sengaja bukan peringatan: peringatan yang
 *                             menyala setiap hari di laptop setiap pengembang
 *                             berhenti dibaca justru sebelum hari ia berarti.
 *   • `not_configured`      — `file` DI PRODUKSI. Inilah yang harus terlihat.
 *
 * ══ MURNI ══════════════════════════════════════════════════════════════════
 * Tanpa I/O: `nodeEnv` dan jumlah berkas kotak keluar DIOPER. Yang membaca
 * cakram adalah `mailer-core`, yang punya alasan sendiri untuk menyentuhnya.
 */

import type { MailConfigSource } from "@/lib/mailer-core";
import type { MailTransport } from "@/lib/mail-settings";

export type MailHealthStatus = "ok" | "capturing_to_file" | "not_configured";

export interface MailHealth {
  status: MailHealthStatus;
  transport: MailTransport;
  source: MailConfigSource;
  /**
   * Berkas `.eml` yang menumpuk. `null` = tidak terbaca — dan itu SENGAJA
   * dibedakan dari `0`: nol berarti tidak ada yang menunggu, `null` berarti
   * tidak tahu. Menyamakan keduanya membuat kegagalan membaca direktori
   * terlihat seperti kabar baik.
   *
   * Satu berkas = satu orang yang sedang menunggu surel yang tidak akan datang.
   */
  outboxCount: number | null;
  /**
   * Bentuk yang boleh keluar ke permukaan PUBLIK (`/api/health`, dipanggil
   * tanpa kredensial).
   *
   * Hanya STATUS. Rambu #317: jangan bocorkan keadaan konfigurasi surel ke
   * permukaan publik — jadi tidak ada host, alamat pengirim, sumber
   * konfigurasi, maupun jumlah antrean yang menyiratkan volume pemakaian.
   * Satu kata sudah cukup untuk membuat pemantauan yang sudah ada berbunyi,
   * dan itulah seluruh gunanya.
   */
  public: { status: MailHealthStatus };
}

export function mailHealth(input: {
  transport: MailTransport;
  source: MailConfigSource;
  /** `process.env.NODE_ENV` milik pemanggil — dioper, supaya bisa diuji. */
  nodeEnv: string | undefined;
  outboxCount: number | null;
}): MailHealth {
  const status: MailHealthStatus =
    input.transport === "smtp"
      ? "ok"
      : input.nodeEnv === "production"
        ? "not_configured"
        : "capturing_to_file";

  return {
    status,
    transport: input.transport,
    source: input.source,
    outboxCount: input.outboxCount,
    public: { status },
  };
}
