import "server-only";

/**
 * ISI HALAMAN PENDARATAN — sisi BASIS DATAnya (tabel `site_contents`).
 *
 * KODE PENAGIHAN menurut doktrin #137: bersama `operator/store.ts`,
 * `subscription-store.ts`, dan `plan-catalog.ts`, jenis modul yang boleh
 * mengimpor `lib/platform-db.ts`. JANGAN PERNAH mengimpornya dari penjaga atau
 * proxy — dan jangan pernah mengimpor BERKAS INI dari sana.
 *
 * ══ GAGAL-LUNAK, BUKAN GAGAL-TERTUTUP ═════════════════════════════════════
 * Di hampir seluruh repo ini "gagal" berarti "tolak" (penjaga, kuota, konteks
 * perusahaan). Di sini justru sebaliknya, dan bedanya perlu dinyatakan: yang
 * gagal dibaca adalah KALIMAT PEMASARAN. Platform yang mati karena itu berarti
 * halaman pendaratan kembali ke kalimat bawaan dari kamus — bukan halaman
 * pendaratan yang memulangkan 500 kepada setiap pengunjung dan setiap perayap.
 *
 * Tidak ada keputusan keamanan maupun uang yang bergantung pada tabel ini. Satu
 * kalimat yang tertinggal lima menit adalah harga yang jelas lebih murah
 * daripada permukaan penjualan yang ikut mati bersama basis data penagihan.
 *
 * ══ CACHE: QUERYNYA, BUKAN HALAMANNYA (pola `plan-catalog.ts`) ═════════════
 * `/` adalah `force-dynamic` dan harus tetap begitu (ia memanggil `auth()`
 * untuk memantulkan pengunjung bersesi). Tanpa cache, SETIAP kunjungan anonim —
 * termasuk setiap kunjungan perayap — menarik seluruh penimpa dari basis data
 * platform. Yang di-cache karena itu querynya; pemantulan bersesi tetap
 * berjalan per permintaan.
 *
 * Penyimpanan dari konsol memanggil `updateTag`, jadi perubahan terlihat
 * SEKETIKA — umur cache di bawah hanyalah jaring untuk perubahan yang terjadi
 * di luar jalur itu (SQL langsung, pemulihan cadangan).
 *
 * ⚠ KEGAGALAN TIDAK IKUT TER-CACHE: lemparan ditangkap DI LUAR pembungkus
 * cache. Kalau `{}` hasil kegagalan masuk ke cache, satu detik platform tak
 * terjangkau akan memaksa halaman pendaratan memakai kalimat bawaan selama
 * seluruh umur cache sesudah platformnya pulih — jebakan yang sama yang sudah
 * dicatat di `plan-catalog.ts`.
 */

import { unstable_cache, updateTag } from "next/cache";

import type { Locale } from "@/lib/i18n/config";
import { platformDb } from "@/lib/platform-db";
import {
  SITE_CONTENT_PREFIX,
  SITE_CONTENT_VALUE_MAX,
  isSiteContentLocale,
} from "@/lib/site-content";

/** Tag revalidasi — satu untuk seluruh tabel; penulisnya memanggil ini. */
export const SITE_CONTENT_TAG = "site-content";

/** Jaring untuk perubahan di luar jalur konsol. Lima menit, sama dengan katalog. */
const UMUR_CACHE_DETIK = 300;

export interface SiteContentRow {
  key: string;
  value: string;
  updatedBy: string;
  updatedAt: Date;
}

