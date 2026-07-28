"use client";

/**
 * Perusahaan yang SEDANG DIBUKA, terpampang di top bar (issue #104).
 *
 * ══ KENAPA INI ADA ═════════════════════════════════════════════════════════
 * Sejak buku besar tiap PT hidup di basis datanya sendiri, satu pertanyaan
 * menjadi yang paling penting di seluruh aplikasi: **buku siapa yang sedang
 * saya tulis?** Sebelum ini jawabannya hanya muncul setelah pengguna membuka
 * menu avatar — sebuah klik yang tidak akan dilakukan orang yang tidak merasa
 * ragu. Padahal justru orang yang tidak ragu itulah yang salah mencatat.
 *
 * Kesalahan mencatat ke PT yang salah TIDAK BERBUNYI saat terjadi: tidak ada
 * galat, tidak ada peringatan, dan baru muncul berbulan-bulan kemudian sebagai
 * neraca yang tidak cocok. Satu-satunya pencegahnya adalah orientasi yang
 * selalu terlihat — sama seperti nama berkas perusahaan yang selalu tertulis di
 * bilah judul Accurate/MYOB, tempat pengguna app ini belajar model mentalnya.
 *
 * ══ KENAPA DARI SESI, BUKAN PERMINTAAN JARINGAN ════════════════════════════
 * Namanya dibawa token (lihat `companyName` di `lib/auth.ts`), jadi ia hadir
 * pada render pertama — bukan berkedip masuk beberapa ratus milidetik setelah
 * halaman terlihat siap. Jeda itu penting: yang paling mungkin salah baca
 * adalah orang yang sudah mulai mengetik sebelum indikatornya sempat muncul.
 *
 * ══ KENAPA BUKAN TOMBOL PENGGANTI PERUSAHAAN ═══════════════════════════════
 * Ini penanda ORIENTASI, bukan kendali. Berganti perusahaan sudah punya
 * tempatnya di menu avatar, dan di sana ia hanya muncul bila pengguna memang
 * memegang lebih dari satu PT — pengetahuan yang tidak dimiliki komponen ini
 * tanpa satu permintaan tambahan. Menjadikannya tombol berarti sebagian
 * pengguna menekan sesuatu yang mengembalikannya ke tempat yang sama.
 */

import { Building2 } from "lucide-react";

import { useT } from "@/lib/i18n/client";

export function CompanyIndicator({ companyName }: { companyName: string | null }) {
  const t = useT();

  // Tanpa perusahaan aktif tidak ada yang jujur untuk ditulis di sini. Tata
  // letak dashboard sudah menahan keadaan itu (ia menampilkan layar memuat
  // sementara penjaga memantulkan ke pemilih perusahaan), jadi ini sekadar
  // penjaga terakhir — bukan keadaan yang perlu dijelaskan ke pengguna.
  if (!companyName) return null;

  return (
    <div
      className="flex min-w-0 items-center gap-2 text-sm"
      // Dibacakan sebagai satu kalimat utuh: nama saja tidak memberi tahu
      // pembaca layar bahwa inilah perusahaan yang sedang dibuka.
      aria-label={`${t("navbar.activeCompany")}: ${companyName}`}
    >
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t("navbar.activeCompany")}:</span>
      {/* `title` menyelamatkan nama panjang yang terpotong di layar sempit —
          satu-satunya cara membacanya utuh tanpa membuka menu apa pun. */}
      <span className="truncate font-medium text-foreground" title={companyName}>
        {companyName}
      </span>
    </div>
  );
}
