/**
 * "Yang Anda dapatkan" — empat kartu yang menjawab *kenapa produk ini*.
 *
 * Dipindahkan keluar dari `app/page.tsx` di issue #245, dan pemindahannya
 * bukan kerapian: setelah pendaratan dan app internal berdiri di atas token
 * yang sama, satu-satunya yang memisahkan keduanya adalah DI MANA markup
 * pemasaran boleh tinggal. `app/page.tsx` kini hanya menyusun; setiap bentuk
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
  landingGrid,
} from "@/components/landing/landing-scale";
import { LandingSection, LandingSectionIntro } from "@/components/landing/landing-section";
import { Card, CardContent } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";

/** Kotak ikon: 40px = target sentuh MASTER.md, meski di sini ia tidak diklik. */
const ICON_BOX = 40;

export async function LandingFeatures() {
  const t = await getT();

  const features = [
    {
      icon: ShopOutlined,
      title: t("landing.featureCompaniesTitle"),
      body: t("landing.featureCompaniesBody"),
    },
    {
      icon: SafetyCertificateOutlined,
      title: t("landing.featureRolesTitle"),
      body: t("landing.featureRolesBody"),
    },
    { icon: FileTextOutlined, title: t("landing.featureTaxTitle"), body: t("landing.featureTaxBody") },
    {
      icon: TranslationOutlined,
      title: t("landing.featureLanguageTitle"),
      body: t("landing.featureLanguageBody"),
    },
  ];

  return (
    <LandingSection divider={false}>
      <LandingSectionIntro title={t("landing.featuresHeading")} />
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
            <Card style={{ height: "100%" }}>
              <CardContent style={{ display: "flex", gap: "var(--ant-margin)" }}>
                {/* Ikon dekoratif: kotaknya `aria-hidden`, jadi span
                    `role="img"` bawaan ikon AntD tidak ikut dibacakan sesudah
                    judul yang sudah mengatakan hal yang sama. Ukurannya
                    `font-size`, bukan kelas kotak (MASTER.md §Ikon). */}
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    flexShrink: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    width: ICON_BOX,
                    height: ICON_BOX,
                    borderRadius: "var(--ant-border-radius-lg)",
                    background: "var(--ant-color-primary-bg)",
                    color: "var(--ant-color-primary)",
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
