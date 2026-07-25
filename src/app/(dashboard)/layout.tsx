"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { ToastProvider } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { GuidedTour } from "@/components/help/guided-tour";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (status === "loading") {
    return <PageLoader message="Memuat sesi..." />;
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
        <main className="flex-1 overflow-y-auto">
          {/* Batas lebar konten: di layar biasa (≤ ~1900px) praktis penuh, dan
              hanya menahan peregangan berlebihan di monitor ultra-lebar
              (2000px+) agar teks/field tak melar terlalu lebar — konten tetap
              berpusat, bukan menumpuk di kiri. */}
          <div className="mx-auto w-full max-w-[1600px] p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
      {/* issue #21 — tur panduan: jalan sekali pada kunjungan pertama halaman
          yang punya tur, dan bisa diputar ulang dari menu Bantuan. */}
      <GuidedTour />
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
