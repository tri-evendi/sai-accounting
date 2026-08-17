/**
 * Kerangka aplikasi — bentuk "jendela produk" yang dipakai BERSAMA oleh
 * purwarupa hero (`landing-hero-mock.tsx`) dan galeri layar
 * (`landing-gallery.tsx`), issue #401.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Tinjauan visual terhadap kompetitor (Jurnal, Kledo, Accurate, Zahir, Zoho
 * Books, Wave, Xero — 2026-08-17): mereka menjual dengan MEMPERLIHATKAN
 * aplikasinya — bilah atas, sidebar, ubin angka, grafik — sementara halaman
 * ini memajang kartu ringkasan tanpa chrome aplikasi. Kerangka ini yang
 * mengubah "kartu dokumen" menjadi "layar aplikasi": bilah atas dengan
 * pengalih PT, sidebar berikon dari registri modul, area utama, dan label
 * contoh di kakinya.
 *
 * SATU komponen untuk empat pemakai (hero + tiga layar galeri), sebab bentuk
 * yang ditulis dua kali akan berbeda pada hari salah satunya disunting — dan
 * di halaman pemasaran perbedaan itu terbaca sebagai dua produk.
 *
 * ══ MENIRU BENTUK APP, TANPA MENGIMPOR KOMPONENNYA ═════════════════════════
 * Bentuknya dirujuk dari `src/components/layout/*` (sider gelap berikon,
 * bilah atas terang, penanda perusahaan) tetapi TIDAK satu pun komponen di
 * sana diimpor: semuanya client component (`Layout.Sider`, `Menu`, menu
 * pengguna), dan halaman ini nol JavaScript sisi klien (`AMBANG_KLIEN`,
 * `tests/rsc-boundary.test.ts`; `tests/landing-boundary.test.ts` juga
 * menolak impor dari luar `components/ui`, `lib`, dan sesama pendaratan).
 * Yang ditiru bentuknya, bukan kodenya.
 *
 * ══ SIDEBAR NAVY = `--ant-color-brand-solid` ═══════════════════════════════
 * Sider aplikasi sungguhan gelap permanen (`SIDER_BG_DARK`), tetapi nilai itu
 * bukan variabel CSS dan halaman ini hanya boleh menulis token. Isian merek
 * adalah padanan terdekatnya yang PUNYA angka: glif putih di atasnya 11,50:1
 * (terang) · 5,06:1 (gelap), sudah diukur untuk `BrandMark`. Butir aktif
 * ditandai isian putih translusen — dan sidebar ini bukan pita: ia strip
 * 40px di dalam gambar produk, jadi tidak bersaing dengan pita penutup yang
 * sengaja menjadi satu-satunya bidang navy selebar layar.
 *
 * ══ BENTUKNYA MENGIKUTI LEBAR KERANGKA, BUKAN VIEWPORT ═════════════════════
 * Kerangka yang sama berdiri di 55% kolom hero, 60% kartu galeri besar, dan
 * 40% kartu galeri kecil — tiga lebar pada satu viewport. Karena itu sidebar
 * disembunyikan / label sidebar & PT kedua ditampilkan lewat `@container`
 * di `LANDING_STYLE`, bukan lewat titik patah viewport.
 *
 * ══ SYARAT `landing.md` §Angkanya karangan TETAP BERLAKU ═══════════════════
 * Kerangka ini hanya BINGKAI; yang membuat angka di dalamnya sah adalah tiga
 * hal yang tetap menjadi tanggung jawab pemanggil + kaki kerangka ini: label
 * "contoh tampilan" berteks & selalu terlihat (dirender DI SINI, di kaki,
 * supaya tidak ada pemakai yang lupa), nama PT jelas contoh (pemanggil),
 * `aria-hidden` pada seluruh purwarupa (pemanggil).
 */
import { CheckOutlined, SwapOutlined, UserOutlined } from "@ant-design/icons";
import type { CSSProperties, ReactNode } from "react";

import { MODULE_ICON } from "@/components/landing/landing-modules";
import {
  LANDING_NOTE,
  LANDING_SURFACE,
  landingChip,
  landingGlyph,
} from "@/components/landing/landing-scale";
import { BrandMark } from "@/components/ui/brand-mark";
import { MODULE_META, type BusinessModule } from "@/lib/business-modules";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export interface FrameCompany {
  name: string;
  active: boolean;
}

export interface FrameNavItem {
  key: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}

