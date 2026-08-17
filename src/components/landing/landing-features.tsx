/**
 * "Yang Anda dapatkan" — empat kartu yang menjawab *kenapa produk ini*.
 *
 * Dipindahkan keluar dari `app/page.tsx` di issue #245, dan pemindahannya
 * bukan kerapian: setelah pendaratan dan app internal berdiri di atas token
 * yang sama, satu-satunya yang memisahkan keduanya adalah DI MANA markup
 * pemasaran boleh tinggal. `app/(marketing)/page.tsx` kini hanya menyusun; setiap bentuk
 * khas pemasaran — hero, kisi kartu jualan, ajakan penutup — hidup di
 * direktori ini, tempat penjaga impor bisa mengurungnya.
 *
 * Urutan halaman disengaja: empat kartu ini menjawab "kenapa produk ini",
 * `LandingModules` menjawab "apakah PEKERJAAN SAYA ada di dalamnya", dan baru
 * sesudah itu harga. Menaruh harga sebelum kedua jawaban itu memaksa orang
 * menimbang angka untuk sesuatu yang belum ia tahu isinya.
 *
 * ══ POTONGAN UI DI SETIAP KARTU (#402) ═════════════════════════════════════
 * Tinjauan visual terhadap kompetitor (2026-08-17): sesudah hero memakai
 * kerangka aplikasi (#401), seksi ini adalah yang pertama yang kembali ke
 * "ikon + judul + paragraf" — dan kompetitor tidak pernah berhenti
 * memperlihatkan produknya. Tiap kartu kini memuat SATU potongan UI kecil,
 * dirender server, yang menggambar hal yang kalimatnya katakan:
 *
 *   • buku terpisah per PT  → pengalih PT (chip yang SAMA dengan bilah kerangka,
 *                             `FRAME_CHIP` dari `landing-app-frame.tsx`);
 *   • peran & jejak audit   → lencana peran dari `ROLES` + baris "siapa · kapan
 *                             · apa";
 *   • PPN & e-Faktur        → tabel tiga baris DPP / PPN / total, angkanya
 *                             DIHITUNG `computeTax(DEFAULT_TAX_RATE)`;
 *   • tiga bahasa           → pil bahasa dari `LOCALES` + `LOCALE_LABELS`.
 *
 * Semua potongan memakai primitif kerangka (`FRAME_CARD`, chip `landingChip`),
 * BUKAN bentuk baru — kartu manfaat dan kerangka hero harus terbaca sebagai
 * satu produk. Syarat `landing.md` §Angkanya karangan berlaku pada satu-satunya
 * potongan yang memuat NOMINAL (PPN): label "contoh tampilan" berteks di dalam
 * kartunya, dan seluruh potongan `aria-hidden` (ia ilustrasi kalimat di
 * atasnya, bukan isi baru). Nama peran & bahasa bukan angka karangan — ia
 * dibaca dari registri yang sama dengan aplikasinya.
 */
import {
  AuditOutlined,
  CheckOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  SwapOutlined,
  TranslationOutlined,
} from "@ant-design/icons";
import type { CSSProperties, ReactNode } from "react";

import { FRAME_CARD, FRAME_CHIP } from "@/components/landing/landing-app-frame";
import {
  LANDING_BODY,
  type LandingHue,
  landingChip,
  landingFillSoft,
  landingGlyph,
  landingGrid,
} from "@/components/landing/landing-scale";
import {
  LandingSection,
  LandingSectionIntro,
} from "@/components/landing/landing-section";
import { Card, CardContent } from "@/components/ui/card";
import { ROLES } from "@/lib/constants";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { roleLabels } from "@/lib/i18n/labels";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money-format";
import { DEFAULT_TAX_RATE, computeTax } from "@/lib/tax";

/** Kotak ikon: 40px = target sentuh MASTER.md, meski di sini ia tidak diklik. */
const ICON_BOX = 40;

