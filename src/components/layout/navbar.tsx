"use client";

/**
 * Bilah atas aplikasi — `Layout.Header` AntD (issue #193).
 *
 * Dua janji MASTER.md hidup di tata letak berkas ini, dan keduanya mudah
 * hilang saat seseorang "merapikan" bar yang penuh:
 *
 *  • **Nama perusahaan aktif selalu terlihat** (§Orientasi Perusahaan), di
 *    semua ukuran layar, tanpa membuka menu apa pun. Karena itu blok kiri
 *    boleh menyusut (`minWidth: 0` → namanya yang terpotong), sedangkan blok
 *    kanan `flexShrink: 0`.
 *  • **Target sentuh ≥ 40px dan jarak antar aksi ≥ 8px.** Tingginya datang
 *    dari `controlHeight` (token, bukan kelas); jaraknya dari `token.marginXS`
 *    ke atas.
 *
 * `Header` bawaan AntD berlatar gelap (`colorBgHeader`) dan ber-`line-height`
 * 64px — keduanya ditimpa di sini: bilah ini permukaan kartu di atas halaman,
 * dan `line-height` 64px akan menurun ke setiap teks di dalamnya (termasuk
 * baris kedua di menu bantuan).
 */

import { Flex, Grid, Layout, theme } from "antd";
import { Menu as MenuIcon } from "lucide-react";

import { AccountantModeToggle } from "@/components/layout/accountant-mode-toggle";
import { CompanyIndicator } from "@/components/layout/company-indicator";
import { HelpMenu } from "@/components/layout/help-menu";
import { ApprovalBadge } from "@/components/layout/approval-badge";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

/**
 * Bilah atas menempel saat halaman digulung, jadi ia harus di atas isi —
 * tetapi tetap DI BAWAH lapisan popup AntD (`zIndexPopupBase` 1000: laci,
 * dropdown, modal). Angka kecil yang disengaja, bukan `z-index: 9999`.
 */
const Z_BILAH_ATAS = 10;

/** Tinggi bilah — sama dengan `h-16` sebelum migrasi. */
const TINGGI_BILAH = 64;

interface NavbarProps {
  userName: string;
  role: string;
  companyName: string | null;
  companyCount: number;
  onMenuClick: () => void;
  onSignOut: () => void;
}

export function Navbar({
  userName,
  role,
  companyName,
  companyCount,
  onMenuClick,
  onSignOut,
}: NavbarProps) {
  const t = useT();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  // Satu sumber kebenaran dengan `Sidebar`: di ≥ lg menu samping adalah kolom
  // tetap, jadi pemicu lacinya tidak boleh ada.
  const lebar = screens.lg ?? false;

  return (
    <Layout.Header
      style={{
        position: "sticky",
        top: 0,
        zIndex: Z_BILAH_ATAS,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: token.marginSM,
        height: TINGGI_BILAH,
        lineHeight: token.lineHeight,
        paddingInline: token.paddingLG,
        fontSize: token.fontSize,
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Flex align="center" gap={token.marginSM} style={{ minWidth: 0 }}>
        {!lebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            aria-label={t("navbar.openMenu")}
          >
            <MenuIcon size={20} aria-hidden="true" />
          </Button>
        )}

        {/* Buku siapa yang sedang dibuka — pertanyaan terpenting sejak tiap PT
            punya basis datanya sendiri (#104). Ikut tampil di layar sempit;
            di sanalah orang paling mudah lupa. */}
        <CompanyIndicator companyName={companyName} companyCount={companyCount} />
      </Flex>

      {/* `flexShrink: 0`: di 375px yang boleh menyempit adalah NAMA perusahaan
          (ia terpotong dengan elipsis), bukan target sentuh aksi-aksi ini. */}
      <Flex align="center" gap={token.marginXS} style={{ flexShrink: 0 }}>
        {/* issue #25 — antrean persetujuan / kabar keputusan (sembunyi bila nol) */}
        <ApprovalBadge />
        {/* issue #21 — Bantuan: Kamus Istilah + putar ulang tur panduan */}
        <HelpMenu />
        {/* issue #11 — Mode Akuntan toggle (primary surface) */}
        <AccountantModeToggle />
        {/* Identitas + aksi akun (ubah sandi, keluar) diringkas ke satu menu
            avatar — memisahkan "informasi" dari "aksi" dan merapikan top bar. */}
        <UserMenu userName={userName} role={role} onSignOut={onSignOut} />
      </Flex>
    </Layout.Header>
  );
}
