"use client";

/**
 * Button — primitif di atas Ant Design `Button` (issue #187, fase B1).
 *
 * Nama dan tanda tangan ekspornya SENGAJA tidak berubah: 128 berkas mengimpor
 * primitif ini, dan mengonversinya adalah pekerjaan fase C. Selama fase B
 * primitif ini adalah JAHITAN — di dalamnya AntD, di luarnya API lama.
 *
 * ── Yang diterjemahkan, dan kenapa penerjemahnya harus di sini ─────────────
 * Tiga nama bertabrakan antara API lama dan API AntD, dan ketiganya adalah
 * kelas kesalahan yang tidak akan pernah gagal di `tsc` kalau dibiarkan bocor
 * ke pemanggil:
 *
 *  1. **`type`.** Di HTML (dan di primitif lama) `type` berarti
 *     `submit`/`button`/`reset`. Di AntD `type` berarti VARIAN VISUAL
 *     (`primary`/`default`/`text`/`link`). 60 tombol di aplikasi ini menulis
 *     `type="submit"`; diteruskan apa adanya ke AntD, semuanya berubah menjadi
 *     tombol bergaya "submit" yang tidak ada — dan **berhenti mengirim
 *     formulirnya**, karena `htmlType` bawaan AntD adalah `button`. Formulir
 *     yang diam saat Enter ditekan adalah bug yang lolos build, lolos tes
 *     tipe, dan hanya terlihat kalau seseorang benar-benar menyimpan sesuatu.
 *     Karena itu `type` di sini tetap berarti HTML, dan dipetakan ke
 *     `htmlType`.
 *  2. **`variant`.** Nama domain aplikasi ini (`primary`/`danger`/…, lihat
 *     issue #50) dipetakan ke pasangan `type` + `danger` milik AntD.
 *  3. **`size`.** `sm|md|lg|icon` -> `small|middle|large` + `shape="circle"`.
 *
 * ── Bawaan `variant` = `secondary` (#267, potongan 5) ──────────────────────
 * **`<Button>` tanpa atribut adalah tombol SEKUNDER.** Sampai potongan 5 ia
 * `primary`, dan itulah bagaimana 120 dari 310 tombol menjadi berisi penuh
 * tanpa seorang pun memutuskannya — sampai penekanan berhenti membedakan apa
 * pun. Bawaan yang aman adalah bawaan yang **paling sering benar**, dan aturan
 * di MASTER.md §Aksi utama per layar adalah *satu aksi utama per layar, nol
 * juga sah*: dengan aturan itu, tombol yang paling sering benar adalah yang
 * sekunder. **Penekanan tinggi sekarang harus DIMINTA** — `variant="primary"`,
 * ditulis, terlihat di diff, satu kali per layar.
 *
 * Pembalikan ini sengaja dikerjakan TERAKHIR, dan itu yang membuatnya murah:
 * potongan 1–4 lebih dulu menuliskan `variant` di **setiap** pemanggil, jadi
 * saat bawaannya dibalik tidak ada satu pun tombol yang ikut bergerak. Diukur
 * pada PR-nya: nol `<Button>` tanpa `variant` di seluruh `src/`, dan markup
 * hasil render ke-305 pemanggilnya identik sebelum & sesudah. Urutan
 * sebaliknya — bawaan dulu, audit belakangan — akan mencabut aksi utama setiap
 * layar sekaligus.
 *
 * ⚠ Jangan membaliknya kembali "supaya tombol tidak perlu ditulis variannya".
 * Yang hilang bukan pengetikan melainkan keputusan: `<Button>` polos berarti
 * tidak ada yang memilih penekanan tombol itu. `tests/button-emphasis.test.ts`
 * karena itu TETAP menolak `<Button>` tanpa `variant`, walau sekarang
 * akibatnya diam (tombol jadi sekunder) alih-alih keras (biru liar) — diam
 * justru lebih sulit terlihat mata.
 *
 * ── Target sentuh ≥ 40px (MASTER.md) ──────────────────────────────────────
 * Tidak dipasang di sini, dan itu disengaja. Tingginya datang dari token
 * `controlHeight: 40` di `AntdProvider`; diverifikasi terhadap sumber AntD
 * (`button/style/index.ts` menetapkan `height: controlHeight` dan
 * `minWidth: controlHeight`) dan dikunci `tests/ui-controls-antd.test.tsx`.
 * Konsekuensi yang perlu diketahui: `controlHeightSM` adalah TURUNAN
 * (`controlHeight * 0.75`), jadi `size="sm"` menjadi 30px — dua piksel lebih
 * pendek dari `h-8` lama. Itu di bawah 40px, sama seperti sebelumnya: `sm`
 * memang dipakai di tempat yang bukan target sentuh utama.
 *
 * ── Tombol-sebagai-tautan: `<Button href>`, dan TIDAK ADA bentuk lain ──────
 * `href` membuat akar AntD-nya `<a class="ant-btn">` — satu elemen, bukan
 * `<a>` membungkus `<button>`. Sarang anchor–tombol (`<Link><Button/></Link>`)
 * DITOLAK di tempat baru: ia dua elemen interaktif bersarang — HTML yang tidak
 * sah, dan pembaca layar mengumumkannya dua kali. (Idiom itu masih terpakai di
 * 46 tempat lama; itu utang, bukan izin untuk menambahnya.)
 *
 * ── ⚠ Kenapa `asChild` DICABUT (#250, temuan #203) ─────────────────────────
 * Ini bug produksi yang menyala di build sungguhan, jadi ditulis panjang —
 * orang berikutnya tidak akan menebaknya benar, dan orang berikutnya itulah
 * yang akan tergoda memasangnya kembali.
 *
 * Sampai #250 primitif ini menerima `asChild`: sebuah bentuk yang MEMBACA prop
 * anaknya (`href`, label) untuk memasangnya di `<a>` milik AntD. Ketika
 * pemanggilnya server component, anak itu menyeberangi batas RSC lebih dulu:
 * `<Link>` adalah komponen client, jadi Flight menserialisasinya sebagai
 * REFERENSI client, dan sisi SSR baru mengubahnya menjadi elemen setelah
 * chunk-nya termuat. Selama belum, React menyerahkannya sebagai simpul
 * **`lazy`** — `{$$typeof: Symbol(react.lazy), _payload, _init}` — yang
 * `React.isValidElement()`-nya `false` dan tidak punya `.props` untuk dibaca.
 * `React.Children.only()` melemparkan "expected to receive a single React
 * element child", dan pada halaman statis itu MEMATIKAN `next build`.
 *
 * Terukur pada #203: pada satu build, `/privacy` (dua tombol) lolos dan
 * `/terms` — halaman kembarnya, pola JSX yang sama persis — gagal pada tombol
 * KEDUAnya saja. Yang menentukan bukan kodenya melainkan urutan pemuatan
 * chunk, dan urutan itu bergeser setiap kali graf modul berubah: di #203
 * pemicunya sekadar delapan paket yang dicabut dari `package.json`. Artinya
 * bug ini tidak pernah bisa "sudah diperbaiki" selama bentuknya masih ada — ia
 * hanya sedang tidak menyala.
 *
 * Karena itu bentuknya dihapus, bukan diperingatkan. Ke-37 pemanggilnya
 * membungkus satu tautan tanpa kecuali (32 `<Link>`, 5 `<a>`), jadi semuanya
 * pindah ke `<Button href>` — bentuk yang tidak membaca anaknya sama sekali
 * dan menghasilkan `<a>` yang identik, tanpa satu pun perubahan perilaku:
 * `asChild` pun sudah merender lewat `ButtonLink` yang sama. `tests/button-no-aschild.test.ts`
 * menolak propnya kembali.
 *
 * Yang ke-37 patut disebut namanya: `ui/empty-state.tsx`. Ia luput dari
 * hitungan issue #250 (yang mengecualikan `components/ui/**`) padahal justru
 * pemanggil paling berbahaya — 45 halaman memakainya, sebagian besar server
 * component. Yang menemukannya adalah penjaganya sendiri, pada jalannya yang
 * pertama.
 *
 * Yang HILANG karena pemetaan ini: navigasi sisi-klien dan prefetch `next/link`
 * untuk ke-37 tautan itu — semuanya pemuatan halaman penuh. Itu sudah begitu
 * sejak #187 (`asChild` juga membuang `<Link>`-nya), jadi #250 tidak
 * mengubahnya. Ke-37 tautan itu adalah perpindahan antar-layar besar
 * (pendaratan -> daftar, wisaya -> dashboard, platform -> buku perusahaan
 * lain), sebagian bahkan sudah sengaja memakai `<a>` supaya memuat penuh.
 *
 * Yang TIDAK hilang: `href` tetap melewati `scopedHref()`, penyelaras jalur
 * bertenant milik `app-link.tsx`. Tanpa itu tiga tautan wisaya penyiapan
 * (`/dashboard`, `/journal/…`, `/reports/…`) akan kembali menempuh pantulan
 * 307 yang justru dihapus issue #157.
 *
 * ── Atribut anchor menempel di TOMBOLNYA ──────────────────────────────────
 * `download`/`target`/`rel` dulu ditulis di `<a>` anaknya. Tanpa anak, mereka
 * ditulis di `<Button>` — dan karena `React.ComponentProps<"button">` tidak
 * mengenal satu pun di antaranya, ketiganya dideklarasikan di bawah supaya
 * yang lupa memindahkannya gugur di `tsc`, bukan di produksi.
 */

