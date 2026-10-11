"use client";

/**
 * Kulit KONSOL OPERATOR — panel admin, bukan satu bilah tab di atas halaman.
 *
 * ══ APA YANG BERUBAH, DAN KENAPA ITU BUKAN SOAL SELERA ═════════════════════
 * Sampai berkas ini ada, `ops.` digambar sebagai: satu bilah gelap setinggi
 * 56px, satu baris tab mendatar di bawahnya, lalu isi yang dikurung 1152px di
 * tengah layar. Bentuk itu lahir saat konsol hanya punya SATU halaman (#154,
 * daftar tenant hanya-baca). Sejak #155 ia menulis, sejak #169 ia memegang
 * kredensial SMTP penyedia, dan kini ia juga memegang isi halaman pendaratan —
 * dan bentuknya tidak pernah ikut tumbuh. Akibatnya yang terlihat:
 *
 *   • menu mendatar tidak punya tempat untuk bertambah. Enam butir sudah
 *     menggulung mendatar (`overflowX: auto`) di 390px — artinya butir ketujuh
 *     menjadi butir yang TIDAK TERLIHAT, bukan butir yang lebih sempit;
 *   • tidak ada tempat untuk judul halaman. Setiap halaman konsol karena itu
 *     menggambar `<h1>`-nya sendiri dengan konstanta `H1` yang disalin berkas
 *     demi berkas — empat salinan dari gaya yang sama;
 *   • isinya terkurung 1152px sementara dasbor pelanggan dan `/platform` sudah
 *     lama memakai lebar penuh. Tabel tenant tujuh kolom karena itu menggulung
 *     mendatar di monitor 1440px, dengan dua bidang kosong di kiri-kanannya.
 *
 * Yang digambar di sini adalah bentuk yang SAMA dengan `PlatformShell` dan
 * chrome dasbor: menu samping gelap 256px, kepala 64px, isi yang menggulung
 * sendiri selebar layar. Bukan keseragaman demi keseragaman — ia berarti satu
 * orang yang berpindah antara dasbor pelanggan (saat menolong pelanggan) dan
 * konsol ini (saat menindaklanjutinya) tidak perlu belajar dua bilah atas.
 *
 * ══ KENAPA BUKAN `PlatformShell` ITU SENDIRI ═══════════════════════════════
 * Karena `PlatformShell` menyeret bidang PELANGGAN, dan dua impornya tidak bisa
 * dilepas tanpa membongkar berkas itu: `signOut` milik NextAuth (bidang operator
 * punya sesi & cookie sendiri — `lib/operator/session.ts`) dan `UserMenu`, yang
 * membaca sesi pelanggan, memanggil pengalih PERUSAHAAN, dan menaut ke
 * `/platform` — tiga hal yang semuanya 404 di host `ops.`.
 *
 * Kerangka `(operator)/layout.tsx` sejak #154 sengaja TIDAK mengimpor satu pun
 * modul bertenant/bercompany, supaya ekstraksi konsol menjadi aplikasi kedua
 * kelak tinggal memindahkan folder. Berkas ini mematuhi batas yang sama:
 *
 *   • keluar DIOPER sebagai `ReactNode` — formulir server action milik layout,
 *     digambar di sini, tanpa satu impor autentikasi pun di berkas ini;
 *   • ikon DIOPER sebagai `ReactNode` (pola `panelNav` → `PlatformShell`);
 *   • kalimatnya DIOPER sebagai prop. `useT()` sebenarnya BISA dipakai di sini
 *     — `LocaleProvider` dipasang root layout `(app)`, yang juga membungkus
 *     grup ini, dan `mail-settings-form.tsx` memakainya — tetapi lima kalimat
 *     yang dioper membuat kulit ini bisa dirender di dalam tes tanpa provider
 *     apa pun, dan tidak menambah satu baris pun pada pemanggilnya yang sudah
 *     memegang `getT()`.
 *
 * Yang diimpor hanya primitif `components/ui` + `antd` + token tema — ketiganya
 * sudah dipakai halaman operator sejak #200.
 *
 * ══ LACI DI LAYAR SEMPIT: `destroyOnHidden`, JANGAN `forceRender` ══════════
 * Sama persis dengan `PlatformShell` dan untuk alasan yang sama: laci yang
 * hanya DIGESER keluar layar tetap ada di urutan fokus, sehingga Tab berjalan
 * melewati menu yang tak terlihat. `destroyOnHidden` membuat laci tertutup
 * harfiah `return null`. **`forceRender` jangan pernah ditambahkan.**
 */

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Drawer, Flex, Grid, Layout, Menu, theme } from "antd";
import type { MenuProps } from "antd";
import {
  CloseOutlined,
  GlobalOutlined,
  MenuOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APP_VERSION } from "@/lib/constants";
