/**
 * KOLOM BACA permukaan DOKUMENTASI — permukaan KETIGA (issue #300).
 *
 * ⚠ Berkas ini bukan lagi KULIT. Sampai perbaikan "satu halaman, dua kulit" ia
 * memikul dua pekerjaan sekaligus: kepala publik (lambang + tombol "Masuk ke
 * aplikasi") DAN kolom baca 768px. Yang pertama pindah ke `docs-public-chrome.tsx`
 * / `docs-app-chrome.tsx`, dipilih `src/app/(app)/(docs)/layout.tsx` menurut ada
 * tidaknya sesi; yang tersisa di sini adalah isi kolomnya — judul, ringkasan,
 * pemberitahuan bahasa, kaki "semua dokumentasi", dan satu blok gaya.
 *
 * Alasan pemisahannya bukan kerapian: `Layout.Content` milik kulit aplikasi
 * merender `<main>`-nya SENDIRI, jadi sebuah `<main>` yang ditulis di sini akan
 * bersarang di dalam `<main>` — markup yang tidak sah dan tengara halaman yang
 * ganda bagi pembaca layar. Karena itu `<main>` kini milik KULIT, dan berkas
 * ini hanya mengisi.
 *
 * ── Kenapa permukaannya bukan `LandingShell`, dan kenapa langit-langitnya
 *    lebih rendah daripada app internal ──────────────────────────────────────
 * MASTER.md §Pemasaran vs App menyatakan dua dunia dalam token: pendaratan
 * (hero ≈53px, CTA berulang, irama 96px) dan app internal (langit-langit
 * `PageHeader`, satu aksi utama, irama 24px). Dokumentasi bukan salah satunya,
 * dan aturannya ditulis di MASTER.md §Dokumentasi. Bentuk pendeknya, dan
 * ketiganya dijaga `tests/docs.test.ts`:
 *
 *  1. **Langit-langit tipografi = `fontSizeHeading2` (30px)**, di BAWAH
 *     langit-langit app internal (38px). Sebuah permukaan yang judulnya lebih
 *     kecil dari judul app tidak akan pernah terbaca sebagai halaman jualan.
 *  2. **Irama app, bukan irama pemasaran** — `--ant-margin-lg` (24px) antar
 *     bagian; tidak ada jarak 64–96px.
 *  3. **NOL tombol berisi penuh.** Dokumentasi tidak mengikat dan tidak
 *     memajukan apa pun (§Aksi utama per layar: "nol juga sah").
 *
 * **Kolom baca tetap 768px di KEDUA kulit.** Itu baris "lebar maksimum" di
 * tabel MASTER.md §Dokumentasi, dan ia mengikat justru pada kulit aplikasi:
 * area kerja dasbor memang lebar penuh, dan membiarkan prosa ikut melebar di
 * sana akan merusak persis yang baru saja diperbaiki — kalimat yang membentang
 * melewati ±75 karakter berhenti bisa dipindai sekali lihat.
 *
 * ── Kenapa server component tanpa satu baris JS pun ────────────────────────
 * Isinya hanya teks. Menyeretnya ke client berarti membayar hidrasi untuk
 * sesuatu yang tidak punya satu pun keadaan — pola yang sama dengan
 * `StaticTable` (#189) dan dengan alasan yang sama.
 *
 * ── SATU blok `<style>` untuk seluruh permukaan ────────────────────────────
 * Tiga hal yang dibutuhkan daftar isi & pengalih halaman tidak punya bentuk
 * sebaris: `:hover`, `:focus-visible`, dan `@media`. Rumahnya satu blok
 * `<style href precedence>` DI SINI, bukan satu blok per komponen — berkas ini
 * dirender setiap halaman dokumentasi, jadi satu href berarti satu aturan di
 * `<head>` berapa pun halaman yang dibuka (React 19 meniadakan gandanya).
 * Sasarannya atribut `data-docs-*`, pola `ui/table.tsx`, bukan kelas.
 *
 * ⚠ Jebakan yang mahal kalau ditemukan belakangan: **gaya sebaris MENGALAHKAN
 * blok ini**, jadi properti yang harus berubah di sebuah breakpoint TIDAK BOLEH
 * juga ditulis sebaris. Karena itu `grid-template-columns` pengalih halaman
 * berdiri sepenuhnya di CSS di bawah — bentuk dasarnya maupun bentuk lebarnya —
 * sementara `display:grid`-nya tetap sebaris.
 */

import { ReadOutlined } from "@ant-design/icons";

import { Link } from "@/components/ui/app-link";
import { DOCS_ROOT } from "@/lib/docs";
import { getLocale, getT } from "@/lib/i18n/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

/** Kolom baca. Angka telanjang, seperti `/terms` & `/privacy`. */
export const LEBAR_BACA = 768;

/**
 * Bentuk kolom bacanya — DIEKSPOR, karena kedua kulit memasangnya dan angka
 * 768 yang disalin ke kulit kedua adalah angka yang akan bergeser sendiri.
 * Isian tepi TIDAK di sini: kulit publik menambahkannya (halamannya telanjang),
 * kulit aplikasi tidak (`Layout.Content` sudah mengisi tepinya).
 */
export const KOLOM_BACA: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  /* Irama app (24px), bukan irama pemasaran (64–96px). */
  gap: "var(--ant-margin-lg)",
  maxWidth: LEBAR_BACA,
  margin: "0 auto",
};

