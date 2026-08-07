"use client";

/**
 * DataTable — varian TABEL INTERAKTIF, di atas Ant Design `Table` (issue #189;
 * sebelumnya `@tanstack/react-table`, yang keluar dari dependencies bersama
 * berkas ini).
 *
 * ── Kapan memakai ini, kapan memakai `StaticTable` ─────────────────────────
 * DataTable membawa hook dan menghidrasi rc-table di peramban, jadi seluruh
 * `dataSource`-nya menyeberang ke client. Itu HARGA YANG PANTAS ketika
 * datanya memang sudah ada di client dan pengguna diuntungkan pengurutan atau
 * pemfilteran seketika — mis. riwayat keputusan persetujuan.
 *
 * Itu harga yang SIA-SIA untuk laporan yang hanya menampilkan. Di app ini 46
 * dari 66 pemakai primitif tabel adalah server component yang membaca Prisma
 * dan dipaginasi lewat URL (`?page=2`); untuk tabel seperti itu pakai
 * `StaticTable`, yang memakai kontrak kolom yang SAMA dan merender di server
 * tanpa satu baris JavaScript pun. Memaksakan DataTable di sana hanya
 * memindahkan buku besar ke bundel client tanpa satu pun manfaat.
 *
 * ── Yang harus dibawa primitif ini, dan tidak diberikan AntD ───────────────
 * 1. **`scroll.x` sebagai BAWAAN.** Ini bagian yang paling mudah salah. Tanpa
 *    `scroll.x`, AntD `Table` tidak menggulung sendiri — tabelnya melebar dan
 *    yang menggulung adalah HALAMAN. Itu persis regresi yang dilarang
 *    MASTER.md di 375px, dan ia tidak terlihat di layar 1440px tempat orang
 *    menulis kodenya. `overflow-x-auto` primitif lama BUKAN otomatis setara
 *    dengan `scroll={{x}}` AntD; kesetaraan itu baru ada setelah bawaannya
 *    dipasang di sini, dan itu dikunci `tests/ui-table.test.tsx`.
 * 2. **Keadaan kosong yang bermakna.** Bawaan AntD adalah gambar "No Data" —
 *    kalimat yang tidak memberi tahu apa pun dan tidak menawarkan jalan keluar.
 *    `empty` dipasang lewat `locale.emptyText`, dan pemanggil mengirim
 *    `EmptyState`.
 * 3. **Baris total.** Dipetakan per kunci kolom lewat prop `summary`, bentuk
 *    yang sama persis dengan `StaticTable`, supaya sebuah tabel bisa berpindah
 *    varian tanpa baris totalnya ikut ditulis ulang.
 * 3b. **`sorter` berarti hal yang SAMA di kedua perender (issue #265).** Di sini
 *    ia pengurutan di peramban seperti kolom AntD biasa; di `StaticTable` ia
 *    judul kolom yang menjadi tautan `?sort=…&dir=…` dan `orderBy` Prisma yang
 *    mengurutkan. Yang dijaga sama adalah ARTInya — "kolom ini menawarkan
 *    kendali urut" — beserta putaran keadaannya: klik pertama menaik, kedua
 *    menurun, ketiga kembali ke urutan bawaan (`sortDirections` AntD dan
 *    `nextSort()` di `lib/table-sort.ts` sengaja sama). Tanpa itu sebuah tabel
 *    tidak bisa berpindah perender tanpa kolomnya ditulis ulang, dan itu tujuan
 *    desain seluruh berkas ini. Sejak #265 bawaannya MATI di semua pembantu
 *    kolom: sortir dinyalakan halaman, bukan oleh `moneyColumn`.
 * 4. **`rowStyle` (issue #229).** AntD hanya punya `onRow`, sekantong atribut
 *    DOM. `StaticTable` tidak boleh menerima itu (penangan kejadian tidak bisa
 *    dikirim dari halaman server), jadi KEDUA perender memakai bentuk yang
 *    lebih sempit dan sama — gaya per baris — dan di sinilah ia diterjemahkan
 *    menjadi `onRow`. Tanpa bentuk yang sama, tabel yang menandai barisnya
 *    (mis. "belum dibaca") terkunci pada satu varian.
 */

import { Table as AntTable } from "antd";
import type { ColumnsType } from "antd/es/table";

import type { SaiColumns } from "@/components/ui/table-columns";

