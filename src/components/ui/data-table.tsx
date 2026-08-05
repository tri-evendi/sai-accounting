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
  className?: string;
  size?: "small" | "middle" | "large";
}

export function DataTable<T extends object>({
  columns,
  data,
  rowKey,
  empty,
  pageSize,
  summary,
  scrollX = "max-content",
  className,
  size = "middle",
}: DataTableProps<T>) {
  /*
   * `className` kolom dipindahkan ke `onCell`, supaya ia hanya mengenai SEL —
   * sama seperti di `StaticTable`. Diteruskan apa adanya, AntD memakainya untuk
   * sel BESERTA header, dan kolom laporan yang berwarna menurut arah angkanya
   * ("Masuk" hijau, "Keluar" merah) akan ikut mewarnai judul kolomnya. Dua
   * perender yang menggayai header secara berbeda adalah cara paling halus
   * sebuah tabel berubah rupa hanya karena variannya diganti.
   */
  const antdColumns = columns.map(({ className: cellClassName, ...rest }) => ({
    ...rest,
    onCell: cellClassName === undefined ? undefined : () => ({ className: cellClassName }),
  }));

  return (
    <AntTable<T>
      className={className}
      size={size}
      columns={antdColumns as ColumnsType<T>}
      dataSource={data as T[]}
      rowKey={rowKey}
      scroll={{ x: scrollX }}
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
