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
 * ── Warna sel judul, di berkas yang tak boleh memakai hook ─────────────────
 * Sel judul yang menempel WAJIB berlatar pekat; tanpa itu baris yang lewat di
 * belakangnya terbaca menembus judul kolom. Berkas ini server-safe dan karena
 * itu tidak bisa memanggil `theme.useToken()`, jadi warnanya disalurkan lewat
 * PROPERTI KUSTOM CSS — satu-satunya nilai yang benar-benar DIWARISI dari
 * pembungkus ke `<th>` di dalamnya.
 *
 * **Sejak #266 latar itu dipasang pada SETIAP sel judul, bukan hanya yang
 * menempel**, dan bawaannya berubah dari `var(--ant-color-bg-container)`
 * (putih) menjadi `var(--ant-color-table-head-bg)` — nada kepala tabel. Kedua
 * hal itu satu keputusan: kalau kepala diberi nada tanpa menyesuaikan bawaan
 * jalur lengketnya, kepalanya bernada saat diam dan PUTIH saat menempel, dan
 * yang melihatnya hanya orang yang sedang menggulung matriks izin. Keduanya
 * teratasi di mana pun sejak #227: root layout memasang kelas pemikul blok
 * token (`ANTD_CSS_VAR_KEY`) pada `<html>`, jadi tabel di LUAR komponen AntD
 * mana pun tetap mewarisinya.
 *
 * Prop `stickyHeadBackground` tetap ada, dan bukan sisa: sebuah tabel bisa
 * berdiri di atas permukaan yang bukan permukaan kartu, dan sel judulnya harus
 * berlatar yang cocok dengan permukaan itu — kalau tidak, baris yang lewat
 * terbaca menembus judul kolom.
 */

/**
 * ── BARIS MENJADI KARTU DI PONSEL (issue #471) ─────────────────────────────
 *
 * Sebuah tabel bermata sepuluh kolom yang digulir menyamping di layar 390px
 * bukan "bisa dipakai"; ia hanya "tidak rusak". Di bawah ambang, setiap baris
 * dilipat menjadi satu kartu bertumpuk dengan nama medan di kiri dan nilainya
 * di kanan.
 *
 * OPT-IN, lewat `<Table cards>`. Tabel neraca dan buku besar TIDAK boleh ikut:
 * di sana yang dibaca justru KOLOMnya — angka yang berbaris tegak lurus supaya
 * bisa dijumlah dengan mata. Melipatnya jadi kartu menghancurkan justru hal
 * yang membuatnya laporan.
 *
 * ── Harga yang dibayar, dan penawarnya ─────────────────────────────────────
 * `display:block` di atas elemen tabel MENGHAPUS semantik tabel dari pohon
 * aksesibilitas: pembaca layar berhenti mengumumkan "kolom Jatuh Tempo" saat
 * fokus pindah. Itu bukan efek samping yang bisa didiamkan — itu sebabnya
 * setiap sel WAJIB membawa `label`, yang dicetak `::before` sebagai teks NYATA
 * di dalam sel. Namanya tidak hilang; ia berpindah dari judul kolom ke dalam
 * selnya sendiri, dan justru di layar sempit itulah bentuk yang lebih berguna.
 *
 * Judul kolomnya sendiri disembunyikan dengan `clip-path`, bukan
 * `display:none` — jarak yang sama, tetapi ia tetap ada bagi mesin pencari dan
 * bagi peramban yang tidak menerapkan `@media` ini.
 *
 * Ambangnya `40em` (640px): telepon terbesar di orientasi tegak masih di
 * bawahnya, tablet terkecil di atasnya. Satuan `em`, bukan `px`, supaya
 * pengguna yang memperbesar huruf bawaan peramban ikut mendapat bentuk kartu.
 */
