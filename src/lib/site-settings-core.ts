/**
 * PENGATURAN SITUS — INTI, tanpa `server-only` dan tanpa `next/cache`.
 *
 * ══ KENAPA DIPECAH DARI `site-settings.ts` ═════════════════════════════════
 * Pemecahan ini punya satu sebab yang sangat konkret: **PPN dibaca penjadwal**,
 * dan penjadwal adalah proses `tsx` DI LUAR Next (`scripts/subscription-
 * scheduler.ts`). Ia tidak bisa memuat modul ber-`server-only`, tidak punya
 * `unstable_cache`, dan membangun klien Prisma-nya sendiri dengan
 * `connectionLimit: 1`.
 *
 * Kalau sakelar PPN hanya bisa dibaca dari sisi Next, menyalakan/mematikannya
 * di panel akan mengubah apa yang DIPAJANG halaman harga tetapi TIDAK mengubah
 * nominal yang benar-benar ditagih — yaitu panel yang berbohong tentang uang.
 *
 * Preseden bentuknya sudah ada dan alasannya sama persis: `mailer.ts` vs
 * `mailer-core.ts`, dan `i18n/server.ts` vs `i18n/load.ts`.
 *
 * KLIENNYA DISUNTIKKAN, bukan diimpor: penjadwal sudah memegang kliennya
 * sendiri, dan mengimpor `lib/platform-db.ts` dari sini akan membuka pool
 * KEDUA di proses yang sengaja dibatasi satu koneksi.
 */

import { selfServeSignupOpen } from "@/lib/registration";

/** Baris pengaturan, bentuk yang dipakai kedua sisi. */
export interface SiteSettingsRow {
  contactWhatsapp: string | null;
  contactEmail: string | null;
  manualPaymentInstructions: string | null;
  selfServeSignupOpen: boolean | null;
  ppnEnabled: boolean | null;
  updatedBy: string;
  updatedAt: Date;
}

/** Seminimal yang dibutuhkan pembaca — penjadwal mengoper kliennya sendiri. */
export interface SiteSettingsReader {
  siteSetting: {
    /**
     * Kembaliannya `unknown` dengan sengaja: klien Prisma mengetik hasil
     * `select` dari bentuk objek yang DITULIS di tempat pemanggilan, dan
     * `Record<string, boolean>` di tanda tangan ini membuatnya menyimpulkan
     * `{[x: string]: never}` — tipe yang tidak pernah cocok dengan apa pun.
     * Batasnya karena itu digeser satu langkah: bentuk BARISNYA dijamin oleh
     * `PILIHAN` di bawah (ia memilih persis medan `SiteSettingsRow`, dan
     * `tsc` menolaknya bila salah satu namanya tidak ada di model), bukan oleh
     * tanda tangan ini.
     */
    findUnique: (args: {
      where: { singleton: number };
      select: Record<string, boolean>;
    }) => Promise<unknown>;
  };
}

/**
 * Medan yang dibaca. Diketik `Record<keyof SiteSettingsRow, true>` supaya nama
 * medan yang salah — atau medan baru yang lupa ditambahkan — ditolak `tsc` di
 * sini, bukan muncul sebagai `undefined` di runtime.
 */
const PILIHAN: Record<keyof SiteSettingsRow, true> = {
  contactWhatsapp: true,
  contactEmail: true,
  manualPaymentInstructions: true,
  selfServeSignupOpen: true,
  ppnEnabled: true,
  updatedBy: true,
  updatedAt: true,
};

/** Baca barisnya. Lemparan DILEMPARKAN — pemanggilnya yang memutuskan
 *  apa arti "tak terbaca" di konteksnya masing-masing. */
export async function readSiteSettingsRow(
  platform: SiteSettingsReader
): Promise<SiteSettingsRow | null> {
  const row = await platform.siteSetting.findUnique({
    where: { singleton: 1 },
    select: { ...PILIHAN },
  });
  /* Bentuknya dijamin `PILIHAN` — lihat catatan di `SiteSettingsReader`. */
  return (row as SiteSettingsRow | null) ?? null;
}

/**
 * Nilai yang BERLAKU dari satu setelan teks: `null`/tidak ada → pakai env;
 * `""`/hanya spasi → operator SENGAJA mencabutnya (env TIDAK dipakai); selain
 * itu → nilai dari basis data.
 *
 * Cabang tengahnya — "dicabut, jadi JANGAN jatuh ke env" — adalah yang paling
 * mudah hilang saat seseorang menyederhanakannya menjadi `db || env`.
 * Hilangnya akan menghidupkan kembali nomor lama di `.env` pada hari operator
 * mencabut nomor barunya.
 */
export function effectiveSetting(
  dbValue: string | null | undefined,
  envValue: string | undefined
): string | undefined {
  if (dbValue === null || dbValue === undefined) return envValue;
  const trimmed = dbValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Pendaftaran mandiri terbuka? Basis data di atas environment.
 *
 * ⚠ GAGAL-TERTUTUP DI SETIAP JALUR, dan itu satu-satunya sifat yang tidak boleh
 * hilang dari fungsi ini: baris tidak ada → env; kolom `null` → env; env tidak
 * diset / salah ketik → TERTUTUP (`selfServeSignupOpen`, `lib/registration.ts`).
 * Pemanggil yang gagal membaca basis data WAJIB mengoper `row = null`, bukan
 * menganggapnya terbuka — dan karena bawaan env sendiri tertutup, kehilangan
 * informasi tidak pernah bisa membuka corong komersial.
 */
export function signupOpenFrom(
  row: Pick<SiteSettingsRow, "selfServeSignupOpen"> | null,
  env: Record<string, string | undefined>
): boolean {
  if (row?.selfServeSignupOpen === true) return true;
  if (row?.selfServeSignupOpen === false) return false;
  return selfServeSignupOpen(env);
}

/**
 * PPN aktif di tagihan platform? Basis data di atas environment.
 *
 * Bawaannya AKTIF — `PLATFORM_PPN_DISABLED` adalah sakelar MEMATIKAN, dan
 * komentarnya sejak #141 menyebut dirinya "mekanisme untuk jawaban penasihat
 * pajak, bukan kebijakan yang kami tetapkan". Arah bawaan itu tidak berubah
 * oleh pemindahan ini: kolom `null` + env tak diset = PPN aktif.
 */
export function ppnEnabledFrom(
  row: Pick<SiteSettingsRow, "ppnEnabled"> | null,
  env: Record<string, string | undefined>
): boolean {
  if (row?.ppnEnabled === true) return true;
  if (row?.ppnEnabled === false) return false;
  return env.PLATFORM_PPN_DISABLED !== "true";
}
