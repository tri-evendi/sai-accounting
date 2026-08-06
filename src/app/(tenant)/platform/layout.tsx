/**
 * Kerangka permukaan `/platform` — panel administrasi AKUN pelanggan.
 *
 * ══ KENAPA LAYOUT, DAN KENAPA IA IKUT MENJAGA ══════════════════════════════
 * Sejak permukaan tenant dipecah menjadi rute-rute sendiri (ringkasan, tim,
 * langganan, paket, privasi), chrome-nya tidak boleh ikut tergandakan lima
 * kali: satu berkas yang menyusun menu, satu tempat yang membacanya.
 *
 * Layout ini memanggil `requireTenantPagePermission("tenant.home")` — izin
 * paling dasar, dipegang SETIAP anggota tenant. Ia bukan pengganti penjaga di
 * tiap halaman melainkan lapisan pertamanya: yang bukan anggota tenant sama
 * sekali dipantulkan di sini, dan halaman di dalamnya menambahkan penjaganya
 * yang lebih ketat (`tenant.billing`, `tenant.export`, …). `tests/authz-
 * coverage` tetap menuntut setiap `page.tsx` menyatakan izinnya sendiri, dan
 * itu benar: layout yang menjaga TIDAK boleh membuat halaman berhenti menjaga
 * dirinya — satu perubahan pada layout tidak boleh diam-diam membuka empat
 * halaman sekaligus.
 *
 * ⚠ MENU DISUSUN DI SINI, dari matriks izin. Kulit (`PlatformShell`) hanya
 * menggambar. Kulit yang ikut membaca izin akan menaruh keputusan "siapa
 * melihat apa" di tempat kedua yang tidak diuji siapa pun — dan butir menu
 * menuju halaman yang akan memantulkan pemiliknya adalah bentuk kebocoran
 * tersendiri: ia memberi tahu orang bahwa ruangan itu ada.
 */
import { LayoutDashboard, Plus, ShieldCheck, Users, Wallet } from "lucide-react";

import { SignedInAs } from "@/components/auth/signed-in-as";
import { PlatformShell, type PlatformNavItem } from "@/components/tenant/platform-shell";
import { getT } from "@/lib/i18n/server";
import { tenantCan } from "@/lib/tenant-authz";
import { requireTenantPagePermission } from "@/lib/tenant-guard";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant } = await requireTenantPagePermission("tenant.home");
  const t = await getT();

  const nav: PlatformNavItem[] = [
    {
      href: "/platform",
      label: t("platform.title"),
      icon: <LayoutDashboard size={16} />,
      /* PERSIS: tanpa ini butir pendaratan menyala di setiap anak-rute, sebab
         semuanya berawalan `/platform`. */
      exact: true,
    },
    ...(tenantCan(tenant, "tenant.member.invite")
      ? [
          {
            href: "/platform/team",
            label: t("platform.teamHeading"),
            icon: <Users size={16} />,
          },
        ]
      : []),
    ...(tenantCan(tenant, "tenant.billing")
      ? [
          {
            href: "/platform/billing",
            label: t("tenantSettings.title"),
            icon: <Wallet size={16} />,
          },
        ]
      : []),
    ...(tenantCan(tenant, "tenant.export")
      ? [
          {
            href: "/platform/privacy",
            label: t("tenantSettings.privacyHeading"),
            icon: <ShieldCheck size={16} />,
          },
        ]
      : []),
    ...(tenantCan(tenant, "company.create")
      ? [
          {
            href: "/companies/new",
            label: t("companies.newTitle"),
            icon: <Plus size={16} />,
          },
        ]
      : []),
  ];

  return (
    <PlatformShell
      tenantName={tenant.tenantName}
      nav={nav}
      account={<SignedInAs name={user.name ?? ""} />}
    >
      {children}
    </PlatformShell>
  );
}
