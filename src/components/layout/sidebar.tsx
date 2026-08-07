"use client";

/**
 * Menu samping aplikasi — `Layout.Sider` + `Menu` (issue #193).
 *
 * Menu dikelompokkan per AREA TUGAS (issue #2) dengan label bahasa Indonesia
 * (issue #1). Daftar & penyaringannya hidup di `src/lib/nav.ts` yang murni dan
 * teruji; komponen ini hanya menggambar.
 *
 * ══ SATU KEPUTUSAN YANG MENENTUKAN SELURUH BENTUK BERKAS INI ═══════════════
 * ⚠ **LACI TERTUTUP TIDAK BOLEH TETAP BISA DI-TAB.**
 *
 * Versi sebelumnya adalah SATU `<aside>` yang dipakai dua kali: kolom tetap di
 * layar lebar, dan laci yang digeser `-translate-x-full` di layar sempit.
 * Menggeser bukan menyembunyikan — ~30 tautan menu dan setiap pemicu grupnya
 * tetap ada di pohon dan tetap di urutan fokus. Pengguna papan ketik di ponsel
 * menekan Tab dari bilah atas dan fokusnya lenyap ke dalam menu yang tidak
 * terlihat di mana pun: puluhan tekanan tanpa satu pun cincin fokus di layar,
 * lalu ia mendarat di halaman yang tidak pernah ia pilih. Pembaca layar
 * membacakan seluruh menu itu sebagai isi halaman. Perbaikan pertamanya adalah
 * kelas `invisible`; migrasi ini menggantinya dengan sesuatu yang lebih kuat.
 *
 * Karena itu di sini TIDAK ADA satu simpul pun yang dipakai dua kali:
 *
 *   ≥ lg  → `Layout.Sider` dirender, `Drawer` tidak pernah ada.
 *   < lg  → `Drawer` dirender, `Layout.Sider` tidak pernah ada; dan `Drawer`
 *           memakai `destroyOnHidden`, yang di `@rc-component/drawer` berarti
 *           harfiah `return null` selama tertutup (`Drawer.js`:
 *           `if (!forceRender && !animatedVisible && !mergedOpen &&
 *           destroyOnHidden) return null;`).
 *
 * Jadi "tidak bisa di-Tab" bukan lagi akibat sebuah kelas CSS yang bisa
 * tertimpa, melainkan akibat tidak adanya DOM sama sekali. `forceRender`
 * JANGAN pernah ditambahkan ke `Drawer` di bawah — satu prop itu mengembalikan
 * bug aslinya secara utuh. Dikunci `tests/layout-chrome-antd.test.tsx`.
 *
 * Lebar mana yang dianggap "lebar" datang dari `Grid.useBreakpoint()` (`lg` =
 * 992px, bukan 1024px milik Tailwind). Hook itu berlangganan lewat
 * `useLayoutEffect`, jadi nilainya sudah benar SEBELUM frame pertama
 * dilukis — tidak ada kedipan menu yang salah.
 *
 * ══ ESCAPE ════════════════════════════════════════════════════════════════
 * Dulu pendengar `keydown` di `document` yang ditulis berkas ini. Kini milik
 * `Drawer` (`keyboard` bawaan `true`), yang juga mengembalikan fokus ke
 * pemicunya setelah menutup — hal yang tidak dilakukan versi lama.
 *
 * ══ TIRAI ═════════════════════════════════════════════════════════════════
 * `colorBgMask` AntD adalah konstanta `rgba(0,0,0,0.45)` di KEDUA algoritma
 * (diukur di issue #190, lihat `lib/theme/antd-tokens.ts`), jadi tirai laci
 * menggelapkan halaman di tema terang maupun gelap — bukan kabut putih yang
 * pernah terjadi ketika tirai memakai token yang ikut berbalik.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Drawer, Flex, Grid, Layout, Menu, theme } from "antd";
import type { MenuProps } from "antd";
import { AccountBookOutlined, AimOutlined, AppstoreAddOutlined, AuditOutlined, BarChartOutlined, BookOutlined, BranchesOutlined, CloseOutlined, ContainerOutlined, DeliveredProcedureOutlined, DollarOutlined, FileDoneOutlined, FileExcelOutlined, FileTextOutlined, FormOutlined, GlobalOutlined, HomeOutlined, IdcardOutlined, KeyOutlined, LockOutlined, MoneyCollectOutlined, PayCircleOutlined, ProfileOutlined, ReadOutlined, ReconciliationOutlined, RollbackOutlined, SafetyCertificateOutlined, SettingOutlined, ShopOutlined, ShoppingCartOutlined, TeamOutlined, ToolOutlined, TruckOutlined, UploadOutlined, WalletOutlined } from "@ant-design/icons";
import type { IconComponent } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Link, useAppRouter } from "@/components/ui/app-link";
import { BrandMark } from "@/components/ui/brand-mark";
import { useEffectivePermissions } from "@/lib/use-effective-permissions";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import { BORDER_TOKENS_DARK, NEUTRAL_TEXT_DARK } from "@/lib/theme/antd-tokens";
import {
  NAV_HOME,
  activeNavHref,
  isNavItemVisible,
  visibleNavGroups,
  visibleNavHrefs,
  type NavGroup,
  type NavItem,
} from "@/lib/nav";

interface SidebarProps {
  role: string;
  // ─── issue #11 — raw Mode Akuntan preference (null = follow role default) ───
  accountantMode?: boolean | null;
  /** Jumlah perusahaan yang boleh dibuka — menentukan item "Pilih Perusahaan". */
  companyCount?: number;
  open: boolean;
  onClose: () => void;
}

