"use client";

/**
 * Kulit `/platform` — PANEL ADMIN PELANGGAN, bukan layar pra-aplikasi.
 *
 * ══ TIGA KULIT, DAN KENAPA INI KULIT KETIGA ════════════════════════════════
 * Aplikasi ini punya dua kerangka yang sudah mapan, dan halaman tingkat tenant
 * tidak cocok di keduanya:
 *
 *   `AuthShell`      satu tugas, satu kartu sempit (masuk, ganti sandi).
 *                    Permukaan tenant membawa ENAM urusan; 448px membuat tabel
 *                    tagihan lima kolom menggeser dirinya sendiri secara
 *                    mendatar bahkan di layar 1440px.
 *   `(dashboard)`    Sidebar + Navbar penuh — tapi menunya disusun dari
 *                    `session.user.role`, yaitu PERAN DI SEBUAH PT. Pengunjung
 *                    di sini boleh jadi belum punya satu pun PT (pemilik baru
 *                    yang sedang membuat yang pertama). Memakainya berarti
 *                    memutar layar pemuatan selamanya bagi orang yang paling
 *                    membutuhkan halaman ini — persis alasan `(tenant)/layout`
 *                    sengaja setipis `(auth)`.
 *
 * Karena itu kulit ketiga: BENTUK panel admin yang sama dengan dasbor —
 * menu samping gelap, bilah atas, isi yang menggulung sendiri — tapi menunya
 * disusun dari KEWENANGAN TINGKAT TENANT yang dioper `layout.tsx`, bukan dari
 * peran di sebuah PT.
 *
 * ⚠ Daftar menunya DIOPER, tidak dihitung di sini. Menyusunnya di dalam kulit
 * berarti kulit harus tahu matriks izin, dan itu menaruh keputusan "siapa
 * melihat apa" di dua tempat — tempat kedua yang tidak diuji siapa pun.
 *
 * ══ BUTIRNYA RUTE, BUKAN JANGKAR ═══════════════════════════════════════════
 * Versi pertama panel ini memakai jangkar `#tim`, `#privasi`, … ke bagian di
 * satu halaman panjang. Itu salah, dan salahnya bukan soal rasa:
 *
 *   • `#privasi` tidak bisa di-bookmark sebagai HALAMAN, tidak muncul di
 *     riwayat sebagai tempat tersendiri, dan tombol Kembali tidak
 *     mengembalikan apa pun;
 *   • yang jauh lebih penting: satu halaman berarti SELURUH isinya dirender
 *     dalam satu permintaan, jadi pemisahan kewenangan bergantung pada
 *     `{canX && …}` yang benar di setiap cabang. Sebagai rute tersendiri,
 *     penjaga di kepala tiap halaman yang menolak — `tenant.billing` tidak
 *     dipegang berarti /platform/billing MEMANTULKAN, bukan merender halaman
 *     yang kebetulan kosong.
 *
 * Butir aktif ditandai dari `usePathname()`; `/platform` dicocokkan persis
 * (kalau tidak, ia akan selalu aktif karena semua jalur lain berawalan
 * dengannya), sisanya dengan awalan supaya anak-rute seperti
 * `/platform/billing/plans` tetap menyalakan induknya.
 *
 * Lambang, bahasa, tema, dan JALAN KELUAR ikut di sini sebab halaman ini tidak
 * punya chrome aplikasi: di dasbor keempatnya tinggal di Navbar/menu akun yang
 * belum ada pada tahap ini (MASTER.md §Orientasi Perusahaan mewajibkan layar
 * tanpa chrome punya jalan keluar).
 *
 * ══ SETELAH ANTD (issue #240, fase C9) ═════════════════════════════════════
 * ⚠ Berkas ini KERANGKA — ia digambar di sekeliling setiap halaman `/platform`,
 * jadi satu jarak yang bergeser di sini bergeser di semuanya sekaligus.
 *
 * Susunannya kini `Layout` + `Layout.Sider`/`Drawer` + `Layout.Header`, mengikuti
 * chrome dasbor (#193) berkas demi berkas — dan itu BUKAN sekadar keseragaman.
 * Versi sebelumnya satu `<aside>` yang dipakai dua kali: kolom tetap di layar
 * lebar, dan laci yang digeser `-translate-x-full` di layar sempit. Menggeser
 * bukan menyembunyikan, jadi butir menunya tetap ada di urutan fokus; kelas
 * `invisible` adalah tambalan untuk itu, dan tambalan itu tidak punya padanan
 * gaya sebaris. Yang menggantikannya lebih kuat daripada kelasnya:
 * `destroyOnHidden` membuat laci tertutup harfiah `return null` — tidak ada DOM
 * sama sekali. **`forceRender` JANGAN pernah ditambahkan**; satu prop itu
 * mengembalikan bug aslinya secara utuh.
 *
 * Escape kini milik `Drawer` (`keyboard` bawaan `true`), yang juga mengembalikan
 * fokus ke pemicunya setelah menutup — hal yang tidak dilakukan pendengar
 * `keydown` tulisan tangan yang dihapus di sini. Tirainya `colorBgMask` AntD,
 * konstanta `rgba(0,0,0,0.45)` di KEDUA algoritma, jadi jebakan "tirai yang ikut
 * berbalik menjadi kabut putih di tema gelap" tidak bisa kembali.
 *
 * Lebar mana yang "lebar" datang dari `Grid.useBreakpoint()` (`lg` = 992px,
 * bukan 1024px milik Tailwind).
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Drawer, Flex, Grid, Layout, Menu, theme } from "antd";
import type { MenuProps } from "antd";
import { Menu as MenuIcon, X } from "lucide-react";

import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BORDER_TOKENS_DARK, NEUTRAL_TEXT_DARK } from "@/lib/theme/antd-tokens";
import { useT } from "@/lib/i18n/client";

/** `w-64` — lebar menu samping, sama dengan chrome dasbor. */
const LEBAR_MENU = 256;
/** `h-16` — tinggi kepala, sama dengan chrome dasbor. */
const TINGGI_KEPALA = 64;
/** `max-w-6xl` — lebar isi halaman. */
const LEBAR_ISI = 1152;