async function ambilPenimpa(locale: Locale): Promise<Record<string, string>> {
  const rows = await platformDb.siteContent.findMany({
    where: { locale },
    select: { key: true, value: true },
  });
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

const penimpaTersimpan = unstable_cache(
  async (locale: Locale) => ambilPenimpa(locale),
  ["site-content", "published"],
  { revalidate: UMUR_CACHE_DETIK, tags: [SITE_CONTENT_TAG] }
);

/**
 * Penimpa untuk satu bahasa, atau `{}` bila platform tak terjangkau.
 *
 * `{}` dan bukan `null`: pemanggilnya (`lib/i18n/server.ts`) tidak punya cabang
 * "tidak terjangkau" untuk ditampilkan — ia hanya merender kamus. Objek kosong
 * ADALAH jawaban yang benar, yaitu "tidak ada yang diganti".
 */
export async function publishedSiteContent(locale: Locale): Promise<Record<string, string>> {
  try {
    return await penimpaTersimpan(locale);
  } catch (error) {
    console.error("[site-content] penimpa tak terbaca — memakai kamus bawaan:", error);
    return {};
  }
}

/**
 * Baris penimpa lengkap (beserta siapa & kapan) untuk KONSOL — tanpa cache.
 *
 * Sengaja tidak ikut cache di atas: layar yang baru saja dipakai menyimpan
 * harus memperlihatkan apa yang BARU tersimpan, bukan apa yang tersimpan lima
 * menit lalu. `null` = platform tak terjangkau; halaman mengatakannya sebagai
 * kalimat, bukan sebagai 500.
 */
export async function siteContentForOperator(locale: Locale): Promise<SiteContentRow[] | null> {
  try {
    return await platformDb.siteContent.findMany({
      where: { locale },
      orderBy: { key: "asc" },
      select: { key: true, value: true, updatedBy: true, updatedAt: true },
    });
  } catch (error) {
    console.error("[site-content] daftar penimpa tak terbaca:", error);
    return null;
  }
}

export interface SaveSiteContentInput {
  locale: Locale;
  /** Kunci → nilai. Nilai KOSONG berarti "kembalikan ke bawaan" (baris dihapus). */
  entries: Record<string, string>;
  /** Nama akun operator — tersimpan di baris DAN di jejak audit. */
  actor: string;
}

export interface SaveSiteContentResult {
  /** Kunci yang nilainya ditulis/diperbarui. */
  updated: string[];
  /** Kunci yang barisnya dihapus — kembali memakai kalimat bawaan. */
  reset: string[];
}

/**
 * Simpan penimpa untuk satu bahasa.
 *
 * ══ KOSONG = KEMBALI KE BAWAAN, DAN ITU SATU-SATUNYA JALANNYA ══════════════
 * Tidak ada aksi "reset" tersendiri, dan itu disengaja: dua jalur tulis untuk
 * satu maksud berarti dua tempat yang harus sama-sama benar soal apa yang
 * dicatat di jejak audit dan apa yang direvalidasi. Mengosongkan kolom lalu
 * menyimpan sudah merupakan bentuk yang paling jujur — dan ia juga yang
 * mencegah baris berisi `""` masuk ke basis data, yaitu penimpa yang akan
 * menghapus satu kalimat dari halaman tanpa bersuara.
 *
 * ⚠ Pemanggil WAJIB sudah memvalidasi kuncinya (`isEditableContentKey`).
 * Fungsi ini menegakkan bentuk yang tidak butuh kamus — bahasa yang dikenal dan
 * panjang nilai — tetapi ia TIDAK bisa tahu kunci mana yang ada di kamus tanpa
 * memuat kamusnya, dan memuat kamus di dalam jalur tulis basis data adalah
 * ketergantungan yang tidak dibutuhkan siapa pun di sini.
 */
export async function saveSiteContent(
  input: SaveSiteContentInput
): Promise<SaveSiteContentResult> {
  if (!isSiteContentLocale(input.locale)) {
    throw new Error(`[site-content] bahasa tidak dikenal: ${input.locale}`);
  }

  const updated: string[] = [];
  const reset: string[] = [];

  for (const [key, raw] of Object.entries(input.entries)) {
    if (!key.startsWith(SITE_CONTENT_PREFIX)) continue;
    /* Spasi di tepi dibuang: penimpa yang isinya hanya spasi adalah kalimat
       yang hilang, bukan kalimat yang diganti. */
    const value = typeof raw === "string" ? raw.trim() : "";

    if (value.length === 0) {
      /* `deleteMany`, bukan `delete`: baris yang memang belum ada bukan galat —
         ia maksud yang sudah terpenuhi. */
      const hasil = await platformDb.siteContent.deleteMany({
        where: { locale: input.locale, key },
      });
      if (hasil.count > 0) reset.push(key);
      continue;
    }

    if (value.length > SITE_CONTENT_VALUE_MAX) {
      throw new Error(`[site-content] nilai terlalu panjang untuk ${key}`);
    }

    /* `upsert` atas UNIQUE (locale, content_key) — idempotensi ditegakkan basis
       data, bukan periksa-lalu-tulis: dua operator yang menyimpan bersamaan
       menghasilkan satu baris, bukan dua kebenaran tentang kalimat yang sama. */
    await platformDb.siteContent.upsert({
      where: { locale_key: { locale: input.locale, key } },
      create: { locale: input.locale, key, value, updatedBy: input.actor },
      update: { value, updatedBy: input.actor },
    });
    updated.push(key);
  }

  if (updated.length > 0 || reset.length > 0) {
    /*
     * Halaman pendaratan berubah SEKETIKA — bukan setelah umur cache habis.
     * Operator yang menyimpan lalu membuka `/` untuk memeriksanya harus melihat
     * hasil suntingannya, bukan versi sebelumnya.
     *
     * `updateTag`, BUKAN `revalidateTag`: di Next versi terpasang yang kedua
     * menuntut profil `cacheLife` sebagai argumen kedua dan memberi semantik
     * "sajikan yang basi dulu, segarkan di belakang" — benar untuk katalog
     * produk, salah untuk layar yang baru saja dipakai menyimpan. `updateTag`
     * memberi read-your-writes: kedaluwarsa + segar dalam permintaan yang sama.
     *
     * ⚠ Harganya satu batasan yang harus dinyatakan: `updateTag` hanya sah
     * DI DALAM server action. Hari ini jalur tulis ini memang hanya punya satu
     * pemanggil (`operator/content/actions.ts`); skrip CLI yang kelak menulis
     * tabel ini harus memanggil `saveSiteContent` dari sebuah action, atau
     * memindahkan baris ini ke pemanggilnya.
     */
    updateTag(SITE_CONTENT_TAG);
  }

  return { updated, reset };
}
