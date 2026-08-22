/**
 * KULIT PUBLIK dokumentasi — yang dilihat pembaca TANPA sesi.
 *
 * Ini kepala yang sudah ada sejak #300, dipindahkan apa adanya dari
 * `docs-shell.tsx`: lambang + nama produk + "Dokumentasi" di kiri, satu tautan
 * `secondary` ke `/login` di kanan, kolom baca 768px di bawahnya. Tidak satu
 * angka pun berubah — keadaan "tanpa sesi" adalah keadaan yang TIDAK boleh
 * bergeser sedikit pun karena dua kulit lain lahir di sebelahnya.
 *
 * ── Kenapa ia kulit TERSENDIRI, bukan cabang di dalam kolom baca ───────────
 * Karena kulit yang satunya (`docs-app-chrome.tsx`) membawa `<main>`-nya
 * sendiri lewat `Layout.Content` AntD. Sebuah `<main>` yang ditulis di dalam
 * kolom baca akan bersarang di sana — markup tak sah, dan dua tengara "main"
 * bagi pembaca layar. Jadi `<main>` milik kulit, dan kulitnya ada dua.
 *
 * ── Satu-satunya ajakan di permukaan ini, dan ia SEKUNDER ──────────────────
 * MASTER.md §Dokumentasi: NOL tombol berisi penuh. Halaman yang hanya
 * menjelaskan tidak mengikat dan tidak memajukan apa pun, jadi jawabannya nol —
 * dan pengulangan CTA adalah salah satu dari empat dimensi yang membuat sebuah
 * halaman menjadi PEMASARAN. Dijaga `tests/docs.test.ts`.
 */

import { ButtonLink } from "@/components/ui/button";
import { Link } from "@/components/ui/app-link";
import { BrandMark } from "@/components/ui/brand-mark";
import { BINGKAI_DOKUMENTASI, LEBAR_BINGKAI } from "@/components/docs/docs-shell";
import { APP_NAME } from "@/lib/constants";
import { DOCS_ROOT } from "@/lib/docs";
import type { TranslateFn } from "@/lib/i18n/client";

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
  /* Sejajar dengan BINGKAI di bawahnya, bukan dengan kolom bacanya: sejak ada
     kolom kiri, lambang yang rata dengan kolom baca akan menggantung di tengah
     halaman sementara daftar halaman mulai jauh di kirinya. */
  maxWidth: LEBAR_BINGKAI,
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

/**
 * Isian tepi ditambahkan DI SINI, bukan di `BINGKAI_DOKUMENTASI`: halaman
 * publik ini telanjang — tidak ada `Layout.Content` yang sudah mengisi tepinya
 * seperti di kulit aplikasi. Menaruhnya di konstanta bersama berarti tepi ganda
 * di sana.
 */
const ISI: React.CSSProperties = {
  ...BINGKAI_DOKUMENTASI,
  padding: "var(--ant-padding-lg) var(--ant-padding)",
};

export function DocsPublicChrome({
  t,
  children,
}: {
  t: TranslateFn;
  children: React.ReactNode;
}) {
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
          <ButtonLink variant="secondary" href="/login">
            {t("docs.openApp")}
          </ButtonLink>
        </div>
      </header>

      <main data-docs style={ISI}>
        {children}
      </main>
    </div>
  );
}
