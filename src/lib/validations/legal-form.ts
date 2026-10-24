/**
 * Bentuk usaha & pemilik/sekutu — BENTUK payload (24 Okt 2026).
 *
 * Zod hanya menjaga bentuk. Aturan mainnya (porsi tepat 100%, CV butuh sekutu
 * aktif & komanditer, perorangan tepat satu pemilik) ada di `validatePartners`
 * (`lib/partners.ts`) dan dikembalikan sebagai KUNCI kamus `legalForm.errors.*`
 * — kalimat yang bisa dibaca, bukan galat enum zod.
 */
import { z } from "zod";
import { FULL_SHARE_BP, LEGAL_FORMS, PARTNER_ROLES } from "@sai/core/legal-form";

export const legalFormEnum = z.enum(LEGAL_FORMS);

export const partnerDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.enum(PARTNER_ROLES).nullish(),
  /** Porsi laba, basis poin (10000 = 100%). */
  shareBp: z.number().int().min(0).max(FULL_SHARE_BP),
});

/** Bagian `equity` pada payload wisaya (`/api/setup/coa`, `/api/setup`). */
export const setupEquitySchema = z.object({
  legalForm: legalFormEnum,
  partners: z.array(partnerDraftSchema).max(50).default([]),
});

export type SetupEquityPayload = z.infer<typeof setupEquitySchema>;

/** PUT /api/company-settings/legal-form — ganti bentuk usaha. */
export const legalFormUpdateSchema = z.object({
  legalForm: legalFormEnum,
  /** Pengguna sudah membaca peringatan "tidak menulis ulang jurnal". */
  acknowledged: z.literal(true),
});

/**
 * PUT /api/company-settings/partners — simpan nama/peran/porsi/aktif SELURUH
 * pemilik sekaligus. Seluruhnya, bukan satu per satu: porsi harus berjumlah
 * 100% pada SETIAP keadaan tersimpan, dan mengubah porsi satu sekutu tanpa
 * yang lain pasti melewati keadaan yang tidak 100%.
 */
export const partnersUpdateSchema = z.object({
  partners: z
    .array(
      partnerDraftSchema.extend({
        /** Tidak ada = pemilik/sekutu BARU — akun Modal & Prive-nya dibuat. */
        id: z.number().int().positive().optional(),
        isActive: z.boolean(),
      })
    )
    .min(1)
    .max(50),
});

/**
 * PUT /api/company-settings/business-profile — identitas legal dan sakelar
 * PPh Final UMKM. Keduanya opsional; yang tidak disebut tidak disentuh.
 * Teks kosong = hapus nilainya (NULL).
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();

export const businessProfileSchema = z.object({
  identity: z
    .object({
      nib: z
        .string()
        .trim()
        .regex(/^(\d{13})?$/)
        .transform((v) => (v === "" ? null : v))
        .nullish(),
      deedNumber: optionalText(100),
      ministryDecreeNumber: optionalText(100),
      /** `YYYY-MM-DD` atau kosong. */
      establishedOn: z
        .string()
        .trim()
        .regex(/^(\d{4}-\d{2}-\d{2})?$/)
        .transform((v) => (v === "" ? null : v))
        .nullish(),
    })
    .optional(),
  pphFinal: z
    .object({
      enabled: z.boolean(),
      startYear: z.number().int().min(2018).max(2100).nullable(),
    })
    .refine((v) => !v.enabled || v.startYear !== null, { path: ["startYear"] })
    .optional(),
});

export type BusinessProfilePayload = z.infer<typeof businessProfileSchema>;
