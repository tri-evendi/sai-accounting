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
import { theme } from "antd";

export interface OperatorNavItem {
  href: string;
  label: string;
  /** Awalan jalur yang membuat tab ini aktif (rincian ikut daftar induknya). */
  activePrefixes: string[];
}

export function OperatorNav({ items, ariaLabel }: { items: OperatorNavItem[]; ariaLabel: string }) {
  const pathname = usePathname();
  const { token } = theme.useToken();

  return (
    <nav
      aria-label={ariaLabel}
      style={{ display: "flex", gap: token.marginXXS, overflowX: "auto" }}
    >
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
            style={{
              display: "inline-flex",
              alignItems: "center",
              /* Target sentuh minimum MASTER.md; sama dengan `controlHeight`. */
              minHeight: token.controlHeight,
              paddingInline: token.paddingSM,
              /* Garis bawah SELALU digambar — yang berubah warnanya, bukan
                 ketebalannya. Tab aktif yang menambah 2px pada baris akan
                 menggeser tetangganya setiap kali halaman berganti. */
              borderBottom: `${token.lineWidthBold}px solid ${
                active ? token.colorPrimary : "transparent"
              }`,
              fontWeight: 500,
              whiteSpace: "nowrap",
              color: active ? token.colorText : token.colorTextSecondary,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
