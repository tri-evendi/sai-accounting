"use client";

/**
 * Select (issue #50) — `<select>` NATIVE, disengaja.
 *
 * Issue #50 secara eksplisit menahan lingkup di sini: select native itu murah,
 * aksesibel, dan di ponsel memunculkan pemilih bawaan sistem yang sudah dikenal
 * pengguna. Penggantian ke Radix Select bukan prioritas. Untuk daftar panjang
 * yang perlu pencarian, yang dipakai adalah `SearchableSelect` (issue #51).
 *
 * Gaya isiannya diambil dari `fieldVariants` milik `Input` — satu sumber
 * kebenaran, supaya kedua kontrol tidak pelan-pelan berbeda tinggi/warna.
 * Penambahan a11y-nya sama seperti `Input`: `aria-invalid` + `aria-describedby`
 * ke pesan `role="alert"`.
 */

import { useId } from "react";
import { type VariantProps } from "class-variance-authority";
import { fieldVariants } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SelectProps = Omit<React.ComponentProps<"select">, "size"> &
  VariantProps<typeof fieldVariants> & {
    /** ReactNode agar label boleh membawa `TermTooltip` (issue #6) — lihat `Input`. */
    label?: React.ReactNode;
    error?: string;
    placeholder?: string;
    options: { value: string; label: string }[];
  };

function Select({
  className,
  label,
  error,
  id,
  options,
  placeholder,
  fieldSize,
  invalid,
  "aria-describedby": describedBy,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const isInvalid = invalid ?? Boolean(error);

  return (
    <div className="space-y-1">
      {label && <Label htmlFor={selectId}>{label}</Label>}
      <select
        data-slot="select"
        id={selectId}
        aria-invalid={isInvalid || undefined}
        aria-describedby={cn(describedBy, error && errorId) || undefined}
        className={cn(
          fieldVariants({ invalid: isInvalid, fieldSize }),
          "cursor-pointer",
          className
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export { Select };
export type { SelectProps };
