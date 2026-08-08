/**
 * StaticTable — varian TABEL YANG DIRENDER DI SERVER (issue #189).
 *
 * **Sengaja TANPA `"use client"`, dan sengaja BUKAN AntD `Table`.**
 *
 * ── Kenapa varian ini ada ──────────────────────────────────────────────────
 * Issue #189 berdiri di depan dua jalan. Yang pertama: jadikan primitif tabel
 * satu-satunya, di atas AntD `Table`, dan terima bahwa ia komponen client.
 * Yang kedua: pecah primitifnya — statis di server untuk laporan yang hanya
 * MENAMPILKAN, interaktif di client untuk yang memang butuh sortir/filter/
 * paginasi seketika. Berkas ini adalah separuh pertama dari jalan kedua.
 *
 * Alasannya terukur, bukan selera (angkanya di badan issue #189). AntD `Table`
 * memakai hook, jadi ia wajib client; dan begitu tabelnya client, seluruh
 * `dataSource` sebuah laporan ikut disalin ke payload RSC sebagai JSON DI ATAS
 * HTML yang sudah dirender — dua salinan buku besar yang sama — lalu peramban
 * masih harus mengunduh, mem-parse, dan MENGHIDRASI rc-table di atasnya.
 * Untuk neraca saldo 2.000 akun yang tidak punya satu pun kendali interaktif,
 * seluruh biaya itu dibayar untuk mendapatkan tampilan yang identik.
 *
 * 46 dari 66 pemakai primitif tabel di app ini adalah server component. Berkas
 * ini yang membuat mereka tetap begitu.
 *
 * ── Yang TETAP dibawa primitif ini ─────────────────────────────────────────
 * Semua yang tak terlihat, yang justru jadi alasan MASTER.md mewajibkan tabel
 * lewat primitif:
 *  • pembungkus geser — tabel lebar menggulung DI DALAM kotaknya, bukan
 *    membuat seluruh halaman menggulung mendatar di 375px (lewat `Table`);
 *  • kolom nominal rata kanan + `tabular-nums` + id-ID (lewat `moneyColumn`);
 *  • baris total sebagai `<tfoot>` semantik;
 *  • keadaan kosong yang BERMAKNA — `EmptyState` dengan kalimat dan aksi,
 *    bukan "No Data" bawaan.
 *
 * ── Rencana pensiun ────────────────────────────────────────────────────────
 * Yang pensiun BUKAN berkas ini, melainkan pemakaian LANGSUNG primitif JSX
 * (`<TableRow><TableCell/>`) di halaman: fase C memindahkan 66 berkas itu ke
 * `StaticTable` atau `DataTable`, dan sesudahnya `table.tsx` tinggal menjadi
 * lapisan gaya internal. Itu sudah terjadi; gaya Tailwind di dalamnya diganti
 * gaya sebaris dari token AntD di #203 — lihat catatan di `table.tsx`.
 *
 * ── Empat prop yang membuka konversi yang tersisa (issue #229) ─────────────
 * Keempatnya lahir dari tabel NYATA yang tidak bisa pindah perender tanpanya,
 * dan ketiganya sengaja dibentuk supaya `StaticTable` tetap SERVER:
 *
 *  • `rowStyle` — gaya per BARIS. Sebelumnya kedua perender hanya meneruskan
 *    gaya per KOLOM, sehingga "Pengajuan Saya" (/approvals) — yang menandai
 *    keputusan belum dibaca lewat LATAR BARIS — tidak bisa pindah tanpa
 *    kehilangan satu-satunya penanda "ini keputusan baru".
 *  • `sticky` + `maxHeight` — header yang tetap terbaca saat matriks digulir.
 *  • `size` — kerapatan setara `DataTable`, supaya perender dipilih menurut
 *    kebutuhan INTERAKTIVITAS (aturan #189) dan bukan menurut kerapatan.
 *  • `summary` BERTINGKAT — kaki berbaris banyak; tabel barang faktur punya
 *    empat (DPP/PPN/Total/dasar IDR) dan tabel barang kontrak dua.
 *
 * Yang SENGAJA tidak ada: `onRow` bergaya AntD, yaitu sekantong atribut DOM
 * termasuk penangan kejadian. Sebuah `onClick` yang dikirim dari halaman server
 * tidak akan mengeluh di `tsc` maupun di ESLint; ia gagal saat dirender, di
 * halaman yang kebetulan dibuka. `rowStyle` adalah himpunan bagian yang tetap
 * benar di KEDUA sisi batas, dan itu yang membuatnya boleh ada di sini.
 *
 * ── Baris seksi & subtotal DI DALAM badan tabel (issue #233) ───────────────
 * `colSpan` bertingkat dari #229 hanya hidup di `<tfoot>` — satu kaki di ujung
 * tabel. Empat laporan keuangan justru butuh baris ber-`colSpan` BERSELANG-
 * SELING dengan baris akun ("ASET LANCAR" · akun · "Total Aset" · "LIABILITAS"
 * · …). `rowCells` membukanya, dan sengaja memakai ULANG `SummaryCell`,
 * penghitung `skip`, serta `mergedCell()` yang sudah ditulis dan diuji untuk
 * kaki: badan dan kaki menggambar `colSpan` lewat SATU reduksi (`spannedCells`),
 * jadi tidak ada dua perilaku yang bisa menyimpang diam-diam.
 *
 * `rowCells` fungsi MURNI atas barisnya, persis seperti `rowStyle` — berkas ini
 * tetap server, tetap tanpa JavaScript.
 *
 * ── Sortir kolom, dan kenapa ia TIDAK membuat berkas ini client (issue #265) ─
 * Sampai #265 berkas ini MENGABAIKAN `sorter` sepenuhnya, padahal `moneyColumn`
 * dan `qtyColumn` menyalakannya secara bawaan: 30 dari 62 tabel membawa prop
 * yang tidak melakukan apa pun, dan kolom uang yang tampak bisa diurutkan
 * menurut kode ternyata tidak bisa diklik di layar.
 *
 * Perbaikannya BUKAN memindahkan tabelnya ke `DataTable` — rc-table terukur
 * +80 KB gzip per rute (#199) dan memaksa halamannya jadi client, yang untuk 62
 * tabel membatalkan taruhan yang dimenangkan seluruh epik #206. Sortirnya
 * dijalankan di SERVER, dikendalikan URL: judul kolom menjadi `<Link>` ke
 * `?sort=…&dir=…`, halaman dirender ulang, dan `orderBy` Prisma yang mengurutkan
 * SELURUH data — bukan hanya baris yang sedang tampil. Aturan pembangunan URL,
 * daftar putihnya, dan keputusan penempatan `NULL` ada di `lib/table-sort.ts`.
 *
 * Yang menyeberang hanyalah `Link` — daun client yang memang sudah dipakai 114
 * tautan lain, dan yang memberi tautan sortir cakupan tenant lewat `scopedHref`
 * tanpa halaman ini perlu tahu slug perusahaannya. Berkas ini tetap SERVER dan
 * `AMBANG_KLIEN` tidak bergerak.
 *
 * Satu hal yang sengaja BERISIK: kolom yang menyatakan `sorter` tanpa prop
 * `sort` (atau dengan kunci yang tidak ada di `sort.keys`) MELEMPAR. Diam
 * adalah persis keadaan yang issue ini tutup — sebuah kendali yang tidak bisa
 * merakit URL-nya lebih baik gagal keras di satu halaman daripada tampil
 * seperti bisa diklik di 62 halaman.
 */

