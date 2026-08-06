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
 * lapisan gaya internal yang hanya dipanggil dua perender ini. Gaya Tailwind
 * di dalamnya diganti token AntD di #203 — lihat catatan di `table.tsx`.
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
 */

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
import { cn } from "@/lib/utils";

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
  className?: string;
}

/**
 * Kerapatan sel. `middle` (bawaan) SENGAJA bukan angka AntD melainkan padding
 * primitifnya sendiri (`px-6 py-3`): 18 tabel sudah memakainya hari ini, dan
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
  /** Kelas tambahan untuk SETIAP baris total (mis. garis atas tebal). */
  summaryClassName?: string;
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
  className?: string;
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

function alignClass(align: SaiColumns<unknown>[number]["align"]) {
  return align === "right" ? "text-right" : align === "center" ? "text-center" : undefined;
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
           * Sel bertag `th` mengambil perataannya lewat GAYA SEBARIS, bukan
           * lewat `alignClass`: penawar bawaan UA di `table.tsx` juga sebaris,
           * dan gaya sebaris selalu menang atas kelas. Menyerahkannya ke kelas
           * berarti `text-right` diam-diam kalah oleh `textAlign: inherit`.
           */
          className={cn(scope ? undefined : alignClass(align), column.className)}
          style={scope ? { ...density, textAlign: align } : density}
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
  summaryClassName,
  summaryStyle,
  rowStyle,
  rowCells,
  size = "middle",
  sticky,
  maxHeight,
  className,
}: StaticTableProps<T>) {
  const density = DENSITY[size];
  // `h-11` primitif memaksa tinggi baris judul; kerapatan yang bukan bawaan
  // harus melepasnya, kalau tidak sel judul tetap 44px di tabel ringkas.
  const headDensity =
    density === undefined ? undefined : { ...density, height: "auto" as const };
  const foot = summaryRows(summary);

  return (
    <Table className={className} maxHeight={maxHeight}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((column) => (
            <TableHead
              key={column.key}
              sticky={sticky}
              /*
               * `column.className` SENGAJA tidak ikut ke sini — ia menggayai
               * SEL, dan sel laporan kerap berwarna menurut arah angkanya
               * ("Masuk" hijau, "Keluar" merah). Menerapkannya ke header akan
               * mewarnai judul kolomnya juga, yang mengubah judul menjadi
               * penanda status palsu. Yang dibagi header dan sel hanyalah
               * PERATAAN, karena angka rata kanan di bawah judul rata kiri
               * terbaca seperti kolom yang berbeda.
               */
              className={alignClass(column.align)}
              style={
                column.width === undefined
                  ? headDensity
                  : { ...headDensity, width: column.width }
              }
            >
              {column.title}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            {/* `p-0` supaya EmptyState memakai lebarnya sendiri, bukan padding sel. */}
            <TableCell colSpan={columns.length} className="p-0">
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
                        className={cn(alignClass(column.align), column.className)}
                        style={density}
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
        <TableFooter className="border-t-2 bg-transparent" style={summaryStyle}>
          {foot.map((line, lineIndex) => (
            <TableRow
              key={lineIndex}
              className={cn(
                "border-b-0 font-bold hover:bg-transparent",
                summaryClassName,
                line.className
              )}
              style={line.style}
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