import {
  BORDER_TOKENS_DARK,
  NEUTRAL_TEXT_DARK,
  SIDER_BG_DARK,
} from "@/lib/theme/antd-tokens";

/** Lebar menu samping — angka yang sama dengan chrome dasbor & `/platform`. */
const LEBAR_MENU = 256;
/** Tinggi kepala — idem. */
const TINGGI_KEPALA = 64;

const TRUNCATE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export interface OperatorShellNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Cocokkan PERSIS — untuk butir pendaratan (`/operator`), yang kalau tidak
   *  akan menyala di setiap anak-rute karena semuanya berawalan dengannya. */
  exact?: boolean;
  /** Judul kelompok di atas butir ini. Kelompok = satu label, bukan submenu
   *  yang bisa dilipat: konsol ini punya tujuh butir, dan menu yang harus
   *  dibuka dulu menyembunyikan halaman yang jarang dibuka justru pada hari
   *  halaman itu dibutuhkan. */
  group?: string;
}

export interface OperatorShellLabels {
  consoleTitle: string;
  auditedBadge: string;
  /** "Masuk sebagai {name}" — sudah terformat di server. */
  signedInAs: string;
  /** Nama operator apa adanya, untuk kelompok identitas di kepala. */
  operatorName: string;
  /**
   * Host yang sedang dibuka (`OPERATOR_HOST`).
   *
   * Dipajang di kepala, dan itu bukan hiasan: konsol ini menulis ke data
   * SUNGGUHAN pelanggan, dan satu-satunya petunjuk bahwa seseorang sedang
   * berada di konsol produksi — bukan di salinan uji — selama ini hanya URL di
   * bilah alamat peramban, yang tidak terlihat di layar penuh. Ia berdiri di
   * sebelah lencana "tindakan tercatat" karena keduanya menjawab pertanyaan
   * yang sama: apa akibat klik berikutnya, dan pada siapa.
   */
  host: string;
  mainMenu: string;
  closeMenu: string;
}

interface OperatorShellProps {
  children: React.ReactNode;
  nav: OperatorShellNavItem[];
  labels: OperatorShellLabels;
  /** Formulir keluar (server action) — digambar, tidak disusun, di sini. */
  logout: React.ReactNode;
}

