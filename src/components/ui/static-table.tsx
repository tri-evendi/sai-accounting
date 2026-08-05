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
   */
  summary?: Record<string, React.ReactNode>;
  /** Kelas tambahan untuk baris total (mis. garis atas tebal). */
  summaryClassName?: string;
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

export function StaticTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  summary,
  summaryClassName,
  className,
}: StaticTableProps<T>) {
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((column) => (
            <TableHead
              key={column.key}
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
              style={column.width === undefined ? undefined : { width: column.width }}
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
            <TableRow key={rowKey(row, index)}>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(alignClass(column.align), column.className)}
                >
                  {cellContent(column, row, index)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>

      {/* Baris total hanya masuk akal bila ada baris yang ditotal. */}
      {summary && rows.length > 0 && (
        <TableFooter className="border-t-2 bg-transparent">
          <TableRow className={cn("border-b-0 font-bold hover:bg-transparent", summaryClassName)}>
            {columns.map((column) => (
              <TableCell
                key={column.key}
                className={cn(alignClass(column.align), column.className)}
              >
                {summary[column.key]}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
