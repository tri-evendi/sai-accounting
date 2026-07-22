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
 */

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { fieldVariants } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "size" | "type"> & {
  label?: React.ReactNode;
  error?: string;
};

function PasswordInput({
  className,
  label,
  error,
  id,
  disabled,
  "aria-describedby": describedBy,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-1">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <div className="relative">
        <input
          data-slot="input"
          id={inputId}
          type={visible ? "text" : "password"}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(describedBy, error && errorId) || undefined}
          className={cn(fieldVariants({ invalid: Boolean(error) }), "pr-10", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-muted-foreground hover:text-foreground disabled:pointer-events-none"
          aria-label={visible ? "Sembunyikan sandi" : "Perlihatkan sandi"}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export { PasswordInput };
export type { PasswordInputProps };
