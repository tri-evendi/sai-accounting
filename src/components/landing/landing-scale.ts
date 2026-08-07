/**
 * SKALA PEMASARAN — apa yang membuat halaman pendaratan "pemasaran", dinyatakan
 * sebagai token (issue #245).
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * MASTER.md §Anti-Patterns sejak awal melarang "gaya landing/marketing (hero
 * raksasa, CTA 'Start trial') di app internal". Larangan itu selama ini
 * bertahan karena sebuah KEBETULAN MEKANIS, bukan karena ada yang menjaganya:
 * dua dunia memakai kelas Tailwind yang kelihatan berbeda, jadi menyalin gaya
 * pemasaran ke halaman internal terasa janggal sudah saat menulisnya.
 *
 * Epik #206 menghapus kebetulan itu. Setelah pendaratan dan app internal sama-
 * sama berdiri di atas token AntD, `fontSize: "var(--ant-font-size-heading-1)"`
 * di halaman piutang dan di hero pendaratan terlihat persis sama — dan yang
 * tersisa hanya satu kalimat larangan di dokumen yang tidak dijalankan siapa
 * pun. Berkas ini adalah penggantinya.
 *
 * ══ APA YANG DINYATAKAN DI SINI ════════════════════════════════════════════
 * Empat dimensi, dan hanya empat. Kalau sebuah halaman punya keempatnya ia
 * halaman pemasaran; kalau sebuah halaman internal punya salah satunya, ada
 * yang salah:
 *
 *   1. **Skala hero** — satu judul yang LEBIH BESAR dari judul terbesar yang
 *      dipunyai aplikasi (`fontSizeHeading1` = 38px). Di ≥576px hero adalah
 *      38 × 1,4 ≈ 53px. Tidak ada halaman internal yang boleh punya teks
 *      sebesar itu: kepala halaman internal lewat `PageHeader`, dan `PageHeader`
 *      tidak pernah melampaui skala heading AntD.
 *   2. **Bobot CTA** — aksi utama diulang (hero, tiap kartu paket, penutup),
 *      selalu `Button size="lg"`, selalu berpasangan primer + garis, dan di
 *      layar sempit melebar penuh. Di app internal aksi utama muncul SEKALI,
 *      di `PageHeader.actions`.
 *   3. **Irama antar-seksi** — 64px di ponsel, 96px di ≥576px. Kerapatan
 *      MASTER.md (6/10) memberi 24px antar-bagian; irama pendaratan tiga sampai
 *      empat kali lipatnya karena halaman ini dibaca sambil menggulung, bukan
 *      dikerjakan.
 *   4. **Lebar maksimum** — kolom teks berhenti di 42rem, seksi di 72rem, dan
 *      keduanya berada DI TENGAH. App internal memakai lebar penuh area kerja;
 *      tabel 12 kolom tidak boleh dipotong demi ukuran baca yang nyaman.
 *
 * ══ BOLEH PUNYA TOKEN SENDIRI — TAPI SEBAGAI TURUNAN, DAN BERPAGAR ═════════
 * Keputusannya: **ya, pendaratan boleh punya skalanya sendiri**, karena tanpa
 * itu satu-satunya jalan menuju hero 53px adalah angka yang diketik langsung di
 * sebuah `style` — dan angka seperti itu bisa disalin ke mana saja tanpa
 * meninggalkan jejak yang bisa dicari siapa pun.
 *
 * Dua syarat yang membuat izin itu tidak menjadi paletnya sendiri:
 *
 *  • **Setiap nilai adalah TURUNAN token AntD** (`calc()` di atas
 *    `--ant-font-size-*`, `--ant-margin-*`, `--ant-padding-*`). Kalau skala
 *    tipografi aplikasi berubah, skala pemasaran ikut bergerak — ia tidak bisa
 *    menyimpang menjadi tipografi kedua. Yang bukan turunan hanya tiga LEBAR
 *    (72/48/42rem), karena aplikasi internal memang tidak punya token untuk
 *    "kolom baca": ia tidak pernah membutuhkannya.
 *  • **Deklarasinya hidup di dalam `[data-landing]`, bukan `:root`.** Blok di
 *    bawah hanya ikut ke dokumen bila sebuah komponen `components/landing/**`
 *    dirender. Menyalin `var(--sai-landing-font-size-hero)` ke halaman internal
 *    karena itu tidak menghasilkan hero — ia menghasilkan properti yang tidak
 *    pernah teratasi, dan teks itu diam-diam mewarisi ukuran induknya.
 *
 * Pagar terakhirnya bukan CSS melainkan `tests/landing-boundary.test.ts`:
 * app internal tidak boleh mengimpor apa pun dari `components/landing/**` (dan
 * sebaliknya), string `--sai-landing-` dan atribut `data-landing` tidak boleh
 * muncul di luar direktori ini, dan blok di bawah tidak boleh dideklarasikan
 * pada selektor global. Jadi menyalin hero ke halaman internal berhenti menjadi
 * "kelas yang tidak diperiksa siapa pun" dan menjadi **impor yang ditolak
 * penjaga**.
 */