function MenuKonsol({
  nav,
  activeHref,
  labels,
  onClose,
  tampilkanTutup,
}: {
  nav: OperatorShellNavItem[];
  activeHref: string | null;
  labels: OperatorShellLabels;
  onClose: () => void;
  tampilkanTutup: boolean;
}) {
  const { token } = theme.useToken();
  const router = useRouter();

  /*
   * Navigasi lewat `router.push`, BUKAN `<Link>` di dalam label.
   *
   * `PlatformShell` memakai `<Link>` di dalam butir AntD lalu menambal sisa
   * barisnya dengan penangan ini; di sini tautannya tidak dibutuhkan sama
   * sekali — konsol operator berada di host sendiri, tidak punya jalur
   * bertenant untuk diselaraskan, dan satu-satunya alasan `<Link>` bertahan di
   * panel pelanggan (prefetch + penyelarasan `app-link`) tidak berlaku. Yang
   * tersisa dari `<Link>` di sini hanyalah elemen kedua di dalam baris yang
   * bisa menelan klik.
   *
   * Harganya dinyatakan apa adanya: Ctrl/Cmd-klik tidak membuka tab baru di
   * menu ini. Itu memang kehilangan — dan ia dipilih sadar, sebab menu konsol
   * tujuh butir dengan satu pemakai per sesi bukan permukaan tempat orang
   * membuka tab paralel; `tests/anchor-button-nesting.test.ts` justru menolak
   * bentuk yang menggabungkan keduanya.
   */
  const klikBaris: MenuProps["onClick"] = ({ key }) => {
    onClose();
    router.push(key);
  };

  /* Butir + judul kelompok, disusun menjadi satu daftar datar: AntD menerima
     `{ type: "group" }` sebagai butir, jadi kelompoknya tidak menambah tingkat
     bersarang yang harus dibuka. */
  const items: MenuProps["items"] = [];
  let kelompokTerakhir: string | undefined;
  for (const item of nav) {
    if (item.group && item.group !== kelompokTerakhir) {
      items.push({ type: "group", key: `group:${item.group}`, label: item.group });
      kelompokTerakhir = item.group;
    }
    items.push({
      key: item.href,
      icon: (
        <span style={{ display: "inline-flex", flexShrink: 0 }} aria-hidden="true">
          {item.icon}
        </span>
      ),
      label: <span style={TRUNCATE}>{item.label}</span>,
    });
  }

  return (
    <Layout.Sider
      width={LEBAR_MENU}
      theme="dark"
      style={{
        height: "100%",
        /* Latar GELAP PERMANEN di kedua tema — penanda bidang yang sama yang
           dipakai kepala konsol sejak #154, dan permukaan yang sama dengan
           `Layout.Sider theme="dark"` dasbor. Ditulis sebagai konstanta karena
           variabel token KOMPONEN hanya ada bila komponennya dirender, dan
           laci di layar sempit menggambar Sider ini DI DALAM `Drawer`. */
        background: SIDER_BG_DARK,
        /* Batas pemisah = `colorBorderSecondary`, bukan `colorSplit`: di tema
           gelap kedua bidang berkontras 1,00:1, jadi garis inilah satu-satunya
           pemisah dan ambangnya 3:1 (alasan penuh di `layout/sidebar.tsx`). */
        borderInlineEnd: `${token.lineWidth}px solid ${BORDER_TOKENS_DARK.colorBorderSecondary}`,
      }}
    >
      <Flex vertical style={{ height: "100%" }}>
        <Flex
          align="center"
          justify="space-between"
          gap={token.marginXS}
          style={{
            height: TINGGI_KEPALA,
            flexShrink: 0,
            paddingInline: token.paddingLG,
            borderBottom: `${token.lineWidth}px solid ${BORDER_TOKENS_DARK.colorSplit}`,
          }}
        >
          <Flex
            align="center"
            gap={token.marginXS}
            style={{
              minWidth: 0,
              fontSize: token.fontSizeLG,
              fontWeight: token.fontWeightStrong,
              /* Bidangnya gelap di KEDUA tema, jadi warna teksnya tidak boleh
                 ikut tema — `colorTextLightSolid` = "teks di atas bidang
                 pekat". */
              color: token.colorTextLightSolid,
            }}
          >
            {/* Lambang BIDANG, bukan lambang merek: konsol ini bukan aplikasi
                pelanggan, dan satu pandangan harus cukup untuk tahu itu.
                `BrandMark` sengaja TIDAK dipakai di sini. */}
            <SafetyCertificateOutlined aria-hidden="true" style={{ fontSize: 20 }} />
            <span style={TRUNCATE}>{labels.consoleTitle}</span>
          </Flex>
          {tampilkanTutup && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={labels.closeMenu}
              style={{ color: token.colorTextLightSolid, flexShrink: 0 }}
            >
              <CloseOutlined aria-hidden="true" style={{ fontSize: 20 }} />
            </Button>
          )}
        </Flex>

        <nav
          aria-label={labels.mainMenu}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBlock: token.paddingXS }}
        >
          <Menu
            mode="inline"
            theme="dark"
            items={items}
            selectedKeys={activeHref ? [activeHref] : []}
            onClick={klikBaris}
            style={{ borderInlineEnd: 0, background: "transparent" }}
          />
        </nav>

        <Flex
          vertical
          style={{
            flexShrink: 0,
            paddingInline: token.paddingLG,
            paddingBlock: token.paddingSM,
            borderTop: `${token.lineWidth}px solid ${BORDER_TOKENS_DARK.colorSplit}`,
            fontSize: token.fontSizeSM,
            /* Bidangnya selalu gelap, jadi teks redupnya memakai anak tangga
               netral tema GELAP (#207) — bukan `colorTextTertiary` yang ikut
               berbalik menjadi abu gelap di atas bidang gelap. */
            color: NEUTRAL_TEXT_DARK.colorTextTertiary,
          }}
        >
          <span>v{APP_VERSION}</span>
        </Flex>
      </Flex>
    </Layout.Sider>
  );
}