/**
 * Enam modul yang digambar di sidebar kerangka — dari REGISTRI, bukan diketik:
 * ikonnya `MODULE_ICON` (peta yang sama dengan daftar modul), labelnya
 * `MODULE_META[m].labelKey`. Modul yang dihapus dari `BUSINESS_MODULES`
 * ditolak `tsc` di sini, bukan menjadi butir hantu di halaman publik.
 *
 * Enam, bukan sepuluh: sidebar setinggi kerangka hero (~340px) memuat enam
 * butir 32px; sepuluh akan meluap atau memaksa kerangka lebih tinggi daripada
 * kalimat di sebelahnya. Yang dipilih adalah yang paling sering dibuka —
 * pembukuan inti, kas & bank, penjualan, pembelian, persediaan, pajak.
 */
const FRAME_NAV_MODULES = [
  "core_accounting",
  "cash_bank",
  "sales",
  "purchasing",
  "inventory",
  "tax_id",
] as const satisfies readonly BusinessModule[];

/** Butir sidebar untuk kerangka, dengan satu modul aktif. */
export function landingFrameNav(
  t: (key: DictionaryKey) => string,
  active: (typeof FRAME_NAV_MODULES)[number],
): FrameNavItem[] {
  return FRAME_NAV_MODULES.map((module) => {
    const Icon = MODULE_ICON[module];
    return {
      key: module,
      icon: <Icon />,
      label: t(MODULE_META[module].labelKey),
      active: module === active,
    };
  });
}

/** Tinggi bilah atas kerangka — 44px: memuat lambang 32px + jarak. */
const TOPBAR_HEIGHT = 44;

/** Lebar sidebar berikon — 40px (permintaan issue: "sidebar 40px berikon"). */
const NAV_WIDTH = 40;

/* `display` sengaja TIDAK di sini — chip aktif menulisnya sendiri; chip PT
   kedua mendapatnya dari CSS (`[data-landing-frame-alt]`, tampil ≥520px).

   DIEKSPOR sejak #402: potongan UI di kartu manfaat ("buku terpisah per PT")
   menggambar pengalih PT yang SAMA dengan bilah kerangka — bentuk yang
   ditulis dua kali akan berbeda pada hari salah satunya disunting. */