import type { CSSProperties } from "react";

/**
 * Titik patah tunggal halaman ini = `screenSM` AntD (576px), bukan `sm:`
 * Tailwind (640px). Angkanya ditulis tangan karena token layar TIDAK ikut
 * diterbitkan sebagai variabel CSS oleh `cssVar` — hanya token bernilai
 * warna/ukuran yang ikut. Kalau AntD kelak menggeser `screenSM`, geser angka
 * ini pada saat yang sama: seluruh pendaratan berpatah di satu titik ini saja,
 * jadi selisihnya akan terlihat sebagai kepala versi ponsel yang bertahan
 * sementara isinya sudah versi lebar (kegagalan yang sama yang tercatat di
 * kepala `app/(auth)/loading.tsx`).
 */
export const LANDING_BREAKPOINT = 576;

/**
 * Tinggi bilah atas yang menempel (`position: sticky`). Dipakai dua kali dan
 * harus sama di keduanya: oleh bilahnya sendiri, dan oleh jarak jangkar seksi
 * (`scroll-margin-top`) — tanpa itu tautan "#harga" menaruh judul seksinya
 * tepat DI BALIK bilah yang menempel.
 */
export const LANDING_NAV_HEIGHT = 64;

/**
 * Blok gaya halaman pendaratan — dipasang SEKALI oleh `LandingShell`.
 *
 * Isinya dua macam, dan keduanya memang tidak bisa ditulis sebagai gaya
 * sebaris: (a) deklarasi skala pemasaran beserta versi ≥576px-nya, dan (b)
 * keadaan yang hanya hidup di CSS — `:hover`, `:focus`, `details[open]`, dan
 * `prefers-reduced-motion`.
 *
 * Sasarannya atribut `data-landing-*`, bukan kelas: halaman ini tidak menyisakan
 * satu pun `className`, dan atribut membuat setiap aturan bisa dilacak balik ke
 * komponen yang memasangnya.
 */
