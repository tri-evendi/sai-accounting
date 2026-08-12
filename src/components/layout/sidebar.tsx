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

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Drawer, Flex, Grid, Layout, Menu, theme } from "antd";
import type { MenuProps } from "antd";
import { AccountBookOutlined, AimOutlined, AppstoreAddOutlined, AuditOutlined, BarChartOutlined, BookOutlined, BranchesOutlined, CloseOutlined, ContainerOutlined, DeliveredProcedureOutlined, DollarOutlined, FileDoneOutlined, FileExcelOutlined, FileTextOutlined, FormOutlined, GlobalOutlined, HomeOutlined, IdcardOutlined, KeyOutlined, LockOutlined, MenuFoldOutlined, MenuUnfoldOutlined, MoneyCollectOutlined, PayCircleOutlined, ProfileOutlined, ReadOutlined, ReconciliationOutlined, RollbackOutlined, SafetyCertificateOutlined, SettingOutlined, ShopOutlined, ShoppingCartOutlined, TeamOutlined, ToolOutlined, TruckOutlined, UploadOutlined, WalletOutlined } from "@ant-design/icons";
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

/**
 * Lebar menu samping — 288, naik dari 256 (`w-64` sebelum migrasi).
 *
 * Angkanya diukur dari label yang TERPOTONG di 256: "Unpaid by Customer"
 * menjadi "Unpaid by Custom…" dan "Match Bank Statement" menjadi "Match Bank
 * State…". Label menu yang terpotong memaksa pembacanya menebak tujuan sebuah
 * pintu — dan di aplikasi akuntansi, "Unpaid by Custom…" bisa berarti apa saja.
 * 288 memuat keduanya utuh berikut ikon dan indennya, dan tetap kelipatan 8
 * seperti seluruh skala jarak di sini.
 */
const LEBAR_MENU = 288;

/**
 * Lebar saat terlipat — cukup untuk ikon dan target sentuhnya, tidak lebih.
 *
 * 80 adalah bawaan `Layout.Sider` AntD, dan dipakai apa adanya: ia sudah
 * sesumbu dengan `controlHeight` 40 (dua kali), jadi ikonnya duduk di tengah
 * tanpa angka baru yang harus dijaga.
 */
const LEBAR_MENU_TERLIPAT = 80;

/** Kunci `localStorage` untuk keadaan terlipat. */
const KUNCI_LIPAT = "sai.sidebar-collapsed";

/*
 * ── Keadaan terlipat sebagai TOKO LUAR, bukan `useState` + efek ───────────
 *
 * Bentuk yang lebih jelas — `useState(false)` lalu membacanya dari
 * `localStorage` di dalam `useEffect` — ditolak dua kali. ESLint menolaknya
 * ("Calling setState synchronously within an effect can trigger cascading
 * renders"), dan ia memang benar: itu render kedua untuk setiap pemuatan
 * halaman, hanya demi satu boolean.
 *
 * `useSyncExternalStore` menjawab persis pertanyaan yang kita punya: nilai
 * yang hidup DI LUAR React (penyimpanan peramban), dengan potret SERVER yang
 * terpisah. Potret servernya `false` — server tidak punya `localStorage`, dan
 * menebaknya akan membuat HTML pertama berbeda dari render klien, yaitu
 * ketidakcocokan hidrasi. Ongkosnya tetap satu bingkai bagi yang melipatnya:
 * kolom lebar sekejap saat memuat ulang. Menghilangkan kedipan itu menuntut
 * keadaan ini dibaca di server, yaitu cookie — dan cookie untuk preferensi
 * tampilan ikut terkirim pada SETIAP permintaan, termasuk tiap berkas statis.
 *
 * `storage` didengarkan supaya dua tab tidak berselisih pendapat; `pendengar`
 * lokal mengurus tab yang sedang ditekan tombolnya, sebab peristiwa `storage`
 * tidak pernah menyala di tab yang menulisnya sendiri.
 */
const pendengar = new Set<() => void>();

