/**
 * Kaki halaman pendaratan — identitas produk, peta tautan, dan sakelar tampilan.
 *
 * ══ KENAPA BERKOLOM, BUKAN TIGA KELOMPOK YANG MENGAMBANG ═══════════════════
 * Bentuk sebelumnya: tiga blok di dalam satu `space-between` — merek di kiri,
 * sakelar di tengah, dua tautan hukum di kanan. Di layar lebar hasilnya kelompok
 * yang saling berjauhan tanpa hubungan yang terbaca, dan di layar sedang
 * urutannya berubah-ubah karena `flex-wrap` memutuskannya sendiri.
 *
 * Kaki berkolom adalah bentuk baku situs keuangan/B2B bukan karena rapi,
 * melainkan karena kaki halaman adalah tempat orang MENCARI sesuatu yang tidak
 * ditemukannya di atas: dokumentasi, ketentuan, cara menghubungi. Kolom
 * berjudul menjawab "di mana saya melihatnya" tanpa harus membaca setiap
 * tautan.
 *
 * ══ KENAPA SAKELAR BAHASA & TEMA ADA DI SINI ═══════════════════════════════
 * Sakelar TEMA hidup di sini di setiap lebar layar (bilah atas hanya memikul
 * bahasa — alasannya di `landing-nav.tsx`). Sakelar BAHASA adalah pasangan yang
 * saling meniadakan: di bilah atas pada ≥576px, di sini pada layar sempit.
 * Tanpa salinan itu pengunjung ponsel — termasuk pembaca Mandarin yang belum
 * punya akun — tidak punya SATU pun cara mengganti bahasa, sebab menu akun yang
 * biasanya menyediakannya baru ada sesudah masuk.
 *
 * Keduanya turun ke BILAH BAWAH, terpisah dari kolom tautan: sakelar bukan
 * tautan, dan menaruhnya di dalam kolom bertajuk membuatnya terbaca sebagai
 * salah satu tujuan.
 *
 * ══ TAHUN HAK CIPTA DIHITUNG, TIDAK DIKETIK ════════════════════════════════
 * `new Date()` aman di sini justru karena halaman ini `force-dynamic` (ia
 * memanggil `auth()` untuk memantulkan pengunjung bersesi), jadi kakinya
 * dirender ulang setiap permintaan. Tahun yang diketik akan salah setiap 1
 * Januari, dan salahnya persis di tempat yang paling murah untuk benar.
 */
import Link from "next/link";

import { LANDING_NOTE } from "@/components/landing/landing-scale";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

/** Tautan kaki: warna sekunder, penuh + bergaris saat hover. */
const FOOTER_LINK: React.CSSProperties = {
  color: "var(--ant-color-text-secondary)",
  textDecoration: "none",
};

/**
 * Judul kolom — sejajar bentuknya dengan label kategori seksi
 * (`LANDING_EYEBROW`), tetapi netral warnanya: kaki halaman tidak boleh
 * menyaingi ajakan penutup yang berdiri tepat di atasnya.
 */
const COLUMN_TITLE: React.CSSProperties = {
  margin: 0,
  marginBottom: "var(--ant-margin-sm)",
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: "var(--ant-font-weight-strong)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ant-color-text)",
};

const COLUMN: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size)",
};

export async function LandingFooter() {
  const t = await getT();
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        borderTop: "1px solid var(--ant-color-border-secondary)",
        /* Nada indigo yang sama dengan pita harga — bukan kebetulan: keduanya
           mengapit ajakan penutup, jadi halaman berakhir sebagai bingkai, bukan
           sebagai ekor abu-abu. `colorFillQuaternary` yang berdiri di sini
           sebelumnya translusen 2–4%: di layar ia praktis tidak ada, yaitu
           persis keluhan "outline saja" yang tercatat di issue #266. */
        background: "var(--sai-landing-band-indigo)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "var(--sai-landing-measure)",
          marginInline: "auto",
          paddingInline: "var(--sai-landing-gutter)",
          paddingBlock: "var(--ant-padding-xl)",
        }}
      >
        <div data-landing-footer-grid="">
          {/* Kolom identitas lebih lebar daripada kolom tautan — ia memikul
              kalimat, bukan daftar. */}
          <div>
            <p
              style={{ margin: 0, fontWeight: "var(--ant-font-weight-strong)" }}
            >
              {APP_NAME}
            </p>
            <p style={{ ...LANDING_NOTE, marginTop: "var(--ant-margin-xxs)" }}>
              {t("landing.footerTagline")}
            </p>
          </div>

          {/* PRODUK — jangkar ke seksi di halaman ini. Di kaki halaman inilah
              orang yang sudah menggulung sampai bawah mencari jalan kembali,
              dan tautan seksi di bilah atas disembunyikan di layar sempit. */}
          <nav aria-label={t("landing.footerProduct")} style={COLUMN}>
            <p style={COLUMN_TITLE}>{t("landing.footerProduct")}</p>
            <a href="#modul" data-landing-link="" style={FOOTER_LINK}>
              {t("landing.navModules")}
            </a>
            <a href="#harga" data-landing-link="" style={FOOTER_LINK}>
              {t("landing.navPricing")}
            </a>
            <a href="#tanya" data-landing-link="" style={FOOTER_LINK}>
              {t("landing.navFaq")}
            </a>
            {/* Kontak HANYA di kaki, tidak di bilah atas. Bilah itu terukur
                menuntut 685px dengan empat tautan; tautan kelima mendorongnya
                melewati titik patah 768px dan menghidupkan lagi gulungan
                mendatar yang baru saja diperbaiki. Kaki halaman justru tempat
                orang mencari cara menghubungi. */}
            <a href="#kontak" data-landing-link="" style={FOOTER_LINK}>
              {t("landing.navContact")}
            </a>
          </nav>

          <nav aria-label={t("landing.footerResources")} style={COLUMN}>
            <p style={COLUMN_TITLE}>{t("landing.footerResources")}</p>
            <Link href="/docs" data-landing-link="" style={FOOTER_LINK}>
              {t("landing.footerDocs")}
            </Link>
          </nav>

          <nav aria-label={t("landing.footerLegal")} style={COLUMN}>
            <p style={COLUMN_TITLE}>{t("landing.footerLegal")}</p>
            <Link href="/terms" data-landing-link="" style={FOOTER_LINK}>
              {t("landing.footerTerms")}
            </Link>
            <Link href="/privacy" data-landing-link="" style={FOOTER_LINK}>
              {t("landing.footerPrivacy")}
            </Link>
          </nav>
        </div>

        {/* Bilah bawah: hak cipta di kiri, sakelar tampilan di kanan. Garis
            pemisahnya `colorBorderSecondary` — sama dengan setiap batas bidang
            lain di halaman ini, sebab pita indigo dan bilah ini sewarna. */}
        <div data-landing-footer-bar="">
          <p style={{ ...LANDING_NOTE, fontSize: "var(--ant-font-size-sm)" }}>
            © {year} {APP_NAME}. {t("landing.footerRights")}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--ant-margin-xs)",
            }}
          >
            <div data-landing-chrome-narrow="">
              <LocaleToggle />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