/** Lebar menu samping — sama dengan `w-64` sebelum migrasi. */
const LEBAR_MENU = 256;

/** Tinggi baris lambang, disamakan dengan bilah atas. */
const TINGGI_KEPALA = 64;

/**
 * Nama ikon (data, `lib/nav.ts`) → komponen `@ant-design/icons`. Pola yang sama
 * dengan Pusat Laporan: kunci tetap nama yang disimpan data, hanya nilainya yang
 * berpindah paket di issue #201 — supaya `lib/nav.ts` tetap murni data.
 */
const ICONS: Record<string, IconComponent> = {
  LayoutDashboard: HomeOutlined,
  FileText: FileTextOutlined,
  Receipt: FileDoneOutlined,
  Package: ContainerOutlined,
  PackagePlus: AppstoreAddOutlined,
  ClipboardCheck: AuditOutlined,
  DollarSign: DollarOutlined,
  Truck: TruckOutlined,
  Users: TeamOutlined,
  Upload: UploadOutlined,
  Settings: SettingOutlined,
  UserCog: IdcardOutlined,
  BookOpen: BookOutlined,
  BookText: AccountBookOutlined,
  BookMarked: ReadOutlined,
  Library: ProfileOutlined,
  BarChart3: BarChartOutlined,
  HandCoins: MoneyCollectOutlined,
  Wallet: WalletOutlined,
  Coins: PayCircleOutlined,
  Lock: LockOutlined,
  Scale: ReconciliationOutlined,
  Ship: GlobalOutlined,
  Undo2: RollbackOutlined,
  Building2: ShopOutlined,
  Target: AimOutlined,
  Wand2: ToolOutlined,
  FileSpreadsheet: FileExcelOutlined,
  PackageCheck: DeliveredProcedureOutlined,
  KeyRound: KeyOutlined,
  ShieldCheck: SafetyCertificateOutlined,
  ShoppingCart: ShoppingCartOutlined,
  SquarePen: FormOutlined,
  Split: BranchesOutlined,
};

/**
 * Satu baris menu = satu `<a>` sungguhan.
 *
 * Bukan `onClick` di dalam item AntD: tautan sungguhan bisa dibuka di tab
 * baru, disalin alamatnya, dan di-prefetch `next/link` — tiga hal yang hilang
 * begitu navigasi pindah ke penangan klik. Ikonnya ikut MASUK ke dalam
 * tautan (bukan lewat prop `icon` milik AntD) supaya seluruh isi barisnya satu
 * sasaran klik; sisa 40px barisnya ditutup `onClick` menu — lihat
 * `klikBaris()`.
 */
function barisNav(
  item: NavItem,
  aktif: boolean,
  t: TranslateFn,
  jarak: number
): NonNullable<MenuProps["items"]>[number] {
  const Icon = ICONS[item.icon] ?? HomeOutlined;
  return {
    key: item.href,
    label: (
      <Link
        href={item.href}
        aria-current={aktif ? "page" : undefined}
        style={{ display: "flex", alignItems: "center", gap: jarak, color: "inherit" }}
      >
        <Icon aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }} />
        <span
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {t(item.labelKey)}
        </span>
      </Link>
    ),
  };
}

/**
 * Isi menu samping — dipakai apa adanya sebagai kolom tetap DAN sebagai isi
 * laci. Selalu `Layout.Sider`, termasuk di dalam `Drawer`: dengan begitu latar
 * gelapnya datang dari token `Layout` AntD sendiri, bukan dari sebuah nilai
 * warna yang harus ditulis ulang di sini.
 */
