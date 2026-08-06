"use client";

/**
 * Kerangka dasbor — `Layout` AntD (PR penutup #201/#240).
 *
 * Cangkangnya sendiri tertinggal saat #193 memindahkan Sidebar ke
 * `Layout.Sider` dan Navbar ke `Layout.Header`: keduanya sudah AntD, tetapi
 * masih berdiri di dalam `<div className="flex …">` tulisan tangan. Berkas ini
 * bukan halaman dan bukan komponen, jadi ia tidak masuk lingkup issue mana pun
 * — dan tiga kelas terakhirnya diselesaikan di sini, dengan susunan yang SAMA
 * dengan `tenant/platform-shell.tsx` (`Layout` > `Sider` + `Layout` > `Header`
 * + `Content`).
 *
 * `Layout.Content` merender `<main>` sendiri, jadi tengara halaman tidak
 * hilang. Padding isinya mengikuti `Grid.useBreakpoint()` — pengganti
 * `p-4 lg:p-6`; `lg` AntD adalah 992px, bukan 1024px milik Tailwind, dan itu
 * satu-satunya pergeseran yang disengaja di sini.
 */
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { Grid, Layout, theme } from "antd";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { ToastProvider } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { GuidedTour } from "@/components/help/guided-tour";
import { CommandPalette } from "@/components/layout/command-palette";
import { useT } from "@/lib/i18n/client";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useT();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();

  if (status === "loading") {
    return <PageLoader message={t("common.loadingSession")} />;
  }

  if (!session) return null;

  /*
   * Sesi tanpa PERAN berarti pengguna belum memilih perusahaan (issue #104):
   * peran datang dari keanggotaan, jadi selama belum ada perusahaan aktif tidak
   * ada peran untuk menyusun menu. Penjaga halaman di bawah tata letak ini
   * sedang memantulkannya ke /select-company; sementara itu yang benar untuk
   * ditampilkan adalah keadaan memuat — bukan menu kosong yang terlihat seperti
   * "Anda tidak punya akses apa pun".
   */
  const role = session.user.role;
  if (!role) return <PageLoader message={t("common.loadingSession")} />;

  return (
    /*
     * ⚠ `hasSider` DITULIS, tidak dibiarkan ditebak. `Layout` menyimpulkan
     * arah barisnya dengan dua cara: anak yang bertipe `Layout.Sider` PERSIS,
     * atau pendaftaran lewat context yang baru terjadi di `useEffect` milik
     * `Sider`. `<Sidebar>` di sini pembungkus, bukan `Sider` telanjang — jadi
     * tanpa prop ini render PERTAMA menumpuk menu di ATAS isi halaman, lalu
     * melompat ke dua kolom sepersekian detik kemudian, pada setiap pemuatan
     * penuh dasbor.
     */
    <Layout hasSider style={{ height: "100vh" }}>
      <Sidebar
        role={role}
        accountantMode={session.user.accountantMode}
        companyCount={session.user.companyCount}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <Layout>
        <Navbar
          userName={session.user.name}
          role={role}
          companyName={session.user.companyName}
          companyCount={session.user.companyCount}
          onMenuClick={() => setSidebarOpen(true)}
          onSignOut={() => signOut({ callbackUrl: "/login" })}
        />
        {/* Konten memenuhi lebar penuh area utama (tanpa batas maks) — sesuai
            permintaan. Padding tepi tetap agar tidak menempel ke sisi.
            `Layout.Content` merender `<main>`-nya sendiri. */}
        <Layout.Content
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: screens.lg ? token.paddingLG : token.padding,
          }}
        >
          {children}
        </Layout.Content>
      </Layout>
      {/* issue #21 — tur panduan: jalan sekali pada kunjungan pertama halaman
          yang punya tur, dan bisa diputar ulang dari menu Bantuan. */}
      <GuidedTour />
      {/* Ctrl/⌘+K — cari halaman dengan mengetik. Ditempel di layout (bukan per
          halaman) supaya pintasannya hidup di seluruh dashboard. Isinya berasal
          dari sumber yang sama dengan menu samping. */}
      <CommandPalette
        role={role}
        accountantMode={session.user.accountantMode}
        companyCount={session.user.companyCount}
      />
    </Layout>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <ToastProvider>
        <DashboardShell>{children}</DashboardShell>
      </ToastProvider>
    </SessionProvider>
  );
}
