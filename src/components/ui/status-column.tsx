/**
 * `statusColumn` — kolom status untuk `StaticTable` maupun `DataTable`
 * (issue #189).
 *
 * **Sengaja TANPA `"use client"`, dan sengaja terpisah dari `table-columns`.**
 * Alasannya sama persis dengan `money-column.tsx`: berkas ini merender
 * `StatusBadge`, sebuah komponen client, dan impor ES bersifat statis — jadi
 * halaman yang tidak punya kolom status tidak perlu ikut menyeretnya
 * menyeberangi batas client.
 */

import { StatusBadge } from "@/components/shared/status-badge";
import { type ColumnBase, type SaiColumn } from "@/components/ui/table-columns";

/** Kolom status — selalu badge BERTEKS, tidak pernah warna saja (MASTER.md). */
export function statusColumn<T>({
  dataIndex,
  title,
  key,
  sorter,
  width,
}: ColumnBase<T>): SaiColumn<T> {
  return {
    key: key ?? dataIndex,
    dataIndex,
    title,
    align: "left",
    width,
    sorter,
    render: (raw) => <StatusBadge status={String(raw ?? "")} />,
  };
}
