import { z } from "zod";
import { CURRENCIES } from "@/lib/constants";

export const journalLineSchema = z
  .object({
    accountId: z.coerce.number().int().positive("Akun wajib dipilih"),
    debit: z.coerce.number().min(0).default(0),
    credit: z.coerce.number().min(0).default(0),
    currency: z.enum(CURRENCIES).default("IDR"),
    rate: z.coerce.number().positive().default(1),
    memo: z.string().max(255).trim().optional(),
  })
  .refine((l) => !(l.debit > 0 && l.credit > 0), {
    message: "Baris tidak boleh berisi debit dan kredit sekaligus",
  })
  .refine((l) => l.debit > 0 || l.credit > 0, {
    message: "Baris harus punya nilai debit atau kredit",
  });

export const journalSchema = z.object({
  date: z.coerce.date(),
  type: z.string().max(20).optional(),
  note: z.string().max(1000).trim().nullable().optional(),
  lines: z.array(journalLineSchema).min(2, "Jurnal minimal 2 baris"),
});

export type JournalInput = z.infer<typeof journalSchema>;