function langganLipat(onChange: () => void): () => void {
  pendengar.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    pendengar.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function bacaLipat(): boolean {
  return window.localStorage.getItem(KUNCI_LIPAT) === "1";
}

function simpanLipat(nilai: boolean): void {
  window.localStorage.setItem(KUNCI_LIPAT, nilai ? "1" : "0");
  pendengar.forEach((beri) => beri());
}

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
/**
 * ⚠ Ikon dioper sebagai PROP `icon`, bukan ditaruh di dalam `label`.
 *
 * Bentuk lamanya (ikon + teks di dalam satu `<Link>`) tampak benar dan patah
 * total saat kolomnya dilipat: `Menu` inline yang terlipat TIDAK merender isi
 * `label` sama sekali — ia hanya menggambar slot `icon`. Karena slot itu kosong,
 * kolom terlipatnya berisi deretan kotak tanpa apa pun di dalamnya, dan
 * satu-satunya yang terlihat adalah blok biru butir yang sedang aktif.
 *
 * Konsekuensinya: `<Link>` kini hanya membungkus TEKS-nya. Sasaran klik satu
 * baris penuh tidak hilang — `klikBaris` di bawah yang menutupnya, persis
 * seperti sebelumnya untuk sisa baris yang memang tidak pernah tertutup anchor.
 */
function barisNav(
  item: NavItem,
  aktif: boolean,
  t: TranslateFn
): NonNullable<MenuProps["items"]>[number] {
  const Icon = ICONS[item.icon] ?? HomeOutlined;
  return {
    key: item.href,
    icon: <Icon aria-hidden="true" style={{ fontSize: 18 }} />,
    label: (
      <Link
        href={item.href}
        aria-current={aktif ? "page" : undefined}
        style={{ color: "inherit" }}
      >
        {t(item.labelKey)}
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
  terlipat = false,
  onToggleLipat,
}: {
  groups: NavGroup[];
  homeVisible: boolean;
  activeHref: string | null;
  openKeys: string[];
  onOpenKeys: (keys: string[]) => void;
  onClose: () => void;
  tampilkanTutup: boolean;
  /**
   * Kolom tetap sedang terlipat. SELALU `false` di dalam `Drawer`: laci itu
   * sendiri sudah bentuk ringkasnya, dan laci yang isinya ikut terlipat adalah
   * menu ikon di dalam panel selebar 288px — ringkas dua kali, terbaca nol
   * kali.
   */
  terlipat?: boolean;
  /** Tanpa ini tombol pelipatnya tidak dirender (mis. di dalam laci). */
  onToggleLipat?: () => void;
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
    ...(homeVisible ? [barisNav(NAV_HOME, activeHref === NAV_HOME.href, t)] : []),
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
        /* Ikon grup — SATU-SATUNYA yang tersisa dari sebuah area tugas saat
           kolomnya terlipat; lihat catatan `icon` di `NavGroup`. */
        icon: (() => {
          const IkonGrup = ICONS[group.icon] ?? HomeOutlined;
          return <IkonGrup aria-hidden="true" style={{ fontSize: 18 }} />;
        })(),
        children: group.items.map((item) =>
          barisNav(item, item.href === activeHref, t)
        ),
      };
    }),
  ];

  return (
    <Layout.Sider
      width={LEBAR_MENU}
      collapsedWidth={LEBAR_MENU_TERLIPAT}
      collapsed={terlipat}
      /* Pemicunya kami sendiri (di baris lambang), bukan batang bawaan AntD
         yang menempel di dasar kolom: batang itu memakan satu baris penuh dan
         berada sejauh mungkin dari mata orang yang baru saja membaca menunya. */
      trigger={null}
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
          /* Terlipat: satu tombol, dipusatkan. Lihat catatan di bawah. */
          justify={terlipat ? "center" : "space-between"}
          gap={token.marginXS}
          style={{
            height: TINGGI_KEPALA,
            flexShrink: 0,
            /* Saat terlipat, padding sisi dikecilkan supaya lambang dan tombol
               tetap punya target sentuh 40px di kolom selebar 80. */
            paddingInline: terlipat ? token.paddingXS : token.paddingLG,
            borderBottom: `1px solid ${BORDER_TOKENS_DARK.colorSplit}`,
          }}
        >
          {/*
           * ⚠ Lambang menghilang SEUTUHNYA saat terlipat, bukan sekadar
           * teksnya.
           *
           * Percobaan pertama hanya menyembunyikan nama aplikasi dan
           * mempertahankan kotak lambangnya di sebelah tombol pelipat. Di kolom
           * 80px keduanya tidak muat: keduanya target sentuh 40px, ditambah
           * jarak dan padding sisi, jadi salah satunya terdorong keluar kotak —
           * persis tabrakan yang dilaporkan.
           *
           * Yang mengalah lambangnya, bukan tombolnya, dan itu bukan undian:
           * tombol pelipat adalah SATU-SATUNYA jalan keluar dari keadaan
           * terlipat — menyembunyikannya mengunci pengguna di kolom ikon.
           * Lambang hanyalah tautan kedua ke beranda; yang pertama berdiri tepat
           * di bawahnya sebagai butir menu paling atas, dan ikonnya tetap
           * terlihat saat terlipat.
           */}
          {!terlipat && (
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
            {/* Nama aplikasi menghilang saat terlipat; lambangnya tetap, dan
                ia tetap tautan ke beranda. `aria-label` di `Link` menjaga
                tautannya tetap punya nama yang bisa dibacakan tanpa teks. */}
            <span
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {APP_NAME}
            </span>
          </Link>
          )}
          {/*
           * Pelipat kolom. Hanya di kolom TETAP — di dalam laci ia tidak
           * dirender sama sekali (`onToggleLipat` tidak dioper), sebab laci
           * sudah bentuk ringkasnya sendiri.
           *
           * Ikonnya menyatakan ARAH tindakan, bukan keadaan sekarang: panah
           * ke kanan saat terlipat (= "lebarkan"), ke kiri saat terbuka
           * (= "sempitkan"). Ikon yang menyatakan keadaan membuat separuh
           * pengguna menekannya untuk hal yang berlawanan.
           */}
          {onToggleLipat && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleLipat}
              aria-label={t(terlipat ? "sidebar.expandMenu" : "sidebar.collapseMenu")}
              aria-expanded={!terlipat}
              style={{ color: token.colorTextLightSolid, flexShrink: 0 }}
            >
              {terlipat ? (
                <MenuUnfoldOutlined aria-hidden="true" style={{ fontSize: 18 }} />
              ) : (
                <MenuFoldOutlined aria-hidden="true" style={{ fontSize: 18 }} />
              )}
            </Button>
          )}

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
          {/* Nama aplikasi disembunyikan saat terlipat: di kolom 80px ia
              membungkus jadi tiga baris dan meluber keluar kotaknya. Versi
              tetap tampil — itu yang dibaca orang saat melaporkan masalah. */}
          {!terlipat && <span>{APP_NAME}</span>}
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

  /*
   * Keadaan terlipat, DIINGAT antar-kunjungan.
   *
   * Nilai awalnya sengaja "terbuka" dan baru disetel dari `localStorage` di
   * dalam efek: render server tidak punya akses ke penyimpanan peramban, dan
   * menebaknya akan membuat HTML pertama berbeda dari render klien —
   * ketidakcocokan hidrasi yang React laporkan sebagai galat. Ongkosnya satu
   * bingkai: pengguna yang melipatnya melihat kolom lebar sekejap saat memuat
   * ulang. Menghilangkan kedipan itu menuntut keadaan ini dibaca di SERVER,
   * yaitu cookie — dan cookie untuk preferensi tampilan berarti ia ikut
   * terkirim pada setiap permintaan, termasuk setiap gambar dan berkas statis.
   */
  const terlipat = useSyncExternalStore(langganLipat, bacaLipat, () => false);

  function toggleLipat() {
    simpanLipat(!terlipat);
  }
  const openKeysEfektif = openKeys ?? (activeGroupId ? [activeGroupId] : []);

  /*
   * ⚠ Melipat HANYA milik kolom tetap. Laci tidak menerima `terlipat` maupun
   * `onToggleLipat`, dan itu bukan kelalaian: laci SUDAH bentuk ringkas dari
   * menu ini, jadi laci yang isinya ikut terlipat adalah menu ikon di dalam
   * panel selebar 288px — ringkas dua kali, terbaca nol kali.
   */
  const panel = (
    <PanelMenu
      groups={groups}
      homeVisible={homeVisible}
      activeHref={activeHref}
      openKeys={openKeysEfektif}
      onOpenKeys={setOpenKeys}
      onClose={onClose}
      tampilkanTutup={!lebar}
      {...(lebar ? { terlipat, onToggleLipat: toggleLipat } : {})}
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
