"use client";

/**
 * Menu pengguna di top bar.
 *
 * Sebelumnya identitas pengguna (nama + peran) dan tombol "Keluar" berdiri
 * sendiri-sendiri sejajar di top bar — memenuhi bar dan mencampur "informasi"
 * (siapa saya) dengan "aksi" (keluar). Kini keduanya diringkas ke satu menu:
 * satu tombol avatar membuka daftar berisi identitas + aksi akun (ubah kata
 * sandi, keluar). Pola dropdown-nya sama dengan Menu Bantuan: `<button>`/
 * `<Link>` sungguhan, ditutup Escape & klik di luar, fokus terlihat.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, KeyRound, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/constants";

/** Inisial dari nama untuk avatar (maks 2 huruf), fallback ikon bila kosong. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function UserMenu({
  userName,
  role,
  onSignOut,
}: {
  userName: string;
  role: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const roleLabel = ROLE_LABELS[role as Role] || role;
  const abbr = initials(userName);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const itemClass =
    "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Akun: ${userName} (${roleLabel})`}
        className={cn(
          "flex h-10 cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-2 text-sm font-medium transition-colors duration-150 sm:pr-3",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          open
            ? "border-primary/30 bg-primary/10"
            : "border-border bg-card hover:bg-muted"
        )}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          aria-hidden="true"
        >
          {abbr || <User className="h-4 w-4" />}
        </span>
        <span className="hidden max-w-[10rem] truncate text-foreground sm:inline">{userName}</span>
        <ChevronDown
          className={cn("hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 sm:block", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu akun"
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {/* Identitas — informasi, bukan aksi. */}
          <div className="flex items-center gap-3 border-b border-border px-3 py-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
              aria-hidden="true"
            >
              {abbr || <User className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground">{userName}</span>
              <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {roleLabel}
              </span>
            </span>
          </div>

          {/* Aksi akun */}
          <div className="p-1">
            <Link
              role="menuitem"
              href="/change-password"
              onClick={() => setOpen(false)}
              className={cn(itemClass, "text-foreground hover:bg-muted")}
            >
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>Ubah Kata Sandi</span>
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className={cn(itemClass, "text-destructive-strong hover:bg-destructive-soft")}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