import { Button as AntdButton } from "antd";
import type { ButtonProps as AntdButtonProps } from "antd";
import * as React from "react";
import { usePathname } from "next/navigation";

import { scopedHref } from "@/components/ui/app-link";

type ButtonVariant =
  | "primary"
  | "default"
  | "secondary"
  | "danger"
  | "destructive"
  | "ghost"
  | "outline"
  | "link";

type ButtonSize = "sm" | "md" | "lg" | "icon";

/**
 * `default` dan `destructive` adalah alias shadcn dari `primary` dan `danger`
 * (issue #50) — keduanya menunjuk objek yang sama persis, bukan salinan, supaya
 * tidak ada jalan bagi keduanya menyimpang diam-diam.
 */
const PRIMARY: AntdVariant = { type: "primary" };
/**
 * `danger` = isian merah pekat, bukan garis merah. Itu rupa tombol destruktif
 * lama (`bg-destructive`), dan mempertahankannya berarti "Hapus" tetap terbaca
 * sebagai tindakan yang berbahaya, bukan sebagai tombol biasa yang kebetulan
 * berwarna.
 */
const DANGER: AntdVariant = { type: "primary", danger: true };

type AntdVariant = Pick<AntdButtonProps, "type" | "danger">;

const VARIANTS: Record<ButtonVariant, AntdVariant> = {
  primary: PRIMARY,
  default: PRIMARY,
  secondary: { type: "default" },
  danger: DANGER,
  destructive: DANGER,
  ghost: { type: "text" },
  outline: { type: "default" },
  link: { type: "link" },
};

