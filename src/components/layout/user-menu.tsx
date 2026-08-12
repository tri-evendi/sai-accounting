"use client";

/**
 * Menu pengguna di top bar.
 *
 * Sebelumnya identitas pengguna (nama + peran) dan tombol "Keluar" berdiri
 * sendiri-sendiri sejajar di top bar — memenuhi bar dan mencampur "informasi"
 * (siapa saya) dengan "aksi" (keluar). Kini keduanya diringkas ke satu menu:
 * satu tombol avatar membuka daftar berisi identitas + aksi akun (ubah kata
 * sandi, ganti bahasa, keluar).
 *
 * ── Pemilih bahasa (fondasi i18n) ──────────────────────────────────────────
 * Bahasa adalah preferensi AKUN dalam pandangan pengguna, jadi tempatnya di
 * menu akun — bukan ikon lepas yang menambah penghuni top bar. Tiap bahasa
 * ditulis DALAM BAHASANYA SENDIRI (`LOCALE_LABELS`) supaya pengguna yang
 * tersasar ke bahasa asing tetap mengenali barisnya sendiri.
 *
 * ── Setelah migrasi AntD (issue #193) ──────────────────────────────────────
 * Panel rakitan tangan diganti `Dropdown` AntD; Escape, klik-di-luar, dan
 * pengembalian fokus ke pemicu kini milik rc-dropdown (lihat catatan yang sama
 * di `help-menu.tsx`), sehingga berkas ini keluar dari `RAW_BUTTON_ALLOWLIST`.
 *
 * **Satu janji yang HAMPIR hilang dalam migrasi ini, dan cara ia diselamatkan.**
 * Baris bahasa dan tema bukan sekadar tautan: keduanya "satu dari tiga",
 * `role="menuitemradio"` + `aria-checked`. Tanpa itu pembaca layar membacakan
 * enam baris yang terdengar setara dan tidak pernah menyebut mana yang sedang
 * berlaku — tanda centang di kanan adalah penanda VISUAL saja. Tipe `items`
 * milik AntD tidak menyebut atribut ARIA, tetapi rc-menu menyebarkan sisa
 * propertinya apa adanya ke `<li>` (`MenuItem.js`: `omit(restProps, ['extra'])`),
 * dan `role` bahkan diperlakukan eksplisit di sana. Karena itu barisnya dibuat
 * lewat `barisPilihan()` dengan satu penegasan tipe yang terdokumentasi —
 * bukan dibiarkan turun pangkat menjadi `menuitem` biasa. `type: "group"` AntD
 * merender `<ul role="group">` sungguhan, jadi himpunan radionya pun tetap
 * punya wadah yang benar.
 *
 * Yang BERUBAH perilakunya: menekan salah satu baris kini menutup menunya —
 * `Dropdown` menutup pada setiap klik di dalam panel. Dulu baris TEMA membiarkan
 * menunya terbuka. Perbedaannya kecil dan bawaan AntD; mengembalikannya berarti
 * menyaring event penutupan berdasarkan asal kliknya, yaitu jenis kepintaran
 * yang rusak diam-diam pada versi AntD berikutnya.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Dropdown, Flex, Grid, theme } from "antd";
import type { MenuProps } from "antd";
import { BgColorsOutlined, CheckOutlined, DesktopOutlined, DownOutlined, FileDoneOutlined, KeyOutlined, LogoutOutlined, MoonOutlined, ShopOutlined, SunOutlined, TranslationOutlined, UserOutlined } from "@ant-design/icons";
import type { IconComponent } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/app-link";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useTheme } from "@/lib/theme/client";
import { THEMES, type Theme } from "@/lib/theme/config";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { setLocale } from "@/lib/i18n/actions";
import { useDictionary, useLocale, useT } from "@/lib/i18n/client";
import { roleLabels } from "@/lib/i18n/labels";
import type { SystemRole } from "@/lib/constants";
import { apiFetch } from "@/lib/api-fetch";
import { moneyPalette, primaryButtonTokens } from "@/lib/theme/antd-tokens";

const THEME_ICONS: Record<Theme, IconComponent> = { light: SunOutlined, dark: MoonOutlined, system: DesktopOutlined };
const THEME_LABELS: Record<Theme, DictionaryKey> = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
};

/** Lebar panel — sama dengan `w-64` sebelum migrasi. */
const LEBAR_PANEL = 256;