/**
 * DPP contoh untuk potongan PPN — konstanta bernama supaya terbaca sebagai
 * DATA CONTOH; PPN & totalnya DIHITUNG dari mesin pajak yang sama dengan
 * faktur sungguhan, jadi tarif yang berubah ikut berubah di sini.
 */
const CONTOH_DPP = 12_500_000;

/**
 * Pil di dalam potongan — chip sehue kartu (28%), teks `colorText`, radius
 * kendali. Sama bentuknya dengan pil modul di "Untuk siapa".
 */
const PIL: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  minHeight: 28,
  paddingInline: "var(--ant-padding-xs)",
  borderRadius: "var(--sai-landing-radius-control)",
  color: "var(--ant-color-text)",
  fontSize: "var(--ant-font-size)",
  whiteSpace: "nowrap",
};

/** Baris tabel mini: label kiri, nominal `tabular-nums` rata kanan. */
const BARIS: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "var(--ant-margin-sm)",
  paddingBlock: 3,
  fontSize: "var(--ant-font-size)",
};

const NOMINAL: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

/**
 * Wadah potongan: kartu area kerja kerangka (`FRAME_CARD`) — permukaan
 * `colorBgContainer` bertepi di atas kartu bernada, jenjang yang sama dengan
 * kartu KPI di dalam kerangka hero. Tepinya WAJIB di sini (bukan pelanggaran
 * §Tepi): ia berdiri di atas kartu BERNADA, tempat permukaan tanpa tepi
 * hanya 1,2–1,5:1 terhadap nadanya.
 */
function Potongan({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      style={{
        ...FRAME_CARD,
        marginTop: "var(--ant-margin-sm)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--ant-margin-xs)",
        paddingBlock: "var(--ant-padding-xs)",
      }}
    >
      {children}
    </div>
  );
}

