"use client";

/**
 * Kerangka layar penyiapan (issue #103).
 *
 * Wizard `/setup` dulu tinggal di grup rute `(dashboard)`, jadi ia dirender
 * dengan chrome penuh: sidebar ~40 menu + navbar. Sejak gerbang setup mendarat,
 * susunan itu jadi JEBAKAN — setiap menu memicu gerbang dan melempar penggunanya
 * kembali ke wizard. Empat puluh pintu yang semuanya memantul ke tempat yang
 * sama, pada layar pertama yang pernah dilihat pengguna baru.
 *
 * Kerangka ini menyisakan satu jalan ke depan: wizard-nya sendiri. Tidak ada
 * navigasi ke halaman yang memang belum bisa dibuka, jadi tidak ada pantulan.
 *
 * Yang SENGAJA tetap ada adalah jalan KELUAR (UX · User Freedom): menu pengguna
 * — ganti bahasa, ubah kata sandi, keluar. Pengguna yang salah masuk akun, atau
 * yang butuh membaca layarnya dalam bahasanya sendiri, tidak boleh terkunci
 * hanya karena kami menyempitkan chrome-nya. Menunya komponen yang SAMA dengan
 * navbar (`UserMenu`), bukan tiruan: satu perilaku, satu tempat memperbaikinya.
 *
 * Sengaja BUKAN `AuthShell`: layar `(auth)` adalah kartu sempit (maks ~28rem)
 * untuk formulir pendek, sedangkan wizard ini punya tabel saldo awal, daftar
 * modul, dan panel neraca berjalan — kartu selebar itu akan menyiksanya. Yang
 * dipinjam adalah PRINSIPNYA (kepala ramping, tanpa navigasi), bukan markup-nya.
 */

import { signOut, useSession } from "next-auth/react";

import { UserMenu } from "@/components/layout/user-menu";
import { PageLoader } from "@/components/ui/loading";
import { APP_NAME } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

export function SetupShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const t = useT();

  if (status === "loading") {
    return <PageLoader message={t("common.loadingSession")} />;
  }

  // Tanpa sesi tidak ada yang bisa ditampilkan; halamannya sendiri (server)
  // yang mengarahkan ke /login lewat requirePagePermission.
  if (!session) return null;

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      {/* Kepala ramping: identitas aplikasi + jalan keluar. Tidak ada navigasi. */}
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
              aria-hidden="true"
            >
              SAI
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-sidebar-foreground">
                {APP_NAME}
              </span>
              <span className="block truncate text-xs text-sidebar-foreground/70">
                {t("setup.shellSubtitle")}
              </span>
            </span>
          </div>

          <UserMenu
            userName={session.user.name}
            // Wizard penyiapan selalu berjalan DI DALAM sebuah perusahaan, jadi
            // perannya ada; `?? ""` hanya menutup tipe nullable yang lahir dari
            // keadaan "belum memilih perusahaan" (issue #104).
            role={session.user.role ?? ""}
            onSignOut={() => signOut({ callbackUrl: "/login" })}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-6 lg:py-8">{children}</main>
    </div>
  );
}
