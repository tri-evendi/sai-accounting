/**
 * Table (issue #52) — primitif tabel, satu sumber gaya untuk 50 tabel
 * transaksi yang sebelumnya menyalin-tempel gayanya sendiri.
 *
 * **Sengaja TANPA `"use client"`.** Berkas ini tidak memakai hook sama
 * sekali, dan itu yang membuatnya boleh berdiri di server. Di app ini
 * 46 dari 66 pemakai primitif tabel adalah server component yang mengambil
 * datanya langsung dari Prisma; menandainya client akan menyeret semuanya ke
 * bundel client tanpa alasan. Jadi penanda itu dilepas — komponen ini murni
 * presentasional dan aman di kedua sisi.
 *
 * `Table` membawa pembungkus geser mendatar bawaan: tabel lebar menggulung
 * DI DALAM kotaknya, bukan membuat seluruh halaman menggulung mendatar di
 * layar 375px (aturan responsif MASTER.md).
 *
 * Untuk kolom nominal pakai `MoneyCell` (lihat `money.tsx`) supaya aturan
 * uang MASTER.md ditegakkan di satu tempat, bukan diketik ulang per halaman.
 *
 * ── Perannya sejak migrasi AntD (issue #189) ───────────────────────────────
 * Primitif tabel dipecah dua, dan berkas ini adalah LAPISAN GAYA di bawah
 * keduanya — bukan lagi API yang seharusnya dipanggil halaman secara langsung:
 *
 *   • `static-table.tsx` — `StaticTable`, dirender di SERVER dari `columns` +
 *     `rows`; memakai primitif di berkas ini untuk markup-nya;
 *   • `data-table.tsx`   — `DataTable`, di atas AntD `Table`, komponen client,
 *     untuk tabel yang benar-benar butuh sortir/filter/paginasi seketika.
 *
 * Keduanya berbagi kontrak kolom yang sama (`table-columns.tsx`), jadi sebuah
 * tabel bisa berpindah varian tanpa kolomnya ditulis ulang.
 *
 * **Pensiunnya sudah terjadi.** Ekspor JSX di bawah dulu dipakai langsung oleh
 * 66 berkas; fase C (#193–#200) memindahkan semuanya ke `StaticTable`/
 * `DataTable`. Yang tersisa memakainya secara langsung tinggal tiga — dua
 * matriks izin dan `shared/aging.tsx` — dan ketiganya memakai `style`, bukan
 * `className`. Karena itu prop `className` DICABUT di #203 bersama kelas
 * Tailwind-nya: gaya di berkas ini kini sebaris dari token AntD.
 *
 * ── Yang TIDAK bisa menjadi gaya sebaris, dan rumahnya ─────────────────────
 * Tiga hal: `:hover` baris, `:last-child` (baris terakhir tanpa garis bawah),
 * dan pengecualian hover untuk baris "tidak ada data". Ketiganya keadaan yang
 * hanya hidup di CSS. Rumahnya satu blok `<style href precedence>` di dalam
 * `Table` — React 19 meniadakan gandanya dan menaikkannya ke `<head>`, jadi
 * seratus tabel tetap menghasilkan satu aturan. Sasarannya `data-slot`, atribut
 * yang memang sudah dipasang setiap primitif di bawah, bukan kelas baru.
 *
 * ── Header lengket: kenapa ia butuh DUA bagian (issue #229) ────────────────
 * Ini bagian yang paling mudah salah, jadi ditulis eksplisit — ia menggantikan
 * `permissions/matrix-sticky.ts`, solusi sementara yang dirakit di sisi
 * pemanggil pada #199.
 *
 * `position: sticky` dihitung terhadap **ancestor scroll container TERDEKAT**,
 * bukan terhadap viewport. Pembungkus geser di bawah SELALU sebuah
 * scroll container (menurut CSS, `overflow-y: visible` ikut berubah menjadi
 * `auto` begitu sumbu lain bukan `visible`), tetapi tinggi bawaannya mengikuti
 * isi — jadi ia tidak pernah benar-benar menggulung vertikal: `top: 0` menempel
 * di puncak tabel, tabelnya ikut naik bersama halaman, dan headernya tetap
 * hilang. Sticky yang terlihat benar di kode dan tidak melakukan apa pun di
 * layar.
 *
 * Karena itu `maxHeight` dan `<TableHead sticky>` HARUS dipakai bersama; salah
 * satu saja tidak menghasilkan apa-apa. `maxHeight` membatasi pembungkus geser
 * itu sendiri — satu kotak, bukan dua seperti solusi lama — sehingga ia mulai
 * menggulung vertikal dan `top: 0` punya sesuatu untuk ditempeli.
 *
 * ── Warna sel judul lengket, di berkas yang tak boleh memakai hook ─────────
 * Sel judul yang menempel WAJIB berlatar pekat; tanpa itu baris yang lewat di
 * belakangnya terbaca menembus judul kolom. Berkas ini server-safe dan karena
 * itu tidak bisa memanggil `theme.useToken()`, jadi warnanya disalurkan lewat
 * PROPERTI KUSTOM CSS — satu-satunya nilai yang benar-benar DIWARISI dari
 * pembungkus ke `<th>` di dalamnya.
 *
 * Bawaannya `var(--ant-color-bg-container)`, yang sejak #227 teratasi di mana
 * pun: root layout memasang kelas pemikul blok token (`ANTD_CSS_VAR_KEY`) pada
 * `<html>`, jadi tabel di LUAR komponen AntD mana pun tetap mewarisinya.
 *
 * Prop `stickyHeadBackground` tetap ada, dan bukan sisa: kedua matriks izin
 * berdiri di atas permukaan yang bukan `colorBgContainer`, dan sel judul yang
 * menempel harus berlatar sama dengan permukaan di belakangnya — kalau tidak,
 * baris yang lewat terbaca menembus judul kolom.
 */