const TRUNCATE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export interface PlatformNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Cocokkan PERSIS, bukan sebagai awalan — untuk butir pendaratan. */
  exact?: boolean;
}

interface PlatformShellProps {
  children: React.ReactNode;
  /** Nama tenant — orientasi "akun siapa", sejajar `CompanyIndicator` di dasbor. */
  tenantName: string;
  nav: PlatformNavItem[];
  /** `SignedInAs` — identitas + keluar, dioper supaya kulit tidak menyentuh sesi. */
  account?: React.ReactNode;
}

/**
 * Isi menu samping — dipakai apa adanya sebagai kolom tetap DAN sebagai isi
 * laci. Selalu `Layout.Sider`, termasuk di dalam `Drawer`: dengan begitu latar
 * gelapnya datang dari token `Layout` AntD sendiri, bukan dari nilai warna yang
 * harus ditulis ulang di sini.
 */
function PanelMenu({
  nav,
  activeHref,
  onClose,
  tampilkanTutup,
}: {
  nav: PlatformNavItem[];
  activeHref: string | null;
  onClose: () => void;
  tampilkanTutup: boolean;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();

  /*
   * Sasaran klik satu BARIS penuh, bukan hanya lebar teksnya.
   *
   * Butir menu ini dulu `<Link>` yang MENGISI barisnya; di dalam item AntD
   * tautannya hanya setinggi & selebar tulisannya, jadi sisa baris akan mati
   * kalau dibiarkan. Penangan ini menutup sisa itu — dan sengaja MUNDUR bila
   * kliknya memang mendarat di tautannya, supaya satu klik tidak menavigasi
   * dua kali. Sama persis dengan menu samping dasbor (#193).
   */
  const klikBaris: MenuProps["onClick"] = ({ key, domEvent }) => {
    onClose();
    const target = domEvent.target as HTMLElement | null;
    if (target?.closest?.("a")) return;
    router.push(key);
  };

  const items: MenuProps["items"] = nav.map((item) => ({
    key: item.href,
    label: (
      <Link
        href={item.href}
        onClick={onClose}
        aria-current={item.href === activeHref ? "page" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: token.marginSM,
          color: "inherit",
        }}
      >
        <span style={{ display: "inline-flex", flexShrink: 0 }} aria-hidden="true">
          {item.icon}
        </span>
        <span style={TRUNCATE}>{item.label}</span>
      </Link>
    ),
  }));

  return (
    <Layout.Sider
      width={LEBAR_MENU}
      theme="dark"
      style={{
        height: "100%",
        borderInlineEnd: `${token.lineWidth}px solid ${BORDER_TOKENS_DARK.colorSplit}`,
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
              /* Bidang ini gelap di KEDUA tema, jadi warnanya tidak boleh ikut
                 tema — `colorTextLightSolid` adalah token AntD untuk "teks di
                 atas bidang pekat". */
              color: token.colorTextLightSolid,
            }}
          >
            <BrandMark size="sm" />
            <span style={TRUNCATE}>{APP_NAME}</span>
          </Flex>
          {tampilkanTutup && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t("sidebar.closeMenu")}
              style={{ color: token.colorTextLightSolid, flexShrink: 0 }}
            >
              <X size={20} aria-hidden="true" />
            </Button>
          )}
        </Flex>

        <nav
          aria-label={t("sidebar.mainMenu")}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBlock: token.paddingXS }}
        >
          <Menu
            mode="inline"
            theme="dark"
            items={items}
            selectedKeys={activeHref ? [activeHref] : []}
            onClick={klikBaris}
            style={{ borderInlineEnd: 0 }}
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
            /* Sama alasannya dengan tombol tutup: bidangnya selalu gelap, jadi
               teks redupnya memakai anak tangga netral tema GELAP (#207). */
            color: NEUTRAL_TEXT_DARK.colorTextTertiary,
          }}
        >
          <span>
            &copy; {new Date().getFullYear()} {APP_NAME}
          </span>
          <span>v{APP_VERSION}</span>
        </Flex>
      </Flex>
    </Layout.Sider>
  );
}