export function OperatorShell({ children, nav, labels, logout }: OperatorShellProps) {
  const pathname = usePathname();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const lebar = screens.lg ?? false;
  const [menuOpen, setMenuOpen] = useState(false);

  /* Butir TERPANJANG yang cocok, bukan butir pertama: `/operator/content`
     berawalan sama dengan tidak satu pun butir lain, tetapi `/operator/tenants`
     dan `/operator/tenants/12` keduanya harus menyalakan butir yang sama —
     sementara `/operator` (exact) tidak boleh menyala di keduanya. */
  const activeHref =
    nav
      .filter((item) => (item.exact ? pathname === item.href : pathname.startsWith(item.href)))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  const panel = (
    <MenuKonsol
      nav={nav}
      activeHref={activeHref}
      labels={labels}
      onClose={() => setMenuOpen(false)}
      tampilkanTutup={!lebar}
    />
  );

  return (
    <Layout style={{ height: "100vh" }}>
      {lebar ? (
        panel
      ) : (
        <Drawer
          placement="left"
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          size={LEBAR_MENU}
          closable={false}
          /* ⚠ Lihat kepala berkas — jangan tambahkan `forceRender`. */
          destroyOnHidden
          styles={{ body: { padding: 0 } }}
        >
          {panel}
        </Drawer>
      )}

      <Layout>
        <Layout.Header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: token.marginSM,
            height: TINGGI_KEPALA,
            flexShrink: 0,
            lineHeight: token.lineHeight,
            paddingInline: token.padding,
            fontSize: token.fontSize,
            background: token.colorBgContainer,
            borderBottom: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
          }}
        >
          {/* ══ KIRI: apa akibat klik berikutnya, dan pada siapa ══════════
              Sampai perombakan ini sisi kiri kepala hanya memuat satu lencana
              kuning, sendirian di bilah selebar layar — dan satu elemen
              berwarna yang mengambang di bidang kosong 64px terbaca sebagai
              sisa render, bukan sebagai peringatan. Ia kini berpasangan dengan
              HOST yang sedang dibuka: dua keterangan yang menjawab pertanyaan
              yang sama, jadi keduanya menjadi satu kelompok dan bukan dua
              benda yang kebetulan berada di sisi yang sama. */}
          <Flex align="center" gap={token.marginXS} style={{ minWidth: 0 }}>
            {!lebar && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMenuOpen(true)}
                aria-label={labels.mainMenu}
              >
                <MenuOutlined aria-hidden="true" style={{ fontSize: 20 }} />
              </Button>
            )}
            {/* Penanda "tindakan tercatat" tetap di urutan BACA pertama: ia
                peringatan, bukan hiasan merek — setiap tindakan di sini terekam
                atas nama operator yang sedang masuk (#155). */}
            <Badge variant="warning">{labels.auditedBadge}</Badge>
            {/* Host menyusut lebih dulu di layar sempit (`TRUNCATE` + `title`),
                sementara lencana dan target sentuh di kanan tidak — aturan yang
                sama dengan `CompanyIndicator` di chrome pelanggan. */}
            {lebar && (
              <Flex
                align="center"
                gap={token.marginXXS}
                style={{
                  minWidth: 0,
                  fontSize: token.fontSizeSM,
                  color: token.colorTextSecondary,
                }}
                title={labels.host}
              >
                <GlobalOutlined aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }} />
                <span style={TRUNCATE}>{labels.host}</span>
              </Flex>
            )}
          </Flex>

          {/* ══ KANAN: siapa yang sedang masuk ════════════════════════════
              Satu kelompok berisian, bukan kalimat abu-abu yang menggantung di
              sebelah tombol. Isian `colorFillQuaternary` memberi identitas itu
              batasnya sendiri tanpa menambah garis ke bilah yang sudah bergaris
              bawah — dan membuat tombol "Keluar" berhenti terbaca seperti
              lanjutan kalimat di sebelahnya. */}
          <Flex align="center" gap={token.marginXS} style={{ flexShrink: 0 }}>
            <Flex
              align="center"
              gap={token.marginXXS}
              style={{
                maxWidth: 200,
                minWidth: 0,
                paddingInline: token.paddingXS,
                paddingBlock: token.paddingXXS,
                borderRadius: token.borderRadius,
                background: token.colorFillQuaternary,
                fontSize: token.fontSizeSM,
                color: token.colorText,
              }}
              /* Judulnya kalimat penuh ("Masuk sebagai …"): yang dipajang hanya
                 namanya, dan nama tanpa konteks di pojok layar bisa terbaca
                 sebagai nama tenant yang sedang dibuka — bukan nama pembukanya. */
              title={labels.signedInAs}
            >
              <UserOutlined aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }} />
              <span style={TRUNCATE}>{labels.operatorName}</span>
            </Flex>
            {logout}
          </Flex>
        </Layout.Header>

        {/* Lebar PENUH, jarak tepi mengikuti `(dashboard)/layout.tsx` persis —
            supaya tabel tenant tujuh kolom berhenti menggulung mendatar di
            monitor lebar (lihat kepala berkas). */}
        <Layout.Content
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: lebar ? token.paddingLG : token.padding,
          }}
        >
          {children}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