const CARD_RULES = `
@media (max-width:40em){
[data-slot="table-container"][data-cards="on"]{overflow-x:visible}
[data-cards="on"] [data-slot="table-header"]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
[data-cards="on"] [data-slot="table"],[data-cards="on"] [data-slot="table-body"],[data-cards="on"] [data-slot="table-footer"],[data-cards="on"] [data-slot="table-row"],[data-cards="on"] [data-slot="table-cell"]{display:block;width:auto}
[data-cards="on"] [data-slot="table-body"] > [data-slot="table-row"]{border:var(--ant-line-width) solid var(--ant-color-border-secondary);border-radius:var(--ant-border-radius-lg);margin-block-end:var(--ant-margin-xs);padding:var(--ant-padding-sm)}
[data-cards="on"] [data-slot="table-body"] > [data-slot="table-row"]:last-child{margin-block-end:0;border-bottom-width:var(--ant-line-width)}
[data-cards="on"] [data-slot="table-cell"]{display:flex;justify-content:space-between;align-items:baseline;gap:var(--ant-margin-sm);padding-inline:0;padding-block:var(--ant-padding-xxs);text-align:end}
[data-cards="on"] [data-slot="table-cell"][data-label]::before{content:attr(data-label);color:var(--ant-color-text-secondary);font-size:var(--ant-font-size-sm);text-align:start;flex:0 1 auto}
[data-cards="on"] [data-slot="table-cell"][data-card="hide"]{display:none}
[data-cards="on"] [data-slot="table-cell"][data-card="title"]{font-weight:600;padding-block-end:var(--ant-padding-xs)}
[data-cards="on"] [data-slot="table-cell"][data-card="title"]::before{content:none}
}
`;

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
${CARD_RULES}`;

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
 * Properti kustom yang menyalurkan warna permukaan dari pembungkus `Table` ke
 * setiap `<TableHead>` di bawahnya. Bukan variabel global: nilainya dipasang
 * per tabel, sehingga dua tabel di satu halaman bisa berdiri di atas permukaan
 * yang berbeda.
 *
 * Sejak #266 ia menyalurkan latar SETIAP sel judul, bukan hanya yang menempel —
 * lihat catatan di `HEAD_BG` di bawah.
 */
const STICKY_HEAD_BG = "--sai-table-head-bg";
const STICKY_HEAD_LINE = "--sai-table-head-line";

/**
 * Sel judul kolom. Tingginya 44px — target sentuh MASTER.md, sekaligus yang
 * membuat baris judul jelas lebih tinggi dari baris isi (12+12). Warnanya
 * sekunder: judul kolom menamai angka di bawahnya dan tidak boleh bersaing
 * dengannya.
 *
 * ── Latarnya BERNADA, dan itu jawaban #266 (jalan B) ──────────────────────
 * Latar halaman (`#f5f5f5`) dan kartu (`#ffffff`) hanya berbeda ~2%, jadi
 * kartu berhenti terbaca sebagai kartu dan yang memisahkan wilayah tinggal
 * tepinya. #269 membuktikan lapisan token buntu: setiap geseran permukaan
 * menjatuhkan ambang yang dijaga #208/#186. Yang tersisa dan berongkos kontras
 * NOL adalah nada di dalam bidang yang sudah ada — dan itu pekerjaan perender,
 * yaitu berkas ini.
 *
 * `--ant-color-table-head-bg` adalah alias GLOBAL, bukan token `Table`: berkas
 * ini server-safe dan sebuah halaman laporan bisa tidak merender satu pun
 * komponen AntD, sehingga variabel token komponen tidak akan ada di dokumen.
 * `AntdProvider` mengoper nilai yang sama ke `components.Table.headerBg`,
 * sehingga `DataTable` dan `StaticTable` menggambar kepala yang identik.
 * Nilai, pengukuran, dan alasan arah nadanya per tema ada di
 * `lib/theme/antd-tokens.ts`, bagian "Jenjang di perender".
 *
 * Latarnya ditulis lewat `--sai-table-head-bg` — properti kustom yang SAMA
 * yang dipakai sel judul lengket. Itu bukan kerapian: kalau kepala bernada
 * hanya dipasang di sini sementara jalur lengketnya jatuh ke bawaan lain,
 * kepalanya akan BERGANTI WARNA saat menempel (#229), dan hanya terlihat oleh
 * orang yang menggulung matriks izin.
 */
const HEAD_BG = `var(${STICKY_HEAD_BG}, var(--ant-color-table-head-bg))`;

const HEAD_STYLE: React.CSSProperties = {
  height: 44,
  paddingInline: "var(--ant-padding-lg)",
  textAlign: "left",
  verticalAlign: "middle",
  fontWeight: 500,
  whiteSpace: "nowrap",
  color: "var(--ant-color-text-secondary)",
  background: HEAD_BG,
};

/** Sel isi: 24px mendatar (sesumbu dengan judul), 12px vertikal. */
const CELL_STYLE: React.CSSProperties = {
  paddingInline: "var(--ant-padding-lg)",
  paddingBlock: "var(--ant-padding-sm)",
  verticalAlign: "middle",
};

/**
 * Gaya sel judul yang menempel. `boxShadow` (bukan `border-bottom`) karena
 * batas milik BARIS judul menggulung bersama tabelnya — yang menempel hanyalah
 * selnya — sehingga garis pemisah judul–isi akan hilang persis saat ia paling
 * dibutuhkan.
 *
 * Latarnya TIDAK disebut lagi di sini (#266): ia sudah datang dari `HEAD_STYLE`,
 * lewat properti kustom yang sama. Dua deklarasi latar untuk satu sel adalah
 * persis cara kepala tabel berganti warna saat menempel.
 */
const STICKY_HEAD_STYLE: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
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
  /**
   * Di bawah 40em, lipat tiap baris menjadi kartu — lihat §CARD_RULES.
   *
   * Menyalakannya menuntut setiap `TableCell` membawa `label`; tanpa itu
   * nilainya berdiri di kartu tanpa nama. Dijaga
   * `tests/mobile-card-tables.test.ts`.
   */
  cards?: boolean;
}

function Table({
  cards,
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
    <div data-slot="table-container" data-cards={cards ? "on" : undefined} style={wrapper}>
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
  label,
  card,
  style,
  ...props
}: React.ComponentProps<"td"> & {
  scope?: "row" | "col" | "rowgroup" | "colgroup";
  /**
   * Nama medan yang dicetak di kiri nilainya saat barisnya menjadi kartu
   * (`<Table cards>`). Tidak berpengaruh apa pun di atas 40em — judul kolomnya
   * yang berbicara di sana.
   */
  label?: string;
  /**
   * `"title"` — baris pertama kartu, dicetak tebal tanpa label (nama pelanggan
   * atau nomor dokumen tidak butuh dinamai; ia SUBJEK kartunya).
   * `"hide"` — sembunyikan di kartu. Untuk kolom yang berguna saat sepuluh
   * kolom berbaris tetapi hanya menambah baris di layar sempit.
   */
  card?: "title" | "hide";
}) {
  if (scope === undefined) {
    return (
      <td
        data-slot="table-cell"
        data-label={label}
        data-card={card}
        style={{ ...CELL_STYLE, ...style }}
        {...props}
      />
    );
  }

  return (
    <th
      data-slot="table-cell"
      data-label={label}
      data-card={card}
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
