"use client";

/**
 * PasswordInput (issue #50, ditulis ulang di atas AntD `Input.Password` pada
 * issue #188) — isian sandi dengan tombol perlihatkan/sembunyikan.
 *
 * ── Tombol matanya dibuang, dan itu MENAIKKAN aksesibilitas ───────────────
 * Implementasi manual sebelumnya memasang `tabIndex={-1}` pada tombolnya
 * "supaya urutan Tab tidak disela". Akibatnya pengguna papan ketik — termasuk
 * yang memakai pembaca layar — tidak punya cara sama sekali untuk memeriksa
 * sandi yang sudah diketik; tombol itu hanya ada untuk tetikus dan sentuhan.
 * Tombol bawaan AntD sebaliknya: `role="button"`, `tabIndex={0}`,
 * `aria-pressed` yang mengumumkan keadaan sekarang, penanganan Enter/Spasi, dan
 * `aria-label` yang IKUT BERGANTI BAHASA lewat `ConfigProvider`
 * ("Tampilkan"/"Sembunyikan" di id, dan padanannya di en/zh) — sebelumnya label
 * itu literal bahasa Indonesia di aplikasi trilingual.
 *
 * Yang hilang: satu perhentian Tab tambahan per isian sandi. Itu memang harga
 * yang dulu sengaja dihindari, tapi menukar "bisa dijangkau papan ketik" dengan
 * "urutan Tab lebih pendek" adalah pertukaran yang salah arah; pola WAI-ARIA
 * untuk tombol di dalam isian memang menempatkannya di urutan Tab.
 *
 * ── Dua lapis, seperti `TextInput`/`Input` ────────────────────────────────
 * `PasswordField` TELANJANG (isian + tombol mata, tanpa label/error) untuk
 * dipakai di dalam `FormControl`; `PasswordInput` membungkusnya dengan label &
 * pesan error. `FormControl` (Radix `Slot`) menyalurkan `id`/`aria-*` ke anak
 * TUNGGAL-nya — dan `Input.Password` meneruskan keduanya ke `<input>` di
 * dalamnya, bukan ke `affix-wrapper`-nya, jadi pautan label–error tetap
 * menunjuk isian yang benar.
 */

import { Input, type InputRef } from "antd";

import { isInvalidField } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useId } from "react";
import { cn } from "@/lib/utils";

type PasswordFieldProps = Omit<
  React.ComponentProps<"input">,
  "size" | "type" | "prefix" | "ref"
> & {
  invalid?: boolean | null;
  ref?: React.Ref<InputRef>;
};

type PasswordInputProps = PasswordFieldProps & {
  label?: React.ReactNode;
  error?: string;
};

/**
 * Isian sandi telanjang. Semua prop yang diterima diteruskan ke `<input>` di
 * dalamnya — termasuk `id` dan `aria-*` yang dialirkan `FormControl`.
 */
function PasswordField({ invalid, ...props }: PasswordFieldProps) {
  const isInvalid = isInvalidField(invalid, props["aria-invalid"]);

  return (
    <Input.Password
      data-slot="input"
      status={isInvalid ? "error" : undefined}
      {...props}
      aria-invalid={isInvalid || undefined}
    />
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
