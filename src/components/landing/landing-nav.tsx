/**
 * Bilah atas halaman pendaratan publik.
 *
 * KENAPA BUKAN `AuthShell`. Kulit pra-aplikasi menaruh isinya di kolom
 * `max-w-md` dan mengasumsikan satu formulir di tengah layar — bentuk yang
 * benar untuk masuk/daftar dan salah untuk halaman yang harus menjelaskan
 * produk sebelum orang punya alasan mengisi apa pun. Yang DIPINJAM dari sana
 * adalah keputusannya, bukan tata letaknya: identitas PRODUK saja, tanpa nama
 * PT — pada pemasangan multi-PT aplikasi belum bisa tahu tenant mana yang
 * sedang datang, dan nilai cadangannya adalah nama pemasang pertama (lihat
 * komentar kepala `auth-shell.tsx`).
 *
 * Pemilih bahasa dan tema ikut di sini, bukan hanya di dalam aplikasi: orang
 * yang belum punya akun tidak bisa membuka menu akun, dan halaman inilah satu-
 * satunya tempat ia bisa memilih membaca dalam bahasanya sendiri.
 */
import Link from "next/link";

import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

export async function LandingNav() {
  const t = await getT();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav
        aria-label={APP_NAME}
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <BrandMark size="sm" />
          <span className="text-base font-semibold text-foreground">{APP_NAME}</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Di layar sempit dua sakelar ini disembunyikan agar tombol MASUK
              dan DAFTAR — satu-satunya hal yang benar-benar dituju orang di
              sini — tidak menyusut di bawah target sentuh 40px. Gantinya
              dirender di KAKI halaman dengan `sm:hidden` (lihat `page.tsx`),
              jadi tidak pernah ada ukuran layar yang kehilangan keduanya:
              pengunjung ponsel yang belum punya akun tidak punya menu akun
              untuk mengganti bahasa. */}
          <div className="hidden items-center gap-2 sm:flex">
            <LocaleToggle />
            <ThemeToggle />
          </div>
          <Button asChild variant="ghost">
            <Link href="/login">{t("landing.signIn")}</Link>
          </Button>
          <Button asChild>
            <Link href="/register">{t("landing.signUp")}</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
