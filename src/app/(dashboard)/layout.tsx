"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        role={role}
        accountantMode={session.user.accountantMode}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar
          userName={session.user.name}
          role={role}
          onMenuClick={() => setSidebarOpen(true)}
          onSignOut={() => signOut({ callbackUrl: "/login" })}
        />
        {/* Konten memenuhi lebar penuh area utama (tanpa batas maks) — sesuai
            permintaan. Padding tepi tetap agar tidak menempel ke sisi. */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
      {/* issue #21 — tur panduan: jalan sekali pada kunjungan pertama halaman
          yang punya tur, dan bisa diputar ulang dari menu Bantuan. */}
      <GuidedTour />
      {/* Ctrl/⌘+K — cari halaman dengan mengetik. Ditempel di layout (bukan per
          halaman) supaya pintasannya hidup di seluruh dashboard. Isinya berasal
          dari sumber yang sama dengan menu samping. */}
      <CommandPalette role={role} accountantMode={session.user.accountantMode} />
    </div>
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
