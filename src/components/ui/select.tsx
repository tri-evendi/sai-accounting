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

type SelectOwnProps = VariantProps<typeof fieldVariants> & {
  placeholder?: string;
  options: { value: string; label: string }[];
};

type SelectProps = Omit<React.ComponentProps<"select">, "size"> &
  SelectOwnProps & {
    /** ReactNode agar label boleh membawa `TermTooltip` (issue #6) — lihat `Input`. */
    label?: React.ReactNode;
    error?: string;
  };

/**
 * Select telanjang — hanya `<select>` bergaya, tanpa pembungkus label/error.
 * Dipakai di dalam pola `Form` shadcn (issue #53), sama seperti `TextInput`:
 * `FormControl` (Radix `Slot`) meneruskan `id`/`aria-*` ke anak tunggal, jadi
 * anaknya harus satu `<select>`, bukan `<div>` pembungkus `Select` komposit.
 */
function NativeSelect({
  className,
  options,
  placeholder,
  fieldSize,
  invalid,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & SelectOwnProps) {
  return (
    <select
      data-slot="select"
      className={cn(
        fieldVariants({ invalid: Boolean(invalid), fieldSize }),
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
  );
}

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
      <NativeSelect
        id={selectId}
        options={options}
        placeholder={placeholder}
        fieldSize={fieldSize}
        invalid={isInvalid}
        aria-invalid={isInvalid || undefined}
        aria-describedby={cn(describedBy, error && errorId) || undefined}
        className={className}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export { Select, NativeSelect };
export type { SelectProps };
