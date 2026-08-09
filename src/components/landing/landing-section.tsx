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
 * `landing-scale.ts`), jadi pita benar-benar bidang berwarna. `accent` dipakai
 * SATU kali — ajakan penutup — karena nada terkuat halaman kehilangan artinya
 * kalau muncul dua kali.
 */
export type LandingTone = "plain" | "brand" | "cyan" | "indigo" | "accent";

const TONE_BG: Record<Exclude<LandingTone, "plain">, string> = {
  brand: "var(--sai-landing-band-brand)",
  cyan: "var(--sai-landing-band-cyan)",
  indigo: "var(--sai-landing-band-indigo)",
  accent: "var(--sai-landing-band-accent)",
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
     berbeda: di tema gelap selisih pita terhadap latar halaman hanya
     1,06–1,14:1, jadi warna saja belum tentu menggambar batasnya. */
  if (divider) outer.borderTop = "1px solid var(--ant-color-border-secondary)";
  if (tone !== "plain") outer.background = TONE_BG[tone];

  return (
    <section id={id} style={outer}>
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
 * Kepala seksi: judul + kalimat penjelas, dikurung pada lebar baca.
 *
 * Kolom teksnya `--sai-landing-measure-copy` (42rem) meski seksinya 72rem —
 * judul selebar layar penuh berhenti bisa dibaca sebagai satu tarikan napas.
 */
export function LandingSectionIntro({
  title,
  children,
  center = false,
}: {
  title: string;
  children?: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div
      style={{
        maxWidth: "var(--sai-landing-measure-copy)",
        marginInline: center ? "auto" : undefined,
      }}
    >
      <h2 style={LANDING_SECTION_TITLE}>{title}</h2>
      {children !== undefined && (
        <p style={{ ...LANDING_BODY, marginTop: "var(--ant-margin-sm)" }}>{children}</p>
      )}
    </div>
  );
}
