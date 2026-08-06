/**
 * Tipe komponen ikon — pengganti `LucideIcon` setelah issue #201.
 *
 * Ditulis sebagai bentuk MINIMUM yang benar-benar dipanggil aplikasi ini, bukan
 * tipe internal `@ant-design/icons`: peta ikon (menu samping, Pusat Laporan,
 * pemilih tema) hanya perlu tahu bahwa nilainya bisa dirender dengan `style`,
 * `className`, dan `aria-hidden`. Komponen `@ant-design/icons` menerima ketiganya
 * (`IconBaseProps extends React.HTMLProps<HTMLSpanElement>`), jadi ia tetap
 * bisa ditaruh di sini tanpa mengimpor jalur `lib/components/AntdIcon` yang
 * bukan bagian dari permukaan publik paketnya.
 *
 * **Jangan menambahkan `size` di sini.** `React.HTMLProps` memang mengizinkan
 * `size` (atribut HTML untuk `<input>`/`<select>`), jadi `<InfoCircleOutlined
 * size={16} />` lolos `tsc` — lalu mendarat sebagai atribut `size="16"` di
 * `<span>` dan tidak mengubah apa pun. Ukuran ikon AntD adalah `font-size`;
 * lihat "Ikon" di `design-system/sai-accounting/MASTER.md`.
 */
import type { AriaAttributes, ComponentType, CSSProperties } from "react";

export type IconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: AriaAttributes["aria-hidden"];
}>;
