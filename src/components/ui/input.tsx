"use client";

/**
 * Input (issue #50, ditulis ulang di atas AntD pada issue #188).
 *
 * API pemanggilnya TIDAK berubah — 69 berkas yang mengimpor berkas ini tidak
 * disentuh di fase B: `label`, `error`, `invalid`, `fieldSize`, dan seluruh
 * atribut `<input>` native tetap diterima. Yang berganti hanya kulitnya: rupa,
 * tinggi, warna batas, dan gaya fokus kini datang dari token AntD
 * (`lib/theme/antd-tokens.ts`), bukan dari `fieldVariants` CVA yang sudah
 * dihapus di sini.
 *
 * ── Dua lapis, dan kenapa keduanya harus tetap ada ────────────────────────
 * `TextInput` TELANJANG (satu `<input>`, tanpa label/error) dan `Input`
 * KOMPOSIT (label + pesan error sendiri). Pemisahan itu bukan gaya: `FormControl`
 * (Radix `Slot`) menyalurkan `id`/`aria-*` ke anak TUNGGAL-nya, jadi isian di
 * dalam pola `Form` wajib berupa satu kontrol, bukan `<div>` pembungkus. Kalau
 * keduanya dilebur sekarang, atribut itu mendarat di pembungkus dan pautan
 * label–error putus tanpa satu pun galat. Peleburan ke `Form.Item` AntD adalah
 * keputusan tersendiri (issue #192), bukan efek samping migrasi kulit.
 *
 * ── Yang TIDAK ikut pindah ke AntD, dengan sengaja ────────────────────────
 * Pesan error komposit tetap `<p className="text-sm text-destructive">`, bukan
 * `token.colorError`. Alasannya terukur dan sudah tertulis di
 * `lib/theme/antd-tokens.ts`: `colorError` terang berkontras 3,27:1 sebagai
 * TEKS — di bawah 4,5:1 untuk huruf 14px. Menukar teks error yang sekarang
 * lolos AA dengan token AntD berarti memundurkan aksesibilitas demi keseragaman
 * yang belum diputuskan siapa pun. Warna error pada KOTAK isiannya sendiri
 * tetap milik AntD (`status="error"`), karena di sana ambangnya 3:1 non-teks.
 *
 * ── `ref` ─────────────────────────────────────────────────────────────────
 * `InputRef` AntD, bukan `HTMLInputElement` — konsekuensi nyata dari pindah ke
 * `Input` AntD, sama seperti `MoneyInput` di #186. Elemennya tetap terjangkau
 * lewat `ref.current.input`, dan `focus()`/`blur()`/`select()` ada langsung di
 * `InputRef` (itu yang dipakai `react-hook-form` untuk memfokuskan isian
 * pertama yang gagal validasi).
 */

import { useId } from "react";
import { Input as AntdInput, type InputRef } from "antd";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Ukuran kontrol. `md` = bawaan provider (`controlHeight: 40`, target sentuh
 * MASTER.md); `sm` = `size="small"` AntD untuk tempat yang memang bukan target
 * sentuh (sel tabel, baris filter padat).
 */
type FieldSize = "md" | "sm";

/** `md` sengaja memetakan ke `undefined`: biarkan token provider yang menentukan. */
function antdSize(fieldSize: FieldSize | null | undefined) {
  return fieldSize === "sm" ? ("small" as const) : undefined;
}

/**
 * `FormControl` menyuntikkan `aria-invalid` (pola `Form` shadcn), sedangkan
 * pemanggil di luar pola itu memakai prop `invalid`. Keduanya harus dibaca —
 * kalau hanya `invalid` yang dilihat, isian yang ditolak react-hook-form
 * mengumumkan dirinya ke pembaca layar tapi garisnya tetap netral: error yang
 * hanya terdengar, tidak terlihat (bug yang sama sudah ditutup di #186).
 */
function isInvalidField(
  invalid: boolean | null | undefined,
  ariaInvalid: React.AriaAttributes["aria-invalid"]
): boolean {
  return Boolean(invalid) || ariaInvalid === true || ariaInvalid === "true";
}

type BareFieldProps = {
  fieldSize?: FieldSize | null;
  invalid?: boolean | null;
};

type TextInputProps = Omit<React.ComponentProps<"input">, "size" | "prefix" | "ref"> &
  BareFieldProps & { ref?: React.Ref<InputRef> };

type InputProps = Omit<React.ComponentProps<"input">, "size" | "prefix" | "ref"> &
  BareFieldProps & {
    /**
     * ReactNode, bukan string, supaya label boleh membawa bantuan kontekstual —
     * mis. `<TermTooltip term="kurs">Kurs</TermTooltip>` (issue #6). Tetap
     * dibungkus `<label htmlFor>` yang sama, jadi klik pada teksnya tetap
     * memfokuskan isian.
     */
    label?: React.ReactNode;
    error?: string;
    ref?: React.Ref<InputRef>;
  };

/**
 * Isian telanjang — satu `<input>` bergaya AntD, tanpa pembungkus label/error.
 * Ini yang dipakai di dalam `FormControl` (MASTER.md §Konvensi Form aturan 4).
 *
 * Tanpa `prefix`/`suffix`/`allowClear`, AntD merender `<input class="ant-input">`
 * apa adanya — tanpa `<span>` pembungkus. `id` dan `aria-*` mendarat di `<input>`
 * dalam kedua bentuk (itu yang membuat `PasswordField`, yang SELALU punya suffix,
 * tetap benar pautannya), tetapi `className` berpindah ke pembungkus begitu
 * affix muncul. Karena 69 pemanggil mengoper `className` untuk mengatur lebar
 * isian, bentuk telanjang di sini dijaga tetap telanjang.
 */
function TextInput({ fieldSize, invalid, ...props }: TextInputProps) {
  const isInvalid = isInvalidField(invalid, props["aria-invalid"]);

  return (
    <AntdInput
      data-slot="input"
      size={antdSize(fieldSize)}
      status={isInvalid ? "error" : undefined}
      {...props}
      aria-invalid={isInvalid || undefined}
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
  // Tanda wajib mengikuti atribut `required` native yang diteruskan pemanggil —
  // satu sumber, tak bisa menyimpang dari validasi HTML/zod (a11y: MASTER.md).
  const required = props.required;

  return (
    <div className="space-y-1">
      {label && (
        <Label htmlFor={inputId}>
          {label}
          {required && (
            <>
              <span aria-hidden="true" className="ml-0.5 text-destructive">
                *
              </span>
              <span className="sr-only"> (wajib)</span>
            </>
          )}
        </Label>
      )}
      <TextInput
        id={inputId}
        fieldSize={fieldSize}
        invalid={isInvalid}
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

export { Input, TextInput, antdSize, isInvalidField };
export type { InputProps, TextInputProps, FieldSize, BareFieldProps };
