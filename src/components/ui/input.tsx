"use client";

/**
 * Input (issue #50) — CVA + token, API pemanggil (`label`, `error`) tetap.
 *
 * Yang berubah selain warna:
 *   • tinggi kontrol jadi 40px (`h-10`) — "target sentuh ≥ 40px" MASTER.md;
 *     sebelumnya hanya padding, sehingga tingginya ±38px;
 *   • `focus-visible` menggantikan `focus`, jadi ring hanya muncul saat
 *     navigasi keyboard;
 *   • pesan error kini benar-benar TERHUBUNG ke isiannya: `aria-invalid` +
 *     `aria-describedby` -> id pesan, dan pesannya `role="alert"` sehingga
 *     diumumkan. Sebelumnya error hanya teks merah di bawah field — pengguna
 *     pembaca layar tidak tahu field mana yang salah.
 *
 * `fieldVariants` diekspor dan dipakai ulang oleh `Select` supaya kedua
 * kontrol tidak pelan-pelan berbeda rupa.
 */

import { useId } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const fieldVariants = cva(
  [
    "block w-full rounded-md border bg-background px-3 text-sm text-foreground shadow-sm",
    "transition-colors duration-150 motion-reduce:transition-none",
    "outline-none placeholder:text-muted-foreground",
    "focus-visible:ring-2 focus-visible:ring-offset-0",
    "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
  ],
  {
    variants: {
      invalid: {
        false: "border-border focus-visible:border-ring focus-visible:ring-ring",
        true: "border-destructive focus-visible:border-destructive focus-visible:ring-destructive",
      },
      fieldSize: {
        /** Default — 40px, target sentuh minimum MASTER.md. */
        md: "h-10 py-2",
        sm: "h-8 py-1",
      },
    },
    defaultVariants: { invalid: false, fieldSize: "md" },
  }
);

type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof fieldVariants> & {
    /**
     * ReactNode, bukan string, supaya label boleh membawa bantuan kontekstual —
     * mis. `<TermTooltip term="kurs">Kurs</TermTooltip>` (issue #6). Tetap
     * dibungkus `<label htmlFor>` yang sama, jadi klik pada teksnya tetap
     * memfokuskan isian.
     */
    label?: React.ReactNode;
    error?: string;
  };

/**
 * Isian telanjang — hanya `<input>` bergaya, tanpa pembungkus label/error.
 *
 * Ini yang dipakai di dalam pola `Form` shadcn (issue #53): `FormControl`
 * (Radix `Slot`) meneruskan `id`/`aria-*` ke ANAK TUNGGAL-nya, jadi anaknya
 * harus berupa satu `<input>`, bukan `<div>` pembungkus milik `Input`
 * komposit. `Input` sendiri dibangun di atas ini agar gayanya tidak
 * bercabang.
 */
function TextInput({
  className,
  fieldSize,
  invalid,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof fieldVariants>) {
  return (
    <input
      data-slot="input"
      className={cn(fieldVariants({ invalid: Boolean(invalid), fieldSize }), className)}
      {...props}
    />
  );
}

function Input({
  className,
  label,
  error,
  id,
  fieldSize,
  invalid,
  "aria-describedby": describedBy,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const isInvalid = invalid ?? Boolean(error);

  return (
    <div className="space-y-1">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <TextInput
        id={inputId}
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

export { Input, TextInput, fieldVariants };
export type { InputProps };
