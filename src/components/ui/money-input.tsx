"use client";

/**
 * MoneyInput (issue #53) — isian nominal berformat id-ID.
 *
 * Pengguna melihat `1.234.567` (pemisah ribuan id-ID) saat mengetik, tetapi
 * nilai yang dilaporkan ke form/`onChange` adalah angka bersih (`1234567`) —
 * jadi payload submit tidak pernah berisi titik/koma yang harus dibersihkan
 * lagi di server. Rata kanan + `tabular-nums` sesuai aturan uang MASTER.md.
 *
 * `value`/`onChange` bertipe number, jadi cocok langsung dengan
 * `react-hook-form` (`field.value`/`field.onChange`). Kosong dilaporkan
 * sebagai `undefined`, bukan `0` — supaya "belum diisi" bisa dibedakan dari
 * "diisi nol" oleh validasi.
 *
 * Desimal: rupiah 0 desimal, valas 2. Diketik dengan koma (konvensi id-ID),
 * mis. `1.234,56`.
 */

import { useId } from "react";
import { fieldVariants } from "@/components/ui/input";
import { displayToNumber, numberToDisplay } from "@/components/ui/money-input-format";
import { cn } from "@/lib/utils";

interface MoneyInputProps
  extends Omit<
    React.ComponentProps<"input">,
    "value" | "onChange" | "type" | "inputMode" | "size"
  > {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** Jumlah desimal yang diizinkan. 0 untuk IDR, 2 untuk valas. */
  decimals?: 0 | 2;
  invalid?: boolean;
}

function MoneyInput({
  value,
  onChange,
  decimals = 0,
  invalid,
  className,
  id,
  onBlur,
  ...props
}: MoneyInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <input
      data-slot="money-input"
      id={inputId}
      // Papan tik numerik di ponsel; `decimal` mengizinkan koma desimal.
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={numberToDisplay(value, decimals)}
      onChange={(e) => onChange(displayToNumber(e.target.value, decimals))}
      onBlur={onBlur}
      aria-invalid={invalid || undefined}
      className={cn(
        fieldVariants({ invalid: Boolean(invalid) }),
        "text-right tabular-nums",
        className
      )}
      {...props}
    />
  );
}

export { MoneyInput };
export type { MoneyInputProps };
