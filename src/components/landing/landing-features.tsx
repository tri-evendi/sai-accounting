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
 */
import {
  FileTextOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
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
import { Card, CardContent } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";

/** Kotak ikon: 40px = target sentuh MASTER.md, meski di sini ia tidak diklik. */
const ICON_BOX = 40;

export async function LandingFeatures() {
  const t = await getT();

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
  }[] = [
    {
      icon: ShopOutlined,
      hue: "brand",
      title: t("landing.featureCompaniesTitle"),
      body: t("landing.featureCompaniesBody"),
    },
    {
      icon: SafetyCertificateOutlined,
      hue: "indigo",
      title: t("landing.featureRolesTitle"),
      body: t("landing.featureRolesBody"),
    },
    {
      icon: FileTextOutlined,
      hue: "cyan",
      title: t("landing.featureTaxTitle"),
      body: t("landing.featureTaxBody"),
    },
    {
      icon: TranslationOutlined,
      hue: "violet",
      title: t("landing.featureLanguageTitle"),
      body: t("landing.featureLanguageBody"),
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
              <CardContent
                style={{ display: "flex", gap: "var(--ant-margin)" }}
              >
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
                <div>
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
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}
