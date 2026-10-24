/**
 * MENU KONSOL OPERATOR — disusun SEKALI, di luar kulitnya.
 *
 * Pola yang sama dengan `lib/panel-nav.tsx` dan untuk alasan yang sama: kulit
 * (`OperatorShell`) hanya MENGGAMBAR; yang memutuskan butir apa yang ada —
 * beserta urutan dan pengelompokannya — tinggal di satu berkas yang bisa
 * dibaca tanpa membuka komponen.
 *
 * Bedanya dengan `panelNav`: TIDAK ADA cabang izin di sini, dan itu tetap
 * benar sesudah peran operator lahir (migration kendali 0004): peran membagi
 * TINDAKAN, bukan BACAAN (`lib/operator/roles.ts`) — setiap operator boleh
 * membuka setiap halaman. Yang disembunyikan per peran adalah tombol & formulir
 * di dalam halamannya, dan yang menolaknya adalah action-nya sendiri.
 *
 * `.tsx` karena butirnya membawa ikon; tidak ada komponen yang diekspor.
 */
import {
  ClockCircleOutlined,
  NotificationOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  AuditOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  HistoryOutlined,
  KeyOutlined,
  LayoutOutlined,
  MailOutlined,
  PictureOutlined,
  FileImageOutlined,
  SettingOutlined,
  TeamOutlined,
  FileSearchOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";

import type { OperatorShellNavItem } from "@op/components/operator/operator-shell";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";

/** Bentuk seminimal yang dibutuhkan — `getT()` maupun `useT()` keduanya cocok. */
type TerjemahFn = (key: DictionaryKey) => string;

const UKURAN_IKON = { fontSize: 16 } as const;

export function operatorNav(t: TerjemahFn): OperatorShellNavItem[] {
  const ringkasan = t("operator.nav.groupSummary");
  const pelanggan = t("operator.nav.groupCustomers");
  const situs = t("operator.nav.groupSite");
  const sistem = t("operator.nav.groupSystem");

  return [
    {
      href: "/",
      label: t("operator.nav.overview"),
      icon: <DashboardOutlined style={UKURAN_IKON} />,
      group: ringkasan,
      /* PERSIS: tanpa ini butir pendaratan menyala di setiap anak-rute, sebab
         semuanya berawalan `/`. */
      exact: true,
    },
    {
      href: "/tenants",
      label: t("operator.nav.tenants"),
      icon: <TeamOutlined style={UKURAN_IKON} />,
      group: pelanggan,
    },
    {
      href: "/deletions",
      label: t("operator.nav.deletions"),
      icon: <DeleteOutlined style={UKURAN_IKON} />,
      group: pelanggan,
    },
    {
      href: "/plans",
      label: t("operator.nav.plans"),
      icon: <AppstoreOutlined style={UKURAN_IKON} />,
      group: pelanggan,
    },
    {
      href: "/licences",
      label: t("operator.nav.licences"),
      icon: <SafetyCertificateOutlined style={UKURAN_IKON} />,
      group: pelanggan,
    },
    {
      href: "/efaktur",
      label: t("operator.nav.efaktur"),
      icon: <AuditOutlined style={UKURAN_IKON} />,
      group: pelanggan,
    },
    {
      href: "/reconciliation",
      label: t("operator.nav.reconciliation"),
      icon: <FileProtectOutlined style={UKURAN_IKON} />,
      group: pelanggan,
    },
    {
      href: "/content",
      label: t("operator.nav.content"),
      icon: <FileTextOutlined style={UKURAN_IKON} />,
      group: situs,
    },
    {
      /* Tampilan halaman depan: seksi, pengumuman, demo, FAQ (migration
         platform 0014) — halaman sendiri, bukan tab `/settings`. */
      href: "/landing",
      label: t("operator.nav.landing"),
      icon: <LayoutOutlined style={UKURAN_IKON} />,
      group: situs,
      /* PERSIS: `/landing/media` punya butirnya sendiri di bawah. */
      exact: true,
    },
    {
      /* Gambar & bukti sosial halaman depan (migration platform 0015). */
      href: "/landing/media",
      label: t("operator.nav.landingMedia"),
      icon: <FileImageOutlined style={UKURAN_IKON} />,
      group: situs,
    },
    {
      href: "/settings",
      label: t("operator.nav.settings"),
      icon: <SettingOutlined style={UKURAN_IKON} />,
      group: situs,
    },
    {
      href: "/brand",
      label: t("operator.nav.brand"),
      icon: <PictureOutlined style={UKURAN_IKON} />,
      group: situs,
    },
    {
      href: "/scheduler",
      label: t("operator.nav.scheduler"),
      icon: <ClockCircleOutlined style={UKURAN_IKON} />,
      group: sistem,
    },
    {
      href: "/conformance",
      label: t("operator.nav.conformance"),
      icon: <FileSearchOutlined style={UKURAN_IKON} />,
    },
    {
      href: "/status-notices",
      label: t("operator.nav.statusNotices"),
      icon: <NotificationOutlined style={UKURAN_IKON} />,
      group: sistem,
    },
    {
      href: "/backup",
      label: t("operator.nav.backups"),
      icon: <CloudServerOutlined style={UKURAN_IKON} />,
      group: sistem,
    },
    {
      href: "/mail",
      label: t("operator.nav.mail"),
      icon: <MailOutlined style={UKURAN_IKON} />,
      group: sistem,
    },
    {
      href: "/accounts",
      label: t("operator.nav.accounts"),
      icon: <KeyOutlined style={UKURAN_IKON} />,
      group: sistem,
    },
    {
      href: "/audit",
      label: t("operator.nav.audit"),
      icon: <HistoryOutlined style={UKURAN_IKON} />,
      group: sistem,
    },
  ];
}
