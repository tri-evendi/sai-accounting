/**
 * Server-search picker (audit: truncated document pickers).
 *
 * Pemilih dokumen dulu dikirim sebagai daftar statis `take: 200/300/500` —
 * dokumen di luar tenggat itu tidak pernah bisa dipilih (retur atas faktur lama
 * mustahil dibuat). Kini pemilihnya mencari ke server: route GET yang ada diberi
 * mode `?picker=1&search=&take=` dan menjawab SATU kontrak bentuk untuk semua
 * entitas, sehingga komponen kliennya (`ServerSearchableSelect`) tidak butuh
 * pemetaan per-entitas:
 *
 *     { options: [{ value: string, label: string, hint?: string }] }
 *
 * Tanpa parameter baru, respons route TIDAK berubah sama sekali — pemanggil lama
 * tetap mendapat bentuk penuh yang sama.
 */

export interface PickerOption {
  value: string;
  label: string;
  /** Baris kedua opsional (mis. pembeli / mata uang / tanggal). */
  hint?: string;
}

export const PICKER_MAX_TAKE = 50;
export const PICKER_DEFAULT_TAKE = 20;

export interface PickerParams {
  /** `?picker=1` — jawab bentuk `{ options }`, bukan bentuk penuh route. */
  picker: boolean;
  /** Teks pencarian, sudah di-trim; string kosong = tanpa filter. */
  search: string;
  /** Batas baris (≤ 50); `undefined` bila tidak diminta — perilaku lama utuh. */
  take: number | undefined;
}

/** Baca `?search=&take=&picker=1` dengan batas aman; tanpa parameter, semua
 *  nilainya netral sehingga kueri lama tidak berubah satu byte pun. */
export function pickerParams(searchParams: URLSearchParams): PickerParams {
  const picker = searchParams.get("picker") === "1";
  const raw = parseInt(searchParams.get("take") ?? "", 10);
  const capped =
    Number.isFinite(raw) && raw > 0 ? Math.min(raw, PICKER_MAX_TAKE) : undefined;
  return {
    picker,
    search: (searchParams.get("search") ?? "").trim(),
    // Mode picker selalu berbatas — daftar tak berbatas adalah bug yang sedang
    // diperbaiki, jadi ia tidak boleh muncul kembali lewat pintu ini.
    take: picker ? (capped ?? PICKER_DEFAULT_TAKE) : capped,
  };
}
