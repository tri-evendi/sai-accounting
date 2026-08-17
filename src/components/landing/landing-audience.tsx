/**
 * "Untuk siapa" — empat segmen usaha, masing-masing dinyatakan lewat MODUL
 * yang biasanya dipakainya (#398).
 *
 * ══ KENAPA SEKSI INI ADA ═══════════════════════════════════════════════════
 * Delapan dari sembilan kompetitor yang ditinjau menyatakan siapa sasarannya;
 * halaman ini tidak — padahal registri modulnya justru KHAS: kontrak
 * berjangka, arsip B/L & COO, tiga bahasa termasuk Mandarin. Sasaran yang
 * tersirat dari registri itu ("perusahaan dagang / ekspor-impor / beberapa
 * PT") tidak pernah dinyatakan, jadi pembaca yang cocok harus menyimpulkannya
 * sendiri dari sepuluh baris daftar modul.
 *
 * ══ MODUL DISEBUT LEWAT REGISTRI, BUKAN DIKETIK ════════════════════════════
 * Setiap kartu memegang `BusinessModule[]` dan merender `MODULE_META[m].labelKey`
 * — jadi nama modulnya SAMA PERSIS dengan daftar di seksi modul, dalam bahasa
 * pembacanya, dan modul yang dihapus dari registri ditolak `tsc` di sini
 * (kunci union), bukan menjadi kata yang tidak menunjuk apa pun di halaman
 * publik. Kalimat kartunya sendiri tetap kalimat pemasaran biasa; yang
 * dikunci ke registri adalah KLAIM tentang modul.
 *
 * ══ LETAKNYA: SESUDAH DAFTAR MODUL ═════════════════════════════════════════
 * Issue #398 membebaskan pilihan antara sesudah `LandingFeatures` atau sesudah
 * `LandingModules`. Dipilih SESUDAH modul, dengan dua alasan:
 *
 *   1. Kartu di sini menyebut modul lewat NAMANYA. Sebelum daftar modul,
 *      "Perdagangan", "Dokumen ekspor" adalah kata yang belum diperkenalkan;
 *      sesudahnya ia rujukan ke sesuatu yang baru saja dibaca — seksi ini
 *      menjawab "dari sepuluh itu, mana yang untuk SAYA".
 *   2. Irama pita. Seksi manfaat sudah polos berkartu nada; menaruh seksi
 *      polos berkartu nada kedua tepat di bawahnya menghasilkan dua kisi
 *      kartu yang identik bentuknya berturut-turut — persis keluhan "terlalu
 *      kaku" di `landing.md`. Sesudah pita cyan modul, seksi polos ini
 *      mengembalikan selang-seling polos → pita → polos.
 *
 * ══ EMPAT NADA, SATU PER KARTU — pola yang sama dengan seksi manfaat ═══════
 * Nada adalah penanda "ini empat hal", bukan kategori (registri tidak punya
 * kategori — `landing.md` §Yang DITOLAK). Kartu berdiri di seksi POLOS, tanpa
 * tepi; pil modul di dalamnya memakai `chip-*` sehue dengan kartunya — pasangan
 * chip-di-atas-fill yang sama dengan kotak ikon, dan teks di atas `chip-*`
 * sudah diukur ≥4,5:1 di kedua tema oleh `tests/landing-colors.test.ts`.
 */
import {
  ApartmentOutlined,
  GlobalOutlined,
  SolutionOutlined,
  TranslationOutlined,
} from "@ant-design/icons";

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
import { MODULE_ICON } from "@/components/landing/landing-modules";
import { Card, CardContent } from "@/components/ui/card";
import { MODULE_META, type BusinessModule } from "@/lib/business-modules";
import { getT } from "@/lib/i18n/server";

/** Sama dengan kartu manfaat & kepercayaan: 40px = target sentuh MASTER.md. */
const ICON_BOX = 40;

interface Segment {
  icon: typeof GlobalOutlined;
  hue: LandingHue;
  title: string;
  body: string;
  /**
   * Modul yang disebut kartu ini. Kunci `BusinessModule`, bukan nama yang
   * diketik: modul yang dihapus dari registri ditolak `tsc` di baris ini.
   */
  modules: readonly BusinessModule[];
}