const SIZES: Record<ButtonSize, Pick<AntdButtonProps, "size" | "shape">> = {
  sm: { size: "small" },
  md: { size: "middle" },
  lg: { size: "large" },
  /**
   * `icon` bukan ukuran melainkan BENTUK: `shape="circle"` memberi kotak
   * sisi `controlHeight` (40px), yaitu target sentuh yang sama dengan tombol
   * berteks — hal yang paling sering hilang saat tombol ikon dirakit tangan.
   */
  icon: { size: "middle", shape: "circle" },
};

/*
 * ── Tidak ada lagi pengecil ikon di sini, dan itu bukan kelalaian ──────────
 *
 * Berkas ini dulu memasang `[&_svg:not([class*='size-'])]:size-4` pada setiap
 * tombol: `<svg>` paket ikon LAMA tanpa ukuran adalah 24px, yang di dalam
 * tombol 40px terlihat seperti salah render. Ikon `@ant-design/icons` tidak
 * membutuhkannya — SVG-nya `1em`, jadi ia sudah mengikuti `fontSize` tombolnya
 * — dan sejak paket lama dicabut (PR penutup issue #201), aturan itu tidak
 * punya satu pun ikon yang dilayaninya. **Jangan memasangnya kembali:** ukuran
 * ikon AntD adalah `font-size`, dan kelas kotak (`size-4`/`h-4 w-4`) mengukur `<span>`
 * pembungkusnya, bukan SVG di dalamnya — perubahan yang terlihat berhasil di
 * diff dan tidak berpengaruh apa pun di layar. Lihat "Ikon" di
 * `design-system/sai-accounting/MASTER.md`.
 */

type NativeButtonProps = Omit<React.ComponentProps<"button">, "color" | "type">;

