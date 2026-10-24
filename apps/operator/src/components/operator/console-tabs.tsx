/**
 * TAB HALAMAN KONSOL — satu komponen untuk setiap halaman konsol yang panjang
 * (`/tenants`, `/tenants/[id]`, `/settings`, `/scheduler`).
 *
 * ══ TAUTAN, BUKAN TAB AntD ═══════════════════════════════════════════════
 * Pilihan rumahnya sudah ada: chip tampilan `?view=` di `/content` — tautan
 * biasa, dirender server. `Tabs` AntD akan menyeret setiap halaman ini menjadi
 * pulau klien DAN memaksa semua panel dirender sekaligus lalu disembunyikan;
 * yang diminta justru kebalikannya: server hanya mengambil data tab AKTIF.
 * Karena itu tiap tab adalah `<Link>` ke `?tab=<id>` (aturan alamatnya di
 * `lib/operator/console-tabs.ts`), dan halaman yang menerima `searchParams`
 * memutuskan apa yang dibaca.
 *
 * Aksesibilitas: `<nav>` berlabel dengan daftar tautan; yang aktif membawa
 * `aria-current="page"` — pola navigasi, bukan `role="tablist"` (tablist
 * menjanjikan panah kiri/kanan yang mengganti panel tanpa navigasi, dan di
 * sini setiap tab memang navigasi). Tab & Enter bekerja tanpa JavaScript;
 * fokus memakai cincin bawaan tautan. Di layar sempit barisnya bergulir
 * mendatar, tidak membungkus — tab yang patah ke baris kedua terbaca sebagai
 * dua kelompok.
 *
 * Server component (tanpa `"use client"`): `Link` & `Badge` adalah daun klien
 * yang boleh dirender dari sini; berkas ini tidak menambah modul klien.
 */
import Link from "next/link";

import { Badge } from "@sai/ui/badge";

import { consoleTabHref } from "@op/lib/operator/console-tabs";

export interface ConsoleTab {
  id: string;
  label: string;
  /** Angka di lencana tab (mis. permintaan aktivasi terbuka). 0/undefined = tanpa lencana. */
  count?: number;
  /** Lencana kuning — angka yang menuntut tindakan, bukan sekadar jumlah. */
  attention?: boolean;
}

export interface ConsoleTabsProps {
  /** Label `<nav>` untuk pembaca layar. */
  label: string;
  basePath: string;
  tabs: readonly ConsoleTab[];
  active: string;
  defaultId: string;
  /** Nama parameter alamat — bawaan `tab`; `/tenants` memakai `status`. */
  param?: string;
  /** Parameter lain yang dibawa saat berpindah tab (pencarian, dsb.). */
  keep?: Record<string, string | undefined>;
}

export function ConsoleTabs({ label, basePath, tabs, active, defaultId, param, keep }: ConsoleTabsProps) {
  return (
    <nav aria-label={label} data-console-tabs="">
      <ul
        style={{
          display: "flex",
          gap: "var(--ant-margin-xxs)",
          margin: 0,
          padding: 0,
          listStyle: "none",
          overflowX: "auto",
          whiteSpace: "nowrap",
          borderBottom: "1px solid var(--ant-color-border-secondary)",
        }}
      >
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id} style={{ flex: "none" }}>
              <Link
                href={consoleTabHref(basePath, tab.id, { defaultId, param, keep })}
                aria-current={current ? "page" : undefined}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--ant-margin-xxs)",
                  /* Target sentuh 40px (MASTER.md). */
                  minHeight: 40,
                  paddingInline: "var(--ant-padding-sm)",
                  marginBottom: -1,
                  fontSize: "var(--ant-font-size)",
                  fontWeight: current ? 600 : 400,
                  color: current ? "var(--ant-color-text)" : "var(--ant-color-text-secondary)",
                  textDecoration: "none",
                  /* Aktif ditandai garis bawah DAN tebal huruf — tidak warna saja. */
                  borderBottom: current
                    ? "2px solid var(--ant-color-primary)"
                    : "2px solid transparent",
                }}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <Badge variant={tab.attention ? "warning" : "default"}>{tab.count}</Badge>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
