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
 * ── `asChild`: tidak ada padanannya di AntD ────────────────────────────────
 * Radix `Slot` merender ANAKNYA sebagai tombol; AntD tidak punya konsep itu.
 * Dari 36 pemakaian `Button asChild` di aplikasi ini, **semuanya** membungkus
 * satu tautan — 32 `<Link>` dan 4 `<a>` — dan tidak satu pun membungkus hal
 * lain. Jadi pemetaannya seragam: `<Button href>`, bentuk anchor milik AntD
 * sendiri (`href` membuat akarnya `<a>`, bukan `<button>`).
 *
 * Alternatifnya, `<Link><Button/></Link>`, DITOLAK: ia menghasilkan
 * `<a><button></a>`, yaitu dua elemen interaktif bersarang — HTML yang tidak
 * sah, dan pembaca layar mengumumkannya dua kali. (Idiom itu memang sudah
 * dipakai di 46 tempat lain di aplikasi ini; itu utang yang layak dibayar di
 * fase C, bukan alasan untuk menambahnya 36 lagi.)
 *
 * Yang HILANG karena pemetaan ini: navigasi sisi-klien dan prefetch `next/link`
 * untuk ke-36 tautan itu — semuanya kini pemuatan halaman penuh. Ke-36 tautan
 * itu adalah perpindahan antar-layar besar (pendaratan -> daftar, wisaya ->
 * dashboard, platform -> buku perusahaan lain), sebagian bahkan sudah sengaja
 * memakai `<a>` supaya memuat penuh. Fase C yang memutuskan mana yang perlu
 * dikembalikan menjadi `<Link>` sungguhan.
 *
 * Yang TIDAK hilang: `href` tetap melewati `scopedHref()`, penyelaras jalur
 * bertenant milik `app-link.tsx`. Tanpa itu tiga tautan wisaya penyiapan
 * (`/dashboard`, `/journal/…`, `/reports/…`) akan kembali menempuh pantulan
 * 307 yang justru dihapus issue #157.
 */

import { Button as AntdButton } from "antd";
import type { ButtonProps as AntdButtonProps } from "antd";
import * as React from "react";
import { usePathname } from "next/navigation";

import { scopedHref } from "@/components/ui/app-link";
import { cn } from "@/lib/utils";

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

type ButtonProps = NativeButtonProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Merender tautan anaknya sebagai tombolnya — lihat komentar kepala berkas. */
  asChild?: boolean;
  /** `type` HTML, bukan `type` AntD. Dipetakan ke `htmlType`. */
  type?: "button" | "submit" | "reset";
};

function Button({ asChild = false, ...props }: ButtonProps) {
  /*
   * Dua komponen, bukan satu dengan percabangan di dalam: hanya jalur `asChild`
   * yang butuh `usePathname()`, dan memanggil hook itu di SETIAP tombol berarti
   * 128 berkas ikut berlangganan perubahan alamat demi tiga tautan yang
   * membutuhkannya.
   */
  return asChild ? <ButtonAnchor {...props} /> : <ButtonElement {...props} />;
}

function ButtonElement({
  variant = "primary",
  size = "md",
  className,
  type,
  ref,
  ...rest
}: Omit<ButtonProps, "asChild">) {
  return (
    <AntdButton
      {...VARIANTS[variant]}
      {...SIZES[size]}
      htmlType={type}
      className={className}
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
 * Prop `next/link` yang TIDAK boleh ikut mendarat di `<a>`. Semuanya instruksi
 * untuk Link, bukan atribut HTML; diteruskan apa adanya, React memperingatkan
 * "unknown prop" di konsol dan atributnya benar-benar tertulis ke DOM.
 */
const LINK_ONLY = new Set([
  "prefetch",
  "replace",
  "scroll",
  "shallow",
  "passHref",
  "legacyBehavior",
  "locale",
  "as",
  "onNavigate",
]);

type AnchorChildProps = {
  href?: unknown;
  children?: React.ReactNode;
  className?: string;
} & Record<string, unknown>;

function ButtonAnchor({
  variant = "primary",
  size = "md",
  className,
  children,
  type,
  ref,
  ...rest
}: Omit<ButtonProps, "asChild">) {
  /*
   * `type` sengaja diambil dari `rest` lalu dibuang: pada `<a>` atribut itu
   * berarti tipe MIME dokumen tujuan, bukan "kirim formulir". Diteruskan apa
   * adanya, tombol tautan mewarisi `type="submit"` yang tak berarti apa-apa dan
   * menyesatkan siapa pun yang membaca DOM-nya.
   */
  void type;
  const pathname = usePathname();
  const child = React.Children.only(children) as React.ReactElement<AnchorChildProps>;
  const {
    href,
    children: label,
    className: childClassName,
    ...childRest
  } = child.props;

  const anchorProps = Object.fromEntries(
    Object.entries(childRest).filter(([key]) => !LINK_ONLY.has(key))
  );

  return (
    <AntdButton
      {...VARIANTS[variant]}
      {...SIZES[size]}
      /*
       * `href` bertipe `UrlObject` juga sah bagi `next/link`, tapi tidak dipakai
       * satu pun dari 36 pemanggil — dan menebak isinya lebih berisiko daripada
       * membiarkannya kosong (sama seperti alasan `app-link.tsx` melewatkan
       * bentuk itu). Tanpa `href`, AntD merender `<button>`: tetap bisa ditekan,
       * hanya tidak menavigasi — kegagalan yang terlihat, bukan yang senyap.
       */
      href={typeof href === "string" ? scopedHref(href, pathname) : undefined}
      className={cn(className, childClassName)}
      ref={ref as React.Ref<HTMLButtonElement | HTMLAnchorElement>}
      {...rest}
      {...anchorProps}
    >
      {label}
    </AntdButton>
  );
}

export { Button };
export type { ButtonProps, ButtonSize, ButtonVariant };
