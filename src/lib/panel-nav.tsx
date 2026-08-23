/**
 * MENU PANEL AKUN — disusun SEKALI, dari matriks izin.
 *
 * ══ KENAPA IA PINDAH KE SINI ═══════════════════════════════════════════════
 * Daftar ini dulu tinggal di dalam `(tenant)/(panel)/layout.tsx`, dan kepala
 * berkas itu memberi alasannya dengan tegas: kulit (`PlatformShell`) hanya
 * MENGGAMBAR, sedangkan yang memutuskan "siapa melihat apa" harus satu tempat —
 * kulit yang ikut membaca izin menaruh keputusan itu di tempat kedua yang tidak
 * diuji siapa pun, dan butir menu menuju halaman yang akan memantulkan
 * pemiliknya adalah bentuk kebocoran tersendiri: ia memberi tahu orang bahwa
 * ruangan itu ada.
 *
 * Alasan itu tidak berubah; yang berubah adalah jumlah PEMANGGILnya. Sejak
 * wisaya penyiapan memakai kulit yang sama, ada dua layout yang membutuhkan
 * daftar ini — dan menyalinnya ke yang kedua akan melanggar persis kalimat di
 * atas. Jadi daftarnya naik satu tingkat, dan kedua layout memanggilnya.
 *
 * `.tsx` karena butirnya membawa ikon; tidak ada komponen yang diekspor dari
 * sini.
 */
import {
  BookOutlined,
  HomeOutlined,
  IdcardOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WalletOutlined,
} from "@ant-design/icons";

import type { PlatformNavItem } from "@/components/tenant/platform-shell";
import type { TranslateFn } from "@/lib/i18n/client";
import { tenantCan } from "@/lib/tenant-authz";

/** Bentuk seminimal yang dibutuhkan — sama dengan yang diterima `tenantCan`. */
type PanelTenant = { role?: string | null } | null | undefined;

export function panelNav(tenant: PanelTenant, t: TranslateFn): PlatformNavItem[] {
  return [
    {
      href: "/platform",
      label: t("platform.title"),
      icon: <HomeOutlined style={{ fontSize: 16 }} />,
      /* PERSIS: tanpa ini butir pendaratan menyala di setiap anak-rute, sebab
         semuanya berawalan `/platform`. */
      exact: true,
    },
    ...(tenantCan(tenant, "tenant.settings")
      ? [
          {
            href: "/platform/account",
            label: t("platform.accountTitle"),
            icon: <IdcardOutlined style={{ fontSize: 16 }} />,
          },
        ]
      : []),
    ...(tenantCan(tenant, "tenant.member.invite")
      ? [
          {
            href: "/platform/team",
            label: t("platform.teamHeading"),
            icon: <TeamOutlined style={{ fontSize: 16 }} />,
          },
        ]
      : []),
    ...(tenantCan(tenant, "tenant.billing")
      ? [
          {
            href: "/platform/billing",
            label: t("tenantSettings.title"),
            icon: <WalletOutlined style={{ fontSize: 16 }} />,
          },
        ]
      : []),
    ...(tenantCan(tenant, "tenant.export")
      ? [
          {
            href: "/platform/privacy",
            label: t("tenantSettings.privacyHeading"),
            icon: <SafetyCertificateOutlined style={{ fontSize: 16 }} />,
          },
        ]
      : []),
    ...(tenantCan(tenant, "company.create")
      ? [
          {
            href: "/companies/new",
            label: t("companies.newTitle"),
            icon: <PlusOutlined style={{ fontSize: 16 }} />,
          },
        ]
      : []),
    /*
     * Dokumentasi — TANPA penjaga izin, dan itu bukan kelalaian.
     *
     * `/docs` permukaan PUBLIK: ia sengaja terbuka tanpa sesi sama sekali,
     * jadi tidak ada izin tenant yang bisa dideklarasikan untuknya dan
     * `tenantCan` di sini justru akan menyembunyikan pintu yang siapa pun
     * boleh lewati. Ia berdiri PALING BAWAH karena ia bukan pekerjaan
     * melainkan rujukan — dibuka saat sesuatu tidak dimengerti, bukan sebagai
     * langkah dalam sebuah alur.
     *
     * Sejak `/docs` punya dua kulit, menekannya dari sini TIDAK lagi melempar
     * pengguna keluar dari panel: yang bersesi tetap mendapat menu samping ini
     * beserta jalan pulangnya.
     */
    {
      href: "/docs",
      label: t("docs.title"),
      icon: <BookOutlined style={{ fontSize: 16 }} />,
    },
  ];
}