export async function LandingAudience() {
  const t = await getT();

  const segments: Segment[] = [
    {
      icon: GlobalOutlined,
      hue: "brand",
      title: t("landing.audienceTradingTitle"),
      body: t("landing.audienceTradingBody"),
      /* Lapisan dagang + arsip dokumen ekspor + stok + e-Faktur: preset
         `commodity_trading` di `CATEGORY_MODULES` menyalakan semuanya; yang
         disebut di sini adalah empat yang membedakannya dari usaha lain. */
      modules: ["trading", "documents", "inventory", "tax_id"],
    },
    {
      icon: ApartmentOutlined,
      hue: "indigo",
      title: t("landing.audienceHoldingTitle"),
      body: t("landing.audienceHoldingBody"),
      /* Buku terpisah per PT adalah sifat PLATFORM (#104), bukan modul; yang
         bisa disebut lewat registri adalah inti yang selalu aktif di setiap
         PT, antrean persetujuan, dan kas & bank per PT. */
      modules: ["core_accounting", "approvals", "cash_bank"],
    },
    {
      icon: TranslationOutlined,
      hue: "violet",
      title: t("landing.audienceLanguageTitle"),
      body: t("landing.audienceLanguageBody"),
      /* Bahasa dipilih per orang (`lib/i18n/config.ts`, cookie) — modul yang
         paling sering dibaca dua pihak berbeda bahasa: dokumen jual-beli dan
         antrean yang menyetujuinya. */
      modules: ["sales", "purchasing", "approvals"],
    },
    {
      icon: SolutionOutlined,
      hue: "cyan",
      title: t("landing.audienceServicesTitle"),
      body: t("landing.audienceServicesBody"),
      /* Preset `services` di `CATEGORY_MODULES` — tanpa stok, tanpa lapisan
         dagang. */
      modules: ["core_accounting", "cash_bank", "fixed_assets"],
    },
  ];

  return (
    /* Seksi POLOS dengan kartu bernada — pasangan yang sah menurut
       `landing.md` §"warnai pitanya ATAU kartunya, tidak keduanya". */
    <LandingSection>
      <LandingSectionIntro
        eyebrow={t("landing.eyebrowAudience")}
        title={t("landing.audienceHeading")}
      >
        {t("landing.audienceBody")}
      </LandingSectionIntro>

      <ul
        style={{
          ...landingGrid(2, 280),
          listStyle: "none",
          margin: 0,
          marginTop: "var(--ant-margin-lg)",
          padding: 0,
        }}
      >
        {segments.map((segment) => (
          <li key={segment.title}>
            <Card
              data-landing-card=""
              style={{
                height: "100%",
                background: landingFillSoft(segment.hue),
                borderRadius: "var(--sai-landing-radius)",
                /* Tanpa tepi: kartu di atas seksi POLOS, nadanya sendiri yang
                   menggambar batasnya (`landing.md` §Tepi). */
                border: "none",
              }}
            >
              <CardContent
                style={{ display: "flex", gap: "var(--ant-margin)" }}
              >
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
                    background: landingChip(segment.hue),
                    color: landingGlyph(segment.hue),
                    fontSize: "var(--ant-font-size-xl)",
                  }}
                >
                  <segment.icon />
                </span>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "var(--ant-font-size-lg)",
                      fontWeight: "var(--ant-font-weight-strong)",
                    }}
                  >
                    {segment.title}
                  </h3>
                  <p
                    style={{
                      ...LANDING_BODY,
                      marginTop: "var(--ant-margin-xxs)",
                      fontSize: "var(--ant-font-size)",
                    }}
                  >
                    {segment.body}
                  </p>

                  {/* Daftar modul: `<ul>` berlabel, bukan deretan `<span>`
                      telanjang — pembaca layar mendapat "daftar, 4 butir",
                      bukan empat kata yang menempel. Labelnya `<p>` biasa
                      (`aria-labelledby` menuntut id yang unik per kartu, dan
                      itu ada di sini). */}
                  <p
                    id={`audience-modules-${segment.hue}`}
                    style={{
                      margin: 0,
                      marginTop: "var(--ant-margin-sm)",
                      fontSize: "var(--ant-font-size-sm)",
                      fontWeight: "var(--ant-font-weight-strong)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--ant-color-text-secondary)",
                    }}
                  >
                    {t("landing.audienceModulesLabel")}
                  </p>
                  <ul
                    aria-labelledby={`audience-modules-${segment.hue}`}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "var(--ant-margin-xs)",
                      listStyle: "none",
                      margin: 0,
                      marginTop: "var(--ant-margin-xs)",
                      padding: 0,
                    }}
                  >
                    {segment.modules.map((module) => {
                      /* Ikon modul dari peta yang SAMA dengan daftar modul &
                         sidebar kerangka (`MODULE_ICON`) — pil ini kini
                         menunjuk balik ke baris yang baru saja dibaca di
                         seksi modul, bukan sekadar menyebut namanya (#402). */
                      const Icon = MODULE_ICON[module];
                      return (
                        <li
                          key={module}
                          style={{
                            /* Pil: chip sehue di atas fill sehue — pasangan
                               yang sama dengan kotak ikon. Teksnya
                               `colorText` 14px, bukan 12px: nama modul adalah
                               ISI, bukan keterangan. Glifnya anak tangga -8
                               sehue (≥3:1 di atas chip, terukur). */
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "var(--ant-margin-xxs)",
                            minHeight: 32,
                            paddingInline: "var(--ant-padding-sm)",
                            borderRadius: "var(--sai-landing-radius-control)",
                            background: landingChip(segment.hue),
                            color: "var(--ant-color-text)",
                            fontSize: "var(--ant-font-size)",
                            fontWeight: 500,
                          }}
                        >
                          <Icon
                            aria-hidden="true"
                            style={{
                              color: landingGlyph(segment.hue),
                              fontSize: "var(--ant-font-size-lg)",
                            }}
                          />
                          {t(MODULE_META[module].labelKey)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}
