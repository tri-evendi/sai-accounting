"use client";

/**
 * Kulit `/platform` — PANEL ADMIN PELANGGAN, bukan layar pra-aplikasi.
 *
 * ══ TIGA KULIT, DAN KENAPA INI KULIT KETIGA ════════════════════════════════
 * Aplikasi ini punya dua kerangka yang sudah mapan, dan halaman ini tidak
 * cocok di keduanya:
 *
 *   `AuthShell`      satu tugas, satu kartu `max-w-md` (masuk, ganti sandi).
 *                    Halaman ini membawa ENAM urusan; 448px membuat tabel
 *                    tagihan lima kolom menggeser dirinya sendiri secara
 *                    mendatar bahkan di layar 1440px.
 *   `(dashboard)`    Sidebar + Navbar penuh — tapi menunya disusun dari
 *                    `session.user.role`, yaitu PERAN DI SEBUAH PT. Pengunjung
 *                    halaman ini boleh jadi belum punya satu pun PT (pemilik
 *                    baru yang sedang membuat yang pertama). Memakainya berarti
 *                    memutar layar pemuatan selamanya bagi orang yang paling
 *                    membutuhkan halaman ini — persis alasan `(tenant)/layout`
 *                    sengaja setipis `(auth)`.
 *
 * Karena itu kulit ketiga: BENTUK panel admin yang sama dengan dasbor —
 * sidebar gelap `w-64`, bilah atas `h-16`, isi yang menggulung sendiri — tapi
 * menunya disusun dari KEWENANGAN TINGKAT TENANT yang dioper halaman, bukan
 * dari peran di sebuah PT. Pelanggan mendapat panel administrasi akunnya,
 * dengan tata bahasa visual yang sama dengan buku yang akan ia buka setelahnya.
 *
 * ══ MENUNYA MENUNJUK BAGIAN, DAN ITU DISENGAJA ═════════════════════════════
 * Butir menu adalah jangkar `#…` ke bagian di halaman yang sama, bukan rute
 * tersendiri. Alasannya bukan kemalasan: seluruh isi tingkat tenant muat dalam
 * satu halaman, dan memecahnya menjadi lima rute berarti lima kali muat ulang
 * untuk pekerjaan yang hampir selalu selesai dalam satu kunjungan. Yang
 * diberikan menu di sini adalah PETA — jawaban atas "apa lagi yang ada di akun
 * saya" — yang di kolom tunggal sebelumnya hanya bisa dijawab dengan menggulung
 * sampai habis.
 *
 * ⚠ Daftar menunya DIOPER, tidak dihitung di sini. Menyusunnya di dalam kulit
 * berarti kulit harus tahu matriks izin, dan itu menaruh keputusan "siapa
 * melihat apa" di dua tempat — tempat kedua yang tidak diuji siapa pun.
 *
 * Lambang, bahasa, tema, dan JALAN KELUAR ikut di sini sebab halaman ini tidak
 * punya chrome aplikasi: di dasbor keempatnya tinggal di Navbar/menu akun yang
 * belum ada pada tahap ini (MASTER.md §Orientasi Perusahaan mewajibkan layar
 * tanpa chrome punya jalan keluar).
 */

import { useState } from "react";
import { Menu, X } from "lucide-react";

import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useT } from "@/lib/i18n/client";

export interface PlatformNavItem {
  /** Jangkar `#bagian` di halaman ini, atau rute penuh (mis. `/companies/new`). */
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface PlatformShellProps {
  children: React.ReactNode;
  heading: string;
  description?: string;
  icon?: React.ReactNode;
  /** Nama tenant — orientasi "akun siapa", sejajar `CompanyIndicator` di dasbor. */
  tenantName: string;
  nav: PlatformNavItem[];
  /** `SignedInAs` — identitas + keluar, dioper supaya kulit tidak menyentuh sesi. */
  account?: React.ReactNode;
}

export function PlatformShell({
  children,
  heading,
  description,
  icon,
  tenantName,
  nav,
  account,
}: PlatformShellProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Tirai layar sempit — di sana sidebar adalah laci, bukan kolom. */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/50 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-6">
          <div className="flex min-w-0 items-center gap-2.5 text-lg font-bold">
            <BrandMark size="sm" />
            <span className="truncate">{APP_NAME}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen(false)}
            aria-label={t("sidebar.closeMenu")}
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <nav aria-label={t("sidebar.mainMenu")} className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <span className="shrink-0" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <p className="shrink-0 border-t border-sidebar-border px-6 py-4 text-xs text-sidebar-foreground/60">
          &copy; {new Date().getFullYear()} {APP_NAME}
          {" · v"}
          {APP_VERSION}
        </p>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(true)}
              aria-label={t("sidebar.mainMenu")}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            {/* Orientasi "akun siapa" — sejajar `CompanyIndicator` di dasbor,
                dan yang menyempit di layar sempit adalah NAMANYA, bukan target
                sentuh aksi di kanan (MASTER.md §Orientasi Perusahaan). */}
            <p className="truncate text-sm font-medium text-foreground" title={tenantName}>
              {tenantName}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <LocaleToggle />
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
            <ThemeToggle />
            {account && (
              <>
                <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
                {account}
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto w-full max-w-6xl space-y-6">
            <div className="flex items-start gap-4">
              {icon && (
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-ring sm:flex">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                {/* `h1` sungguhan. Di kulit lama judul halaman adalah `h2` yang
                    sederajat dengan judul setiap bagiannya, dan halaman ini
                    tidak punya `h1` sama sekali. */}
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{heading}</h1>
                {description && (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
