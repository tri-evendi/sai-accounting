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
      colSpan: number;
      /**
       * Perataan sel gabungan. Tanpa ini ia mewarisi perataan kolom PERTAMA
       * yang ditelannya — dan label "Total (USD)" yang membentang di atas empat
       * kolom barang hampir selalu ingin rata KANAN, menempel pada angkanya,
       * bukan rata kiri seperti kolom "Barang".
       */
      align?: "left" | "right" | "center";
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

/** Bentuk objek sel kaki, atau `undefined` bila selnya isi polos. */
function mergedCell(cell: SummaryCell | undefined) {
  return cell !== null && typeof cell === "object" && "colSpan" in cell ? cell : undefined;
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
          rows.map((row, index) => (
            <TableRow key={rowKey(row, index)} style={rowStyle?.(row, index)}>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(alignClass(column.align), column.className)}
                  style={density}
                >
                  {cellContent(column, row, index)}
                </TableCell>
              ))}
            </TableRow>
          ))
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
              {
                /*
                 * `colSpan` menelan kolom di kanannya, jadi kolomnya dilewati
                 * dengan penghitung — bukan disaring — supaya sel berikutnya
                 * tetap jatuh di kolom yang benar. Kolom yang tidak disebut
                 * tetap mendapat SEL-nya sendiri, aturan yang sama dengan kaki
                 * satu baris: baris total tak boleh meleset satu kolom.
                 */
                columns.reduce<{ nodes: React.ReactNode[]; skip: number }>(
                  (acc, column) => {
                    if (acc.skip > 0) return { ...acc, skip: acc.skip - 1 };
                    const cell = line.cells[column.key];
                    const merged = mergedCell(cell);
                    const span = merged?.colSpan ?? 1;
                    acc.nodes.push(
                      <TableCell
                        key={column.key}
                        colSpan={span === 1 ? undefined : span}
                        className={cn(
                          alignClass(merged?.align ?? column.align),
                          column.className
                        )}
                        style={density}
                      >
                        {merged ? merged.content : (cell as React.ReactNode)}
                      </TableCell>
                    );
                    return { nodes: acc.nodes, skip: span - 1 };
                  },
                  { nodes: [], skip: 0 }
                ).nodes
              }
            </TableRow>
          ))}
        </TableFooter>
      )}
    </Table>
  );
}
