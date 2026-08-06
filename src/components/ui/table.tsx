/**
 * Table (issue #52) — primitif tabel shadcn/ui, satu sumber gaya untuk 50
 * tabel transaksi yang sebelumnya menyalin-tempel kelas Tailwind sendiri.
 *
 * **Sengaja TANPA `"use client"`.** shadcn menandai berkas ini `"use client"`
 * secara konvensi, padahal isinya tidak memakai hook sama sekali. Di app ini
 * 46 dari 66 pemakai primitif tabel adalah server component yang mengambil
 * datanya langsung dari Prisma; menandainya client akan menyeret semuanya ke
 * bundel client tanpa alasan. Jadi penanda itu dilepas — komponen ini murni
 * presentasional dan aman di kedua sisi.
 *
 * `Table` membawa pembungkus `overflow-x-auto` bawaan: tabel lebar menggulung
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
 * **Rencana pensiun.** Ekspor JSX di bawah (`Table`/`TableRow`/`TableCell`/…)
 * masih dipakai langsung oleh 66 berkas; fase C (#193–#200) memindahkannya ke
 * `StaticTable`/`DataTable` satu modul per PR. Setelah berkas terakhir pindah,
 * ekspor ini berhenti menjadi API publik dan kelas Tailwind di dalamnya
 * diganti token AntD di #203 — sampai saat itu keduanya sah hidup berdampingan.
 *
 * ── Header lengket: kenapa ia butuh DUA bagian (issue #229) ────────────────
 * Ini bagian yang paling mudah salah, jadi ditulis eksplisit — ia menggantikan
 * `permissions/matrix-sticky.ts`, solusi sementara yang dirakit di sisi
 * pemanggil pada #199.
 *
 * `position: sticky` dihitung terhadap **ancestor scroll container TERDEKAT**,
 * bukan terhadap viewport. Pembungkus `overflow-x-auto` di bawah SELALU sebuah
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
 * Bawaannya `var(--ant-color-bg-container)`, yang teratasi selama tabelnya
 * berada di dalam sebuah komponen AntD (di app ini hampir selalu `Card`;
 * `ConfigProvider` v6 memasang variabelnya pada elemen ber-kelas `css-var-root`
 * yang digambar komponen AntD sendiri, BUKAN pada `:root` — aturan yang sama
 * dengan `components/shared/aging.tsx`). Pemanggil yang berdiri di LUAR pohon
 * itu — kedua matriks izin — mengirim `token.colorBgContainer` lewat
 * `stickyHeadBackground`, dan itulah satu-satunya alasan prop itu ada.
 */

import { cn } from "@/lib/utils";

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
  className,
  maxHeight,
  containerStyle,
  stickyHeadBackground,
  stickyHeadBorderColor,
  ...props
}: TableProps) {
  /*
   * Dirakit bersyarat, bukan disebar tanpa syarat: 66 berkas merender `Table`
   * tanpa satu pun prop di atas, dan `style={{}}` yang selalu ada mengubah
   * markup mereka tanpa alasan.
   */
  const style: React.CSSProperties = { ...containerStyle };
  if (maxHeight !== undefined) style.maxHeight = maxHeight;
  if (stickyHeadBackground !== undefined) {
    (style as Record<string, string>)[STICKY_HEAD_BG] = stickyHeadBackground;
  }
  if (stickyHeadBorderColor !== undefined) {
    (style as Record<string, string>)[STICKY_HEAD_LINE] = stickyHeadBorderColor;
  }

  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
      style={Object.keys(style).length === 0 ? undefined : style}
    >
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

function TableHead({
  className,
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
      className={cn(
        "h-11 px-6 text-left align-middle font-medium whitespace-nowrap text-muted-foreground",
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
      // Gaya pemanggil MENIMPA gaya lengketnya: kolom masih boleh mengatur
      // lebar & perataannya sendiri tanpa kehilangan sifat menempelnya.
      style={sticky ? { ...STICKY_HEAD_STYLE, ...style } : style}
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
