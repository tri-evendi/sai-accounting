/**
 * `moneyColumn` — kolom nominal untuk `StaticTable` maupun `DataTable`
 * (issue #189).
 *
 * **Sengaja TANPA `"use client"`, dan sengaja terpisah dari `table-columns`.**
 *
 * Berkas ini merender `Money`, yang sejak #186 adalah komponen client. Impor ES
 * bersifat statis, jadi menaruh pembantu ini di `table-columns.tsx` akan
 * menyeret `money.tsx` menyeberangi batas client pada SETIAP halaman yang
 * mengimpor pembantu kolom apa pun — termasuk laporan yang tidak punya satu pun
 * kolom uang (terukur di Riwayat Stok). Dengan modulnya sendiri, halaman hanya
 * membayar `money.tsx` ketika benar-benar menampilkan uang.
 *
 * Berkas ini tetap server-safe: ia hanya MERENDER komponen client, tidak
 * memakai hook. Itu sebabnya `StaticTable` boleh memanggilnya di server.
 */

import { Money } from "@/components/ui/money";
import {
  isEmptyValue,
  numericSorter,
  type ColumnBase,
  type SaiColumn,
} from "@/components/ui/table-columns";
import { type CurrencyCode } from "@/lib/money-format";

/**
 * Kolom nominal — rata kanan, tabular-nums, format id-ID, mata uang eksplisit,
 * negatif berwarna DAN bertanda minus. Semuanya lewat `Money`, jadi satu
 * perubahan aturan berlaku untuk seluruh tabel sekaligus.
 *
 * Nilai kosong diteruskan APA ADANYA ke `Money`, yang menampilkannya "—".
 * Sebuah `?? 0` di sini akan mengubah "nilainya belum diketahui" menjadi
 * "Rp 0" di setiap tabel yang memakai pembantu ini — persis bug yang ditutup
 * di Piutang/Utang & Nilai Persediaan, tapi lewat pintu yang tak terlihat dari
 * halamannya.
 */
export function moneyColumn<T>({
  dataIndex,
  title,
  key,
  sorter = true,
  width,
  currency = "IDR",
  hideCurrency,
  signed,
  tone,
}: ColumnBase<T> & {
  /** Tetap, atau dibaca per baris untuk tabel multi-mata-uang. */
  currency?: CurrencyCode | ((row: T) => CurrencyCode);
  hideCurrency?: boolean;
  signed?: boolean;
  tone?: "auto" | "positive" | "negative" | "pending" | "neutral";
}): SaiColumn<T> {
  return {
    key: key ?? dataIndex,
    dataIndex,
    title,
    align: "right",
    width,
    sorter: sorter === true ? numericSorter<T>(dataIndex) : sorter,
    render: (raw, record) => (
      <Money
        value={isEmptyValue(raw) ? undefined : Number(raw)}
        currency={typeof currency === "function" ? currency(record) : currency}
        hideCurrency={hideCurrency}
        signed={signed}
        tone={tone}
      />
    ),
  };
}
