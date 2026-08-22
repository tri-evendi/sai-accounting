/**
 * Seksi pendaratan — pembawa IRAMA dan LEBAR, dua dari empat dimensi yang
 * menyatakan "pemasaran" (lihat `landing-scale.ts`).
 *
 * Enam seksi halaman ini dulu mengulang rangkaian kelas yang sama —
 * `border-t border-border py-16 sm:py-24` + `mx-auto w-full max-w-6xl px-4
 * sm:px-6` — di enam berkas berbeda. Rangkaian yang diulang adalah rangkaian
 * yang akan menyimpang: satu seksi memakai `py-20`, satu lagi `max-w-5xl`, dan
 * tidak ada yang gagal.
 *
 * Setelah #245 iramanya satu variabel (`--sai-landing-rhythm`) dan lebarnya
 * satu variabel (`--sai-landing-measure*`), keduanya dideklarasikan di dalam
 * `[data-landing]`. Menyalin komponen ini ke halaman internal karena itu tidak
 * membawa iramanya ikut — dan impornya sendiri sudah ditolak
 * `tests/landing-boundary.test.ts` lebih dulu.
 */
import type { CSSProperties } from "react";

import {
  LANDING_BODY,
  LANDING_NAV_HEIGHT,
  LANDING_SECTION_TITLE,
} from "@/components/landing/landing-scale";

/**
 * Jarak jangkar: tinggi bilah menempel + satu `margin` AntD. Tanpa ini tautan
 * "#harga" di bilah atas menggulung judul seksinya persis ke balik bilah itu.
 */
const ANCHOR_OFFSET = LANDING_NAV_HEIGHT + 16;

/**
 * Nada pita seksi — penanda WILAYAH, dan satu-satunya cara halaman ini terbaca
 * sebagai beberapa tempat alih-alih satu daftar panjang berpemisah garis.
 *
 * Sampai perubahan ini hanya ada dua nilai (`plain` / `muted`), dan `muted`
 * adalah `colorFillQuaternary` — warna TRANSLUSEN 2–4% yang, digambar di atas
 * latar halaman, praktis tak terlihat di kedua tema. Akibatnya halaman ini
 * memang persis keluhan yang tercatat di issue #266: putih-hitam dengan garis.
 *
 * Nada di bawah opak (`color-mix` di atas permukaan yang sedang berlaku,
 * `landing-scale.ts`), jadi pita benar-benar bidang berwarna.
 *
 * `solid` (#401) BUKAN tint: ia isian navy merek penuh (`--ant-color-brand-
 * solid`) dengan teks terang — satu-satunya pita pekat halaman ini, dipakai
 * SATU kali di ajakan penutup sebagai PUNCAK. Semua pita lain berhenti di
 * 14% pada satu tingkat kecerahan; tanpa satu bidang pekat halaman berakhir
 * datar. Teks di dalamnya `--sai-landing-on-solid` (putih penuh) dan
 * `--sai-landing-on-solid-muted` (putih 92%, terukur — 85% gagal 4,5:1 di
 * tema gelap). ⚠ Tombol `primary` DILARANG di atasnya (isian navy di atas navy
 * = 1,00:1 di tema terang) — pakai `variant="inverse"`; dijaga
 * `tests/landing-colors.test.ts`.
 */
export type LandingTone = "plain" | "brand" | "cyan" | "indigo" | "solid";

const TONE_BG: Record<Exclude<LandingTone, "plain">, string> = {
  brand: "var(--sai-landing-band-brand)",
  cyan: "var(--sai-landing-band-cyan)",
  indigo: "var(--sai-landing-band-indigo)",
  solid: "var(--sai-landing-band-solid)",
};

export interface LandingSectionProps {
  /** Jangkar untuk tautan bilah atas (`#modul`, `#harga`, `#tanya`). */
  id?: string;
  tone?: LandingTone;
  /** Seksi pertama sesudah hero tidak memerlukan garis kedua di atasnya. */
  divider?: boolean;
  /** `narrow` untuk isi yang dibaca berurutan (FAQ), bukan dipindai. */
  width?: "wide" | "narrow";
  center?: boolean;
  children: React.ReactNode;
}