/**
 * Aturan yang tidak punya bentuk sebaris — lihat catatan di kepala berkas.
 *
 * Hover DIBATASI ke baris di dalam `<tbody>`: baris judul dan baris kaki tidak
 * boleh menyala saat kursor lewat, karena keduanya bukan data yang bisa
 * ditunjuk. Pengecualiannya baris "tidak ada data", yang berada di dalam
 * `<tbody>` tetapi juga bukan data — ia menandai dirinya `data-hover="off"`.
 *
 * Tautan sortir (`data-slot="table-sort"`, issue #265) ikut di sini karena
 * alasan yang sama: `:hover` tidak punya bentuk sebaris. Judul kolom berwarna
 * `colorTextSecondary` supaya ia tidak bersaing dengan angka di bawahnya; saat
 * kursor lewat ia menguat ke warna teks penuh — cukup untuk menyatakan "ini
 * bisa diklik" tanpa mengubah judul menjadi tautan biru di setiap tabel.
 */
const TABLE_RULES = `
[data-slot="table-body"] > [data-slot="table-row"]:hover{background:var(--ant-color-fill-quaternary)}
[data-slot="table-body"] > [data-slot="table-row"][data-hover="off"]:hover{background:transparent}
[data-slot="table-body"] > [data-slot="table-row"]:last-child{border-bottom-width:0}
[data-slot="table-footer"] > [data-slot="table-row"]{border-bottom-width:0}
[data-slot="table-sort"]{transition:color 150ms}
[data-slot="table-sort"]:hover{color:var(--ant-color-text)}
`;

/** Pembungkus geser: tabel lebar menggulung DI DALAM kotaknya (MASTER.md). */
const CONTAINER_STYLE: React.CSSProperties = {
  position: "relative",
  width: "100%",
  overflowX: "auto",
};

const TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  captionSide: "bottom",
  fontSize: "var(--ant-font-size)",
};

/**
 * Kisi tabel memakai `colorBorderSecondary`, bukan `colorBorder` — token yang
 * sama yang dipakai `Table` AntD sendiri (`Table.borderColor`), sehingga kedua
 * perender menggambar kisi yang identik. Kontrasnya diputuskan di issue #208.
 */
const ROW_BORDER = "1px solid var(--ant-color-border-secondary)";

/**
 * Sel judul kolom. Tingginya 44px — target sentuh MASTER.md, sekaligus yang
 * membuat baris judul jelas lebih tinggi dari baris isi (12+12). Warnanya
 * sekunder: judul kolom menamai angka di bawahnya dan tidak boleh bersaing
 * dengannya.
 */
const HEAD_STYLE: React.CSSProperties = {
  height: 44,
  paddingInline: "var(--ant-padding-lg)",
  textAlign: "left",
  verticalAlign: "middle",
  fontWeight: 500,
  whiteSpace: "nowrap",
  color: "var(--ant-color-text-secondary)",
};

