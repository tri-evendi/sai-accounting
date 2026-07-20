import { z } from "zod";
import { PERIOD_STATUSES } from "@/lib/period";

/** Mirrors the enum-like `periods.status` column (docs/DATABASE.md §2). */
export const periodStatusSchema = z.enum(PERIOD_STATUSES);

const yearMonth = {
  year: z.coerce.number().int().min(2000, "Tahun tidak valid").max(2100, "Tahun tidak valid"),
  month: z.coerce.number().int().min(1, "Bulan tidak valid").max(12, "Bulan tidak valid"),
};

export const periodQuerySchema = z.object(yearMonth);

export const periodCloseSchema = z.object({
  ...yearMonth,
  note: z.string().max(1000).trim().nullable().optional(),
});

export const periodReopenSchema = z.object({
  ...yearMonth,
  // Required, and it lands in the audit log: reopening a closed month is the one
  // action here that can change already-reported figures, so it must say why.
  reason: z
    .string()
    .trim()
    .min(5, "Alasan buka kembali wajib diisi (minimal 5 karakter)")
    .max(1000),
});

export type PeriodQueryInput = z.infer<typeof periodQuerySchema>;
export type PeriodCloseInput = z.infer<typeof periodCloseSchema>;
export type PeriodReopenInput = z.infer<typeof periodReopenSchema>;
