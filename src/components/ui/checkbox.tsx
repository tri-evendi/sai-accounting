"use client";

/**
 * Checkbox — primitif di atas Ant Design `Checkbox` (issue #187, fase B1;
 * sebelumnya Radix, yang dipakai sejak issue #73 untuk matriks Hak Akses).
 *
 * ── Satu-satunya penerjemahan yang dibutuhkan ─────────────────────────────
 * API terkontrol Radix adalah `checked` + `onCheckedChange(nilai)`; API AntD
 * adalah `checked` + `onChange(event)`. 16 berkas memakai bentuk Radix, dan
 * mengonversinya adalah pekerjaan fase C — jadi nama lama dipertahankan di
 * sini dan diterjemahkan sekali: `onChange(e) -> onCheckedChange(e.target.checked)`.
 *
 * Perhatikan bahwa `e.target` AntD BUKAN elemen DOM melainkan objek buatan
 * (`CheckboxChangeEvent`), sehingga `e.target.checked` selalu boolean. Itu
 * kebetulan menyelesaikan satu utang kecil dari Radix: di sana nilainya bisa
 * `"indeterminate"`, sehingga ke-16 pemanggil menulis `v === true`. Perbandingan
 * itu tetap benar terhadap boolean, jadi tak satu pun perlu disentuh sekarang.
 *
 * ── Target sentuh ─────────────────────────────────────────────────────────
 * Kotaknya sendiri `controlInteractiveSize` = `controlHeight / 2` = 20px,
 * ukuran yang sama persis dengan `size-5` sebelumnya. Sama seperti dulu,
 * daerah tekan yang layak jempol dicapai pemanggil lewat `<label>` yang
 * membungkusnya — bukan dengan membesarkan kotaknya, yang justru membuat
 * formulir panjang terlihat seperti daftar periksa.
 */

import { Checkbox as AntdCheckbox } from "antd";
import type { CheckboxProps as AntdCheckboxProps } from "antd";

type CheckboxProps = Omit<AntdCheckboxProps, "onChange"> &
  React.AriaAttributes & {
    /** Nama lama (Radix). Menerima boolean; `"indeterminate"` tidak dipakai. */
    onCheckedChange?: (checked: boolean) => void;
  };

function Checkbox({ onCheckedChange, ...props }: CheckboxProps) {
  return (
    <AntdCheckbox
      {...props}
      onChange={
        onCheckedChange === undefined
          ? undefined
          : (event) => onCheckedChange(event.target.checked)
      }
    />
  );
}

export { Checkbox };
export type { CheckboxProps };
