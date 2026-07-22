/**
 * Table (issue #52) — primitif tabel shadcn/ui, satu sumber gaya untuk 50
 * tabel transaksi yang sebelumnya menyalin-tempel kelas Tailwind sendiri.
 *
 * **Sengaja TANPA `"use client"`.** shadcn menandai berkas ini `"use client"`
 * secara konvensi, padahal isinya tidak memakai hook sama sekali. Di app ini
 * 36 dari 50 tabel adalah server component yang mengambil datanya langsung
 * dari Prisma; menandainya client akan menyeret semuanya ke bundel client
 * tanpa alasan. Jadi penanda itu dilepas — komponen ini murni presentasional
 * dan aman di kedua sisi.
 *
 * `Table` membawa pembungkus `overflow-x-auto` bawaan: tabel lebar menggulung
 * DI DALAM kotaknya, bukan membuat seluruh halaman menggulung mendatar di
 * layar 375px (aturan responsif MASTER.md).
 *
 * Untuk kolom nominal pakai `MoneyCell` (lihat `money.tsx`) supaya aturan
 * uang MASTER.md ditegakkan di satu tempat, bukan diketik ulang per halaman.
 */

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors duration-150 motion-reduce:transition-none",
        "hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-6 text-left align-middle font-medium whitespace-nowrap text-muted-foreground",
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-6 py-3 align-middle", "[&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
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
