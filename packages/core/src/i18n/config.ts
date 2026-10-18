/**
 * Fondasi multibahasa (i18n) — konfigurasi locale.
 *
 * Modul ini MURNI: tanpa React, tanpa `next/headers`, tanpa Prisma. Ia dipakai
 * server (`server.ts`), client (`client.tsx`), server action (`actions.ts`),
 * DAN tes — jadi tidak boleh menyeret salah satu runtime.
 *
 * ── Keputusan arsitektur: locale di COOKIE, bukan segmen rute `[lang]` ──────
 * Panduan Next (`node_modules/next/dist/docs/01-app/02-guides/
 * internationalization.md`) menyarankan `app/[lang]/…` karena sasarannya situs
 * publik yang butuh URL per bahasa demi SEO. Aplikasi ini INTERNAL dan seluruh
 * halamannya di balik autentikasi: tidak ada mesin pencari yang mengindeksnya,
 * jadi bahasa di URL tidak membeli apa pun — tetapi ongkosnya besar:
 *
 *   • seluruh rute harus dipindahkan ke `app/[lang]/`,
 *   • setiap `<Link href>` harus ditulis ulang,
 *   • `src/proxy.ts` (JWT + alur wajib-ganti-kata-sandi) dan penjaga RBAC
 *     berbasis path harus paham prefiks bahasa.
 *
 * Maka bahasa disimpan di cookie `locale`, dibaca root layout di server, dan
 * struktur rute TIDAK berubah. Konsekuensi yang disadari: root layout membaca
 * `cookies()`, jadi render bersifat dinamis — aplikasi ini memang sudah dinamis
 * (sesi + izin efektif per pengguna), jadi tidak ada yang hilang.
 */

/** Bahasa yang didukung. Indonesia = sumber kebenaran makna, en/zh = terjemahannya. */
export const LOCALES = ["id", "en", "zh"] as const;

export type Locale = (typeof LOCALES)[number];

/** Bahasa bawaan bila cookie kosong dan `Accept-Language` tak menolong. */
export const DEFAULT_LOCALE: Locale = "id";

/** Nama cookie penyimpan pilihan bahasa. */
export const LOCALE_COOKIE = "locale";

/** Umur cookie bahasa: satu tahun — pilihan bahasa bukan data sesi. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Nama bahasa DALAM BAHASANYA SENDIRI. Pengguna yang tersasar ke bahasa yang
 * tidak ia mengerti harus tetap bisa menemukan bahasanya sendiri di daftar —
 * "Bahasa Indonesia" tidak boleh muncul sebagai "Indonesian" saat UI berbahasa
 * Mandarin.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
  zh: "中文",
};

/** Penyempit tipe: `unknown` → `Locale`. Dipakai di cookie, action, dan tes. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

interface AcceptLanguageEntry {
  tag: string;
  quality: number;
  /** Urutan kemunculan — pemutus seri untuk bobot q yang sama. */
  index: number;
}

/**
 * Negosiasi `Accept-Language` (RFC 9110 §12.5.4) — ditulis tangan, tanpa
 * dependensi (`negotiator`/`@formatjs/intl-localematcher` yang dicontohkan
 * dokumen Next tidak dipasang, dan tiga bahasa tidak sebanding dengan dua paket
 * baru).
 *
 * Aturannya:
 *   • bobot `q` menentukan urutan; seri diputus oleh urutan kemunculan;
 *   • `q=0` berarti "tidak diterima" → entrinya dibuang;
 *   • kecocokan persis dulu (`en`), lalu subtag utama (`zh-Hans-CN` → `zh`);
 *   • `*` berarti "apa saja" → bahasa bawaan;
 *   • header kosong/rusak → bahasa bawaan, tidak pernah melempar.
 *
 * Catatan: `zh-TW`/`zh-Hant` ikut dipetakan ke `zh` (Hans, daratan Tiongkok) —
 * hanya Mandarin Sederhana yang tersedia, dan itu lebih baik daripada jatuh ke
 * bahasa Indonesia untuk pembaca Mandarin.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const entries: AcceptLanguageEntry[] = [];
  header.split(",").forEach((part, index) => {
    const [rawTag, ...params] = part.trim().split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!tag) return;

    let quality = 1;
    for (const param of params) {
      const match = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(param);
      if (match) quality = Number(match[1]);
    }
    // q rusak (NaN), q=0 ("tidak diterima"), atau di luar rentang → abaikan.
    if (!Number.isFinite(quality) || quality <= 0 || quality > 1) return;

    entries.push({ tag, quality, index });
  });

  entries.sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { tag } of entries) {
    if (tag === "*") return DEFAULT_LOCALE;
    if (isLocale(tag)) return tag;
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }

  return DEFAULT_LOCALE;
}
