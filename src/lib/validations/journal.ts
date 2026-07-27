import { z } from "zod";
import { CURRENCIES } from "@/lib/constants";
import { vmsg } from "@/lib/i18n/validation";

export const journalLineSchema = z
  .object({
    accountId: z.coerce.number().int().positive(vmsg("validation.accountRequired")),
    debit: z.coerce.number().min(0).default(0),
    credit: z.coerce.number().min(0).default(0),
    currency: z.enum(CURRENCIES).default("IDR"),
    rate: z.coerce.number().positive().default(1),
    memo: z.string().max(255).trim().optional(),
    /**
     * Penimpaan pusat biaya untuk BARIS ini (issue #91). Kosong = ikut pilihan
     * di kepala jurnal. Inilah kasus yang membuat dimensinya diletakkan di
     * baris: satu tagihan listrik bersama dibagi ke dua cabang dalam satu
     * jurnal, dan itu mustahil dinyatakan kalau dimensinya hanya di kepala.
     */
    costCenterId: z.coerce.number().int().positive().nullable().optional(),
  })
  .refine((l) => !(l.debit > 0 && l.credit > 0), {
    message: vmsg("validation.journalLineNotBoth"),
  })
  .refine((l) => l.debit > 0 || l.credit > 0, {
    message: vmsg("validation.journalLineNeedsValue"),
  });

export const journalSchema = z.object({
  date: z.coerce.date(),
  type: z.string().max(20).optional(),
  note: z.string().max(1000).trim().nullable().optional(),
  /** Pusat biaya BAWAAN untuk setiap baris yang tak memilih sendiri (#91). */
  costCenterId: z.coerce.number().int().positive().nullable().optional(),
  lines: z.array(journalLineSchema).min(2, vmsg("validation.journalMinTwoLines")),
});

export type JournalInput = z.infer<typeof journalSchema>;