/**
 * Atribut yang hanya berarti di `<a>`. Ada di sini karena `<Button href>`
 * adalah SATU-SATUNYA cara membuat tombol-tautan sejak #250: tanpa anak `<a>`
 * untuk menampungnya, `download` & kawan-kawan tidak punya tempat lain.
 * `React.ComponentProps<"button">` tidak mengenalnya, jadi tanpa deklarasi ini
 * memindahkan `<a download>` ke `<Button href download>` gagal di `tsc`.
 */
type AnchorOnlyProps = Pick<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "download" | "target" | "rel"
>;

type ButtonProps = NativeButtonProps &
  AnchorOnlyProps & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /**
     * Menjadikan tombolnya sebuah TAUTAN — `<a class="ant-btn">`, bentuk anchor
     * AntD sendiri. Aman di kedua sisi batas RSC karena ia tidak membaca anak
     * apa pun; lihat komentar kepala berkas untuk bentuk yang DICABUT dan
     * kenapa.
     *
     * Nilainya melewati `scopedHref()` supaya jalur bertenant tidak kembali
     * menempuh pantulan 307 (#157).
     */
    href?: string;
    /** `type` HTML, bukan `type` AntD. Dipetakan ke `htmlType`. */
    type?: "button" | "submit" | "reset";
  };

function Button({ href, ...props }: ButtonProps) {
  /*
   * Dua komponen, bukan satu dengan percabangan di dalam: hanya jalur tautan
   * yang butuh `usePathname()`, dan memanggil hook itu di SETIAP tombol berarti
   * 128 berkas ikut berlangganan perubahan alamat demi tautan yang
   * membutuhkannya.
   */
  if (href !== undefined) return <ButtonLink href={href} {...props} />;
  return <ButtonElement {...props} />;
}

function ButtonElement({
  /** Bawaannya `secondary` — lihat "Bawaan `variant`" di kepala berkas. */
  variant = "secondary",
  size = "md",
  type,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <AntdButton
      {...VARIANTS[variant]}
      {...SIZES[size]}
      htmlType={type}
      /*
       * `ref` tetap ditandatangani `HTMLButtonElement` di luar (satu pemanggil,
       * `confirm-dialog.tsx`, memfokuskan tombol konfirmasinya lewat ref).
       * AntD menandatanganinya sebagai gabungan anchor|button karena komponen
       * yang sama bisa merender keduanya; penyempitan itu diselesaikan di sini,
       * bukan dengan memaksa pemanggil melebarkan tipenya.
       */
      ref={ref as React.Ref<HTMLButtonElement | HTMLAnchorElement>}
      {...rest}
    />
  );
}

/**
 * Bentuk anchor AntD: satu `<a class="ant-btn">`, bukan `<a>` membungkus
 * `<button>`. Satu-satunya jalur tautan sejak #250, dan ia tidak pernah membaca
 * `children` — itulah yang membuatnya aman di kedua sisi batas RSC.
 */
function ButtonLink({
  /**
   * Bawaan yang SAMA dengan `ButtonElement`, dan itu harus dijaga tetap sama:
   * dua bawaan yang berbeda berarti `<Button>` dan `<Button href>` yang ditulis
   * identik berpenampilan berbeda — perbedaan yang tidak akan pernah gagal di
   * `tsc` dan hanya terlihat kalau seseorang menaruh keduanya bersebelahan.
   */
  variant = "secondary",
  size = "md",
  href,
  children,
  type,
  ref,
  ...rest
}: ButtonProps) {
  /*
   * `type` sengaja diambil lalu dibuang: pada `<a>` atribut itu berarti tipe
   * MIME dokumen tujuan, bukan "kirim formulir". Diteruskan apa adanya, tombol
   * tautan mewarisi `type="submit"` yang tak berarti apa-apa dan menyesatkan
   * siapa pun yang membaca DOM-nya.
   */
  void type;
  const pathname = usePathname();

  return (
    <AntdButton
      {...VARIANTS[variant]}
      {...SIZES[size]}
      /*
       * Tanpa `href`, AntD merender `<button>`: tetap bisa ditekan, hanya tidak
       * menavigasi — kegagalan yang terlihat, bukan yang senyap.
       */
      href={href === undefined ? undefined : scopedHref(href, pathname)}
      ref={ref as React.Ref<HTMLButtonElement | HTMLAnchorElement>}
      {...rest}
    >
      {children}
    </AntdButton>
  );
}

export { Button };
export type { ButtonProps, ButtonSize, ButtonVariant };
