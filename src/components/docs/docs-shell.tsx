/**
 * Kerangka permukaan DOKUMENTASI — permukaan KETIGA (issue #300).
 *
 * ── Kenapa ia bukan `LandingShell`, dan bukan chrome dasbor ────────────────
 * MASTER.md §Pemasaran vs App menyatakan dua dunia dalam token: pendaratan
 * (hero ≈53px, CTA berulang, irama 96px, kolom baca di tengah) dan app internal
 * (langit-langit `PageHeader`, satu aksi utama, irama 24px, lebar penuh area
 * kerja). Dokumentasi bukan salah satunya:
 *
 *  • ia dibaca orang yang mungkin belum punya akun — jadi ia tidak boleh
 *    memikul chrome dasbor, yang menyeret `auth()`/Prisma ke permukaan publik;
 *  • ia tidak menjual apa pun — jadi ia tidak boleh memikul skala pemasaran,
 *    yang seluruh gunanya adalah mengubah pembaca menjadi pendaftar.
 *
 * Aturannya ditulis di MASTER.md §Dokumentasi. Bentuk pendeknya, dan ketiganya
 * dijaga `tests/docs.test.ts`:
 *
 *  1. **Langit-langit tipografi = `fontSizeHeading2` (30px)**, di BAWAH
 *     langit-langit app internal (38px). Sebuah permukaan yang judulnya lebih
 *     kecil dari judul app tidak akan pernah terbaca sebagai halaman jualan.
 *  2. **Irama app, bukan irama pemasaran** — `--ant-margin-lg` (24px) antar
 *     bagian; tidak ada jarak 64–96px.
 *  3. **NOL tombol berisi penuh.** Dokumentasi tidak mengikat dan tidak
 *     memajukan apa pun (§Aksi utama per layar: "nol juga sah"). Satu-satunya
 *     ajakan di sini adalah tautan masuk ke aplikasi, dan ia `secondary`.
 *
 * Yang DIWARISI apa adanya dari app: kolom baca sebagai angka telanjang
 * (preseden `/terms` & `/privacy`, yang juga permukaan publik non-pemasaran),
 * warna dari token AntD, ikon `@ant-design/icons`, primitif `src/components/ui`.
 *
 * ── Kenapa server component tanpa satu baris JS pun ────────────────────────
 * Halaman ini hanya teks. Menyeretnya ke client berarti membayar hidrasi untuk
 * sesuatu yang tidak punya satu pun keadaan — pola yang sama dengan
 * `StaticTable` (#189) dan dengan alasan yang sama.
 */

import { ReadOutlined } from "@ant-design/icons";

import { Link } from "@/components/ui/app-link";
import { ButtonLink } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand-mark";
import { APP_NAME } from "@/lib/constants";
import { DOCS_ROOT } from "@/lib/docs";
import { getLocale, getT } from "@/lib/i18n/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

/** Kolom baca. Angka telanjang, seperti `/terms` & `/privacy`. */
const LEBAR_BACA = 768;

const HALAMAN: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--ant-color-bg-layout)",
  color: "var(--ant-color-text)",
};

const BILAH: React.CSSProperties = {
  borderBottom: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
};

const BILAH_ISI: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--ant-margin-sm)",
  maxWidth: LEBAR_BACA,
  margin: "0 auto",
  padding: "var(--ant-padding-sm) var(--ant-padding)",
};

const MEREK: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ant-margin-xs)",
  color: "var(--ant-color-text)",
  fontWeight: 600,
};

const ISI: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  /* Irama app (24px), bukan irama pemasaran (64–96px). */
  gap: "var(--ant-margin-lg)",
  maxWidth: LEBAR_BACA,
  margin: "0 auto",
  padding: "var(--ant-padding-lg) var(--ant-padding)",
};

const JUDUL: React.CSSProperties = {
  margin: 0,
  /* Langit-langit permukaan ketiga: 30px, di BAWAH 38px app internal. */
  fontSize: "var(--ant-font-size-heading-2)",
  lineHeight: 1.3,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: "var(--ant-color-text)",
};

const RINGKAS: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-lg)",
  lineHeight: 1.6,
  color: "var(--ant-color-text-secondary)",
};

const PEMBERITAHUAN_BAHASA: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xxs)",
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-warning-border)",
  background: "var(--ant-color-warning-bg)",
  color: "var(--ant-color-money-pending)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.6,
};

const KAKI: React.CSSProperties = {
  maxWidth: LEBAR_BACA,
  margin: "0 auto",
  padding: "0 var(--ant-padding) var(--ant-padding-lg)",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-tertiary)",
};

export interface DocsShellProps {
  judul: string;
  ringkas?: string;
  children: React.ReactNode;
}

/**
 * Kerangka + pemberitahuan bahasa.
 *
 * Pemberitahuan itu adalah keputusan 3 dalam bentuk yang terlihat: pembaca
 * ber-`en`/`zh` diberi tahu DALAM BAHASANYA SENDIRI bahwa isinya baru ada
 * dalam bahasa Indonesia, beserta alasannya. Tanpa ini, halaman berprosa
 * Indonesia di aplikasi trilingual terbaca sebagai terjemahan yang tertinggal —
 * dan pembacanya akan menunggu sesuatu yang tidak sedang dikerjakan siapa pun.
 */
export async function DocsShell({ judul, ringkas, children }: DocsShellProps) {
  const locale = await getLocale();
  const t = await getT();

  return (
    <div style={HALAMAN}>
      <header style={BILAH}>
        <div style={BILAH_ISI}>
          <Link href={DOCS_ROOT} style={MEREK}>
            <BrandMark size="sm" />
            <span>{APP_NAME}</span>
            <span style={{ color: "var(--ant-color-text-tertiary)" }} aria-hidden="true">
              ·
            </span>
            <span style={{ color: "var(--ant-color-text-secondary)", fontWeight: 400 }}>
              {t("docs.title")}
            </span>
          </Link>
          {/* Satu-satunya ajakan di permukaan ini, dan ia SEKUNDER — lihat
              butir 3 di kepala berkas. */}
          <ButtonLink variant="secondary" href="/login">
            {t("docs.openApp")}
          </ButtonLink>
        </div>
      </header>

      <main style={ISI}>
        <div>
          <h1 style={JUDUL}>{judul}</h1>
          {ringkas && <p style={RINGKAS}>{ringkas}</p>}
        </div>

        {locale !== DEFAULT_LOCALE && (
          <div style={PEMBERITAHUAN_BAHASA}>
            <strong style={{ display: "flex", alignItems: "center", gap: "var(--ant-margin-xxs)" }}>
              <ReadOutlined aria-hidden="true" />
              {t("docs.languageNotice")}
            </strong>
            <span>{t("docs.languageNoticeWhy")}</span>
          </div>
        )}

        {children}
      </main>

      <footer style={KAKI}>
        <Link href={DOCS_ROOT} style={{ color: "var(--ant-color-link)" }}>
          {t("docs.backToIndex")}
        </Link>
      </footer>
    </div>
  );
}
