"use client";

/**
 * Navigasi konsol operator (issue #154) — client kecil hanya untuk menandai
 * tab aktif lewat `usePathname`; daftar tautannya disusun layout server.
 *
 * SENGAJA bukan `components/layout/sidebar.tsx`: konsol operator adalah
 * bidang terpisah yang kelak bisa diekstrak jadi aplikasi sendiri, jadi ia
 * tidak boleh menyeret chrome (menu, sesi, izin) aplikasi pelanggan.
 */

import { Link } from "@/components/ui/app-link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface OperatorNavItem {
  href: string;
  label: string;
  /** Awalan jalur yang membuat tab ini aktif (rincian ikut daftar induknya). */
  activePrefixes: string[];
}

export function OperatorNav({ items, ariaLabel }: { items: OperatorNavItem[]; ariaLabel: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={ariaLabel} className="flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          item.activePrefixes.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
          );
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-200",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