export const FRAME_CHIP: CSSProperties = {
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  minWidth: 0,
  paddingInline: "var(--ant-padding-xs)",
  paddingBlock: 2,
  borderRadius: "var(--ant-border-radius)",
  fontSize: "var(--ant-font-size-sm)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export function LandingAppFrame({
  title,
  companies,
  nav,
  navLabels = false,
  caption,
  children,
  style,
}: {
  /** Nama layar di bilah atas ("Dasbor", "Jurnal umum", …). */
  title: string;
  /** Pengalih PT: dua PT contoh, satu aktif. PT kedua tampil bila kerangka cukup lebar. */
  companies: FrameCompany[];
  /** Butir sidebar — ikon (+ label bila `navLabels`) dari registri modul. */
  nav: FrameNavItem[];
  /** Hanya hero yang meminta label; galeri tetap sidebar berikon 40px. */
  navLabels?: boolean;
  /** Label "contoh tampilan" — dirender di kaki, selalu terlihat. */
  caption: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      data-landing-frame=""
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        borderRadius: "var(--sai-landing-radius)",
        border: "1px solid var(--ant-color-border-secondary)",
        background: LANDING_SURFACE,
        /* Token bayangan, bukan tulisan tangan (MASTER.md §Jarak, radius, bayangan). */
        boxShadow: "var(--ant-box-shadow-tertiary)",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* ── Bilah atas: lambang · nama layar · pengalih PT · pengguna ───── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--ant-margin-xs)",
          minHeight: TOPBAR_HEIGHT,
          paddingInline: "var(--ant-padding-xs)",
          borderBottom: "1px solid var(--ant-color-border-secondary)",
        }}
      >
        <BrandMark size="sm" />
        <span
          style={{
            fontWeight: "var(--ant-font-weight-strong)",
            fontSize: "var(--ant-font-size)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>

        {/* Pengalih PT — janji hero ("satu PT — atau banyak") yang digambar
            di setiap kerangka: PT aktif berisi nada, PT kedua di sebelahnya
            (tampil bila kerangka >=520px), lalu ikon tukar. */}
        <span
          style={{
            marginInlineStart: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--ant-margin-xxs)",
            minWidth: 0,
          }}
        >
          {companies.map((company) =>
            company.active ? (
              <span
                key={company.name}
                style={{
                  ...FRAME_CHIP,
                  display: "inline-flex",
                  background: landingChip("brand"),
                  color: landingGlyph("brand"),
                  fontWeight: "var(--ant-font-weight-strong)",
                }}
              >
                <CheckOutlined />
                {company.name}
              </span>
            ) : (
              <span
                key={company.name}
                data-landing-frame-alt=""
                style={{ ...FRAME_CHIP, color: "var(--ant-color-text-secondary)" }}
              >
                {company.name}
              </span>
            ),
          )}
          <SwapOutlined
            style={{
              color: "var(--ant-color-text-secondary)",
              fontSize: "var(--ant-font-size)",
            }}
          />
        </span>

        {/* Lingkaran pengguna — bentuk menu pengguna app, tanpa nama. */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            flexShrink: 0,
            borderRadius: "50%",
            background: landingChip("brand"),
            color: landingGlyph("brand"),
            fontSize: "var(--ant-font-size-sm)",
          }}
        >
          <UserOutlined />
        </span>
      </div>

      {/* ── Badan: sidebar + area utama ─────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ⚠ TANPA `display` sebaris di sidebar & PT kedua: keduanya
            disembunyikan/ditampilkan oleh aturan `@container` di
            `LANDING_STYLE`, dan gaya sebaris akan MENANG atas aturan itu —
            terukur: dengan `display:flex` sebaris sidebar tetap tampil di
            kerangka 288px. `display`-nya hidup di CSS. */}
        <div
          data-landing-frame-nav={navLabels ? "wide" : ""}
          style={{
            gap: 2,
            flexShrink: 0,
            minWidth: NAV_WIDTH,
            padding: "var(--ant-padding-xxs)",
            background: "var(--sai-landing-band-solid)",
            color: "var(--sai-landing-on-solid)",
          }}
        >
          {nav.map((item) => (
            <span
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--ant-margin-xs)",
                height: 32,
                paddingInline: 8,
                borderRadius: "var(--ant-border-radius)",
                whiteSpace: "nowrap",
                /* Butir aktif: isian putih translusen di atas navy — dan
                   nama modulnya (bila label tampil) yang menamainya, jadi
                   isian bukan penanda tunggal. */
                background: item.active
                  ? "color-mix(in srgb, var(--sai-landing-on-solid) 18%, transparent)"
                  : undefined,
                fontWeight: item.active ? "var(--ant-font-weight-strong)" : undefined,
                fontSize: "var(--ant-font-size)",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  fontSize: "var(--ant-font-size-lg)",
                  lineHeight: 1,
                }}
              >
                {item.icon}
              </span>
              <span data-landing-frame-nav-label="">{item.label}</span>
            </span>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: "var(--ant-padding-sm)",
            /* Area kerja app: `colorBgLayout` di belakang kartu-kartu
               `colorBgContainer` — jenjang yang sama dengan dasbor sungguhan. */
            background: "var(--ant-color-bg-layout)",
          }}
        >
          {children}
        </div>
      </div>

      {/* Label contoh: BERTEKS, selalu terlihat, di dalam kerangkanya sendiri.
          14px, bukan 12px — ia mekanisme yang membuat angka di atasnya sah,
          bukan keterangan hias (`landing.md` §Angkanya karangan). */}
      <p
        data-landing-frame-caption=""
        style={{
          ...LANDING_NOTE,
          borderTop: "1px solid var(--ant-color-border-secondary)",
          background: "var(--ant-color-fill-quaternary)",
          /* ⚠ Hanya sisi AWAL yang sebaris. Sisi akhir milik CSS
             (`[data-landing-frame-caption]`): di hero ia diperlebar selebar
             kartu ponsel mulai 768px, dan `paddingInline` sebaris (shorthand
             kedua sisi) akan MENANG atas aturan itu — terukur, kalimatnya
             lewat di bawah kartu ponsel. */
          paddingInlineStart: "var(--ant-padding)",
          paddingBlock: "var(--ant-padding-xs)",
          fontSize: "var(--ant-font-size)",
        }}
      >
        {caption}
      </p>
    </div>
  );
}

/**
 * Kartu di dalam area kerja kerangka — `colorBgContainer` bertepi di atas
 * `colorBgLayout`, persis kartu KPI dasbor. Diekspor supaya hero & galeri
 * menggambar kartu dalam yang SAMA.
 */
export const FRAME_CARD: CSSProperties = {
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  paddingInline: "var(--ant-padding-sm)",
  paddingBlock: "var(--ant-padding-xs)",
  minWidth: 0,
};
