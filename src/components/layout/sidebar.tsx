"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ShieldCheck,
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
  ShieldCheck,
};

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
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
        active
          ? "bg-blue-600 text-white border-l-4 border-white"
          : "text-gray-300 hover:bg-gray-800 hover:text-white"
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
  const groups = visibleNavGroups(user);
  const homeVisible = isNavItemVisible(NAV_HOME, user);
  // Kecocokan terpanjang: /inventory/opname menyorot "Hitung Ulang Stok" saja.
  const activeHref = activeNavHref(pathname, visibleNavHrefs(user));

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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-gray-900 text-white transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-gray-800">
          <Link href="/dashboard" className="text-lg font-bold">
            {APP_NAME}
          </Link>
          <button
            onClick={onClose}
            aria-label="Tutup menu"
            className="lg:hidden cursor-pointer text-gray-400 transition-colors duration-150 hover:text-white"
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
              <h2 className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
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
        <div className="shrink-0 border-t border-gray-800 px-6 py-3">
          <p className="text-xs text-gray-500">SAI Management</p>
          <p className="text-xs text-gray-600">v0.1.0</p>
        </div>
      </aside>
    </>
  );
}
