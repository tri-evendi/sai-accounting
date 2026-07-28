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
 * ══ ORIENTASI DULU, KENDALI KEMUDIAN ═══════════════════════════════════════
 * Versi pertamanya sengaja tidak bisa ditekan: komponen ini tidak tahu apakah
 * ada perusahaan LAIN untuk dipilih, dan tombol yang mengembalikan sebagian
 * pengguna ke ruangan yang sama lebih buruk daripada teks biasa.
 *
 * Sesi kini membawa jumlahnya (`companyCount`), jadi pengetahuan itu ada tanpa
 * satu permintaan pun — dan nama perusahaan di bilah atas adalah tempat orang
 * pertama kali mencari cara berpindah (pola yang sama di Accurate, Xero,
 * QuickBooks). Jadi: SATU perusahaan → tetap teks biasa; LEBIH dari satu →
 * tautan ke pemilihnya.
 */

import Link from "next/link";
import { Building2, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

export function CompanyIndicator({
  companyName,
  companyCount = 0,
}: {
  companyName: string | null;
  /** Berapa perusahaan yang boleh dibuka pengguna ini (dari sesi). */
  companyCount?: number;
}) {
  const t = useT();

  // Tanpa perusahaan aktif tidak ada yang jujur untuk ditulis di sini. Tata
  // letak dashboard sudah menahan keadaan itu (ia menampilkan layar memuat
  // sementara penjaga memantulkan ke pemilih perusahaan), jadi ini sekadar
  // penjaga terakhir — bukan keadaan yang perlu dijelaskan ke pengguna.
  if (!companyName) return null;

  const label = `${t("navbar.activeCompany")}: ${companyName}`;
  const body = (
    <>
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t("navbar.activeCompany")}:</span>
      {/* `title` menyelamatkan nama panjang yang terpotong di layar sempit —
          satu-satunya cara membacanya utuh tanpa membuka menu apa pun. */}
      <span className="truncate font-medium text-foreground" title={companyName}>
        {companyName}
      </span>
    </>
  );

  const shared = "flex min-w-0 items-center gap-2 text-sm";

  if (companyCount < 2) {
    return (
      <div className={shared} aria-label={label}>
        {body}
      </div>
    );
  }

  return (
    <Link
      href="/select-company"
      // Namanya saja tidak memberi tahu bahwa ia BISA ditekan; kalimat penuh
      // inilah yang dibacakan pembaca layar.
      aria-label={`${label} — ${t("auth.selectCompany.switchLabel")}`}
      className={cn(
        shared,
        "cursor-pointer rounded-md px-2 py-1 -mx-2 transition-colors duration-150",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {body}
      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
