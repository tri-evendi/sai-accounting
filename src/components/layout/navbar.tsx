"use client";

import { Menu, LogOut, User } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { AccountantModeToggle } from "@/components/layout/accountant-mode-toggle";
import { HelpMenu } from "@/components/layout/help-menu";

interface NavbarProps {
  userName: string;
  role: string;
  onMenuClick: () => void;
  onSignOut: () => void;
}

export function Navbar({ userName, role, onMenuClick, onSignOut }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        aria-label="Buka menu"
        className="cursor-pointer text-gray-500 transition-colors duration-150 hover:text-gray-700 lg:hidden"
      >
        <Menu className="h-6 w-6" aria-hidden="true" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3 sm:gap-4">
        {/* issue #21 — Bantuan: Kamus Istilah + putar ulang tur panduan */}
        <HelpMenu />
        {/* issue #11 — Mode Akuntan toggle (primary surface) */}
        <AccountantModeToggle />
        {/* Identitas pengguna disembunyikan di layar sempit agar tombol Bantuan,
            Mode Akuntan, dan Keluar tetap muat; datanya tetap ada di Pengaturan. */}
        <div className="hidden items-center gap-2 text-sm sm:flex">
          <User className="h-4 w-4 text-gray-400" aria-hidden="true" />
          <span className="font-medium text-gray-700">{userName}</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {ROLE_LABELS[role as Role] || role}
          </span>
        </div>
        <button
          onClick={onSignOut}
          className="flex cursor-pointer items-center gap-1 rounded-md px-3 py-2 text-sm text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Keluar</span>
          <span className="sr-only sm:hidden">Keluar</span>
        </button>
      </div>
    </header>
  );
}