interface DataTableProps<T> {
  columns: SaiColumns<T>;
  data: readonly T[];
  /**
   * `index` opsional supaya tanda tangannya sama persis dengan `GetRowKey`
   * AntD dan dengan `StaticTable` — satu bentuk `rowKey` untuk kedua varian,
   * sehingga memindahkan tabel antar varian tidak menyentuh barisnya.
   */
  rowKey: (row: T, index?: number) => React.Key;
  /** Ditampilkan menggantikan isi tabel ketika tidak ada baris. */
  empty?: React.ReactNode;
  /** Aktifkan paginasi sisi client. Kosongkan untuk menampilkan semua baris. */
  pageSize?: number;
  /** Baris total, dipetakan per KUNCI kolom — sama seperti `StaticTable`. */
  summary?: Record<string, React.ReactNode>;
  /**
   * Lebar gulung mendatar. Bawaannya `max-content`: tabel selebar isinya,
   * menggulung di dalam kotaknya sendiri.
   *
   * Bisa DIGANTI (mis. lebar piksel tetap), tapi sengaja tidak bisa
   * DIKOSONGKAN: `undefined` jatuh kembali ke bawaan, bukan ke "tanpa scroll".
   * Menghapus `scroll.x` adalah satu-satunya cara membuat halaman menggulung
   * mendatar lagi di 375px, dan itu bukan pilihan yang pantas disediakan
   * lewat sebuah prop.
   */
  scrollX?: number | string;
  /** Gaya akar tabel — pengganti `className` yang dicabut di #203. */
  style?: React.CSSProperties;
  size?: "small" | "middle" | "large";
  /**
   * Gaya per BARIS — bentuk yang sama persis dengan `StaticTable.rowStyle`,
   * sengaja lebih sempit dari `onRow` AntD. Lihat butir 4 di kepala berkas.
   */
  rowStyle?: (row: T, index: number) => React.CSSProperties | undefined;
  /**
   * Judul kolom tetap terbaca saat isinya digulir. Di sini ia dipasang lewat
   * `scroll.y` AntD, yang memberi badan tabel tinggi tetap dan headernya
   * sendiri — mekanisme yang berbeda dari `StaticTable` (yang membatasi
   * pembungkus gesernya), tetapi hasil yang sama di layar.
   */
  maxHeight?: number | string;
}

export function DataTable<T extends object>({
  columns,
  data,
  rowKey,
  empty,
  pageSize,
  summary,
  scrollX = "max-content",
  style,
  size = "middle",
  rowStyle,
  maxHeight,
}: DataTableProps<T>) {
  /*
   * `cellStyle` kolom dipindahkan ke `onCell`, supaya ia hanya mengenai SEL —
   * sama seperti di `StaticTable`. Diteruskan sebagai `style` kolom, AntD
   * memakainya untuk sel BESERTA header, dan kolom laporan yang berwarna
   * menurut arah angkanya ("Masuk" hijau, "Keluar" merah) akan ikut mewarnai
   * judul kolomnya. Dua perender yang menggayai header secara berbeda adalah
   * cara paling halus sebuah tabel berubah rupa hanya karena variannya diganti.
   *
   * `cellStyle` juga DIKELUARKAN dari sisa propnya: ia prop milik kontrak kolom
   * repo ini, bukan milik `ColumnType` AntD, dan meneruskannya ke rc-table
   * hanya menitipkan kunci yang tak akan pernah dibaca siapa pun.
   */
  const antdColumns = columns.map(({ cellStyle, ...rest }) => ({
    ...rest,
    onCell: cellStyle === undefined ? undefined : () => ({ style: cellStyle }),
  }));

  return (
    <AntTable<T>
      style={style}
      size={size}
      columns={antdColumns as ColumnsType<T>}
      dataSource={data as T[]}
      rowKey={rowKey}
      scroll={maxHeight === undefined ? { x: scrollX } : { x: scrollX, y: maxHeight }}
      onRow={
        rowStyle === undefined
          ? undefined
          : (record, index) => ({ style: rowStyle(record, index ?? 0) })
      }
      locale={empty === undefined ? undefined : { emptyText: empty }}
      pagination={
        pageSize
          ? {
              pageSize,
              // Menyembunyikan pagination saat isinya muat satu halaman: kendali
              // yang tak bisa menuju ke mana pun hanya menambah kebisingan.
              hideOnSinglePage: true,
              showSizeChanger: false,
            }
          : false
      }
      summary={
        summary === undefined || data.length === 0
          ? undefined
          : () => (
              <AntTable.Summary>
                <AntTable.Summary.Row>
                  {columns.map((column, index) => (
                    <AntTable.Summary.Cell
                      key={column.key}
                      index={index}
                      align={column.align}
                    >
                      {summary[column.key]}
                    </AntTable.Summary.Cell>
                  ))}
                </AntTable.Summary.Row>
              </AntTable.Summary>
            )
      }
    />
  );
}
