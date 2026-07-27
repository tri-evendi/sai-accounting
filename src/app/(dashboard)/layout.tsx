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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        role={session.user.role}
        accountantMode={session.user.accountantMode}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar
          userName={session.user.name}
          role={session.user.role}
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
      <CommandPalette role={session.user.role} accountantMode={session.user.accountantMode} />
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
