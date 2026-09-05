/**
 * Memuat daftar opsi, dan MEMBEDAKAN "kosong" dari "gagal".
 *
 * ══ Kenapa modul sekecil ini perlu ada ═════════════════════════════════════
 * Sembilan pemuat daftar di aplikasi ini ditulis dengan pola yang sama:
 *
 *     apiFetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => setX([]))
 *
 * dan pola itu MENUKAR kegagalan dengan ketiadaan. Layar tidak menampilkan
 * galat apa pun — ia menampilkan "tidak ada pilihan", yaitu kalimat yang
 * berbohong tentang isi basis data. Pengguna lalu bertindak atas kebohongan
 * itu: menambahkan pemasok yang sudah ada, membatalkan kontrak karena
 * pelanggannya "belum terdaftar", atau menyimpan dokumen tanpa pusat biaya
 * karena isiannya lenyap.
 *
 * Dilaporkan sebagai "nama pemasok tidak terbaca" pada 5 Sep 2026 — waktu itu
 * sebabnya 409 `company_required` (`fetch` telanjang, lihat `api-fetch.ts`).
 * Sebabnya sudah diperbaiki; KEBOHONGANNYA belum, dan ia akan mengulang dirinya
 * pada kegagalan berikutnya yang bentuknya berbeda: jaringan putus, 500, atau
 * izin yang dicabut di tengah sesi.
 *
 * Doktrin ini bukan hal baru di repo — `suppliers/[id]/transaction-form.tsx`
 * sudah menuliskannya sejak awal ("it must SAY it failed rather than render as
 * 'nothing outstanding'"). Yang baru hanyalah satu tempat untuk memakainya
 * bersama-sama, supaya kesembilan salinan tidak masing-masing memutuskan lagi.
 */

import { apiFetch } from "@/lib/api-fetch";

/**
 * `T[]` bila daftarnya benar-benar dibaca — termasuk daftar KOSONG, yang adalah
 * jawaban yang sah. `null` HANYA berarti gagal, dan pemanggil wajib
 * menampilkannya sebagai kegagalan, bukan sebagai daftar kosong.
 *
 * Jawaban yang BUKAN array juga dihitung gagal, dan itu disengaja: badan 409
 * `company_required` adalah sebuah objek, dan meneruskannya sebagai "data"
 * hanya memindahkan kebingungan satu lapis ke atas.
 */
export async function fetchOptionList<T>(
  url: string,
  init?: RequestInit
): Promise<T[] | null> {
  try {
    const res = await apiFetch(url, init);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as T[]) : null;
  } catch {
    // Jaringan putus, permintaan dibatalkan, atau badan yang bukan JSON.
    return null;
  }
}
