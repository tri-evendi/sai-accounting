/**
 * TAB HALAMAN KONSOL — aturan URL-nya, MURNI (tanpa React), supaya teruji.
 *
 * Tab yang aktif hidup di URL (`?tab=<id>`, atau parameter lain bila halaman
 * sudah punya kosakata alamatnya sendiri — `/tenants` memakai `?status=`).
 * Alasannya sama dengan tampilan `?view=` di `/content` (pages/operator.md:
 * saringan lewat form GET): tautan bisa ditempel ke tiket, tombol Kembali
 * benar-benar kembali, muat ulang tidak membuang posisi, dan baris "perlu
 * perhatian" bisa menunjuk LANGSUNG ke tab yang tepat.
 *
 * Nilai yang tidak dikenal atau tidak ada → tab BAWAAN, bukan galat: alamat
 * lama yang dibagikan sebelum sebuah tab berganti nama tetap membuka halaman.
 */

/** Pilih tab aktif dari nilai parameter alamat. */
export function resolveConsoleTab<T extends string>(
  value: string | string[] | undefined,
  ids: readonly T[],
  fallback: T
): T {
  const v = Array.isArray(value) ? value[0] : value;
  return (ids as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
}

/**
 * Alamat sebuah tab. Parameter lain di alamat (`q`, saringan) DIPERTAHANKAN —
 * berpindah tab tidak boleh membuang pencarian yang sedang berjalan. Tab
 * bawaan ditulis TANPA parameternya, jadi alamat kanonik halaman tetap
 * `/settings`, bukan `/settings?tab=signup`.
 */
export function consoleTabHref(
  basePath: string,
  tabId: string,
  options: {
    defaultId: string;
    param?: string;
    keep?: Record<string, string | undefined>;
  }
): string {
  const param = options.param ?? "tab";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(options.keep ?? {})) {
    if (k !== param && v !== undefined && v !== "") params.set(k, v);
  }
  if (tabId !== options.defaultId) params.set(param, tabId);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