function PanelMenu({
  groups,
  homeVisible,
  activeHref,
  openKeys,
  onOpenKeys,
  onClose,
  tampilkanTutup,
}: {
  groups: NavGroup[];
  homeVisible: boolean;
  activeHref: string | null;
  openKeys: string[];
  onOpenKeys: (keys: string[]) => void;
  onClose: () => void;
  tampilkanTutup: boolean;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useAppRouter();

  /*
   * Sasaran klik satu BARIS penuh, bukan hanya lebar teksnya.
   *
   * Tautan di dalam item AntD hanya setinggi tulisannya; sisa tinggi baris
   * (40px, target sentuh MASTER.md) akan mati kalau dibiarkan. Penangan ini
   * menutup sisa itu — dan sengaja MUNDUR bila kliknya memang mendarat di
   * tautannya, supaya satu klik tidak menavigasi dua kali. Tekan Enter saat
   * fokus ada di barisnya (navigasi panah rc-menu) juga lewat sini.
   */
  const klikBaris: MenuProps["onClick"] = ({ key, domEvent }) => {
    onClose();
    const target = domEvent.target as HTMLElement | null;
    if (target?.closest?.("a")) return;
    router.push(key);
  };

  const items: MenuProps["items"] = [
    ...(homeVisible ? [barisNav(NAV_HOME, activeHref === NAV_HOME.href, t, token.marginSM)] : []),
    ...groups.map((group) => {
      const terbuka = openKeys.includes(group.id);
      const berisiAktif = group.items.some((i) => i.href === activeHref);
      return {
        key: group.id,
        label: (
          <Flex component="span" align="center" gap={token.marginXXS}>
            {t(group.labelKey)}
            {/* Grup ditutup tapi berisi halaman aktif → titik penanda. AntD
                sendiri hanya mewarnai judulnya, dan warna tidak boleh jadi
                penanda tunggal (MASTER.md §Anti-Patterns). */}
            {!terbuka && berisiAktif && (
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: token.colorPrimary,
                }}
              />
            )}
          </Flex>
        ),
        children: group.items.map((item) =>
          barisNav(item, item.href === activeHref, t, token.marginSM)
        ),
      };
    }),
  ];

  return (
    <Layout.Sider
      width={LEBAR_MENU}
      theme="dark"
      style={{
        height: "100%",
        /* Tema gelap: sidebar `#001529` dan permukaan kartu `#141414`
           berkontras **1,00:1** — bukan "~1,4:1" seperti tertulis di sini
           sampai #205; keduanya praktis identik dalam luminansi, dan terhadap
           `colorBgLayout` gelap (`#000000`) angkanya 1,14:1. Ini persis jebakan
           "dua bidang sewarna" MASTER.md dalam bentuk paling murni: yang
           memisahkan kedua kolom BUKAN warnanya, melainkan HANYA garis ini.

           Karena itu garis ini `colorBorderSecondary` (batas yang MEMBAWA
           MAKNA, dinaikkan sampai lolos 3:1 di #208) dan bukan `colorSplit` —
           token yang #208 justru tahan SENGAJA di bawah 3:1 sebagai pemisah
           dekoratif. Terukur: `colorSplit` gelap `#5a5a5a` = 2,67:1 terhadap
           sider dan 2,39:1 terhadap permukaan melayang gelap (dua-duanya
           gagal), `colorBorderSecondary` gelap `#6a6a6a` = 3,41:1 terhadap
           sider dan minimum 3,05:1 terhadap area kerja di kedua tema.

           Versi GELAP-nya di kedua tema, sama seperti `SIDER_BG_DARK`: garis
           ini menempel pada bidang yang memang gelap permanen. */
        borderInlineEnd: `1px solid ${BORDER_TOKENS_DARK.colorBorderSecondary}`,
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
            borderBottom: `1px solid ${BORDER_TOKENS_DARK.colorSplit}`,
          }}
        >
          <Link
            href="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: token.marginXS,
              minWidth: 0,
              fontSize: token.fontSizeLG,
              fontWeight: token.fontWeightStrong,
              color: token.colorTextLightSolid,
            }}
          >
            <BrandMark size="sm" />
            <span
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {APP_NAME}
            </span>
          </Link>
          {tampilkanTutup && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t("sidebar.closeMenu")}
              /* Permukaan ini gelap di KEDUA tema, jadi warna teksnya tidak
                 boleh ikut tema — `colorTextLightSolid` adalah token AntD untuk
                 "teks di atas bidang pekat". */
              style={{ color: token.colorTextLightSolid, flexShrink: 0 }}
            >
              <CloseOutlined aria-hidden="true" style={{ fontSize: 20 }} />
            </Button>
          )}
        </Flex>

        {/* `data-tour="menu-tugas"` adalah sasaran langkah tur (`lib/tours.ts`)
            — jangan ganti namanya. `<nav>` juga penanda daerah bagi pembaca
            layar; `role="menu"` milik AntD tinggal di dalamnya. */}
        <nav
          aria-label={t("sidebar.mainMenu")}
          data-tour="menu-tugas"
          style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBlock: token.paddingXS }}
        >
          <Menu
            mode="inline"
            theme="dark"
            items={items}
            selectedKeys={activeHref ? [activeHref] : []}
            openKeys={openKeys}
            onOpenChange={(keys) => onOpenKeys(keys as string[])}
            onClick={klikBaris}
            style={{ borderInlineEnd: 0 }}
          />
        </nav>

        <Flex
          vertical
          style={{
            flexShrink: 0,
            paddingInline: token.paddingLG,
            paddingBlock: token.paddingXS,
            borderTop: `1px solid ${BORDER_TOKENS_DARK.colorSplit}`,
            fontSize: token.fontSizeSM,
            /* Sama alasannya dengan tombol tutup: bidangnya selalu gelap, jadi
               teks redupnya memakai anak tangga netral tema GELAP (#207). */
            color: NEUTRAL_TEXT_DARK.colorTextTertiary,
          }}
        >
          <span>{APP_NAME}</span>
          {/* Dari `package.json` saat build, bukan literal — nomor yang
              diketik tangan tidak pernah ikut naik saat rilis, dan justru
              dibaca orang ketika sedang melaporkan masalah. */}
          <span>v{APP_VERSION}</span>
        </Flex>
      </Flex>
    </Layout.Sider>
  );
}