type BarisMenu = NonNullable<MenuProps["items"]>[number];

/** Inisial dari nama untuk avatar (maks 2 huruf), fallback ikon bila kosong. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Satu baris "pilih salah satu" (bahasa / tema).
 *
 * Penegasan tipenya disengaja dan terbatas pada satu tempat: `MenuItemType`
 * AntD tidak menyebut `role` maupun `aria-checked`, sedangkan rc-menu
 * menyebarkan keduanya ke `<li>`-nya. Lihat alasan lengkapnya di kepala berkas.
 */
function barisPilihan(opts: {
  key: string;
  label: React.ReactNode;
  aktif: boolean;
  disabled?: boolean;
  lang?: string;
  onClick: () => void;
}): BarisMenu {
  return {
    key: opts.key,
    label: opts.label,
    disabled: opts.disabled,
    lang: opts.lang,
    onClick: opts.onClick,
    role: "menuitemradio",
    "aria-checked": opts.aktif,
  } as BarisMenu;
}

export function UserMenu({
  userName,
  role,
  onSignOut,
}: {
  userName: string;
  role: string;
  onSignOut: () => void;
}) {
  /**
   * Perusahaan yang sedang dibuka + apakah ada yang lain (issue #104).
   *
   * Diambil hanya SAAT MENU DIBUKA, sekali per pemuatan halaman: ini informasi
   * yang jarang berubah dan tidak layak dibayar satu permintaan di setiap
   * render. Yang dipakai untuk berpindah tetap layar pemilih — di sanalah
   * pemuatan ulang penuh terjadi, dan itu memang yang dibutuhkan (lihat
   * CompanyChoices).
   */
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<{ id: number; name: string }[] | null>(null);
  const [activeCompany, setActiveCompany] = useState<string | null>(null);
  /* Boleh membuka /platform (akun: perusahaan, langganan, ekspor)? Dijawab
   * server lewat permintaan yang memang sudah dilakukan menu ini. */
  const [canOpenPlatform, setCanOpenPlatform] = useState(false);
  const t = useT();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const dictionary = useDictionary();
  const activeLocale = useLocale();
  const { theme: pilihanTema, resolved, changeTheme } = useTheme();
  const router = useRouter();
  const [switching, startSwitching] = useTransition();
  // Peran kustom (data, tabel `roles`) tidak punya label di kamus — nilai
  // perannya sendiri jadi cadangan, sama seperti sebelum multibahasa.
  const roleLabel = roleLabels(dictionary)[role as SystemRole] || role;
  const abbr = initials(userName);

  useEffect(() => {
    if (!open || companies !== null) return;
    let cancelled = false;
    void apiFetch("/api/user/companies")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            activeId: number | null;
            companies: { id: number; name: string }[];
            canOpenPlatform?: boolean;
          } | null
        ) => {
          if (cancelled || !data) return;
          setCompanies(data.companies);
          setActiveCompany(data.companies.find((c) => c.id === data.activeId)?.name ?? null);
          setCanOpenPlatform(Boolean(data.canOpenPlatform));
        }
      )
      .catch(() => {
        // Menu tetap berguna tanpa daftar perusahaan; jangan menggagalkannya.
      });
    return () => {
      cancelled = true;
    };
  }, [open, companies]);

  /**
   * Simpan pilihan bahasa (cookie, lewat server action) lalu minta server
   * merender ulang: kamus dipilih di root layout, jadi `router.refresh()`
   * adalah yang membuat seluruh chrome berganti bahasa tanpa muat ulang penuh.
   */
  function chooseLocale(next: Locale) {
    if (next === activeLocale) {
      setOpen(false);
      return;
    }
    startSwitching(async () => {
      await setLocale(next);
      router.refresh();
      setOpen(false);
    });
  }

  const judulGrup: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: token.marginXXS,
  };
  const centang = <CheckOutlined aria-hidden="true" style={{ fontSize: 16 }} />;
  /*
   * Latar avatar memakai isian tombol primer (#186), bukan `colorPrimary`
   * global: inisial di dalamnya adalah TEKS PUTIH.
   *
   * ⚠ Alasannya MENGUAT sejak warna merek menjadi navy. Dulu `colorPrimary`
   * (`#1677ff`) gagal tipis (4,10:1). Sekarang `colorPrimary` di tema GELAP
   * sengaja TERANG karena perannya teks — putih di atasnya hanya **2,98:1**,
   * yaitu lambang/avatar yang lenyap. Token yang benar untuk peran "teks terang
   * di atas isian merek" tetap yang dipakai di bawah (lihat `colorBrandSolid`
   * di `lib/theme/antd-tokens.ts`, nilainya sama).
   */
  const latarAvatar = primaryButtonTokens(resolved).colorPrimary;
  /** Tautan mengisi lebar barisnya, dan warnanya ikut keadaan baris menu. */
  const gayaTautan: React.CSSProperties = { display: "block", color: "inherit" };

  const identitas: BarisMenu = {
    key: "identitas",
    type: "group",
    label: (
      <Flex align="center" gap={token.marginXS} style={{ paddingBlock: token.paddingXXS }}>
        <Avatar
          size={36}
          style={{ backgroundColor: latarAvatar, flexShrink: 0 }}
          icon={abbr ? undefined : <UserOutlined aria-hidden="true" style={{ fontSize: 16 }} />}
        >
          {abbr || undefined}
        </Avatar>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: token.fontSize,
              fontWeight: token.fontWeightStrong,
              color: token.colorText,
            }}
          >
            {userName}
          </span>
          <Badge style={{ marginInlineEnd: 0 }}>{roleLabel}</Badge>
          {/* Perusahaan yang sedang dibuka — di aplikasi akuntansi, "buku
              siapa yang sedang saya lihat" adalah hal yang tidak boleh
              perlu ditebak. */}
          {activeCompany && (
            <span
              style={{
                display: "block",
                marginTop: token.marginXXS,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: token.fontSizeSM,
                color: token.colorTextTertiary,
              }}
            >
              {activeCompany}
            </span>
          )}
        </span>
      </Flex>
    ),
  };

  const bahasa: BarisMenu = {
    key: "bahasa",
    type: "group",
    label: (
      <span style={judulGrup}>
        <TranslationOutlined aria-hidden="true" style={{ fontSize: 14 }} />
        {t("userMenu.language")}
      </span>
    ),
    children: [
      ...LOCALES.map((locale) =>
        barisPilihan({
          key: `locale-${locale}`,
          lang: locale,
          aktif: locale === activeLocale,
          disabled: switching,
          onClick: () => chooseLocale(locale),
          label: (
            <Flex align="center" justify="space-between" gap={token.marginXS}>
              <span>{LOCALE_LABELS[locale]}</span>
              {locale === activeLocale && centang}
            </Flex>
          ),
        })
      ),
      ...(switching
        ? [
            {
              key: "locale-switching",
              disabled: true,
              label: (
                <span role="status" style={{ fontSize: token.fontSizeSM }}>
                  {t("userMenu.languageSwitching")}
                </span>
              ),
            } as BarisMenu,
          ]
        : []),
    ],
  };

  /*
   * Tema — tetangga bahasa, dan itu bukan kebetulan.
   *
   * Keduanya preferensi TAMPILAN milik orangnya (bukan milik perusahaan, bukan
   * data), keduanya disimpan sebagai cookie tampilan-saja, dan keduanya dicari
   * orang di tempat yang sama: menu akun. Menaruh tema di ikon lepas pada top
   * bar akan menambah satu penghuni bar demi sesuatu yang disentuh sekali
   * seumur pemasangan.
   *
   * Bentuknya sama dengan blok bahasa di atas (`menuitemradio` +
   * `aria-checked`), bukan `ThemeToggle` berikonnya: di dalam menu, baris
   * berteks bisa dijelajahi dengan panah bersama baris lain — tiga tombol ikon
   * berdampingan justru memutus pola navigasinya.
   */
  const tema: BarisMenu = {
    key: "tema",
    type: "group",
    label: (
      <span style={judulGrup}>
        <BgColorsOutlined aria-hidden="true" style={{ fontSize: 14 }} />
        {t("theme.label")}
      </span>
    ),
    children: THEMES.map((option) => {
      const Icon = THEME_ICONS[option];
      const aktif = option === pilihanTema;
      return barisPilihan({
        key: `theme-${option}`,
        aktif,
        onClick: () => changeTheme(option),
        label: (
          <Flex align="center" justify="space-between" gap={token.marginXS}>
            <Flex component="span" align="center" gap={token.marginXXS}>
              <Icon aria-hidden="true" style={{ fontSize: 16 }} />
              {t(THEME_LABELS[option])}
            </Flex>
            {aktif && centang}
          </Flex>
        ),
      });
    }),
  };

  /*
   * Alamat tujuan sengaja ditulis LITERAL di setiap barisnya, bukan dioper
   * lewat satu pembantu: `tests/platform-landing.test.tsx` mencari
   * `href="/platform"` di berkas ini sebagai bukti bahwa pintu ke halaman akun
   * masih ada setelah nama rutenya berubah dari `/tenant` (#172). Pembantu yang
   * "merapikan" tiga baris ini membuat penjaga itu buta tanpa satu pun tes
   * merah.
   */
  const aksi: BarisMenu[] = [
    /* Ganti perusahaan — hanya muncul bila memang ADA yang lain. Menawarkan
       pilihan yang tidak ada hanya membuat orang menekan sesuatu yang
       mengembalikannya ke tempat yang sama. */
    ...(companies !== null && companies.length > 1
      ? [
          {
            key: "/select-company",
            icon: <ShopOutlined aria-hidden="true" style={{ fontSize: 16 }} />,
            label: (
              <Link href="/select-company" style={gayaTautan}>
                {t("auth.selectCompany.switchLabel")}
              </Link>
            ),
          },
        ]
      : []),
    /* Akun (halaman /platform, issue #172 — dulu /tenant). Terbuka untuk SETIAP
       anggota tenant: di sanalah ia melihat perusahaan yang boleh dibukanya, dan
       owner melihat langganannya. Yang membedakan peran adalah ISI halaman,
       bukan ada-tidaknya tautan ini — tetapi tautannya tetap dikondisikan
       `canOpenPlatform` supaya pengguna tanpa keanggotaan tenant (sisa masa
       adopsi #134) tidak ditawari pintu yang memantulkannya. */
    ...(canOpenPlatform
      ? [
          {
            key: "/platform",
            icon: <FileDoneOutlined aria-hidden="true" style={{ fontSize: 16 }} />,
            label: (
              <Link href="/platform" style={gayaTautan}>
                {t("userMenu.tenantAccount")}
              </Link>
            ),
          },
        ]
      : []),
    {
      key: "/change-password",
      icon: <KeyOutlined aria-hidden="true" style={{ fontSize: 16 }} />,
      label: (
        <Link href="/change-password" style={gayaTautan}>
          {t("userMenu.changePassword")}
        </Link>
      ),
    },
    {
      key: "sign-out",
      danger: true,
      icon: <LogoutOutlined aria-hidden="true" style={{ fontSize: 16 }} />,
      /* `danger` AntD memberi latar hover merah, tetapi warna TEKS-nya
       * `colorError` (3,27:1 di tema terang) — di bawah 4,5:1 untuk teks 14px.
       * Token uang #186 adalah anak tangga yang sudah diukur untuk peran itu. */
      style: { color: moneyPalette(token).colorMoneyNegative },
      onClick: () => {
        setOpen(false);
        onSignOut();
      },
      label: t("userMenu.signOut"),
    },
  ];

  const items: MenuProps["items"] = [
    identitas,
    { type: "divider", key: "d-identitas" },
    bahasa,
    { type: "divider", key: "d-bahasa" },
    tema,
    { type: "divider", key: "d-tema" },
    ...aksi,
  ];

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      trigger={["click"]}
      placement="bottomRight"
      menu={{ items, style: { width: LEBAR_PANEL } }}
    >
      <Button
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("userMenu.trigger", { name: userName, role: roleLabel })}
      >
        <Flex component="span" align="center" gap={token.marginXXS}>
          <Avatar
            size={28}
            style={{ backgroundColor: latarAvatar, flexShrink: 0 }}
            icon={abbr ? undefined : <UserOutlined aria-hidden="true" style={{ fontSize: 14 }} />}
          >
            {abbr || undefined}
          </Avatar>
          {screens.sm && (
            <>
              <span
                style={{
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {userName}
              </span>
              <DownOutlined aria-hidden="true" style={{ fontSize: 16, flexShrink: 0,
                  color: token.colorTextTertiary,
                  transition: `transform ${token.motionDurationMid}`,
                  transform: open ? "rotate(180deg)" : undefined }} />
            </>
          )}
        </Flex>
      </Button>
    </Dropdown>
  );
}
