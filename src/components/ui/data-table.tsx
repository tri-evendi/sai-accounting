"use client";

/**
 * DataTable (issue #52) — pola resmi shadcn: `Table` + TanStack `useReactTable`.
 * Memakai `@tanstack/react-table` yang sudah lama terpasang di package.json
 * tetapi belum pernah dipakai satu berkas pun.
 *
 * **Kapan memakai ini, kapan tidak.** DataTable membawa hook, jadi ia komponen
 * client. Di app ini 36 dari 50 tabel adalah *server component* yang mengambil
 * datanya langsung dari Prisma dan dipaginasi lewat URL (`?page=2`) — untuk
 * tabel seperti itu pakai primitif `Table` + `MoneyCell` saja; memaksakan
 * DataTable hanya memindahkan data ke bundel client tanpa manfaat. Gunakan
 * DataTable bila datanya MEMANG sudah ada di client dan pengguna diuntungkan
 * oleh pengurutan/pemfilteran seketika — mis. antrean persetujuan.
 *
 * Contoh pemakaian:
 *
 *   const columns = [
 *     textColumn<Row>({ accessorKey: "documentNo", header: "Dokumen" }),
 *     moneyColumn<Row>({ accessorKey: "amount", header: "Nilai",
 *                        currency: (row) => row.currency }),
 *     statusColumn<Row>({ accessorKey: "status", header: "Status" }),
 *   ];
 *
 *   <DataTable
 *     columns={columns}
 *     data={rows}
 *     pageSize={20}
 *     empty={<EmptyState title="Belum ada pengajuan" … />}
 *   />
 */

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type CurrencyCode } from "@/lib/money-format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Helper kolom — aturan tampilan hidup di sini, bukan di tiap halaman */
/* ------------------------------------------------------------------ */

/** Menandai kolom sebagai numerik agar header & selnya rata kanan. */
type Align = "left" | "right";

function alignMeta(align: Align) {
  return { align } as const;
}

interface ColumnBase<TData> {
  accessorKey: Extract<keyof TData, string>;
  header: string;
  /** Nonaktifkan pengurutan untuk kolom ini. */
  enableSorting?: boolean;
}

/** Kolom teks biasa. */
export function textColumn<TData>({
  accessorKey,
  header,
  enableSorting = true,
}: ColumnBase<TData>): ColumnDef<TData> {
  return {
    accessorKey,
    header,
    enableSorting,
    meta: alignMeta("left"),
  };
}

/**
 * Kolom nominal — rata kanan, tabular-nums, format id-ID, mata uang eksplisit,
 * negatif merah bertanda minus. Semua lewat `Money`, jadi satu perubahan
 * aturan berlaku untuk seluruh tabel sekaligus.
 */
export function moneyColumn<TData>({
  accessorKey,
  header,
  currency = "IDR",
  hideCurrency,
  signed,
  enableSorting = true,
}: ColumnBase<TData> & {
  /** Tetap, atau dibaca per baris untuk tabel multi-mata-uang. */
  currency?: CurrencyCode | ((row: TData) => CurrencyCode);
  hideCurrency?: boolean;
  signed?: boolean;
}): ColumnDef<TData> {
  return {
    accessorKey,
    header,
    enableSorting,
    // Diurutkan sebagai angka, bukan sebagai teks hasil format — kalau tidak,
    // "Rp 9.000" akan terurut di atas "Rp 10.000".
    sortingFn: "basic",
    meta: alignMeta("right"),
    cell: ({ row, getValue }) => (
      <Money
        value={Number(getValue() ?? 0)}
        currency={typeof currency === "function" ? currency(row.original) : currency}
        hideCurrency={hideCurrency}
        signed={signed}
      />
    ),
  };
}

/** Kolom status — selalu badge BERTEKS, tidak pernah warna saja. */
export function statusColumn<TData>({
  accessorKey,
  header,
  enableSorting = true,
}: ColumnBase<TData>): ColumnDef<TData> {
  return {
    accessorKey,
    header,
    enableSorting,
    meta: alignMeta("left"),
    cell: ({ getValue }) => <StatusBadge status={String(getValue() ?? "")} />,
  };
}

/* ------------------------------------------------------------------ */

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  /** Ditampilkan menggantikan isi tabel ketika tidak ada baris. */
  empty?: React.ReactNode;
  /** Aktifkan paginasi sisi client. Kosongkan untuk menampilkan semua baris. */
  pageSize?: number;
  initialSorting?: SortingState;
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  empty,
  pageSize,
  initialSorting = [],
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  /*
   * React Compiler melewatkan memoisasi komponen ini karena `useReactTable`
   * mengembalikan fungsi yang tidak aman dimemoisasi. Aman di sini: nilai dari
   * `table` hanya dipakai di dalam render komponen ini dan tidak pernah
   * diteruskan ke komponen/hook lain yang dimemoisasi — yaitu satu-satunya
   * kondisi yang diperingatkan aturan tersebut. Konsekuensinya hanya
   * kehilangan optimasi otomatis, bukan UI basi.
   */
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pageSize
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageIndex: 0, pageSize } },
        }
      : {}),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const align =
                  (header.column.columnDef.meta as { align?: Align } | undefined)?.align ??
                  "left";
                const sorted = header.column.getIsSorted();
                const sortable = header.column.getCanSort();
                return (
                  <TableHead
                    key={header.id}
                    className={align === "right" ? "text-right" : undefined}
                    // Pembaca layar mengumumkan arah urutan kolomnya.
                    aria-sort={
                      !sorted ? "none" : sorted === "asc" ? "ascending" : "descending"
                    }
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded-sm font-medium",
                          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          "hover:text-foreground",
                          align === "right" && "flex-row-reverse"
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-0">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const align =
                    (cell.column.columnDef.meta as { align?: Align } | undefined)?.align ??
                    "left";
                  return (
                    <TableCell
                      key={cell.id}
                      className={align === "right" ? "text-right" : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {pageSize && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <p className="text-sm text-muted-foreground">
            Halaman {table.getState().pagination.pageIndex + 1} dari {table.getPageCount()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Sebelumnya
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