import { CaretDownOutlined, CaretUpOutlined, SwapOutlined } from "@ant-design/icons";

import { Link } from "@/components/ui/app-link";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { nextSort, sortHref, type ActiveSort, type SortParams } from "@/lib/table-sort";

/**
 * Sel baris kaki. Bentuk polos = isi sel; bentuk objek dipakai ketika satu
 * label harus membentang beberapa kolom ("Total (USD)" di atas empat kolom
 * barang). Kolom yang tertutup `colSpan` dilewati, jadi jumlah `<td>` tetap
 * sama dengan jumlah kolom yang benar-benar tampil.
 */
export type SummaryCell =
  | React.ReactNode
  | {
      content: React.ReactNode;
      /**
       * Berapa kolom yang ditelan sel ini. Bawaannya 1 — sebuah sel boleh
       * memakai bentuk objek hanya untuk `scope`, tanpa menggabung apa pun
       * (label subtotal di tabel dua kolom adalah judul BARIS, bukan sel
       * gabungan).
       */
      colSpan?: number;
      /**
       * Perataan sel gabungan. Tanpa ini ia mewarisi perataan kolom PERTAMA
       * yang ditelannya — dan label "Total (USD)" yang membentang di atas empat
       * kolom barang hampir selalu ingin rata KANAN, menempel pada angkanya,
       * bukan rata kiri seperti kolom "Barang".
       */
      align?: "left" | "right" | "center";
      /**
       * Sel ini MENAMAI sesuatu, bukan berisi data — dirender `<th scope="…">`
       * bergaya sel isi (issue #233; alasannya panjang di `table.tsx`).
       *
       *  • `colgroup` — judul kelompok baris di bawahnya ("ASET LANCAR");
       *  • `row`      — judul baris, mis. label subtotal di sebelah angkanya.
       *
       * Tanpa ini baris seksi hanyalah `<td>` ber-`colSpan`: pembaca layar
       * membacakan "ASET LANCAR" sebagai sel data tanpa konteks di tengah
       * tabel, dan tak satu pun angka di bawahnya terhubung kepadanya.
       */
      scope?: "row" | "colgroup";
    };

