/**
 * Kaki halaman pendaratan — identitas produk, dua dokumen hukum, dan salinan
 * kedua pemilih bahasa/tema.
 *
 * ══ KENAPA SAKELAR BAHASA & TEMA ADA DI SINI JUGA ══════════════════════════
 * Di bawah 576px bilah atas menyembunyikan keduanya agar tombol Masuk dan
 * Daftar tidak menyusut di bawah target sentuh 40px. Tanpa salinan ini,
 * pengunjung ponsel — termasuk pembaca Mandarin yang belum punya akun — tidak
 * punya SATU pun cara mengganti bahasa: menu akun yang biasanya menyediakannya
 * baru ada sesudah masuk. Keduanya karena itu bertukar tempat, bukan berbagi:
 * `[data-landing-chrome]` (bilah atas) dan `[data-landing-chrome-narrow]`
 * (kaki) adalah pasangan yang saling meniadakan di titik patah yang sama.
 */
import Link from "next/link";

import { LANDING_NOTE } from "@/components/landing/landing-scale";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

/** Tautan hukum: warna sekunder, garis bawah & warna penuh muncul saat hover. */
const LEGAL_LINK: React.CSSProperties = {
  color: "var(--ant-color-text-secondary)",
  textDecoration: "none",
};

export async function LandingFooter() {
  const t = await getT();

  return (
    <footer
      style={{
        borderTop: "1px solid var(--ant-color-border-secondary)",
        background: "var(--ant-color-fill-quaternary)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--ant-margin-lg)",
          width: "100%",
          maxWidth: "var(--sai-landing-measure)",
          marginInline: "auto",
          paddingInline: "var(--sai-landing-gutter)",
          paddingBlock: "var(--ant-padding-xl)",
        }}
      >
        <div>
          <p style={{ margin: 0, fontWeight: "var(--ant-font-weight-strong)" }}>{APP_NAME}</p>
          <p style={{ ...LANDING_NOTE, marginTop: "var(--ant-margin-xxs)" }}>
            {t("landing.footerTagline")}
          </p>
        </div>

        <div data-landing-chrome-narrow="">
          <LocaleToggle />
          <ThemeToggle />
        </div>

        <nav
          aria-label={t("landing.footerLegal")}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--ant-margin-xs)",
            fontSize: "var(--ant-font-size)",
          }}
        >
          <Link href="/terms" data-landing-link="" style={LEGAL_LINK}>
            {t("landing.footerTerms")}
          </Link>
          <Link href="/privacy" data-landing-link="" style={LEGAL_LINK}>
            {t("landing.footerPrivacy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
