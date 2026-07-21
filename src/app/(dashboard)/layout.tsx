"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { ToastProvider } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (status === "loading") {
    return <PageLoader message="Loading session..." />;
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
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
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