/** Satu baris kaki, dipetakan per KUNCI kolom — bentuk yang sama dengan `summary` tunggal. */
export interface SummaryRow {
  cells: Record<string, SummaryCell>;
  /** Gaya baris — mis. garis atas tebal untuk baris Total, atau berat huruf biasa. */
  style?: React.CSSProperties;
}

/**
 * Kerapatan sel. `middle` (bawaan) SENGAJA bukan angka AntD melainkan padding
 * primitifnya sendiri (24px mendatar, 12px vertikal): 18 tabel memakainya, dan
 * sebuah prop kerapatan tidak boleh mengubah rupa tabel yang tidak memintanya.
 *
 * `small` memakai `cellPaddingBlockSM`/`cellPaddingInlineSM` AntD apa adanya.
 * `large` hanya menambah sumbu VERTIKAL (`cellPaddingBlock` 16): sumbu mendatar
 * primitif sudah 24, lebih longgar dari 16 milik AntD, jadi memakai angka AntD
 * di sana justru membuat "large" lebih SEMPIT daripada "middle".
 */
const DENSITY: Record<string, React.CSSProperties | undefined> = {
  small: { paddingBlock: 8, paddingInline: 8 },
  middle: undefined,
  large: { paddingBlock: 16 },
};

/**
 * Konteks sortir — satu-satunya hal yang tidak bisa disimpulkan sendiri oleh
 * sebuah tabel yang dirender di server.
 *
 * Bentuknya sengaja MENIRU `Pagination` (`basePath` + `searchParams`): halaman
 * daftar di app ini sudah menuliskan keduanya untuk paginasi, jadi memasang
 * sortir tidak memperkenalkan bentuk kedua untuk hal yang sama.
 */
export interface StaticTableSort {
  /** Jalur daftar tanpa query, mis. `"/documents"` — sama seperti `Pagination.basePath`. */
  basePath: string;
  /**
   * `searchParams` halaman APA ADANYA. Semuanya dipertahankan di tautan sortir
   * (saringan, pencarian, halaman); hanya `sort`/`dir` yang diganti.
   */
  params?: SortParams;
  /**
   * Kunci kolom yang benar-benar punya `orderBy` di kueri — biasanya
   * `sortableKeys(SPEC)` dari `lib/table-sort.ts`.
   *
   * Ada supaya kedua sisi terbukti sejalan: sebuah kolom yang menyatakan
   * `sorter` tetapi tidak ada di sini akan MELEMPAR, alih-alih memasang kendali
   * yang tautannya diabaikan `parseSort` dan tidak mengurutkan apa pun.
   */
  keys: readonly string[];
  /** Urutan yang sedang berlaku — hasil `parseSort`. */
  active?: ActiveSort | null;
}

/** Ikon indikator; ukurannya `fontSize`, tidak pernah prop `size` (MASTER.md). */
const SORT_ICON_SIZE = 12;

/**
 * Kendali urut pada judul kolom.
 *
 * Sebuah TAUTAN, bukan tombol: ia menuju ke sebuah alamat, jadi klik tengah,
 * Ctrl-klik, dan "salin alamat tautan" bekerja seperti seharusnya, dan
 * kendalinya sudah benar sebelum satu baris JavaScript pun dijalankan. Pola
 * WAI-ARIA untuk tabel yang bisa diurutkan tidak minta label tambahan: keadaan
 * urutnya diumumkan `aria-sort` pada `<th>`-nya, jadi teks tautannya tetap
 * NAMA KOLOM saja. Ikonnya karena itu `aria-hidden` — ia penanda kedua untuk
 * mata, bukan sumber informasi.
 */
