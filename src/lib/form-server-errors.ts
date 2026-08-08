/**
 * Kegagalan validasi SERVER → `form.setError` (MASTER.md §Konvensi Form aturan
 * 7), untuk formulir mana pun.
 *
 * Aturan 7 berbunyi: server tetap penjaga terakhir, dan penolakannya harus
 * mendarat di ISIAN yang salah — bukan diringkas menjadi satu pita merah di
 * atas formulir, yang membuat pengguna menebak. Tetapi ia punya satu syarat
 * yang mudah terlewat: `details.fieldErrors` bisa memuat nama field yang TIDAK
 * punya isian di layar (`invoiceId` yang disuntik server dari URL, `type` yang
 * sudah ditetapkan halaman pemanggil). Menaruh galat di sana berarti pesan yang
 * tidak pernah terlihat siapa pun, dan tombol Simpan yang gagal tanpa sebab —
 * kelas kegagalan yang sama dengan yang dicatat issue #216.
 *
 * Karena itu fungsi ini menerima daftar field yang benar-benar DIRENDER: yang
 * dikenal mendarat di fieldnya, sisanya naik menjadi galat formulir (`root`),
 * tempat pengguna masih bisa membacanya.
 *
 * Pesannya sudah berbahasa pengguna saat tiba di sini (`translateFieldErrors()`
 * di route handler), jadi `FormMessage` meneruskannya apa adanya — itulah
 * cabang "bukan kunci" pada `translateMessage`.
 *
 * MURNI: tanpa React, tanpa DOM, tanpa jaringan — hanya tipe dari
 * react-hook-form. Itu yang membuat bagian formulir yang berjalan SETELAH
 * jaringan (bagian yang tak pernah tersentuh saat seseorang mencoba formulirnya
 * dengan tangan) bisa diuji langsung di `tests/`.
 */

import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/** Bentuk jawaban 400 baku route handler (lihat MASTER.md §Konvensi Form). */
export interface ServerErrorBody {
  error?: string;
  details?: { fieldErrors?: Record<string, string[] | undefined> };
}

export function applyServerFieldErrors<TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
  body: ServerErrorBody,
  /** Field yang punya isian di layar formulir ini. */
  fields: readonly Path<TFieldValues>[],
  fallback: string
): void {
  const fieldErrors = body.details?.fieldErrors ?? {};
  const onScreen = new Set<string>(fields);
  /* Galat yang menunjuk field di luar layar tidak boleh ditelan. */
  const offscreen: string[] = [];
  let placed = false;

  for (const [name, messages] of Object.entries(fieldErrors)) {
    const message = messages?.find((m) => typeof m === "string" && m.trim().length > 0);
    if (!message) continue;
    if (onScreen.has(name)) {
      setError(name as Path<TFieldValues>, { type: "server", message });
      placed = true;
    } else {
      offscreen.push(message);
    }
  }

  if (offscreen.length > 0 || !placed) {
    setError("root", { message: String(offscreen[0] || body.error || fallback) });
  }
}
