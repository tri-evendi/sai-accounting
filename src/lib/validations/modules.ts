import { z } from "zod";
import { BUSINESS_CATEGORIES, BUSINESS_MODULES } from "@/lib/business-modules";

/**
 * Payload PUT /api/company-settings/modules (issue #99): himpunan modul LENGKAP
 * yang diinginkan — bukan patch — supaya menyimpan bersifat idempoten. Satu
 * skema untuk dua sisi (Konvensi Form MASTER.md): client memakainya sebelum
 * mengirim, server tetap penjaga terakhir.
 *
 * Zod hanya menjaga BENTUK. Aturan mainnya (modul tak dikenal, modul kembar,
 * dan yang terpenting: modul inti tak boleh dimatikan) dicek
 * `validateEnabledModules` — sama seperti `validateOverrides` di #73 — karena
 * pesannya harus berupa kalimat yang bisa langsung dibaca pengguna, bukan galat
 * enum zod.
 */
export const businessCategoryEnum = z.enum(BUSINESS_CATEGORIES);

export const businessModulesPayloadSchema = z.object({
  /** Kategori usaha (preset) yang dipilih; null = tidak menyebut kategori. */
  businessCategory: businessCategoryEnum.nullish(),
  /** Modul yang diinginkan aktif. Dibatasi supaya payload aneh ditolak murah. */
  modules: z.array(z.string().max(40)).max(BUSINESS_MODULES.length * 2),
});

export type BusinessModulesPayload = z.infer<typeof businessModulesPayloadSchema>;
