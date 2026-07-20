"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Package,
  DollarSign,
  Truck,
  Users,
  Upload,
  Settings,
  UserCog,
  BookOpen,
  BookText,
  Library,
  BarChart3,
  HandCoins,
  Wallet,
  Coins,
  Lock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

interface SidebarProps {
  role: string;
  open: boolean;
  onClose: () => void;
}

const allNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["bos", "core", "ptg"] },
  { href: "/contracts", label: "Contracts", icon: FileText, roles: ["bos", "core"] },
  { href: "/invoices", label: "Invoices", icon: Receipt, roles: ["bos", "core"] },
  { href: "/receivables", label: "Piutang", icon: HandCoins, roles: ["bos", "core"] },
  { href: "/payables", label: "Utang", icon: Wallet, roles: ["bos", "core"] },
  { href: "/advances", label: "Uang Muka", icon: Coins, roles: ["bos", "core"] },
  { href: "/inventory", label: "Inventory", icon: Package, roles: ["bos", "core", "ptg"] },
  { href: "/finance", label: "Finance", icon: DollarSign, roles: ["bos", "core"] },
  { href: "/accounts", label: "Akun Perkiraan", icon: BookOpen, roles: ["bos"] },
  { href: "/journal", label: "Jurnal Umum", icon: BookText, roles: ["bos"] },
  { href: "/ledger", label: "Buku Besar", icon: Library, roles: ["bos"] },
  { href: "/reports", label: "Laporan", icon: BarChart3, roles: ["bos"] },
  { href: "/periods", label: "Tutup Periode", icon: Lock, roles: ["bos"] },
  { href: "/suppliers", label: "Suppliers", icon: Truck, roles: ["bos", "core"] },
  { href: "/customers", label: "Customers", icon: Users, roles: ["bos", "core"] },
  { href: "/documents", label: "Documents", icon: Upload, roles: ["bos", "core"] },
  { href: "/users", label: "Users", icon: UserCog, roles: ["bos"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["bos", "core", "ptg"] },
];

export function Sidebar({ role, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const navItems = allNavItems.filter((item) => item.roles.includes(role));

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
          "fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-gray-800">
          <Link href="/dashboard" className="text-lg font-bold">
            {APP_NAME}
          </Link>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600 text-white border-l-4 border-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Version */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-800 px-6 py-3">
          <p className="text-xs text-gray-500">SAI Management</p>
          <p className="text-xs text-gray-600">v0.1.0</p>
        </div>
      </aside>
    </>
  );
}
