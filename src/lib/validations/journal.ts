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
  lines: z.array(journalLineSchema).min(2, vmsg("validation.journalMinTwoLines")),
});

export type JournalInput = z.infer<typeof journalSchema>;