function SortControl({
  columnKey,
  title,
  sort,
}: {
  columnKey: string;
  title: React.ReactNode;
  sort: StaticTableSort;
}) {
  const active = sort.active ?? null;
  const dir = active !== null && active.key === columnKey ? active.dir : null;
  const icon =
    dir === "asc" ? (
      <CaretUpOutlined aria-hidden="true" style={{ fontSize: SORT_ICON_SIZE }} />
    ) : dir === "desc" ? (
      <CaretDownOutlined aria-hidden="true" style={{ fontSize: SORT_ICON_SIZE }} />
    ) : (
      /*
       * Berputar 90° = dua panah atas-bawah: "kolom ini bisa diurutkan, dan
       * sekarang belum". Warnanya lebih pudar dari yang aktif, tapi bedanya
       * bukan hanya warna — bentuk ikonnya sendiri berbeda.
       *
       * Warnanya `colorBorder`, bukan `colorTextQuaternary` (issue #266).
       * Kuartener adalah α 0,25 dan terukur **1,83:1** di atas putih — di bawah
       * ambang 3:1 untuk grafis non-teks sejak #265, jadi satu-satunya isyarat
       * "kolom ini bisa diurutkan" praktis tak terlihat. Nada kepala baru
       * membuatnya sedikit lebih buruk lagi (1,82:1), dan sebuah penanda yang
       * kini duduk di atas permukaan baru harus diukur, bukan diwarisi.
       * `colorBorder` (#208) adalah tinta yang memang diturunkan untuk peran
       * ini — batas & grafis non-teks pada 3:1 — dan terukur di atas nada
       * kepala: **3,62:1 terang · 3,89:1 gelap**. Ia tetap jelas lebih pudar
       * dari judul kolomnya (6,76:1), jadi hierarkinya tidak berbalik.
       */
      <SwapOutlined
        aria-hidden="true"
        rotate={90}
        style={{ fontSize: SORT_ICON_SIZE, color: "var(--ant-color-border)" }}
      />
    );

  return (
    <Link
      data-slot="table-sort"
      href={sortHref(sort.basePath, sort.params, nextSort(columnKey, active))}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--ant-margin-xxs)",
        color: "inherit",
        cursor: "pointer",
      }}
    >
      {title}
      {icon}
    </Link>
  );
}

/** Nilai `aria-sort` untuk kolom yang bisa diurutkan. */
function ariaSort(columnKey: string, sort: StaticTableSort): "ascending" | "descending" | "none" {
  const active = sort.active ?? null;
  if (active === null || active.key !== columnKey) return "none";
  return active.dir === "asc" ? "ascending" : "descending";
}

/**
 * `sorter` sebagai sifat, bukan sebagai pembanding: di sini yang berarti hanya
 * "kolom ini menawarkan kendali urut". `false` adalah bawaan pembantu kolom
 * sejak #265, jadi ia harus dibaca sebagai TIDAK.
 */
function declaresSorter(sorter: unknown): boolean {
  return sorter !== undefined && sorter !== false;
}