export function PlatformShell({ children, tenantName, nav, account }: PlatformShellProps) {
  const t = useT();
  const pathname = usePathname();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const lebar = screens.lg ?? false;
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (item: PlatformNavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const activeHref = nav.find(isActive)?.href ?? null;

  const panel = (
    <PanelMenu
      nav={nav}
      activeHref={activeHref}
      onClose={() => setMenuOpen(false)}
      tampilkanTutup={!lebar}
    />
  );

  return (
    <Layout style={{ height: "100vh" }}>
      {/* Kolom tetap: laci tidak pernah ikut dirender, jadi tidak ada salinan
          kedua menu ini di mana pun. */}
      {lebar ? (
        panel
      ) : (
        <Drawer
          placement="left"
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          size={LEBAR_MENU}
          closable={false}
          /* ⚠ Inilah yang membuat laci tertutup benar-benar tidak ada di DOM —
             lihat catatan di kepala berkas. Jangan tambahkan `forceRender`. */
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
          <Flex align="center" gap={token.marginXS} style={{ minWidth: 0 }}>
            {!lebar && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMenuOpen(true)}
                aria-label={t("sidebar.mainMenu")}
              >
                <MenuIcon size={20} aria-hidden="true" />
              </Button>
            )}
            {/* Orientasi "akun siapa" — sejajar `CompanyIndicator` di dasbor,
                dan yang menyempit di layar sempit adalah NAMANYA, bukan target
                sentuh aksi di kanan (MASTER.md §Orientasi Perusahaan). */}
            <p
              style={{ ...TRUNCATE, margin: 0, fontWeight: 500, color: token.colorText }}
              title={tenantName}
            >
              {tenantName}
            </p>
          </Flex>
          <Flex align="center" gap={token.marginXS} style={{ flexShrink: 0 }}>
            <LocaleToggle />
            <ThemeToggle />
            {account}
          </Flex>
        </Layout.Header>

        <Layout.Content style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: token.padding }}>
          <div style={{ width: "100%", maxWidth: LEBAR_ISI, margin: "0 auto" }}>{children}</div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
