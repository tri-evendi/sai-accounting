/**
 * Bentuk payload pengaturan pajak perusahaan (issue #368, temuan F-12).
 *
 * Murni: tanpa Prisma, tanpa I/O — aman diimpor formulir client maupun route.
 */
import { z } from "zod";

import { vmsg } from "@/lib/i18n/validation";

/** `YYYY-MM-DD`, dan benar-benar sebuah tanggal (bukan `2026-02-31`). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, vmsg("validation.taxRateDateInvalid"))
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, vmsg("validation.taxRateDateInvalid"));

export const taxRateInputSchema = z.object({
  /*
   * 0–100. Batas bawahnya 0 dan bukan 0,01: tarif 0% adalah nilai yang sah dan
   * pernah dipakai (masa PPN ditanggung pemerintah). Batas atasnya 100 karena
   * kolomnya `Decimal(5,2)` — dan lebih penting, karena tarif di atas 100%
   * pasti salah ketik, dan salah ketik pada tarif pajak mencetak faktur yang
   * dikirim ke pelanggan.
   */
  rate: z.coerce
    .number()
    .min(0, vmsg("validation.taxRateOutOfRange"))
    .max(100, vmsg("validation.taxRateOutOfRange")),
  effectiveFrom: isoDate,
  note: z.string().max(500).trim().optional(),
});

export const companyPkpSchema = z.object({
  isPkp: z.boolean(),
});

export type TaxRateInput = z.infer<typeof taxRateInputSchema>;