export async function LandingFeatures() {
  const t = await getT();

  /* PPN contoh — dari mesin pajak yang sama dengan faktur (`lib/tax.ts`). */
  const pajak = computeTax(CONTOH_DPP, DEFAULT_TAX_RATE);

  /*
   * Tiga peran SISTEM dari `ROLES` (`lib/constants.ts`) — namanya lewat
   * `roleLabels()` (`lib/i18n/labels.ts`), penolong yang SAMA dengan halaman
   * Pengguna, jadi lencananya tidak bisa menyebut peran yang tidak ada dan
   * tidak merakit kunci kamus secara dinamis (`tests/i18n-orphan-keys`).
   * Tiga, bukan empat: pil keempat ("Administrator Sistem") patah ke baris
   * ketiga di kartu 280px.
   */
  const label = roleLabels(await getDictionary(await getLocale()));
  const peran = [
    label[ROLES.MANAGING_DIRECTOR],
    label[ROLES.FINANCE_MANAGER],
    label[ROLES.WAREHOUSE_HEAD],
  ];

  /*
   * ══ SATU NADA PER KARTU — dan hue-nya adalah PENANDA, bukan selera ═══════
   * Empat kartu ini menjawab empat pertanyaan yang berbeda, dan sebelum
   * perubahan ini keempatnya kotak putih bergaris dengan kotak ikon yang sama
   * persis: satu wilayah yang harus dibaca berurutan supaya ketahuan isinya
   * empat hal. Nada yang berbeda per kartu membuat barisnya bisa DIPINDAI.
   *
   * Nada TIDAK pernah menjadi satu-satunya penanda (MASTER.md §Anti-Patterns):
   * setiap kartu tetap punya judul, ikonnya sendiri, dan kalimat penjelas.
   * Yang ditambahkan warna hanyalah "ini empat hal, bukan satu".
   *
   * Kartu ini berdiri di atas seksi POLOS, bukan di atas pita — itu syaratnya.
   * Nada kartu dan nada pita yang sama-sama tint akan saling meniadakan di tema
   * terang (1,03:1); aturannya karena itu satu kalimat: **warnai pitanya ATAU
   * kartunya, tidak keduanya.**
   */
  const features: {
    icon: typeof ShopOutlined;
    hue: LandingHue;
    title: string;
    body: string;
    snippet: ReactNode;
  }[] = [
    {
      icon: ShopOutlined,
      hue: "brand",
      title: t("landing.featureCompaniesTitle"),
      body: t("landing.featureCompaniesBody"),
      /* Pengalih PT — chip yang SAMA dengan bilah kerangka hero: PT aktif
         berisi nada + centang, PT kedua redup, ikon tukar. Nama PT jelas
         contoh (§Angkanya karangan syarat 2). */
      snippet: (
        <span
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--ant-margin-xxs)",
            minWidth: 0,
          }}
        >
          <span
            style={{
              ...FRAME_CHIP,
              display: "inline-flex",
              background: landingChip("brand"),
              color: landingGlyph("brand"),
              fontWeight: "var(--ant-font-weight-strong)",
            }}
          >
            <CheckOutlined />
            {t("landing.mockCompany")}
          </span>
          <span
            style={{
              ...FRAME_CHIP,
              display: "inline-flex",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            {t("landing.mockCompanyTwo")}
          </span>
          <SwapOutlined
            style={{
              color: "var(--ant-color-text-secondary)",
              fontSize: "var(--ant-font-size)",
            }}
          />
          {/* Kalimat pengalih PT — kunci yang SAMA dengan layar pengalih di
              galeri, jadi janji "satu akun, buku terpisah" berbunyi satu. */}
          <span
            style={{
              flexBasis: "100%",
              fontSize: "var(--ant-font-size-sm)",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            {t("landing.mockSwitcherHint")}
          </span>
        </span>
      ),
    },
    {
      icon: SafetyCertificateOutlined,
      hue: "indigo",
      title: t("landing.featureRolesTitle"),
      body: t("landing.featureRolesBody"),
      /* Lencana peran (chip indigo) + baris jejak audit. */
      snippet: (
        <>
          <span
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--ant-margin-xxs)",
            }}
          >
            {peran.map((nama) => (
              <span
                key={nama}
                style={{ ...PIL, background: landingChip("indigo") }}
              >
                <SafetyCertificateOutlined
                  style={{ color: landingGlyph("indigo") }}
                />
                {nama}
              </span>
            ))}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--ant-margin-xxs)",
              fontSize: "var(--ant-font-size-sm)",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            <AuditOutlined />
            {t("landing.snippetAuditRow")}
          </span>
        </>
      ),
    },
    {
      icon: FileTextOutlined,
      hue: "cyan",
      title: t("landing.featureTaxTitle"),
      body: t("landing.featureTaxBody"),
      /* Tabel tiga baris DPP / PPN / total — nominal DIHITUNG, label contoh
         berteks di dalam kartunya (§Angkanya karangan syarat 1). Kunci
         barisnya sama dengan faktur di galeri: satu istilah, satu kunci. */
      snippet: (
        <>
          <span style={BARIS}>
            <span>{t("landing.mockSubtotal")}</span>
            <span style={NOMINAL}>{formatMoney(pajak.dpp, "IDR")}</span>
          </span>
          <span
            style={{
              ...BARIS,
              borderBottom: "1px solid var(--ant-color-border-secondary)",
            }}
          >
            <span>{t("landing.mockVat", { rate: DEFAULT_TAX_RATE })}</span>
            <span style={NOMINAL}>{formatMoney(pajak.taxAmount, "IDR")}</span>
          </span>
          <span style={{ ...BARIS, fontWeight: "var(--ant-font-weight-strong)" }}>
            <span>{t("landing.mockInvoiceTotal")}</span>
            <span style={NOMINAL}>{formatMoney(pajak.total, "IDR")}</span>
          </span>
          <span
            style={{
              fontSize: "var(--ant-font-size-sm)",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            {t("landing.mockCaption")}
          </span>
        </>
      ),
    },
    {
      icon: TranslationOutlined,
      hue: "violet",
      title: t("landing.featureLanguageTitle"),
      body: t("landing.featureLanguageBody"),
      /* Pil bahasa dari `LOCALES` — nama dalam bahasanya sendiri
         (`LOCALE_LABELS`, aturan yang sama dengan pemilih bahasa). Bahasa
         yang ditambahkan ke registri muncul di sini tanpa ada yang ingat. */
      snippet: (
        <span
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--ant-margin-xxs)",
          }}
        >
          {LOCALES.map((locale) => (
            <span
              key={locale}
              style={{ ...PIL, background: landingChip("violet") }}
            >
              <TranslationOutlined style={{ color: landingGlyph("violet") }} />
              {LOCALE_LABELS[locale]}
            </span>
          ))}
        </span>
      ),
    },
  ];

  return (
    <LandingSection divider={false}>
      <LandingSectionIntro
        eyebrow={t("landing.eyebrowFeatures")}
        title={t("landing.featuresHeading")}
      />
      {/* ⚠ Kisi SERAGAM, dan itu keputusan yang diambil setelah mencoba
          kebalikannya. Versi asimetris (kartu pertama membentang penuh, tiga
          sisanya di dua kolom) DICOBA dan dibuang: tiga sisa di dua kolom
          menyisakan satu kartu yatim di baris terakhir, yang di layar terbaca
          sebagai kisi yang gagal memuat — bukan sebagai penekanan. Irama
          halaman ini dipecah di tempat lain (daftar modul), bukan di sini. */}
      <ul
        style={{
          ...landingGrid(2, 280),
          listStyle: "none",
          margin: 0,
          marginTop: "var(--ant-margin-lg)",
          padding: 0,
        }}
      >
        {features.map((feature) => (
          <li key={feature.title}>
            <Card
              data-landing-card=""
              style={{
                height: "100%",
                background: landingFillSoft(feature.hue),
                borderRadius: "var(--sai-landing-radius)",
                /* Tepi DICABUT di sini, dan hanya di sini: kartu ini berdiri
                   di atas seksi POLOS, jadi nadanya sendiri yang menggambar
                   batasnya. Aturan "tepi tidak boleh dicabut" di landing.md
                   berlaku untuk kartu di atas PITA — di sana selisih kartu
                   terhadap pita hanya 1,01–1,06:1 di tema gelap dan tepi itu
                   satu-satunya pemisahnya. Di sini tidak ada pita. */
                border: "none",
              }}
            >
              {/* Kolom: baris (ikon + teks) lalu potongan UI SELEBAR kartu.
                  Potongan sengaja tidak di kolom teks: di 320px kolom itu
                  hanya ~184px (kartu 288 − padding − ikon 40 − jarak), dan
                  tabel DPP/PPN/total menuntut ±200px; di lebar kartu penuh
                  (±240px) ia muat tanpa memotong nominal. */}
              <CardContent
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                }}
              >
                <div style={{ display: "flex", gap: "var(--ant-margin)" }}>
                {/* Ikon dekoratif: kotaknya `aria-hidden`, jadi span
                    `role="img"` bawaan ikon AntD tidak ikut dibacakan sesudah
                    judul yang sudah mengatakan hal yang sama. Ukurannya
                    `font-size`, bukan kelas kotak (MASTER.md §Ikon).

                    Kotaknya berisi PEKAT (28%) dan glifnya anak tangga ke-8
                    dari hue yang sama — pasangan yang bergerak searah di kedua
                    tema, terukur 4,51–8,27:1 (ambang ikon 3:1). */}
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    flexShrink: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    width: ICON_BOX,
                    height: ICON_BOX,
                    borderRadius: "50%",
                    background: landingChip(feature.hue),
                    color: landingGlyph(feature.hue),
                    fontSize: "var(--ant-font-size-xl)",
                  }}
                >
                  <feature.icon />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "var(--ant-font-size-lg)",
                      fontWeight: "var(--ant-font-weight-strong)",
                    }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    style={{
                      ...LANDING_BODY,
                      marginTop: "var(--ant-margin-xxs)",
                      fontSize: "var(--ant-font-size)",
                    }}
                  >
                    {feature.body}
                  </p>
                </div>
                </div>
                <Potongan>{feature.snippet}</Potongan>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}
