"use client";

/**
 * Kulit `/platform` — PANEL ADMIN PELANGGAN, bukan layar pra-aplikasi.
 *
 * ══ TIGA KULIT, DAN KENAPA INI KULIT KETIGA ════════════════════════════════
 * Aplikasi ini punya dua kerangka yang sudah mapan, dan halaman tingkat tenant
 * tidak cocok di keduanya:
 *
 *   `AuthShell`      satu tugas, satu kartu `max-w-md` (masuk, ganti sandi).
 *                    Permukaan tenant membawa ENAM urusan; 448px membuat tabel
 *                    tagihan lima kolom menggeser dirinya sendiri secara
 *                    mendatar bahkan di layar 1440px.
 *   `(dashboard)`    Sidebar + Navbar penuh — tapi menunya disusun dari
 *                    `session.user.role`, yaitu PERAN DI SEBUAH PT. Pengunjung
 *                    di sini boleh jadi belum punya satu pun PT (pemilik baru
 *                    yang sedang membuat yang pertama). Memakainya berarti
 *                    memutar layar pemuatan selamanya bagi orang yang paling
 *                    membutuhkan halaman ini — persis alasan `(tenant)/layout`
 *                    sengaja setipis `(auth)`.
 *
 * Karena itu kulit ketiga: BENTUK panel admin yang sama dengan dasbor —
 * sidebar gelap `w-64`, bilah atas `h-16`, isi yang menggulung sendiri — tapi
 * menunya disusun dari KEWENANGAN TINGKAT TENANT yang dioper `layout.tsx`,
 * bukan dari peran di sebuah PT.
 *
 * ⚠ Daftar menunya DIOPER, tidak dihitung di sini. Menyusunnya di dalam kulit
 * berarti kulit harus tahu matriks izin, dan itu menaruh keputusan "siapa
 * melihat apa" di dua tempat — tempat kedua yang tidak diuji siapa pun.
 *
 * ══ BUTIRNYA RUTE, BUKAN JANGKAR ═══════════════════════════════════════════
 * Versi pertama panel ini memakai jangkar `#tim`, `#privasi`, … ke bagian di
 * satu halaman panjang. Itu salah, dan salahnya bukan soal rasa:
 *
 *   • `#privasi` tidak bisa di-bookmark sebagai HALAMAN, tidak muncul di
 *     riwayat sebagai tempat tersendiri, dan tombol Kembali tidak
 *     mengembalikan apa pun;
 *   • yang jauh lebih penting: satu halaman berarti SELURUH isinya dirender
 *     dalam satu permintaan, jadi pemisahan kewenangan bergantung pada
 *     `{canX && …}` yang benar di setiap cabang. Sebagai rute tersendiri,
 *     penjaga di kepala tiap halaman yang menolak — `tenant.billing` tidak
 *     dipegang berarti /platform/billing MEMANTULKAN, bukan merender halaman
 *     yang kebetulan kosong.
 *
 * Butir aktif ditandai dari `usePathname()`; `/platform` dicocokkan persis
 * (kalau tidak, ia akan selalu aktif karena semua jalur lain berawalan
 * dengannya), sisanya dengan awalan supaya anak-rute seperti
 * `/platform/billing/plans` tetap menyalakan induknya.
 *
 * Lambang, bahasa, tema, dan JALAN KELUAR ikut di sini sebab halaman ini tidak
 * punya chrome aplikasi: di dasbor keempatnya tinggal di Navbar/menu akun yang
 * belum ada pada tahap ini (MASTER.md §Orientasi Perusahaan mewajibkan layar
 * tanpa chrome punya jalan keluar).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

export interface PlatformNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Cocokkan PERSIS, bukan sebagai awalan — untuk butir pendaratan. */
  exact?: boolean;
}

interface PlatformShellProps {
  children: React.ReactNode;
  /** Nama tenant — orientasi "akun siapa", sejajar `CompanyIndicator` di dasbor. */
  tenantName: string;
  nav: PlatformNavItem[];
  /** `SignedInAs` — identitas + keluar, dioper supaya kulit tidak menyentuh sesi. */
  account?: React.ReactNode;
}

export function PlatformShell({ children, tenantName, nav, account }: PlatformShellProps) {
  const t = useT();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (item: PlatformNavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  /* Escape menutup laci — aturan yang sama dengan laci dasbor: lapisan yang
   * menutupi seluruh layar tidak boleh hanya bisa ditutup dengan menyentuh
   * tirainya. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Tirai layar sempit — di sana sidebar adalah laci, bukan kolom.
       *
       * ⚠ HITAM, BUKAN `bg-foreground/50`. Tirai yang memakai `--foreground`
       * IKUT BERBALIK bersama tema: di tema gelap `--foreground` adalah #F8FAFC,
       * jadi "tirai" itu menjadi kabut PUTIH 50% — halaman di baliknya justru
       * menjadi lebih terang saat laci dibuka, kebalikan dari yang seharusnya
       * dilakukan sebuah scrim. Ini persis jebakan "tinjau di KEDUA tema" di
       * MASTER.md §Color Palette: dari kodenya kelas itu terlihat paling benar
       * di antara semua pilihan, sebab ia satu-satunya yang lolos penjaga token
       * tanpa pengecualian.
       *
       * Scrim memang bukan permukaan bertema — ia bayangan. Sidebar dasbor
       * sudah lama benar dengan `bg-black/50` + pengecualian setempat; di sini
       * pengecualian yang sama yang berlaku, bukan token yang salah. */}
      {menuOpen && (
        <div
          // eslint-disable-next-line no-restricted-syntax
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ⚠ LACI TERTUTUP TIDAK BOLEH TETAP BISA DI-TAB.
       *
       * `-translate-x-full` hanya MENGGESER laci ke luar layar; butir menunya
       * tetap ada di pohon dan tetap urutan fokus. Di layar sempit itu berarti
       * pengguna keyboard menekan Tab dari bilah atas dan fokusnya menghilang
       * ke dalam lima tautan yang tidak terlihat di mana pun — beberapa tekanan
       * tanpa satu pun ring fokus di layar, lalu ia mendarat di suatu tempat
       * tanpa tahu bagaimana ia sampai.
       *
       * `invisible` mencabutnya dari urutan fokus (dan dari pembaca layar);
       * `lg:visible` mengembalikannya di lebar tempat laci memang menjadi kolom
       * tetap. Transisinya tetap `transform` saja: saat MEMBUKA, visibilitas
       * menyala lebih dulu lalu geserannya beranimasi seperti sebelumnya. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:static lg:z-auto lg:visible lg:translate-x-0",
          menuOpen ? "translate-x-0" : "invisible -translate-x-full"
        )}
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
            {nav.map((item) => {
              const active = isActive(item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <span className="shrink-0" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
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
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