export function LandingSection({
  id,
  tone = "plain",
  divider = true,
  width = "wide",
  center = false,
  children,
}: LandingSectionProps) {
  const outer: CSSProperties = {
    paddingBlock: "var(--sai-landing-rhythm)",
    scrollMarginTop: ANCHOR_OFFSET,
  };
  /* Garisnya TETAP ada di setiap batas pita, juga ketika nadanya sudah
     berbeda — diukur ulang pada token yang benar-benar terpasang: selisih
     pita terhadap latar halaman hanya 1,09:1 (terang) dan 1,14:1 (gelap),
     jadi warna sendirian TIDAK menggambar batas wilayah di kedua tema.

     Yang berubah hanya BENTUKNYA: bukan lagi `border-top` selebar layar
     melainkan `::before` bergradien yang pekat di kolom isi lalu meleleh
     sebelum tepi viewport (`landing-scale.ts`). Batasnya tetap terbaca; kesan
     "kertas bergaris" hilang. */
  if (tone !== "plain") outer.background = TONE_BG[tone];
  /* Pita pekat: seluruh teks di dalamnya terang. Diwariskan dari seksi, jadi
     judul (`LANDING_SECTION_TITLE`, tanpa warna sendiri) ikut; kalimat
     penjelas (`LANDING_BODY`, `colorTextSecondary`) diganti di `Intro`. */
  if (tone === "solid") outer.color = "var(--sai-landing-on-solid)";

  return (
    /* `data-landing-reveal` pada SEKSI, bukan pada tiap kartu: yang ditegaskan
       adalah perpindahan antar-wilayah saat digulung, dan sepuluh kartu yang
       muncul satu per satu adalah koreografi — hal yang justru dilarang
       ("decorative-only animation"). Aturannya, beserta ketiga pagarnya, ada di
       `landing-scale.ts`; tanpa dukungan peramban atribut ini tidak berarti
       apa-apa dan isinya terlihat penuh. */
    <section
      id={id}
      data-landing-reveal=""
      {...(divider ? { "data-landing-divider": "" } : null)}
      style={outer}
    >
      <div
        style={{
          width: "100%",
          maxWidth:
            width === "narrow"
              ? "var(--sai-landing-measure-narrow)"
              : "var(--sai-landing-measure)",
          marginInline: "auto",
          paddingInline: "var(--sai-landing-gutter)",
          textAlign: center ? "center" : undefined,
        }}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Label kategori di atas judul seksi ("Manfaat", "Harga", "Keamanan & kendali").
 *
 * ══ KENAPA INI, DAN KENAPA BUKAN SEKADAR HIASAN ════════════════════════════
 * Sampai perubahan ini setiap seksi dimulai DINGIN — langsung `<h2>`, tanpa
 * apa pun yang memberi tahu pembaca yang sedang menggulung cepat bahwa ia baru
 * memasuki wilayah lain. Pita berwarna melakukannya untuk mata, tetapi tidak
 * untuk orang yang memindai teks, dan sama sekali tidak untuk pembaca layar.
 *
 * Label kategori adalah pola baku situs B2B/keuangan justru karena halaman
 * seperti ini dibaca dengan MELOMPAT, bukan berurutan: ia menjawab "bagian ini
 * tentang apa" dalam satu kata sebelum kalimat judulnya dibaca.
 *
 * Bentuknya: 12px, tebal, huruf besar, jarak huruf lebar, warna merek. Ini satu
 * dari sedikit tempat `--ant-font-size-sm` (12px) SAH untuk teks yang bukan
 * keterangan berulang (MASTER.md §Tipografi melarangnya untuk DATA) — di sini
 * ia label struktural, dan huruf besar + `letter-spacing` menjaganya tetap
 * terbaca. Ia dirender sebagai `<p>`, BUKAN heading: menyisipkan `<h3>` di atas
 * `<h2>` akan mematahkan urutan tingkat heading yang justru dipakai pembaca
 * layar untuk menavigasi.
 */
const LANDING_EYEBROW: CSSProperties = {
  margin: 0,
  marginBottom: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: "var(--ant-font-weight-strong)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ant-color-primary)",
};

/**
 * Kepala seksi: label kategori + judul + kalimat penjelas, dikurung pada lebar
 * baca.
 *
 * Kolom teksnya `--sai-landing-measure-copy` (42rem) meski seksinya 72rem —
 * judul selebar layar penuh berhenti bisa dibaca sebagai satu tarikan napas.
 */
export function LandingSectionIntro({
  eyebrow,
  title,
  children,
  center = false,
  headingLevel = "h2",
  onSolid = false,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  center?: boolean;
  /**
   * Di atas pita `solid` (#401): kalimat penjelas memakai putih redup
   * (`--sai-landing-on-solid-muted`) alih-alih `colorTextSecondary`, yang di
   * atas navy hanya ~2,2:1. Judulnya sudah mewarisi putih dari seksinya.
   */
  onSolid?: boolean;
  /**
   * `h1` HANYA untuk seksi yang menjadi kepala HALAMANNYA sendiri — di
   * `/pricing` (#399) seksi harga adalah yang pertama, dan halaman tanpa `<h1>`
   * tidak punya judul bagi pembaca layar maupun mesin pencari. Di `/` hero
   * sudah memikul satu-satunya `<h1>`, jadi di sana bawaan `h2` yang berlaku.
   * Bentuknya TIDAK berubah (`LANDING_SECTION_TITLE`): yang berganti tingkat
   * dokumennya, bukan ukurannya — hero adalah satu-satunya teks berskala hero.
   */
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;
  return (
    <div
      style={{
        maxWidth: "var(--sai-landing-measure-copy)",
        marginInline: center ? "auto" : undefined,
      }}
    >
      {eyebrow !== undefined && <p style={LANDING_EYEBROW}>{eyebrow}</p>}
      <Heading style={LANDING_SECTION_TITLE}>{title}</Heading>
      {children !== undefined && (
        <p
          style={{
            ...LANDING_BODY,
            marginTop: "var(--ant-margin-sm)",
            ...(onSolid ? { color: "var(--sai-landing-on-solid-muted)" } : null),
          }}
        >
          {children}
        </p>
      )}
    </div>
  );
}
