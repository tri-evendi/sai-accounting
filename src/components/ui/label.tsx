/**
 * Label — `<label>` biasa (issue #187, fase B1; sebelumnya Radix Label).
 *
 * ── Kenapa primitif ini TIDAK merender komponen AntD ──────────────────────
 * Karena AntD tidak punya satu pun. Di AntD label bukan komponen melainkan
 * PROP: `Form.Item label`. Menariknya ke sini sekarang berarti memutuskan
 * bentuk lapisan formulir lebih dulu — dan itu justru keputusan yang sedang
 * ditimbang di issue #192 (RHF + zod sebagai mesin, AntD sebagai kulit).
 * Menebaknya di B1 berarti menulis ulang keempat pemakainya dua kali.
 *
 * Jadi yang dilakukan di sini hanya melepas Radix. Yang hilang bersamanya
 * praktis tidak ada: `<label htmlFor>` native sudah memfokuskan kontrolnya saat
 * diklik, termasuk ketika labelnya berisi elemen lain (mis. `TermTooltip`), dan
 * pencegahan seleksi teks pada klik ganda sudah ditangani `select-none`.
 *
 * Yang DIDAPAT sepadan: berkas ini berhenti menjadi modul `"use client"`.
 * Sebelumnya ia menyeret Radix menyeberangi batas client hanya untuk merender
 * satu `<label>` — dan ia dipakai `Input`, `Select`, dan `PasswordInput`, yaitu
 * dasar hampir setiap formulir.
 *
 * Kelas Tailwind-nya sengaja dibiarkan: tanpa komponen AntD di bawahnya tidak
 * ada token komponen untuk menggantikannya, dan menyalakan `theme.useToken()`
 * di sini akan mengembalikan berkas ini menjadi modul client demi tiga
 * deklarasi gaya. Keduanya lenyap bersama Tailwind di issue #203.
 */

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-1 text-sm font-medium text-foreground select-none",
        "group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Label };