interface StaticTableProps<T> {
  columns: SaiColumns<T>;
  rows: readonly T[];
  /**
   * Kunci React per baris. Wajib dan bukan indeks: baris yang diurutkan ulang
   * atau disaring di server akan bertukar isi kalau kuncinya posisi.
   *
   * `index` opsional agar tanda tangannya sama persis dengan `DataTable`
   * (dan dengan `GetRowKey` AntD di baliknya).
   */
  rowKey: (row: T, index?: number) => React.Key;
  /**
   * Ditampilkan menggantikan isi tabel ketika tidak ada baris. Wajib
   * `EmptyState` bermakna — satu kalimat dan, bila ada, satu aksi.
   */
  empty?: React.ReactNode;
  /**
   * Baris total, dipetakan per KUNCI kolom. Kolom yang tidak disebut dirender
   * sebagai sel kosong, sehingga baris total tak bisa meleset satu kolom
   * ketika pilihan kolom pengguna mengurangi susunannya.
   *
   * Bentuk LARIK untuk kaki bertingkat (issue #229). Satu `Record` tetap sah
   * dan berarti "satu baris" — 18 pemanggil lama tidak berubah.
   */
  summary?: Record<string, React.ReactNode> | readonly SummaryRow[];
  /** Gaya `<tfoot>` — mis. mengubah tebal garis pemisahnya dari isi tabel. */
  summaryStyle?: React.CSSProperties;
  /**
   * Gaya per BARIS. Dipakai untuk keadaan yang melekat pada barisnya, bukan
   * pada satu selnya — penanda "belum dibaca", baris yang dibatalkan, baris
   * kelompok. Kembalikan `undefined` untuk baris biasa.
   *
   * Sengaja hanya GAYA, bukan `onRow` bergaya AntD — lihat kepala berkas.
   */
  rowStyle?: (row: T, index: number) => React.CSSProperties | undefined;
  /**
   * Baris BUKAN-DATA di dalam badan tabel — seksi & subtotal laporan keuangan
   * (issue #233). Dipetakan per KUNCI kolom, bentuk sel yang sama persis dengan
   * `summary`, jadi `colSpan`/`align`/`scope` berperilaku identik di badan dan
   * di kaki.
   *
   * `undefined` = baris data biasa, jalur lama persis — itu yang membuat 20-an
   * pemanggil yang tidak mengirim prop ini tidak berubah sama sekali.
   *
   * Kolom yang TIDAK disebut tetap digambar dari barisnya (lihat `spannedCells`),
   * sehingga baris subtotal cukup mengganti LABELnya:
   *
   * ```ts
   * rowCells={(row) =>
   *   row.kind === "section"
   *     ? { item: { content: row.label, colSpan: 2, scope: "colgroup" } }
   *     : row.kind === "subtotal"
   *       ? { item: { content: row.label, scope: "row" } }
   *       : undefined
   * }
   * ```
   *
   * Sengaja fungsi MURNI atas barisnya, seperti `rowStyle` — lihat kepala berkas.
   */
  rowCells?: (row: T, index: number) => Record<string, SummaryCell> | undefined;
  /** Kerapatan sel; `middle` = kerapatan primitif. Lihat `DENSITY`. */
  size?: "small" | "middle" | "large";
  /**
   * Judul kolom tetap terbaca saat isinya digulir. WAJIB bersama `maxHeight` —
   * sendirian ia tidak melakukan apa pun (alasannya di kepala `table.tsx`).
   */
  sticky?: boolean;
  /** Tinggi maksimum kotak gulung, mis. `"70vh"`. */
  maxHeight?: number | string;
  /** Gaya elemen `<table>` — pengganti `className` yang dicabut di #203. */
  style?: React.CSSProperties;
  /**
   * Sortir lewat URL (issue #265). WAJIB ada begitu satu kolom pun menyatakan
   * `sorter` — tanpanya perendernya MELEMPAR, bukan diam. Lihat kepala berkas.
   */
  sort?: StaticTableSort;
}

/** Nilai sel: `render` bila ada, kalau tidak nilai `dataIndex` apa adanya. */
function cellContent<T>(
  column: SaiColumns<T>[number],
  row: T,
  index: number
): React.ReactNode {
  const raw = column.dataIndex === undefined ? undefined : row[column.dataIndex];
  if (column.render) return column.render(raw, row, index);
  return raw as React.ReactNode;
}

/**
 * Perataan kolom sebagai GAYA, bukan kelas (issue #203). `left` sengaja
 * menghasilkan `undefined`: itu perataan bawaan sel, dan menuliskannya berarti
 * menimpa `textAlign` yang mungkin datang dari `cellStyle` kolomnya.
 */
function alignStyle(
  align: SaiColumns<unknown>[number]["align"]
): React.CSSProperties | undefined {
  return align === "right"
    ? { textAlign: "right" }
    : align === "center"
      ? { textAlign: "center" }
      : undefined;
}

/**
 * Kaki dinormalkan ke satu bentuk — larik baris — supaya perendernya tidak
 * punya dua jalur yang bisa menyimpang.
 */
function summaryRows(
  summary: Record<string, React.ReactNode> | readonly SummaryRow[] | undefined
): readonly SummaryRow[] {
  if (summary === undefined) return [];
  return Array.isArray(summary) ? summary : [{ cells: summary as Record<string, SummaryCell> }];
}

