"use client";

import { Menu } from "lucide-react";
import { AccountantModeToggle } from "@/components/layout/accountant-mode-toggle";
import { HelpMenu } from "@/components/layout/help-menu";
import { ApprovalBadge } from "@/components/layout/approval-badge";
import { UserMenu } from "@/components/layout/user-menu";
import { useT } from "@/lib/i18n/client";

interface NavbarProps {
  userName: string;
  role: string;
  onMenuClick: () => void;
  onSignOut: () => void;
}

export function Navbar({ userName, role, onMenuClick, onSignOut }: NavbarProps) {
  const t = useT();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        aria-label={t("navbar.openMenu")}
        className="cursor-pointer text-muted-foreground transition-colors duration-150 hover:text-foreground lg:hidden"
      >
        <Menu className="h-6 w-6" aria-hidden="true" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3 sm:gap-4">
        {/* issue #25 — antrean persetujuan / kabar keputusan (sembunyi bila nol) */}
        <ApprovalBadge />
        {/* issue #21 — Bantuan: Kamus Istilah + putar ulang tur panduan */}
        <HelpMenu />
        {/* issue #11 — Mode Akuntan toggle (primary surface) */}
        <AccountantModeToggle />
        {/* Identitas + aksi akun (ubah sandi, keluar) diringkas ke satu menu
            avatar — memisahkan "informasi" dari "aksi" dan merapikan top bar. */}
        <UserMenu userName={userName} role={role} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
