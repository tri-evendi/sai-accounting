"use client";

import { Menu } from "lucide-react";
import { AccountantModeToggle } from "@/components/layout/accountant-mode-toggle";
import { CompanyIndicator } from "@/components/layout/company-indicator";
import { HelpMenu } from "@/components/layout/help-menu";
import { ApprovalBadge } from "@/components/layout/approval-badge";
import { UserMenu } from "@/components/layout/user-menu";
import { useT } from "@/lib/i18n/client";

interface NavbarProps {
  userName: string;
  role: string;
  companyName: string | null;
  onMenuClick: () => void;
  onSignOut: () => void;
}

export function Navbar({ userName, role, companyName, onMenuClick, onSignOut }: NavbarProps) {
  const t = useT();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label={t("navbar.openMenu")}
          className="shrink-0 cursor-pointer text-muted-foreground transition-colors duration-150 hover:text-foreground lg:hidden"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>

        {/* Buku siapa yang sedang dibuka — pertanyaan terpenting sejak tiap PT
            punya basis datanya sendiri (#104). Ikut tampil di layar sempit;
            di sanalah orang paling mudah lupa. */}
        <CompanyIndicator companyName={companyName} />
      </div>

      {/* `shrink-0`: di 375px yang boleh menyempit adalah NAMA perusahaan
          (ia truncate), bukan target sentuh aksi-aksi ini. */}
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
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
