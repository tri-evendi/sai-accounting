"use client";

/**
 * PasswordInput — isian sandi dengan tombol perlihatkan/sembunyikan.
 *
 * Ikut dirapikan di issue #50: gayanya tidak lagi menyalin kelas isian, tetapi
 * memakai `fieldVariants` yang sama dengan `Input`/`Select`, jadi ketiganya
 * tidak bisa lagi berbeda tinggi atau warna diam-diam. Pesan error terhubung
 * ke isiannya (`aria-invalid` + `aria-describedby` -> `role="alert"`), seperti
 * `Input`.
 *
 * Label tombol matanya berbahasa Indonesia — app ini Indonesia-first.
 *
 * ── Dua lapis, seperti `TextInput`/`Input` ────────────────────────────────
 * `PasswordField` adalah lapis TELANJANG (isian + tombol mata, tanpa
 * label/error) yang dipakai di dalam pola `Form` shadcn; `PasswordInput`
 * membungkusnya dengan label & pesan error untuk pemakaian di luar `Form`.
 * Pemisahannya mengikuti alasan yang sama dengan `TextInput` (MASTER.md
 * §Konvensi Form aturan 4): `FormControl` adalah Radix `Slot` yang menyalurkan
 * `id`/`aria-*` ke anak TUNGGAL-nya, jadi anaknya tidak boleh berupa `<div>`
 * pembungkus — atribut itu akan mendarat di pembungkusnya, bukan di isian yang
 * dimaksud, dan pautan label–error diam-diam putus.
 */

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { fieldVariants } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PasswordFieldProps = Omit<React.ComponentProps<"input">, "size" | "type"> & {
  invalid?: boolean;
};

type PasswordInputProps = Omit<React.ComponentProps<"input">, "size" | "type"> & {
  label?: React.ReactNode;
  error?: string;
};

/**
 * Isian sandi telanjang. Semua prop yang diterima diteruskan ke `<input>` di
 * dalamnya — termasuk `id` dan `aria-*` yang dialirkan `FormControl`.
 */
function PasswordField({ className, invalid, disabled, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        data-slot="input"
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn(fieldVariants({ invalid: Boolean(invalid) }), "pr-10", className)}
        {...props}
      />
      {/* `tabIndex={-1}` disengaja: urutan Tab tetap isian → isian berikutnya,
          tidak disela tombol bantu. Tetap terjangkau lewat klik/sentuh, dan
          bukan satu-satunya jalan (isiannya sendiri bisa diketik & dibaca
          pembaca layar). */}
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none disabled:pointer-events-none"
        aria-label={visible ? "Sembunyikan sandi" : "Perlihatkan sandi"}
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden />
        ) : (
          <Eye className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

function PasswordInput({
  className,
  label,
  error,
  id,
  disabled,
  "aria-describedby": describedBy,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-1">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <PasswordField
        id={inputId}
        disabled={disabled}
        invalid={Boolean(error)}
        aria-invalid={error ? true : undefined}
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

export { PasswordInput, PasswordField };
export type { PasswordInputProps, PasswordFieldProps };
