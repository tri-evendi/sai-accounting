"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Package,
  PackagePlus,
  ClipboardCheck,
  DollarSign,
  Truck,
  Users,
  Upload,
  Settings,
  UserCog,
  BookOpen,
  BookText,
  BookMarked,
  Library,
  BarChart3,
  HandCoins,
  Wallet,
  Coins,
  Lock,
  Scale,
  Ship,
  Undo2,
  Building2,
  Target,
  Wand2,
  FileSpreadsheet,
  PackageCheck,
  KeyRound,
  ShieldCheck,
  ShoppingCart,
  SquarePen,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import {
  NAV_HOME,
  activeNavHref,
  isNavItemVisible,
  visibleNavGroups,
  visibleNavHrefs,
  type NavItem,
} from "@/lib/nav";

interface SidebarProps {
  role: string;
  // ─── issue #11 — raw Mode Akuntan preference (null = follow role default) ───
  accountantMode?: boolean | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Menu dikelompokkan per AREA TUGAS (issue #2) dengan label bahasa Indonesia
 * (issue #1). Daftar & penyaringannya hidup di `src/lib/nav.ts` yang murni dan
 * teruji; komponen ini hanya menggambar — termasuk memetakan nama ikon ke
 * komponen lucide (pola yang sama dengan Pusat Laporan).
 */
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  Receipt,
  Package,
  PackagePlus,
  ClipboardCheck,
  DollarSign,
  Truck,
  Users,
  Upload,
  Settings,
  UserCog,
  BookOpen,
  BookText,
  BookMarked,
  Library,
  BarChart3,
  HandCoins,
  Wallet,
  Coins,
  Lock,
  Scale,
  Ship,
  Undo2,
  Building2,
  Target,
  Wand2,
  FileSpreadsheet,
  PackageCheck,
  KeyRound,
  ShieldCheck,
  ShoppingCart,
  SquarePen,
};

/**
 * Set izin EFEKTIF milik pengguna (issue #73): matriks bawaan + override DB,
 * dibaca sekali per pemuatan sidebar dari `/api/user/permissions`. Sebelum
 * jawabannya tiba (atau bila permintaannya gagal) nilainya `undefined` dan
 * penyaringan nav jatuh ke `can()` matriks bawaan — perilaku lama. TAMPILAN
 * SAJA: halaman tujuan tetap dijaga `requirePagePermission` server-side.
 */
function useEffectivePermissions(role: string): ReadonlySet<string> | undefined {
  const [allowed, setAllowed] = useState<ReadonlySet<string> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/permissions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { permissions?: string[] } | null) => {
        if (!cancelled && Array.isArray(data?.permissions)) {
          setAllowed(new Set(data.permissions));
        }
      })
      .catch(() => {
        // Biarkan undefined — fallback matriks bawaan.
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  return allowed;
}

function NavLink({
  item,
  active,
  onClose,
}: {
  item: NavItem;
  active: boolean;
  onClose: () => void;
}) {
  const Icon = ICONS[item.icon] ?? LayoutDashboard;
  return (
    <Link
      href={item.href}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground border-l-4 border-sidebar-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ role, accountantMode, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  // issue #11 — permukaan akuntansi (Catatan Transaksi, Rincian per Akun, Daftar
  // Akun) hanya muncul bila peran mengizinkan DAN Mode Akuntan efektif ON. Aturan
  // itu hidup di `isNavItemVisible`, satu keputusan dengan penjaga halaman.
  const user = { role, accountantMode };
  // issue #73 — menu mengikuti matriks EFEKTIF (override dari /permissions)
  // begitu termuat; sebelumnya memakai matriks bawaan di bundle.
  const allowed = useEffectivePermissions(role);
  const groups = visibleNavGroups(user, allowed);
  const homeVisible = isNavItemVisible(NAV_HOME, user, allowed);
  // Kecocokan terpanjang: /inventory/opname menyorot "Hitung Ulang Stok" saja.
  const activeHref = activeNavHref(pathname, visibleNavHrefs(user, allowed));

  return (
    <>
      {/* Backdrop for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-sidebar-border">
          <Link href="/dashboard" className="text-lg font-bold">
            {APP_NAME}
          </Link>
          <button
            onClick={onClose}
            aria-label="Tutup menu"
            className="lg:hidden cursor-pointer text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation — dikelompokkan per area tugas */}
        <nav
          aria-label="Menu utama"
          data-tour="menu-tugas"
          className="flex-1 overflow-y-auto px-3 py-4"
        >
          {homeVisible && (
            <NavLink item={NAV_HOME} active={activeHref === NAV_HOME.href} onClose={onClose} />
          )}

          {groups.map((group) => (
            <div key={group.id} className="mt-5 first:mt-4">
              <h2 className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                {group.label}
              </h2>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={activeHref === item.href}
                    onClose={onClose}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Version */}
        <div className="shrink-0 border-t border-sidebar-border px-6 py-3">
          <p className="text-xs text-sidebar-foreground/60">SAI Management</p>
          <p className="text-xs text-sidebar-foreground/50">v0.1.0</p>
        </div>
      </aside>
    </>
  );
}