export const LANDING_STYLE = `
[data-landing]{
  --sai-landing-font-size-hero:var(--ant-font-size-heading-2);
  --sai-landing-line-height-hero:var(--ant-line-height-heading-1);
  --sai-landing-tracking-hero:-0.02em;
  --sai-landing-font-weight-display:700;
  --sai-landing-font-size-section:var(--ant-font-size-heading-3);
  --sai-landing-font-size-lead:calc(var(--ant-font-size-lg) * 1.125);
  --sai-landing-font-size-body:var(--ant-font-size-lg);
  --sai-landing-rhythm:calc(var(--ant-margin-xl) * 2);
  --sai-landing-gutter:var(--ant-padding);
  --sai-landing-measure:72rem;
  --sai-landing-measure-narrow:48rem;
  --sai-landing-measure-copy:42rem;
  --sai-landing-cta-gap:var(--ant-margin-sm);
  --sai-landing-cta-space:var(--ant-margin-xl);
}
[data-landing-skip]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
[data-landing-skip]:focus{position:absolute;top:var(--ant-margin);left:var(--ant-margin);z-index:1000;width:auto;height:auto;clip:auto;padding:var(--ant-padding-xs) var(--ant-padding);border-radius:var(--ant-border-radius);background:var(--ant-color-primary);color:var(--ant-color-text-light-solid);text-decoration:none}
[data-landing-actions]{display:flex;flex-direction:column;gap:var(--sai-landing-cta-gap)}
[data-landing-chrome]{display:none;align-items:center;gap:var(--ant-margin-xs)}
[data-landing-chrome-narrow]{display:flex;align-items:center;gap:var(--ant-margin-xs)}
[data-landing-brand]{transition:opacity 200ms ease}
[data-landing-brand]:hover{opacity:.8}
[data-landing-link]{transition:color 200ms ease}
[data-landing-link]:hover{color:var(--ant-color-text);text-decoration:underline;text-underline-offset:4px}
[data-landing-faq]{cursor:pointer;list-style:none}
[data-landing-faq]::-webkit-details-marker{display:none}
[data-landing-faq]:hover{color:var(--ant-color-link)}
[data-landing-faq]:focus-visible{outline:2px solid var(--ant-color-primary-border);outline-offset:2px}
[data-landing-caret]{transition:transform 200ms ease}
[data-landing] details[open] [data-landing-caret]{transform:rotate(180deg)}
@media (min-width:${LANDING_BREAKPOINT}px){
  [data-landing]{
    --sai-landing-font-size-hero:calc(var(--ant-font-size-heading-1) * 1.4);
    --sai-landing-font-size-section:var(--ant-font-size-heading-2);
    --sai-landing-rhythm:calc(var(--ant-margin-xxl) * 2);
    --sai-landing-gutter:var(--ant-padding-lg);
  }
  [data-landing-actions]{flex-direction:row}
  [data-landing-chrome]{display:flex}
  [data-landing-chrome-narrow]{display:none}
}
@media (prefers-reduced-motion:reduce){
  [data-landing-brand],[data-landing-link],[data-landing-caret]{transition:none}
}
`;

/** Judul hero — satu-satunya teks di aplikasi ini yang melampaui `heading1`. */
export const LANDING_HERO_TITLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-hero)",
  lineHeight: "var(--sai-landing-line-height-hero)",
  letterSpacing: "var(--sai-landing-tracking-hero)",
  fontWeight: "var(--sai-landing-font-weight-display)" as CSSProperties["fontWeight"],
};

/** Judul seksi (`<h2>`) — satu tingkat di bawah hero, tetap di atas skala app. */
export const LANDING_SECTION_TITLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-section)",
  letterSpacing: "var(--sai-landing-tracking-hero)",
  fontWeight: "var(--sai-landing-font-weight-display)" as CSSProperties["fontWeight"],
};

/** Kalimat pembuka di bawah judul hero. */
export const LANDING_LEAD: CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-lead)",
  lineHeight: 1.6,
  color: "var(--ant-color-text-secondary)",
};

/** Kalimat pembuka di bawah judul seksi, dan paragraf penjelas seksi. */
export const LANDING_BODY: CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-body)",
  lineHeight: 1.6,
  color: "var(--ant-color-text-secondary)",
};

/**
 * Catatan kecil (uji coba, PPN, modul per perusahaan) — 14px, sekunder.
 *
 * Ukurannya ditulis eksplisit, BUKAN lewat `<small>`: latar dokumen ini 16px,
 * jadi `<small>` menghasilkan 12,8px — di bawah lantai 14px MASTER.md untuk
 * teks yang membawa keterangan harga.
 */
export const LANDING_NOTE: CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.6,
  color: "var(--ant-color-text-secondary)",
};

/**
 * Kisi kartu pendaratan dengan JUMLAH KOLOM TERKUNCI.
 *
 * `repeat(auto-fit, minmax(<min>, 1fr))` telanjang berkembang sampai kolom
 * selebar `min` masih muat — di 1152px itu berarti empat sampai lima kolom
 * untuk kartu yang dirancang tiga. Suku `(100% - (n-1)×gap)/n` menahan lebar
 * minimum satu kolom pada pembagian n, jadi kisi ini tidak pernah melampaui
 * `columns` kolom, dan tetap turun sendiri menjadi dua lalu satu di layar
 * sempit — tanpa satu pun titik patah yang ditulis tangan.
 */
export function landingGrid(columns: number, min: number): CSSProperties {
  const gap = "var(--ant-margin)";
  const share = `(100% - ${columns - 1} * ${gap}) / ${columns}`;
  return {
    display: "grid",
    gap,
    gridTemplateColumns: `repeat(auto-fit, minmax(max(${min}px, ${share}), 1fr))`,
  };
}
