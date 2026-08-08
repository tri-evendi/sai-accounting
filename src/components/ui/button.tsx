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
 * ── Tombol-sebagai-tautan: TIGA bentuk, dan cara memilih di antaranya ──────
 * Sarang anchor–tombol (`<Link><Button/></Link>`, `<a href download><Button/></a>`)
 * DITOLAK di mana pun: ia dua elemen interaktif bersarang — HTML yang tidak sah,
 * dan pembaca layar mengumumkannya dua kali. Yang menggantikannya:
 *
 *   1. **`<Button>`** — tombol. Tidak menavigasi.
 *   2. **`<Button href>`** — `<a class="ant-btn">` milik AntD, PEMUATAN HALAMAN
 *      PENUH. Benar untuk tautan keluar, `download`, `target="_blank"`, dan
 *      perpindahan yang memang ingin memuat ulang seluruh app.
 *   3. **`<ButtonLink href>`** (#289) — `<a class="ant-btn">` yang SAMA, plus
 *      navigasi sisi-klien dan prefetch. Benar untuk rute di dalam app.
 *
 * Keduanya (2 & 3) merender satu elemen `<a>` dan berbagi satu perakit
 * (`ButtonAnchor`), jadi rupanya tidak bisa menyimpang. Yang membedakan hanya
 * apa yang terjadi saat diklik — dan itu keputusan yang harus DITULIS, sebab
 * keduanya terlihat identik di layar dan hanya berbeda di waktu muat.
 *
 * ── Hitungan sarang yang tersisa: 24 di 14 berkas (2026-08-08) ─────────────
 * Diukur dengan parser TypeScript yang sama dengan `tests/button-emphasis.test.ts`,
 * dan angkanya kini dijaga per-berkas di `tests/anchor-button-nesting.test.ts`
 * (`SISA_SARANG`, daftar yang hanya boleh MENGECIL). Jejaknya: **50 di 29**
 * saat issue #289 dibuka, **45 di 27** setelah modul faktur (PR 1), **24 di
 * 14** setelah paruh pertama sisa modul (PR 2). Angka di sini akan basi lebih
 * cepat daripada `SISA_SARANG`; kalau keduanya berbeda, yang benar adalah
 * penjaganya.
 *
 * ⚠ Dua angka lain beredar dan keduanya keliru — ditulis di sini supaya tidak
 * dihidupkan kembali. **"46"** (yang tertulis di kepala berkas ini sampai #289)
 * menghitung `<Link>` saja dan melewatkan 4 sarang `<a>`. **"56 di 32 berkas"**
 * (badan issue #289) adalah sapuan regex; `[^>]` di dalam pola berhenti pada
 * `>` milik `=>`, jadi setiap sarang di dalam `.map((x) => …)` ikut tercacah
 * salah. Hitung dengan parser, bukan dengan regex — di #267 empat angka
 * berturut-turut salah persis karena itu.
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
 * ── ⚠ Kenapa 50 sarang itu TIDAK boleh sekadar pindah ke `<Button href>` ───
 * Karena untuk MEREKA harganya tidak gratis. Ke-37 pemanggil #250 sudah memuat
 * penuh sejak #187 — `asChild` pun membuang `<Link>`-nya — jadi pindah ke
 * `<Button href>` tidak mengubah apa pun. Ke-50 sarang ini kebalikannya:
 * `<Link>`-nya MASIH HIDUP, jadi memindahkannya apa adanya akan mencabut
 * navigasi sisi-klien dan prefetch dari 46 tautan sekaligus — menukar bug
 * validitas HTML dengan regresi yang terasa di setiap perpindahan halaman.
 * Karena itu bentuk KETIGA, bukan pemindahan.
 *
 * ── Bagaimana `ButtonLink` mendapat keduanya, dan apa yang DITOLAK ─────────
 * Yang dicari: SATU elemen `<a>`, bergaya tombol, dengan perilaku `next/link`.
 * Empat jalan diukur; tiga gugur.
 *
 *  ✗ **Mengganti elemen akar `Button` AntD.** Tidak ada jalannya — diperiksa di
 *    sumbernya, bukan ditebak: `antd@6.5.3` `es/button/Button.js` bercabang
 *    `href !== undefined ? createElement("a") : createElement("button")` dan
 *    tidak menerima `as`/`component`/`linkComponent`; `ButtonProps` juga tidak
 *    mendeklarasikannya.
 *  ✗ **Menyalin nama kelas cssinjs ke `<Link className>`.** `AntdProvider`
 *    tidak menyetel `hashed: false`, jadi aturan gayanya menempel pada kelas
 *    ber-hash (`css-<hash>`) yang berubah setiap kali token berubah. Kelas yang
 *    disalin akan berhenti berlaku DIAM-DIAM — tombolnya menjadi teks biasa,
 *    tanpa satu pun galat.
 *  ✗ **`<Link legacyBehavior>` membungkus `<Button href>`.** Ini secara teknis
 *    menghasilkan satu `<a>` (Link meng-`cloneElement` anaknya), tetapi ia
 *    MEMBACA anaknya — kelas bug yang sama dengan `asChild`, sampai-sampai
 *    `next/link` sendiri melempar bila anak itu simpul `react.lazy`
 *    (`client/app-dir/link.js`, galat E863). Dan ia sudah usang: Next 16
 *    memanggil `errorOnce("legacyBehavior is deprecated and will be removed")`.
 *    Membangun primitif baru di atas prop yang dijadwalkan hilang, yang cara
 *    kerjanya persis yang dicabut #250, adalah dua kesalahan sekaligus.
 *  ✓ **`<a>` AntD sungguhan + semantik `next/link` dipasang dari luar.**
 *    Gayanya tetap milik AntD (tidak ada kelas yang disalin), `href`-nya nyata
 *    (klik-tengah, "buka di tab baru", salin alamat, dan pembaca layar semuanya
 *    tetap benar), dan yang kita tambahkan hanya dua hal yang memang punya API
 *    publik: `router.push()` pada klik biasa, dan `router.prefetch()` saat
 *    tautannya masuk viewport.
 *
 * ⚠ Yang bentuk ini TIDAK berikan, supaya tidak ada yang mengira ia `next/link`
 * seutuhnya: `useLinkStatus()` (status pending per tautan) dan prefetch-ulang
 * otomatis saat cache segmen kedaluwarsa. Keduanya digerakkan
 * `mountLinkInstance()`, internal `next/link` tanpa API publik. Kalau salah
 * satunya kelak dibutuhkan, jalannya bukan menebak internal itu melainkan
 * menunggu Next membuka `Link` untuk elemen kustom.
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
import { usePathname, useRouter } from "next/navigation";

import {
  amatiSekaliSaatTerlihat,
  klikBiasa,
  scopedHref,
  tautanDicegat,
} from "@/components/ui/app-link";

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
  if (href !== undefined) return <ButtonAnchor href={href} {...props} />;
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
 * `<button>`. Ia tidak pernah membaca `children` — itulah yang membuatnya aman
 * di kedua sisi batas RSC (#250).
 *
 * SATU-SATUNYA perakit `<a>` di berkas ini: `<Button href>` memakainya, dan
 * `<ButtonLink>` juga. Itu disengaja — dua perakit berarti dua tombol tautan
 * yang bisa berpenampilan berbeda tanpa satu pun galat.
 */
function ButtonAnchor({
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

type ButtonLinkProps = Omit<ButtonProps, "href" | "type" | "ref" | "onClick"> & {
  /**
   * Tujuan di DALAM app — jalur yang diawali `/`. Wajib, bukan opsional:
   * `<ButtonLink>` tanpa tujuan adalah tombol, dan untuk itu sudah ada
   * `<Button>`.
   *
   * Nilainya melewati `scopedHref()`, sama seperti `<Button href>` dan
   * `<Link>`. Tanpa itu jalur bertenant kembali menempuh pantulan 307 (#157).
   *
   * Alamat LUAR (`https://…`, `mailto:`) boleh ditulis dan tidak akan rusak —
   * ia hanya tidak dicegat, jadi peramban menanganinya seperti tautan biasa.
   * Tapi untuk itu `<Button href>` lebih jujur: ia tidak menjanjikan navigasi
   * sisi-klien yang memang tidak mungkin.
   */
  href: string;
  /** `router.replace()` alih-alih `push()` — tidak menambah riwayat. */
  replace?: boolean;
  /**
   * Prefetch saat tautannya masuk viewport, seperti `next/link`. `false`
   * mematikannya untuk tautan yang jarang diklik tapi sering terlihat.
   */
  prefetch?: boolean;
  /**
   * Dijalankan SEBELUM navigasi. `preventDefault()` di dalamnya membatalkan
   * navigasinya — perilaku yang sama dengan `onClick` pada `next/link`.
   */
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
};

/**
 * Tombol yang MENAVIGASI di sisi klien — bentuk ketiga (#289).
 *
 * Ia merender `<ButtonAnchor>` yang sama dengan `<Button href>`, jadi rupanya
 * datang seluruhnya dari AntD dan tidak ada satu pun nama kelas yang disalin.
 * Yang ditambahkan hanya dua hal, keduanya lewat API publik `next/navigation`:
 * `router.push()` saat diklik, dan `router.prefetch()` saat tautannya terlihat.
 *
 * ⚠ Ia tidak membaca `children` sama sekali — tautannya dibangun dari PROP.
 * Itu bukan gaya penulisan melainkan syarat: bentuk yang membaca anaknya
 * (`asChild`, `<Link legacyBehavior>`) menerima simpul `react.lazy` ketika
 * pemanggilnya server component, dan itu yang mematikan `next build` di #203.
 * Lihat kepala berkas.
 */
function ButtonLink({
  href,
  replace = false,
  prefetch = true,
  onClick,
  target,
  download,
  ...rest
}: ButtonLinkProps) {
  const pathname = usePathname();
  const router = useRouter();

  /*
   * Satu `scopedHref()`, satu hasil: `ButtonAnchor` di bawah memanggil fungsi
   * MURNI yang sama dengan `pathname` yang sama, jadi alamat di atribut `href`
   * dan alamat yang didorong `router` tidak bisa berbeda. Menghitungnya sekali
   * lalu menyerahkan hasilnya ke `ButtonAnchor` justru akan MEMBUAT bedanya
   * mungkin — `ButtonAnchor` akan men-scope ulang yang sudah ter-scope.
   */
  const tujuan = scopedHref(href, pathname);
  const dicegat = tautanDicegat(tujuan, { target, download });

  const anchorRef = React.useRef<Element | null>(null);
  const simpanRef = React.useCallback((el: HTMLButtonElement | null) => {
    anchorRef.current = el;
  }, []);

  /*
   * Prefetch viewport, seperti `next/link` (yang memprefetch saat tautannya
   * TERLIHAT, bukan saat dihover). Dilewati di `development` karena `next/link`
   * pun melewatinya di sana: `router.prefetch()` pada dev server memicu
   * kompilasi rute atas permintaan, jadi memasangnya justru memperlambat menu
   * yang sekadar terlihat.
   *
   * Satu pengamat per tautan, bukan satu pengamat bersama. Layar terpadat yang
   * sudah dipindahkan (`/invoices`) memuat ENAM — dua di kepala, empat chip
   * saringan dari `.map()` — dan tidak ada berkas tersisa yang memuat lebih
   * dari empat sarang. Pengamat bersama menuntut peta elemen tingkat modul,
   * yaitu keadaan global, demi penghematan sebesar itu.
   */
  React.useEffect(() => {
    if (!dicegat || !prefetch) return;
    if (process.env.NODE_ENV === "development") return;
    return amatiSekaliSaatTerlihat(anchorRef.current, () => router.prefetch(tujuan));
  }, [dicegat, prefetch, router, tujuan]);

  const tanganiKlik = (e: React.MouseEvent<HTMLElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (!dicegat || !klikBiasa(e)) return;

    e.preventDefault();
    if (replace) router.replace(tujuan);
    else router.push(tujuan);
  };

  return (
    <ButtonAnchor
      href={href}
      target={target}
      download={download}
      onClick={tanganiKlik}
      /*
       * AntD meneruskan `ref` ke elemen yang benar-benar ia render, dan pada
       * cabang `href` itu `<a>` (`es/button/Button.js`). Tandatangannya di
       * `ButtonProps` tetap `HTMLButtonElement` karena di situlah 128 pemanggil
       * lain memakainya; yang disimpan di sini hanya elemen untuk DIAMATI, jadi
       * `Element` sudah cukup dan tidak ada tanda tangan yang perlu dilebarkan.
       */
      ref={simpanRef}
      {...rest}
    />
  );
}

export { Button, ButtonLink };
export type { ButtonLinkProps, ButtonProps, ButtonSize, ButtonVariant };
