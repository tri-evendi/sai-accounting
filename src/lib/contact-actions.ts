"use server";

/**
 * Formulir "hubungi kami" di halaman pendaratan — server action-nya.
 *
 * ══ KENAPA SERVER ACTION, BUKAN KOMPONEN FORMULIR KLIEN ════════════════════
 * Konvensi formulir aplikasi ini `react-hook-form` + `zod` lewat pola `Form`
 * (AGENTS.md), dan pola itu KLIEN. Di halaman ini ia salah: pendaratan sengaja
 * nol JavaScript sisi klien — dikunci `AMBANG_KLIEN` di
 * `tests/rsc-boundary.test.ts` — karena pengunjungnya belum tentu pernah
 * mendaftar, dan hidrasi untuk mereka dibayar tanpa imbalan.
 *
 * `<form action={…}>` di Next App Router bekerja TANPA JavaScript: peramban
 * mengirimkan formulirnya seperti formulir HTML biasa, dan server action
 * memprosesnya. Validasi tetap `zod`, hanya pindah ke sisi server — yang
 * memang satu-satunya sisi yang bisa dipercaya untuk endpoint publik.
 *
 * ══ TIGA PAGAR, DAN KENAPA MASING-MASING ADA ═══════════════════════════════
 *  1. **Pembatas laju PERSISTEN per IP.** Aturan di kepala `rate-limit.ts`:
 *     endpoint terbuka-ke-internet tidak boleh memakai penghitung memori.
 *     Formulir ini bahkan lebih terbuka daripada `/register` — ia tidak
 *     menuntut apa pun dari pengirim dan setiap kiriman MENGIRIM SUREL.
 *  2. **Perangkap madu (`website`).** Bot pengisi-otomatis mengisi setiap
 *     isian yang ditemukannya; manusia tidak pernah melihat yang satu ini.
 *     Terisi = diperlakukan seolah BERHASIL, bukan ditolak: penolakan
 *     memberi tahu bot bahwa perangkapnya ada.
 *  3. **Balasan tidak pernah membocorkan keadaan pemasangan.** Alamat tujuan
 *     yang belum disetel dijawab di TAMPILAN (seksinya tidak merender
 *     formulir sama sekali), bukan di sini.
 *
 * ══ HASILNYA LEWAT PENGALIHAN, BUKAN STATE ═════════════════════════════════
 * `useActionState` akan menyeret formulir ini menjadi komponen klien dan
 * membatalkan seluruh alasan di atas. Karena itu hasilnya disampaikan lewat
 * parameter kueri (`?kontak=…#kontak`), yang dibaca halaman dan dirender
 * sebagai pita — bekerja identik dengan maupun tanpa JavaScript.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { sendMail } from "@/lib/mailer";
import {
  PERSISTENT_RATE_LIMITS,
  checkPersistentRateLimit,
} from "@/lib/rate-limit-persistent";
import { clientIpFrom } from "@/lib/client-ip";

/** Hasil yang bisa muncul di `?kontak=` — dibaca `app/page.tsx`. */
export type ContactOutcome =
  "terkirim" | "gagal" | "takbenar" | "terlalu-sering";

const Skema = z.object({
  nama: z.string().trim().min(1).max(120),
  surel: z.string().trim().email().max(200),
  /*
   * Minimal 10 karakter: pesan "hi" tidak bisa ditindaklanjuti dan merupakan
   * bentuk kiriman bot yang paling umum. Maksimal 4.000 — batas surel yang
   * wajar, sekaligus menahan kiriman raksasa.
   */
  pesan: z.string().trim().min(10).max(4000),
});

/** Alamat IP pengirim, untuk pembatas laju. */
async function alamatIp(): Promise<string> {
  /*
   * Entri ke-N dari KANAN (issue #372), bukan yang pertama. Kalimat lama di
   * sini berbunyi "yang pertama adalah klien asli" — dan itu benar hanya
   * selama Traefik MENIMPA header kiriman klien. Begitu ada proxy kedua di
   * depannya, yang pertama menjadi teks pilihan pengirim, dan sebuah pembatas
   * laju yang kuncinya bisa diketik pengirim tidak membatasi apa pun. Formulir
   * ini MENGIRIM SUREL pada setiap kiriman, jadi taruhannya meriam spam.
   *
   * Tanpa alamat yang bisa dipastikan → "tak-dikenal": satu ember bersama,
   * bukan jatah tak terbatas masing-masing.
   */
  return clientIpFrom(await headers()) ?? "tak-dikenal";
}

function kembali(hasil: ContactOutcome): never {
  redirect(`/?kontak=${hasil}#kontak`);
}

export async function kirimPesanKontak(formData: FormData): Promise<void> {
  const tujuan = process.env.PLATFORM_CONTACT_EMAIL?.trim();
  /*
   * Tanpa alamat tujuan tidak ada yang bisa dikirim. Seksinya memang tidak
   * merender formulir dalam keadaan itu, jadi sampai di sini berarti kiriman
   * langsung ke endpoint — dijawab sebagai gagal, bukan dengan galat yang
   * menceritakan konfigurasi pemasangan kepada pengirimnya.
   */
  if (!tujuan) kembali("gagal");

  /* Perangkap madu: terisi = bot. Dijawab "terkirim" dengan sengaja. */
  if (String(formData.get("website") ?? "").length > 0) kembali("terkirim");

  const terurai = Skema.safeParse({
    nama: formData.get("nama"),
    surel: formData.get("surel"),
    pesan: formData.get("pesan"),
  });
  if (!terurai.success) kembali("takbenar");

  const ip = await alamatIp();
  const jatah = await checkPersistentRateLimit(
    `kontak:${ip}`,
    PERSISTENT_RATE_LIMITS.contactIp,
  );
  if (!jatah.allowed) kembali("terlalu-sering");

  const { nama, surel, pesan } = terurai.data;
  try {
    await sendMail({
      to: tujuan,
      subject: `[Kontak] ${nama}`,
      /*
       * ⚠ TANPA `replyTo` — `MailMessage` belum punya bidang itu, dan
       * menambahkannya berarti menyentuh KEDUA transport (berkas & SMTP)
       * sekaligus. Alamat pengirim karena itu ditulis di BARIS PERTAMA badan
       * pesan, jadi penerima tetap bisa membalas dengan menyalinnya.
       *
       * Alamat pengirim juga tidak boleh menjadi `from`: mengirim surel atas
       * nama domain orang lain adalah cara tercepat mendarat di folder spam
       * (SPF/DKIM tidak akan cocok).
       */
      text: `Nama : ${nama}\nSurel: ${surel}\n\n${pesan}\n`,
    });
  } catch {
    kembali("gagal");
  }

  kembali("terkirim");
}
