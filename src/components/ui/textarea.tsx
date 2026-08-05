"use client";

/**
 * Textarea (ditulis ulang di atas AntD `Input.TextArea` pada issue #188).
 *
 * Tetap TELANJANG — satu `<textarea>`, tanpa label/error sendiri — supaya bisa
 * jadi anak tunggal `FormControl` (MASTER.md §Konvensi Form aturan 4). AntD
 * merender `<textarea class="ant-input">` langsung selama `showCount`/
 * `allowClear` tidak dipakai; begitu salah satunya dipasang, ia menyisipkan
 * `<span>` pembungkus dan syarat "anak tunggal" itu patah.
 *
 * ── Yang berubah untuk pemanggil ──────────────────────────────────────────
 * Berkas ini dulu SATU-SATUNYA primitif isian yang bukan modul client (ia hanya
 * `<textarea>` + kelas Tailwind, jadi bisa dirender di server). Sekarang ia
 * client, karena komponen AntD adalah komponen client — itu +1 pada
 * `AMBANG_KLIEN` di `tests/rsc-boundary.test.ts`, dan satu-satunya kenaikan
 * dari issue ini. Ketujuh pemanggilnya sudah komponen client, jadi tidak ada
 * halaman yang ikut tertarik menyeberang.
 *
 * `ref` kini `TextAreaRef` AntD, bukan `HTMLTextAreaElement` — elemennya
 * terjangkau lewat `ref.current.resizableTextArea?.textArea`.
 */

import { Input } from "antd";

import { isInvalidField } from "@/components/ui/input";

/** `TextAreaRef` AntD — tidak diekspor dari akar paket, jadi diambil dari komponennya. */
type TextareaRef = React.ComponentRef<typeof Input.TextArea>;

type TextareaProps = Omit<React.ComponentProps<"textarea">, "ref" | "size"> & {
  invalid?: boolean | null;
  ref?: React.Ref<TextareaRef>;
};

function Textarea({ invalid, ...props }: TextareaProps) {
  /*
   * Versi Tailwind menyalakan gaya error lewat `aria-[invalid=true]:` — sebuah
   * selektor CSS. AntD memakai prop `status`, jadi atribut yang disuntik
   * `FormControl` harus dibaca di JavaScript; kalau tidak, isian yang ditolak
   * validasi kembali jadi error yang hanya terdengar, tidak terlihat.
   */
  const isInvalid = isInvalidField(invalid, props["aria-invalid"]);

  return (
    <Input.TextArea
      data-slot="textarea"
      status={isInvalid ? "error" : undefined}
      {...props}
      aria-invalid={isInvalid || undefined}
    />
  );
}

export { Textarea };
export type { TextareaProps, TextareaRef };