/**
 * Bentuk objek sel, atau `undefined` bila selnya isi polos.
 *
 * Pembedanya `content` dan bukan lagi `colSpan` (issue #233): sejak `colSpan`
 * boleh dihilangkan, sebuah sel bisa memakai bentuk objek hanya untuk `scope`.
 * `content` aman sebagai pembeda — elemen React adalah objek ber-`$$typeof`/
 * `type`/`props` dan TIDAK pernah punya `content`, dan nilai polos lain (teks,
 * angka, larik) bukan objek biasa. Bentuk lama `{ content, colSpan }` tetap
 * cocok, jadi 18 pemanggil kaki lama tidak berubah sedikit pun.
 */
function mergedCell(cell: SummaryCell | undefined) {
  return cell !== null && typeof cell === "object" && "content" in cell ? cell : undefined;
}

/**
 * SATU reduksi `colSpan` untuk kaki DAN badan (issue #233).
 *
 * `colSpan` menelan kolom di kanannya, jadi kolomnya dilewati dengan penghitung
 * — bukan disaring — supaya sel berikutnya tetap jatuh di kolom yang benar.
 *
 * `fallback` adalah satu-satunya hal yang berbeda antara kedua tempat, dan
 * bedanya bukan selera:
 *
 *  • di `<tfoot>` ia `undefined` — kaki tidak punya baris data, jadi kolom yang
 *    tidak disebut hanya bisa menjadi sel KOSONG. Itu aturan yang sudah ada
 *    sejak kaki satu baris: baris total tak boleh meleset satu kolom ketika
 *    pilihan kolom pengguna mengurangi susunannya.
 *  • di `<tbody>` ia menggambar kolomnya seperti biasa — baris seksi PUNYA
 *    baris data di belakangnya. Itulah yang membuat baris subtotal cukup
 *    menyebut LABELnya saja dan angkanya tetap datang dari `moneyColumn`,
 *    alih-alih halaman menulis ulang aturan uang di sisi `rowCells`. Peta yang
 *    memaksa sel kosong tetap bisa dibuat: sebut kuncinya dengan isi kosong.
 */
function spannedCells<T>(
  columns: SaiColumns<T>,
  cells: Record<string, SummaryCell>,
  density: React.CSSProperties | undefined,
  fallback?: (column: SaiColumns<T>[number]) => React.ReactNode
): React.ReactNode[] {
  return columns.reduce<{ nodes: React.ReactNode[]; skip: number }>(
    (acc, column) => {
      if (acc.skip > 0) return { ...acc, skip: acc.skip - 1 };
      const cell = cells[column.key];
      const merged = mergedCell(cell);
      const span = merged?.colSpan ?? 1;
      const scope = merged?.scope;
      const align = merged?.align ?? column.align;
      const content = merged
        ? merged.content
        : cell === undefined && fallback
          ? fallback(column)
          : (cell as React.ReactNode);
      acc.nodes.push(
        <TableCell
          key={column.key}
          scope={scope}
          colSpan={span === 1 ? undefined : span}
          /*
           * Sel bertag `th` menyebut perataannya EKSPLISIT, termasuk saat
           * `align` tidak diberikan: penawar bawaan UA di `table.tsx`
           * (`textAlign: "inherit"`) berdiri di gaya yang sama, jadi tanpa
           * penyebutan itu sel judul baris akan mewarisi perataan barisnya
           * alih-alih memakai perataan kolomnya.
           */
          style={
            scope
              ? { ...density, textAlign: align ?? "left", ...column.cellStyle }
              : { ...density, ...alignStyle(align), ...column.cellStyle }
          }
        >
          {content}
        </TableCell>
      );
      return { nodes: acc.nodes, skip: span - 1 };
    },
    { nodes: [], skip: 0 }
  ).nodes;
}

