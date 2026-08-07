"use client";

/**
 * Kepala halaman standar — breadcrumb + judul + deskripsi + aksi di satu pola.
 * Disusun ulang di atas Ant Design pada issue #191 (fase B5); dipakai 87 berkas.
 *
 * ── Kenapa ini TETAP komponen aplikasi, bukan komponen AntD ────────────────
 * Ant Design v6 tidak punya `PageHeader`. Ia ada di v4, ditandai usang di v5,
 * lalu dipindahkan keluar ke ProComponents. Jadi yang dipakai di sini adalah
 * bahan-bahannya — `Breadcrumb`, `Typography`, `Flex` — sementara ATURANnya
 * tetap milik aplikasi ini.
 *
 * Aturan itu (lihat "Kepala Halaman & Breadcrumb" di
 * design-system/sai-accounting/MASTER.md) tidak berubah sedikit pun, dan
 * dijaga `tests/page-header.test.ts` yang TIDAK ikut disentuh issue ini:
 * - SEMUA halaman dashboard memakai komponen ini; jangan menulis `<h1>` atau
 *   memanggil `<Breadcrumb>` sendiri.
 * - Halaman tingkat-1 (item menu samping): tanpa `breadcrumbs`, judul = label
 *   menunya persis (boleh membawa jumlah, mis. "Pelanggan (12)").
 * - Halaman di bawahnya (baru/ubah/rincian): `breadcrumbs` dimulai dari label
 *   menu induk — kata yang sama dengan menu samping, bukan terjemahan lain.
 *
 * ── `breadcrumb.tsx` LARUT ke sini ─────────────────────────────────────────
 * Primitif `Breadcrumb` lama hanya punya satu pemakai: berkas ini. Ia sekarang
 * `Breadcrumb` AntD, dan tipe `BreadcrumbItem` ikut pindah ke sini supaya tidak
 * ada modul yang hidup hanya untuk mengekspor satu tipe.
 *
 * ── Butir breadcrumb tetap `<Link>` sungguhan ──────────────────────────────
 * `items[].href` milik AntD merender `<a href>` polos: pemuatan halaman penuh,
 * dan — lebih parah di aplikasi ini — jalur yang TIDAK dilewatkan penyelaras
 * bertenant `app-link.tsx`, sehingga "/invoices" menempuh pantulan 307 yang
 * justru dihapus issue #157. Karena itu tautannya dititipkan lewat `title`,
 * bukan `href`; AntD hanya menyumbang pemisah, jarak, dan warna butir terakhir.
 * Pola yang sama dipakai `pagination.tsx` (#189) dengan alasan yang sama.
 *
 * ── Kenapa `<h1>` 24px, bukan `Title level={1}` apa adanya ─────────────────
 * `fontSizeHeading1` AntD adalah 38px — ukuran judul halaman pendaratan, bukan
 * kepala layar kerja yang di bawahnya ada tabel. Yang dipertahankan adalah
 * ukuran yang sudah berjalan (24px = `fontSizeHeading3`), dan yang TIDAK boleh
 * ikut berubah adalah tingkat elemennya: judul halaman wajib `<h1>` supaya
 * struktur heading halaman tetap punya akar. Jadi levelnya 1, ukurannya token
 * heading-3 — bukan `level={3}`, yang akan menghasilkan `<h3>` tanpa `<h1>` di
 * atasnya.
 */

import type { ReactNode } from "react";
import { Breadcrumb, Flex, Typography, theme } from "antd";

import { Link } from "@/components/ui/app-link";

const { Title, Text } = Typography;

export interface BreadcrumbItem {
  label: string;
  /** Tanpa `href` = halaman ini (butir terakhir), bukan tautan. */
  href?: string;
}

export interface PageHeaderProps {
  /** Isi `<h1>` — label menu/bahasa tugas, boleh ReactNode untuk jumlah dsb. */
  title: ReactNode;
  /** Jejak lokasi untuk halaman di bawah tingkat-1; item terakhir = halaman ini. */
  breadcrumbs?: BreadcrumbItem[];
  /** Satu-dua kalimat penjelas di bawah judul (opsional). */
  description?: ReactNode;
  /** Badge status di samping judul, mis. <Badge>Aktif</Badge> (opsional). */
  badge?: ReactNode;
  /** Tombol aksi rata-kanan, mis. "+ Buat Tagihan" (opsional). */
  actions?: ReactNode;
}

export function PageHeader({
  title,
  breadcrumbs,
  description,
  badge,
  actions,
}: PageHeaderProps) {
  const { token } = theme.useToken();

  return (
    <header style={{ marginBottom: token.marginLG }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb
          style={{ marginBottom: token.margin }}
          items={breadcrumbs.map((item) => ({
            title: item.href ? <Link href={item.href}>{item.label}</Link> : item.label,
          }))}
        />
      )}

      <Flex wrap align="flex-start" justify="space-between" gap={token.marginSM}>
        <div style={{ minWidth: 0 }}>
          <Flex wrap align="center" gap={token.marginSM}>
            <Title
              level={1}
              style={{ fontSize: token.fontSizeHeading3, marginBottom: 0 }}
            >
              {title}
            </Title>
            {badge}
          </Flex>
          {description && (
            <Text
              type="secondary"
              style={{ display: "block", marginTop: token.marginXXS }}
            >
              {description}
            </Text>
          )}
        </div>
        {actions && (
          <Flex wrap align="center" gap={token.marginXS} style={{ flexShrink: 0 }}>
            {actions}
          </Flex>
        )}
      </Flex>
    </header>
  );
}