export function Sidebar({ role, accountantMode, companyCount, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();
  const lebar = screens.lg ?? false;

  // issue #11 — permukaan akuntansi (Catatan Transaksi, Rincian per Akun, Daftar
  // Akun) hanya muncul bila peran mengizinkan DAN Mode Akuntan efektif ON. Aturan
  // itu hidup di `isNavItemVisible`, satu keputusan dengan penjaga halaman.
  const user = { role, accountantMode, companyCount };
  // issue #73 — menu mengikuti matriks EFEKTIF (override dari /permissions)
  // begitu termuat; sebelumnya memakai matriks bawaan di bundle.
  const allowed = useEffectivePermissions(role);
  const groups = visibleNavGroups(user, allowed);
  const homeVisible = isNavItemVisible(NAV_HOME, user, allowed);
  // Kecocokan terpanjang: /inventory/opname menyorot "Hitung Ulang Stok" saja.
  const activeHref = activeNavHref(pathname, visibleNavHrefs(user, allowed));

  // ── Grup menu bisa dilipat (issue: 28 item sekaligus terasa penuh) ──
  // Default: hanya grup berisi halaman aktif yang terbuka; sisanya tertutup,
  // jadi menu terlihat ~7 baris, bukan tembok panjang. `null` berarti "belum
  // disentuh pengguna" — dan itu bukan sama dengan daftar kosong: daftar kosong
  // adalah pilihan sadar untuk menutup semuanya. State di memori: karena
  // sidebar tinggal di layout yang persist, pilihan buka/tutup tetap bertahan
  // saat berpindah halaman (reset hanya saat muat ulang penuh).
  const activeGroupId =
    groups.find((g) => g.items.some((i) => i.href === activeHref))?.id ?? null;
  const [openKeys, setOpenKeys] = useState<string[] | null>(null);
  const openKeysEfektif = openKeys ?? (activeGroupId ? [activeGroupId] : []);

  const panel = (
    <PanelMenu
      groups={groups}
      homeVisible={homeVisible}
      activeHref={activeHref}
      openKeys={openKeysEfektif}
      onOpenKeys={setOpenKeys}
      onClose={onClose}
      tampilkanTutup={!lebar}
    />
  );

  // Kolom tetap: laci tidak pernah ikut dirender, jadi tidak ada salinan kedua
  // menu ini di mana pun.
  if (lebar) return panel;

  return (
    <Drawer
      placement="left"
      open={open}
      onClose={onClose}
      size={LEBAR_MENU}
      closable={false}
      /* ⚠ Inilah yang membuat laci tertutup benar-benar tidak ada di DOM —
         lihat catatan panjang di kepala berkas. Jangan tambahkan `forceRender`. */
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      {panel}
    </Drawer>
  );
}
