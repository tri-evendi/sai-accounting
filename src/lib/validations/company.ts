import { z } from "zod";
import { vmsg } from "@sai/core/i18n/validation";
import { COMPANY_DATABASE_PREFIX } from "@/lib/company-provisioning-shared";
import { isReservedCompanySlug } from "@sai/core/tenant-routes";
import { DEFAULT_LEGAL_FORM, LEGAL_FORMS } from "@sai/core/legal-form";

/**
 * Membuat perusahaan baru (issue #104) — satu skema, dua sisi.
 *
 * Skema INI yang divalidasi formulir DAN route handler. Slug dan nama basis
 * data bukan sekadar isian: keduanya ikut menjadi teks di dalam perintah SQL
 * `CREATE DATABASE` (nama basis data tidak bisa diparameterkan). Karena itu
 * bentuknya dipaksa di sini, dan DIPERIKSA ULANG tepat sebelum dipakai oleh
 * `assertSafeDatabaseName()`. Dua lapis dengan sengaja — yang pertama untuk
 * memberi pesan yang bisa dibaca orang, yang kedua supaya keamanannya tidak
 * bergantung pada lapis pertama.
 */
export const companyCreateSchema = z.object({
  name: z.string().min(1, vmsg("validation.companyNameRequired")).max(150).trim(),
  slug: z
    .string()
    .min(2, vmsg("validation.companySlugInvalid"))
    .max(40)
    .regex(/^[a-z0-9-]+$/, vmsg("validation.companySlugInvalid"))
    .trim()
    /* Nama yang dimaknai khusus oleh lapisan jalur — lihat
       `RESERVED_COMPANY_SLUGS` di `lib/tenant-routes.ts` (issue #346). Skrip
       operator memakai regex sendiri, jadi keduanya memanggil predikat yang
       sama; pagar ini tidak menjaga mereka. */
    .refine((v) => !isReservedCompanySlug(v), {
      message: vmsg("validation.companySlugReserved"),
    }),
  /**
   * Opsional: diturunkan dari slug bila kosong. Diisi manual pada pemasangan
   * yang penggunanya tidak boleh `CREATE DATABASE` — administrator membuat
   * basis datanya lebih dulu, lalu menyebut namanya di sini.
   */
  databaseName: z
    .string()
    .max(60)
    .regex(/^[a-z0-9_]+$/, vmsg("validation.companyDatabaseInvalid"))
    .refine((v) => v.startsWith(COMPANY_DATABASE_PREFIX), {
      message: vmsg("validation.companyDatabasePrefix"),
    })
    .optional(),
  /**
   * Bentuk usaha (24 Okt 2026). Opsional dengan bawaan `pt` — klien lama yang
   * tidak mengirimnya membuat PT, persis seperti sebelumnya. Menentukan templat
   * ekuitas yang disemai wisaya penyiapan.
   */
  legalForm: z.enum(LEGAL_FORMS).default(DEFAULT_LEGAL_FORM),
});

export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;