/**
 * Aturan yang tak punya bentuk sebaris — lihat catatan di kepala berkas.
 *
 * Kenapa baris pertama menyasar `:root` dan bukan sebuah `data-*`: yang
 * menggulung saat sebuah tautan `#jangkar` diklik adalah elemen penggulung
 * DOKUMEN (`html`), bukan kotak mana pun di dalam halaman — `scroll-behavior`
 * yang dipasang pada pembungkus di bawah tidak melakukan apa-apa. `:has()`
 * mengurungnya kembali: aturan itu hanya berlaku pada dokumen yang benar-benar
 * memuat permukaan ini, jadi halaman lain (termasuk pendaratan) tidak ikut
 * berubah perilaku karena sebuah berkas dokumentasi. Pengguna yang meminta
 * gerak dikurangi sudah dilayani `globals.css` (`prefers-reduced-motion`
 * menimpa `scroll-behavior` menjadi `auto`), jadi tidak perlu diulang di sini.
 *
 * ⚠ `[data-docs]` kini dipasang oleh KULIT, bukan berkas ini — di kulit
 * aplikasi elemen terluar milik `PlatformShell`, yang tidak boleh disentuh.
 */
const ATURAN_DOKUMENTASI = `
:root:has([data-docs]){scroll-behavior:smooth}
[data-docs-row]{transition:color 150ms ease}
[data-docs-row]:hover [data-docs-row-title],[data-docs-row]:focus-visible [data-docs-row-title]{color:var(--ant-color-link-hover);text-decoration:underline}
[data-docs-row]:hover [data-docs-row-arrow],[data-docs-row]:focus-visible [data-docs-row-arrow]{color:var(--ant-color-link-hover)}
[data-docs-row]:focus-visible{outline:var(--ant-line-width-focus) solid var(--ant-color-primary);outline-offset:4px;border-radius:var(--ant-border-radius)}
[data-docs-list] > li:last-child{border-bottom-width:0}
[data-docs-jump]{transition:background-color 150ms ease,color 150ms ease}
[data-docs-jump]:hover,[data-docs-jump]:focus-visible{background:var(--ant-color-fill-quaternary);color:var(--ant-color-link-hover);text-decoration:underline}
[data-docs-jump]:focus-visible{outline:var(--ant-line-width-focus) solid var(--ant-color-primary);outline-offset:2px}
[data-docs-pager-grid]{grid-template-columns:1fr}
[data-docs-pager-grid] > [data-docs-pager-next]{grid-column:1}
[data-docs-pager]{transition:background-color 150ms ease,border-color 150ms ease,color 150ms ease}
[data-docs-pager]:hover{background:var(--ant-color-fill-quaternary);border-color:var(--ant-color-primary-border)}
[data-docs-pager]:hover [data-docs-pager-title]{color:var(--ant-color-link-hover)}
[data-docs-pager]:focus-visible{outline:var(--ant-line-width-focus) solid var(--ant-color-primary);outline-offset:2px}
@media (min-width:640px){[data-docs-pager-grid]{grid-template-columns:1fr 1fr}[data-docs-pager-grid] > [data-docs-pager-next]{grid-column:2}}
`;

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

/**
 * Kaki kolom — "semua dokumentasi".
 *
 * Ia sengaja tinggal DI DALAM kolom baca, bukan di kulit: di kulit aplikasi
 * menu samping tidak memuat satu pun butir dokumentasi (menunya menu AKUN),
 * jadi tautan pulang ke daftar isi adalah satu-satunya jalan kembali dari
 * sebuah halaman dokumen — dan ia harus ada di kedua kulit, bukan di satu.
 */
const KAKI: React.CSSProperties = {
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-tertiary)",
};

/**
 * Baris konteks DI ATAS judul — cabang mana yang sedang dibaca.
 *
 * Sengaja di atas `<h1>` dan bukan di kakinya: pembaca yang mendarat langsung
 * dari mesin pencari (permukaan ini publik, jadi itu jalur masuk yang normal)
 * perlu tahu ia sedang berdiri di mana SEBELUM membaca, bukan sesudah.
 */
const KONTEKS: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  marginBottom: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-tertiary)",
};

export interface DocsShellProps {
  judul: string;
  ringkas?: string;
  /** Baris konteks kecil di atas judul (dipakai halaman dokumen, bukan daftar isi). */
  konteks?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Isi kolom baca + pemberitahuan bahasa.
 *
 * Pemberitahuan itu adalah keputusan 3 dalam bentuk yang terlihat: pembaca
 * ber-`en`/`zh` diberi tahu DALAM BAHASANYA SENDIRI bahwa isinya baru ada
 * dalam bahasa Indonesia, beserta alasannya. Tanpa ini, halaman berprosa
 * Indonesia di aplikasi trilingual terbaca sebagai terjemahan yang tertinggal —
 * dan pembacanya akan menunggu sesuatu yang tidak sedang dikerjakan siapa pun.
 *
 * ⚠ Prosanya TETAP berbahasa Indonesia sementara chrome di sekelilingnya
 * mengikuti bahasa sesi. Itu disengaja, dan tidak berubah karena chrome-nya
 * kini bisa berupa chrome aplikasi.
 */
export async function DocsShell({ judul, ringkas, konteks, children }: DocsShellProps) {
  const locale = await getLocale();
  const t = await getT();

  return (
    <>
      <style href="sai-docs" precedence="default">
        {ATURAN_DOKUMENTASI}
      </style>

      <div>
        {konteks && <div style={KONTEKS}>{konteks}</div>}
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

      <footer style={KAKI}>
        <Link href={DOCS_ROOT} style={{ color: "var(--ant-color-link)" }}>
          {t("docs.backToIndex")}
        </Link>
      </footer>
    </>
  );
}