export function StaticTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  summary,
  summaryStyle,
  rowStyle,
  rowCells,
  size = "middle",
  sticky,
  maxHeight,
  style,
  sort,
}: StaticTableProps<T>) {
  const density = DENSITY[size];
  // Tinggi 44px milik primitif memaksa tinggi baris judul; kerapatan yang bukan
  // bawaan harus melepasnya, kalau tidak sel judul tetap 44px di tabel ringkas.
  const headDensity =
    density === undefined ? undefined : { ...density, height: "auto" as const };
  const foot = summaryRows(summary);

  return (
    <Table style={style} maxHeight={maxHeight}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => {
            const sortable = declaresSorter(column.sorter);
            if (sortable && (sort === undefined || !sort.keys.includes(column.key))) {
              /*
               * Kegagalan yang KERAS, dan itu inti issue #265. Sampai #265
               * perender ini mengabaikan `sorter` tanpa suara, sehingga 30
               * tabel memasang prop mati yang tidak pernah dilaporkan siapa
               * pun. Sebuah kendali urut yang tidak bisa merakit URL-nya —
               * atau yang kuncinya tidak dikenal kueri, sehingga tautannya
               * disaring habis `parseSort` — adalah prop mati yang sama, hanya
               * lebih meyakinkan karena kali ini ia bisa diklik.
               */
              throw new Error(
                `StaticTable: kolom "${column.key}" menyatakan \`sorter\`, tetapi ` +
                  (sort === undefined
                    ? "tabel ini tidak diberi prop `sort`."
                    : `"${column.key}" tidak ada di \`sort.keys\` (${sort.keys.join(", ") || "kosong"}).`) +
                  " Sortir di StaticTable dijalankan basis data lewat URL: buat" +
                  " `SortSpec` di halamannya (lib/table-sort.ts), oper" +
                  " `sort={{ basePath, params, keys: sortableKeys(SPEC), active }}`," +
                  " dan pakai `sortOrderBy(...)` sebagai `orderBy`. Kalau kolom ini" +
                  " memang tidak bisa diurutkan basis data — mis. nilainya dihitung" +
                  " di memori dari baris lain — hapus `sorter`-nya."
              );
            }

            return (
              <TableHead
                key={column.key}
                sticky={sticky}
                /*
                 * Tanpa ini pembaca layar tidak tahu tabelnya terurut, apalagi
                 * ke arah mana. `none` pada kolom yang bisa diurutkan tapi
                 * belum aktif adalah bagian dari pola yang sama — ia yang
                 * mengumumkan bahwa kolomnya PUNYA sortir.
                 */
                aria-sort={sortable && sort !== undefined ? ariaSort(column.key, sort) : undefined}
                /*
                 * `column.cellStyle` SENGAJA tidak ikut ke sini — ia menggayai
                 * SEL, dan sel laporan kerap berwarna menurut arah angkanya
                 * ("Masuk" hijau, "Keluar" merah). Menerapkannya ke header akan
                 * mewarnai judul kolomnya juga, yang mengubah judul menjadi
                 * penanda status palsu. Yang dibagi header dan sel hanyalah
                 * PERATAAN, karena angka rata kanan di bawah judul rata kiri
                 * terbaca seperti kolom yang berbeda.
                 */
                style={{
                  ...headDensity,
                  ...alignStyle(column.align),
                  ...(column.width === undefined ? undefined : { width: column.width }),
                }}
              >
                {sortable && sort !== undefined ? (
                  <SortControl columnKey={column.key} title={column.title} sort={sort} />
                ) : (
                  column.title
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.length === 0 ? (
          // `data-hover="off"`: baris ini bukan data, jadi ia tidak boleh
          // menyala saat kursor lewat (aturannya di `table.tsx`).
          <TableRow data-hover="off">
            {/* Tanpa padding supaya EmptyState memakai lebarnya sendiri. */}
            <TableCell colSpan={columns.length} style={{ padding: 0 }}>
              {empty}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, index) => {
            const cells = rowCells?.(row, index);
            return (
              <TableRow key={rowKey(row, index)} style={rowStyle?.(row, index)}>
                {cells === undefined
                  ? columns.map((column) => (
                      <TableCell
                        key={column.key}
                        style={{
                          ...density,
                          ...alignStyle(column.align),
                          ...column.cellStyle,
                        }}
                      >
                        {cellContent(column, row, index)}
                      </TableCell>
                    ))
                  : spannedCells(columns, cells, density, (column) =>
                      cellContent(column, row, index)
                    )}
              </TableRow>
            );
          })
        )}
      </TableBody>

      {/* Baris total hanya masuk akal bila ada baris yang ditotal. */}
      {foot.length > 0 && rows.length > 0 && (
        <TableFooter style={summaryStyle}>
          {foot.map((line, lineIndex) => (
            <TableRow
              key={lineIndex}
              style={{ fontWeight: 700, ...line.style }}
            >
              {/* Tanpa `fallback`: kaki tidak punya baris data, jadi kolom yang
                  tidak disebut hanya bisa menjadi sel kosong — lihat
                  `spannedCells`. */}
              {spannedCells(columns, line.cells, density)}
            </TableRow>
          ))}
        </TableFooter>
      )}
    </Table>
  );
}
