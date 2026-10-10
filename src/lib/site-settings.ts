import "server-only";

/**
 * PENGATURAN SITUS — tiga nilai yang berhenti menuntut SSH.
 *
 * KODE PENAGIHAN menurut doktrin #137 (ia mengimpor `lib/platform-db.ts`):
 * JANGAN PERNAH mengimpor berkas ini dari penjaga atau proxy.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Nomor WhatsApp, alamat surel penjualan, dan instruksi transfer manual hanya
 * hidup di environment, jadi mengubahnya berarti masuk SSH ke server produksi,
 * menyunting `.env`, lalu `docker compose up -d`. Ketiganya bukan keputusan
 * teknis — dan yang pertama memikul SELURUH corong penawaran Fase B
 * (`docs/KOMERSIALISASI.md` §7), sementara yang ketiga adalah satu-satunya
 * sebab tagihan yang terbit hari ini tidak bisa dibayar siapa pun (§1).
 *
 * ══ TIGA LAPIS, POLA `resolveMailConfig` ═══════════════════════════════════
 * Basis data → environment. Tidak ada lapis ketiga: nilai bawaan untuk nomor
 * telepon adalah "tidak ada", dan `contactChannels()` memang sudah menghilangkan
 * kanal yang nilainya tak sah alih-alih memajang tombol yang menjanjikan jalan
 * yang tidak ada.
 *
 * ⚠ NULL ≠ STRING KOSONG, dan bedanya ditegakkan di sini:
 *   • `null` di basis data = "tidak diatur dari konsol" → JATUH ke environment;
 *   • `""` = operator SENGAJA mencabut kanalnya → env TIDAK dipakai.
 * Tanpa pembedaan itu, mencabut nomor WhatsApp dari konsol akan diam-diam
 * menghidupkan kembali nomor lama yang masih tertinggal di `.env`.
 *
 * ══ GAGAL-LUNAK ════════════════════════════════════════════════════════════
 * Platform tak terjangkau → resolver memulangkan nilai ENVIRONMENT, bukan
 * menghilangkan kanal kontak dari halaman publik. Alasan yang sama dengan
 * `site-content-store.ts`: yang gagal dibaca adalah setelan pemasaran, dan
 * penagihan yang mati tidak boleh mencabut jalan menghubungi penjual.
 */

import { unstable_cache, updateTag } from "next/cache";

import { contactChannels, type ContactChannels } from "@/lib/contact-channels";
import { platformDb } from "@/lib/platform-db";
import {
  effectiveSetting,
  ppnEnabledFrom,
  readSiteSettingsRow,
  signupOpenFrom,
  type SiteSettingsRow,
} from "@/lib/site-settings-core";

/* Di-ekspor ulang supaya pemanggil lama tidak perlu tahu pemecahannya; INTI-nya
 * hidup di `site-settings-core.ts` sebab penjadwal (`tsx`, di luar Next) juga
 * membacanya dan tidak bisa memuat modul ber-`server-only`. */
export { effectiveSetting, ppnEnabledFrom, signupOpenFrom } from "@/lib/site-settings-core";
export type { SiteSettingsRow } from "@/lib/site-settings-core";

/** Tag revalidasi — satu untuk barisnya; penulisnya memanggil ini. */
export const SITE_SETTINGS_TAG = "site-settings";

/** Jaring untuk perubahan di luar jalur konsol. Lima menit, sama dengan katalog. */
const UMUR_CACHE_DETIK = 300;

async function ambilBaris(): Promise<SiteSettingsRow | null> {
  return readSiteSettingsRow(platformDb);
}

const barisTersimpan = unstable_cache(async () => ambilBaris(), ["site-settings", "row"], {
  revalidate: UMUR_CACHE_DETIK,
  tags: [SITE_SETTINGS_TAG],
});

/**
 * Baris pengaturan, atau `null` bila belum ada / platform tak terjangkau.
 *
 * Kegagalan TIDAK ikut ter-cache (lemparan ditangkap di luar pembungkus) —
 * jebakan yang sudah dicatat di `plan-catalog.ts`: satu detik platform mati
 * akan membuat halaman publik memakai nilai env selama seluruh umur cache
 * sesudah platformnya pulih.
 */
export async function siteSettings(): Promise<SiteSettingsRow | null> {
  try {
    return await barisTersimpan();
  } catch (error) {
    console.error("[site-settings] baris tak terbaca — memakai environment:", error);
    return null;
  }
}

/** Baris apa adanya untuk KONSOL — tanpa cache: layar yang baru dipakai
 *  menyimpan harus memperlihatkan apa yang BARU tersimpan. */
