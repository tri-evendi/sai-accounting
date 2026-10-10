/**
 * MENU KONSOL OPERATOR — disusun SEKALI, di luar kulitnya.
 *
 * Pola yang sama dengan `lib/panel-nav.tsx` dan untuk alasan yang sama: kulit
 * (`OperatorShell`) hanya MENGGAMBAR; yang memutuskan butir apa yang ada —
 * beserta urutan dan pengelompokannya — tinggal di satu berkas yang bisa
 * dibaca tanpa membuka komponen.
 *
 * Bedanya dengan `panelNav`: TIDAK ADA cabang izin di sini. Bidang operator
 * tidak punya matriks peran — siapa pun yang lolos `OPERATOR_HOST` + daftar IP
 * + kata sandi + TOTP memegang seluruh konsol (#154). Menambahkan `can(...)`
 * palsu di sini akan menyiratkan pembagian yang tidak ada.
 *
 * `.tsx` karena butirnya membawa ikon; tidak ada komponen yang diekspor.
 */
import {
  ClockCircleOutlined,
  DashboardOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  HistoryOutlined,
  MailOutlined,
  TeamOutlined,
} from "@ant-design/icons";

import type { OperatorShellNavItem } from "@/components/operator/operator-shell";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

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
      href: "/operator",
      label: t("operator.nav.overview"),
      icon: <DashboardOutlined style={UKURAN_IKON} />,
      group: ringkasan,
      /* PERSIS: tanpa ini butir pendaratan menyala di setiap anak-rute, sebab
         semuanya berawalan `/operator`. */
      exact: true,
    },
    {
      href: "/operator/tenants",
      label: t("operator.nav.tenants"),
      icon: <TeamOutlined style={UKURAN_IKON} />,
      group: pelanggan,
    },
    {
      href: "/operator/reconciliation",
      label: t("operator.nav.reconciliation"),
      icon: <FileProtectOutlined style={UKURAN_IKON} />,
      group: pelanggan,
    },
    {
      href: "/operator/content",
      label: t("operator.nav.content"),
      icon: <FileTextOutlined style={UKURAN_IKON} />,
      group: situs,
    },
    {
      href: "/operator/scheduler",
      label: t("operator.nav.scheduler"),
      icon: <ClockCircleOutlined style={UKURAN_IKON} />,
      group: sistem,
    },
    {
      href: "/operator/mail",
      label: t("operator.nav.mail"),
      icon: <MailOutlined style={UKURAN_IKON} />,
      group: sistem,
    },
    {
      href: "/operator/audit",
      label: t("operator.nav.audit"),
      icon: <HistoryOutlined style={UKURAN_IKON} />,
      group: sistem,
    },
  ];
}
