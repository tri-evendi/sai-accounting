import "server-only";

/**
 * TAMPILAN HALAMAN DEPAN — pembaca & penulis (tabel `landing_settings`,
 * migration platform 0014; konsol `/landing`).
 *
 * Aturan sahnya hidup di INTI murni `@sai/core/landing-settings`; berkas ini
 * hanya menambahkan SUMBER (basis data platform), cache, dan sinyal.
 *
 * ══ GAGAL-LUNAK = PERILAKU HARI INI ═══════════════════════════════════════
 * Platform tak terjangkau → `DEFAULT_LANDING_SETTINGS`: semua seksi tampil,
 * "Jadwalkan demo" menuju `/register`, tanpa bilah pengumuman, FAQ dari kamus.
 * Persis halaman sebelum tabel ini ada — setelan pemasaran yang gagal dibaca
 * tidak boleh mengubah, apalagi menjatuhkan, halaman publik.
 *
 * ══ CACHE: POLA `site-settings.ts` ═══════════════════════════════════════
 * `unstable_cache` dengan versi sinyal `landing-settings` sebagai bagian
 * kunci. Penulisnya `app-operator`, pembacanya `app-customer`; sinyal yang
 * membawa perubahan ke proses lain dalam `CACHE_SIGNAL_POLL_SECONDS`, umur
 * cache 300 detik sebagai jaring. Kegagalan tidak ikut ter-cache.
 */

import { unstable_cache } from "next/cache";

import { bumpCacheSignal, cacheSignalVersion } from "@sai/platform/cache-signals";
import { platformDb } from "@sai/platform/platform-db";
import { resolveContactChannels } from "@sai/platform/site-settings";
import type { Locale } from "@sai/core/i18n/config";
import {
  DEFAULT_LANDING_SETTINGS,
  landingSettingsFromRow,
  localizedText,
  whatsappUrlWithText,
  type LandingAnnouncement,
  type LandingFaqItem,
  type LandingSectionKey,
  type LandingSettings,
  type LandingSettingsRow,
  type LocalizedText,
} from "@sai/core/landing-settings";

export const LANDING_SETTINGS_TAG = "landing-settings";
const UMUR_CACHE_DETIK = 300;

const PILIHAN = {
  hiddenSectionsJson: true,
  demoBookingUrl: true,
  whatsappMessageJson: true,
  announcementJson: true,
  faqItemsJson: true,
  updatedBy: true,
  updatedAt: true,
} as const satisfies Record<keyof LandingSettingsRow, true>;

async function ambilBaris(): Promise<LandingSettingsRow | null> {
  return platformDb.landingSetting.findUnique({ where: { singleton: 1 }, select: PILIHAN });
}

const barisTersimpan = unstable_cache(
  /* `versi` hanya bagian kunci cache — lihat `site-settings.ts`. */
  async (versi: number) => {
    void versi;
    return ambilBaris();
  },
  ["landing-settings", "row", "signal"],
  { revalidate: UMUR_CACHE_DETIK, tags: [LANDING_SETTINGS_TAG] }
);

/**
 * Setelan EFEKTIF untuk halaman publik. Tidak pernah melempar: platform mati,
 * tabel belum dimigrasikan, atau `PLATFORM_DATABASE_URL` kosong (build CI,
 * tes) → bawaan.
 */
export async function landingSettings(): Promise<LandingSettings> {
  try {
    const versi = (await cacheSignalVersion(platformDb, "landing-settings")) ?? -1;
    return landingSettingsFromRow(await barisTersimpan(versi));
  } catch (error) {
    console.error("[landing-settings] baris tak terbaca — memakai tampilan bawaan:", error);
    return DEFAULT_LANDING_SETTINGS;
  }
}

/** Untuk KONSOL — tanpa cache, dan "tak terjangkau" dibedakan dari "kosong". */
export async function landingSettingsForOperator(): Promise<
  { row: LandingSettingsRow | null; settings: LandingSettings } | "unreachable"
> {
  try {
    const row = await ambilBaris();
    return { row, settings: landingSettingsFromRow(row) };
  } catch (error) {
    console.error("[landing-settings] baris tak terbaca (konsol):", error);
    return "unreachable";
  }
}

/**
 * Tautan WhatsApp EFEKTIF untuk pendaratan & halaman kontak: nomor dari
 * `resolveContactChannels()` (satu sakelar untuk seluruh app), kalimat pembuka
 * dari setelan ini dalam bahasa pembaca. Tanpa nomor sah = `undefined`.
 *
 * ⚠ SENGAJA bukan di `resolveContactChannels()`: kanal itu juga dipakai
 * permukaan tagihan yang menyusun `?text=`-nya sendiri (`billing-actions.tsx`).
 */
export async function resolveLandingWhatsappUrl(locale: Locale): Promise<string | undefined> {
  const [kanal, setelan] = await Promise.all([resolveContactChannels(), landingSettings()]);
  if (kanal.whatsappUrl === undefined) return undefined;
  const teks = setelan.whatsappMessage ? localizedText(setelan.whatsappMessage, locale) : null;
  return whatsappUrlWithText(kanal.whatsappUrl, teks);
}

/* ── Penulis ──────────────────────────────────────────────────────────────── */

/** Medan yang bisa ditulis — SATU formulir menulis SATU kelompok medan. */
export interface LandingSettingsPatch {
  hiddenSections?: LandingSectionKey[];
  demoBookingUrl?: string | null;
  whatsappMessage?: LocalizedText | null;
  announcement?: LandingAnnouncement | null;
  faqItems?: LandingFaqItem[] | null;
}

const json = (v: unknown): string | null => (v === null ? null : JSON.stringify(v));

/**
 * Simpan sebagian setelan. Medan yang TIDAK disebut tidak ditulis: menyimpan
 * bilah pengumuman tidak boleh ikut menulis ulang daftar FAQ yang dibuka
 * operator lain di tab sebelah. Nilai WAJIB sudah divalidasi pemanggil
 * (skema konsol); `null` = kembalikan medan itu ke bawaan.
 *
 * Sesudahnya sinyal `landing-settings` dinaikkan (pola `saveSiteSettings`).
 */
export async function saveLandingSettings(patch: LandingSettingsPatch, actor: string): Promise<void> {
  const data: Record<string, string | null> = { updatedBy: actor.slice(0, 100) };
  if (patch.hiddenSections !== undefined) {
    data.hiddenSectionsJson = patch.hiddenSections.length > 0 ? JSON.stringify(patch.hiddenSections) : null;
  }
  if (patch.demoBookingUrl !== undefined) data.demoBookingUrl = patch.demoBookingUrl;
  if (patch.whatsappMessage !== undefined) data.whatsappMessageJson = json(patch.whatsappMessage);
  if (patch.announcement !== undefined) data.announcementJson = json(patch.announcement);
  if (patch.faqItems !== undefined) data.faqItemsJson = json(patch.faqItems);

  await platformDb.landingSetting.upsert({
    where: { singleton: 1 },
    create: { singleton: 1, ...data, updatedBy: data.updatedBy as string },
    update: data,
  });
  await bumpCacheSignal(platformDb, "landing-settings");
}