/** Sel isi: 24px mendatar (sesumbu dengan judul), 12px vertikal. */
const CELL_STYLE: React.CSSProperties = {
  paddingInline: "var(--ant-padding-lg)",
  paddingBlock: "var(--ant-padding-sm)",
  verticalAlign: "middle",
};

/**
 * Properti kustom yang menyalurkan warna permukaan dari pembungkus `Table` ke
 * setiap `<TableHead sticky>` di bawahnya. Bukan variabel global: nilainya
 * dipasang per tabel, sehingga dua tabel di satu halaman bisa berdiri di atas
 * permukaan yang berbeda.
 */
const STICKY_HEAD_BG = "--sai-table-head-bg";
const STICKY_HEAD_LINE = "--sai-table-head-line";

/**
 * Gaya sel judul yang menempel. `boxShadow` (bukan `border-bottom`) karena
 * batas milik BARIS judul menggulung bersama tabelnya — yang menempel hanyalah
 * selnya — sehingga garis pemisah judul–isi akan hilang persis saat ia paling
 * dibutuhkan.
 */
const STICKY_HEAD_STYLE: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: `var(${STICKY_HEAD_BG}, var(--ant-color-bg-container))`,
  boxShadow: `inset 0 -1px 0 var(${STICKY_HEAD_LINE}, var(--ant-color-border-secondary))`,
};

interface TableProps extends React.ComponentProps<"table"> {
  /**
   * Tinggi maksimum KOTAK GULUNG. Tanpa ini pembungkus geser setinggi isinya
   * dan tidak pernah menggulung vertikal — lihat catatan header lengket di
   * kepala berkas. Pakai satuan relatif (`70vh`): yang menentukan berapa banyak
   * baris yang muat adalah tinggi LAYAR, dan angka piksel tetap akan memotong
   * tabel di layar besar sekaligus melewati batas layar kecil.
   */
  maxHeight?: number | string;
  /** Gaya pembungkus geser — tepi, sudut, latar kotaknya. */
  containerStyle?: React.CSSProperties;
  /** Lihat catatan "Warna sel judul lengket" di kepala berkas. */
  stickyHeadBackground?: string;
  /** Warna garis pemisah judul–isi saat judulnya menempel. */
  stickyHeadBorderColor?: string;
}

function Table({
  maxHeight,
  containerStyle,
  stickyHeadBackground,
  stickyHeadBorderColor,
  style,
  ...props
}: TableProps) {
  /*
   * Dirakit bersyarat, bukan disebar tanpa syarat: sebagian besar pemanggil
   * merender `Table` tanpa satu pun prop di atas, dan gaya pembungkus yang
   * selalu memuat kunci tambahan mengubah markup mereka tanpa alasan.
   */
  const wrapper: React.CSSProperties = { ...CONTAINER_STYLE, ...containerStyle };
  if (maxHeight !== undefined) wrapper.maxHeight = maxHeight;
  if (stickyHeadBackground !== undefined) {
    (wrapper as Record<string, string>)[STICKY_HEAD_BG] = stickyHeadBackground;
  }
  if (stickyHeadBorderColor !== undefined) {
    (wrapper as Record<string, string>)[STICKY_HEAD_LINE] = stickyHeadBorderColor;
  }

  return (
    <div data-slot="table-container" style={wrapper}>
      <style href="sai-table" precedence="default">
        {TABLE_RULES}
      </style>
      <table data-slot="table" style={{ ...TABLE_STYLE, ...style }} {...props} />
    </div>
  );
}

function TableHeader(props: React.ComponentProps<"thead">) {
  // Garis pemisah judul–isi datang dari `TableRow` di dalamnya, bukan dari
  // sini: satu tempat yang menggambar garis baris, bukan dua yang bisa
  // menyimpang.
  return <thead data-slot="table-header" {...props} />;
}

function TableBody(props: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" {...props} />;
}

function TableFooter({ style, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      /*
       * Garis atas DUA piksel: kaki tabel memisahkan total dari data, dan garis
       * setebal kisi biasa membuatnya terbaca sebagai baris data terakhir.
       * Latarnya sengaja tanpa isian — angka totalnya sudah dibedakan tebal
       * huruf, dan bidang berwarna di dasar setiap tabel membuat halaman
       * laporan terlihat berpita.
       */
      style={{
        borderTop: `2px solid var(--ant-color-border-secondary)`,
        fontWeight: 500,
        ...style,
      }}
      {...props}
    />
  );
}

