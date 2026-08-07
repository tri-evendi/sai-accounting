"use client";

/**
 * MoneyInput (issue #53, ditulis ulang di atas AntD pada issue #186) — isian
 * nominal berformat id-ID.
 *
 * Pengguna melihat `1.234.567` (pemisah ribuan id-ID) saat mengetik, tetapi
 * nilai yang dilaporkan ke form/`onChange` adalah angka bersih (`1234567`) —
 * jadi payload submit tidak pernah berisi titik/koma yang harus dibersihkan
 * lagi di server. Rata kanan + `tabular-nums` sesuai aturan uang MASTER.md.
 *
 * `value`/`onChange` bertipe number, jadi cocok langsung dengan
 * `react-hook-form` (`field.value`/`field.onChange`). Kosong dilaporkan
 * sebagai `undefined`, bukan `0` — supaya "belum diisi" bisa dibedakan dari
 * "diisi nol" oleh validasi. Itu sisi isian dari aturan yang sama dengan "—"
 * pada `Money`: nol adalah sebuah nilai, bukan ketiadaan nilai.
 *
 * Desimal: rupiah 0 desimal, valas 2. Diketik dengan koma (konvensi id-ID),
 * mis. `1.234,56`.
 *
 * ── Kenapa `Input` AntD, bukan `InputNumber` ───────────────────────────────
 * `InputNumber` membawa `formatter`/`parser`-nya sendiri, yaitu salinan KEDUA
 * dari aturan yang sudah hidup di `money-input-format.ts` — dan salinan yang
 * lebih lemah: ia memformat ulang di tengah pengetikan (titik ribuan yang baru
 * saja diketik dipindahkan di bawah kursor), lalu melaporkan `null` untuk isian
 * kosong, bukan `undefined`. Konversi di sini tidak berubah sedikit pun dari
 * versi sebelumnya; yang berganti hanya kulitnya, sehingga isian uang tampil
 * dan berfokus persis seperti isian AntD lain di formulir yang sama.
 *
 * Tidak ada kelas Tailwind di berkas ini: rupa isian datang dari token AntD,
 * dan dua sifat yang AntD tidak berikan (`tabular-nums`, rata kanan) dipasang
 * sebagai gaya sebaris.
 */

import { useId } from "react";
import { Input, type InputRef } from "antd";

import { displayToNumber, numberToDisplay } from "@/components/ui/money-input-format";

interface MoneyInputProps
  extends Omit<
    React.ComponentProps<"input">,
    "value" | "onChange" | "type" | "inputMode" | "size" | "prefix" | "ref"
  > {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** Jumlah desimal yang diizinkan. 0 untuk IDR, 2 untuk valas. */
  decimals?: 0 | 2;
  invalid?: boolean;
  /**
   * `InputRef` AntD, bukan `HTMLInputElement` — itu konsekuensi nyata dari
   * pindah ke `Input` AntD, jadi ditulis di tipe, bukan dibiarkan tersandung
   * saat dipakai. Elemennya tetap bisa diraih lewat `ref.current.input`, dan
   * `focus()`/`blur()`/`select()` tersedia langsung di `InputRef`.
   */
  ref?: React.Ref<InputRef>;
}

function MoneyInput({
  value,
  onChange,
  decimals = 0,
  invalid,
  id,
  onBlur,
  style,
  ...props
}: MoneyInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  /*
   * `FormControl` (pola Form shadcn) menyuntikkan `aria-invalid` ke anaknya,
   * sedangkan prop `invalid` dipakai pemanggil di luar pola itu. Keduanya
   * dibaca supaya isian yang ditolak validasi benar-benar terlihat merah:
   * versi sebelumnya hanya melihat `invalid`, sehingga error dari
   * react-hook-form mengumumkan diri ke pembaca layar tapi tidak mengubah
   * garis isiannya sedikit pun.
   */
  const ariaInvalid = props["aria-invalid"];
  const isInvalid = Boolean(invalid) || ariaInvalid === true || ariaInvalid === "true";

  return (
    <Input
      data-slot="money-input"
      id={inputId}
      // Papan tik numerik di ponsel; `decimal` mengizinkan koma desimal.
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={numberToDisplay(value, decimals)}
      onChange={(e) => onChange(displayToNumber(e.target.value, decimals))}
      onBlur={onBlur}
      status={isInvalid ? "error" : undefined}
      aria-invalid={isInvalid || undefined}
      style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", ...style }}
      {...props}
    />
  );
}

export { MoneyInput };
export type { MoneyInputProps };
