/**
 * Bentuk kamus + pencarian kuncinya.
 *
 * MURNI (tanpa React / `next/headers` / `server-only`) supaya bisa dipakai
 * server, client, dan tes sekaligus.
 *
 * `id.json` adalah SUMBER KEBENARAN bentuk kamus: tipe `Dictionary` diturunkan
 * darinya lewat `typeof import(...)` yang hanya hidup di tingkat TIPE (tak ada
 * impor runtime, jadi tak ada JSON yang ikut ke bundle mana pun). Karena
 * `server.ts` mengetik ketiga pemuat kamus sebagai `Promise<Dictionary>`, kunci
 * yang HILANG di `en.json`/`zh.json` ditolak `tsc` — dan `tests/i18n.test.ts`
 * menangkap kunci BERLEBIH yang tak terlihat oleh pemeriksaan struktural.
 */

/** Bentuk kamus, diturunkan dari kamus bahasa Indonesia. */
export type Dictionary = typeof import("./dictionaries/id.json");

/**
 * Semua jalur-titik yang sah di kamus, mis. `"nav.items.contracts"`.
 *
 * Inilah yang membuat penyapuan fase 2 aman: salah ketik kunci ditolak `tsc`,
 * bukan baru ketahuan sebagai teks aneh di layar.
 */
export type DictionaryKey = DotPaths<Dictionary>;

type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${DotPaths<T[K]>}`;
}[keyof T & string];

/** Nilai pengganti untuk `{placeholder}` di dalam teks. */
export type TranslationValues = Record<string, string | number>;

/**
 * Ambil teks untuk `key`, sisipkan `{placeholder}` bila ada.
 *
 * Kunci hilang harus BERISIK saat pengembangan (console.error) tetapi tidak
 * boleh pernah menjatuhkan halaman produksi: nilai baliknya kuncinya sendiri,
 * yang juga langsung terlihat di layar saat menyapu halaman di fase 2.
 *
 * Sengaja menerima `key: string` (bukan `DictionaryKey`): di sinilah perilaku
 * "kunci tak dikenal" hidup, jadi tes harus bisa memanggilnya dengan kunci
 * sampah. Pintu yang dipakai halaman (`useT`, `getT`) mengetatkan tipenya.
 */
export function translate(
  dictionary: Dictionary | null | undefined,
  key: string,
  values?: TranslationValues
): string {
  const raw = resolve(dictionary, key);

  if (typeof raw !== "string") {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        `[i18n] kunci terjemahan tidak ditemukan: "${key}". ` +
          "Tambahkan kunci itu ke SEMUA kamus (id/en/zh) — tests/i18n.test.ts menjaga ketiganya identik."
      );
    }
    return key;
  }

  return interpolate(raw, values);
}

/** Telusuri jalur-titik. Apa pun yang bukan string di ujungnya = tidak ketemu. */
function resolve(dictionary: unknown, key: string): unknown {
  let node: unknown = dictionary;
  for (const segment of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/**
 * Ganti `{nama}` dengan nilainya. Placeholder tanpa nilai DIBIARKAN apa adanya
 * — teks yang bocor lebih mudah dilacak daripada lubang kosong yang senyap.
 */
function interpolate(text: string, values?: TranslationValues): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}