function TableRow({ style, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      style={{
        borderBottom: ROW_BORDER,
        // Hover-nya sendiri hidup di `TABLE_RULES`; yang bisa ditulis sebaris
        // hanya transisinya. `prefers-reduced-motion` ditegakkan sekali untuk
        // semua di `globals.css`, jadi tidak ada penawar per komponen.
        transition: "background-color 150ms",
        ...style,
      }}
      {...props}
    />
  );
}

function TableHead({
  sticky,
  style,
  ...props
}: React.ComponentProps<"th"> & {
  /**
   * Sel judul menempel di puncak kotak gulung. Hanya berguna bersama
   * `<Table maxHeight>` — sendirian ia tidak melakukan apa pun; alasannya di
   * kepala berkas.
   */
  sticky?: boolean;
}) {
  return (
    <th
      data-slot="table-head"
      // Gaya pemanggil MENIMPA gaya lengketnya: kolom masih boleh mengatur
      // lebar & perataannya sendiri tanpa kehilangan sifat menempelnya.
      style={
        sticky
          ? { ...HEAD_STYLE, ...STICKY_HEAD_STYLE, ...style }
          : { ...HEAD_STYLE, ...style }
      }
      {...props}
    />
  );
}

/**
 * Sel isi tabel. Dengan `scope` ia berganti tag menjadi `<th scope="…">` —
 * SATU-SATUNYA perbedaannya adalah tag dan atributnya; gayanya tetap gaya sel
 * ISI (issue #233).
 *
 * ── Kenapa berganti tag di sini, bukan memakai `TableHead` ────────────────
 * Baris seksi ("ASET LANCAR") dan baris subtotal di TENGAH `<tbody>` bukan sel
 * data: yang pertama menamai kelompok baris di bawahnya, yang kedua menamai
 * angka di sebelahnya. Sebagai `<td>` biasa pembaca layar membacakannya sebagai
 * sel tanpa konteks, dan tak satu pun angka di bawahnya terhubung ke judulnya.
 * Yang benar `<th scope="colgroup">` / `<th scope="row">`.
 *
 * `TableHead` tidak bisa dipakai untuk itu: ia sel judul KOLOM, dan dari lima
 * deklarasinya EMPAT salah di tengah badan tabel — `height: 44` (sedangkan
 * baris isi 12px+12px), tanpa `paddingBlock` (jadi tingginya HANYA berasal dari
 * `height`), `colorTextSecondary` (judul seksi jadi LEBIH pudar dari akun di
 * bawahnya — hierarki terbalik), dan `whiteSpace: nowrap` (label "Total
 * Liabilitas + Ekuitas" tak boleh membungkus, memaksa tabel menggeser mendatar
 * di 375px). Memakainya berarti membatalkan empat dari lima di sisi pemanggil —
 * gaya bersama yang seluruhnya ditimpa bukan gaya bersama.
 *
 * ── Dua penawar bawaan UA ──────────────────────────────────────────────────
 * Reset di `globals.css` TIDAK menyentuh `<th>` — sama seperti preflight
 * Tailwind yang digantikannya — jadi bawaan peramban
 * `th { font-weight: bold; text-align: center }` tetap berlaku dan sebuah
 * `<th>` akan tampil TEBAL dan DI TENGAH di tengah badan tabel. Keduanya
 * dinetralkan ke `inherit` supaya sel bertag `th` tampil persis sama dengan
 * `<td>` yang digantikannya: perataan datang dari kolomnya, tebal huruf dari
 * BARISnya — aturan yang sama dengan sel lain. Gaya pemanggil ditulis
 * SESUDAHNYA, jadi ia tetap bisa menimpa keduanya.
 */
function TableCell({
  scope,
  style,
  ...props
}: React.ComponentProps<"td"> & { scope?: "row" | "col" | "rowgroup" | "colgroup" }) {
  if (scope === undefined) {
    return (
      <td data-slot="table-cell" style={{ ...CELL_STYLE, ...style }} {...props} />
    );
  }

  return (
    <th
      data-slot="table-cell"
      scope={scope}
      style={{
        ...CELL_STYLE,
        fontWeight: "inherit",
        textAlign: "inherit",
        ...style,
      }}
      {...props}
    />
  );
}

function TableCaption({ style, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      style={{
        marginTop: "var(--ant-margin)",
        fontSize: "var(--ant-font-size)",
        color: "var(--ant-color-text-secondary)",
        ...style,
      }}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