export async function siteSettingsForOperator(): Promise<SiteSettingsRow | null | "unreachable"> {
  try {
    return await ambilBaris();
  } catch (error) {
    console.error("[site-settings] baris tak terbaca (konsol):", error);
    return "unreachable";
  }
}

/**
 * Kanal kontak EFEKTIF — basis data di atas environment.
 *
 * Bentuk & validasinya tetap milik `contactChannels()` yang murni dan teruji
 * (`tests/contact-channels.test.ts`): nomor yang tidak sah tetap menghilangkan
 * kanalnya, dan `wa.me` tetap dibangun di satu tempat. Yang ditambahkan di sini
 * hanya SUMBER nilainya.
 */
export async function resolveContactChannels(): Promise<ContactChannels> {
  const row = await siteSettings();
  return contactChannels({
    PLATFORM_CONTACT_WHATSAPP: effectiveSetting(row?.contactWhatsapp, process.env.PLATFORM_CONTACT_WHATSAPP),
    PLATFORM_CONTACT_EMAIL: effectiveSetting(row?.contactEmail, process.env.PLATFORM_CONTACT_EMAIL),
  });
}

/** Instruksi transfer manual EFEKTIF — basis data di atas environment. */
export async function resolveManualPaymentInstructions(): Promise<string | null> {
  const row = await siteSettings();
  return (
    effectiveSetting(row?.manualPaymentInstructions, process.env.MANUAL_PAYMENT_INSTRUCTIONS) ?? null
  );
}

export interface SaveSiteSettingsInput {
  /** `null` = kembalikan ke environment; `""` = cabut kanalnya. */
  contactWhatsapp: string | null;
  contactEmail: string | null;
  manualPaymentInstructions: string | null;
  /** `null` = pakai environment; `true`/`false` = keputusan dari konsol. */
  selfServeSignupOpen: boolean | null;
  ppnEnabled: boolean | null;
  actor: string;
}

/**
 * Simpan pengaturan. Satu baris, `upsert` atas `singleton = 1`.
 *
 * `updateTag` (bukan `revalidateTag`): operator yang menyimpan lalu membuka `/`
 * untuk memeriksa nomornya harus melihat nomor BARU, bukan yang lama selama
 * lima menit. Alasan penuh — beserta batasan "hanya sah di dalam server
 * action" — ada di `site-content-store.ts`.
 */
export async function saveSiteSettings(input: SaveSiteSettingsInput): Promise<void> {
  const data = {
    contactWhatsapp: input.contactWhatsapp,
    contactEmail: input.contactEmail,
    manualPaymentInstructions: input.manualPaymentInstructions,
    selfServeSignupOpen: input.selfServeSignupOpen,
    ppnEnabled: input.ppnEnabled,
    updatedBy: input.actor,
  };
  await platformDb.siteSetting.upsert({
    where: { singleton: 1 },
    create: { singleton: 1, ...data },
    update: data,
  });
  updateTag(SITE_SETTINGS_TAG);
}

/**
 * Hapus barisnya — ketiga setelan kembali ke ENVIRONMENT.
 *
 * `deleteMany`, bukan `delete`: baris yang memang belum ada bukan galat, ia
 * maksud yang sudah terpenuhi. Dan ini satu-satunya cara mengembalikan keadaan
 * `null` (= "pakai env") setelah konsol pernah menulis, sebab formulir HTML
 * tidak bisa mengirim `null` (lihat kepala `siteSettingsSchema`).
 */
export async function resetSiteSettings(): Promise<void> {
  await platformDb.siteSetting.deleteMany({ where: { singleton: 1 } });
  updateTag(SITE_SETTINGS_TAG);
}

/**
 * Pendaftaran mandiri terbuka? — EFEKTIF (basis data di atas environment).
 *
 * ⚠ GAGAL-TERTUTUP tetap utuh: `siteSettings()` memulangkan `null` saat platform
 * tak terjangkau, dan `signupOpenFrom(null, env)` jatuh ke environment — yang
 * bawaannya TERTUTUP. Jadi basis data yang mati tidak pernah membuka corong,
 * dan juga tidak menutup corong yang sengaja dibuka lewat `.env`.
 */
export async function resolveSelfServeSignupOpen(): Promise<boolean> {
  return signupOpenFrom(await siteSettings(), process.env);
}

/**
 * PPN aktif di tagihan platform? — EFEKTIF.
 *
 * ⚠ Dipakai JALUR UANG (tagihan prorata pindah paket) dan permukaan yang
 * memajang nominal. Penjadwal memakai `ppnEnabledFrom` dari INTI dengan
 * kliennya sendiri — lihat kepala `site-settings-core.ts`.
 */
export async function resolvePpnEnabled(): Promise<boolean> {
  return ppnEnabledFrom(await siteSettings(), process.env);
}
