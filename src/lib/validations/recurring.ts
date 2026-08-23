/**
 * Templat transaksi berulang — skema yang dipakai BERSAMA form dan route
 * handler (issue #469, tahap 3).
 *
 * Diimpor keduanya, bukan disalin: satu aturan yang ditulis dua kali adalah dua
 * aturan yang akan menyimpang, dan yang menyimpang di sini menentukan kapan
 * sebuah dokumen lahir sendiri.
 *
 * Pesannya KUNCI kamus, bukan kalimat — pesan zod dipanggang saat modul dimuat
 * dan tidak bisa ikut berganti bahasa (`lib/i18n/validation.ts`).
 */
import { z } from "zod";

import { RECURRENCE_FREQUENCIES, RECURRING_KINDS } from "@/lib/recurring";

const vmsg = (key: string) => key;

/** `YYYY-MM-DD` — bentuk yang sama dengan isian tanggal lain di aplikasi ini. */
const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, vmsg("validation.dateInvalid"));

export const recurringTemplateSchema = z
  .object({
    name: z.string().trim().min(1, vmsg("validation.nameRequired")).max(150),
    kind: z.enum(RECURRING_KINDS),
    /** Dokumen yang diulang. */
    sourceId: z.number().int().positive(vmsg("validation.sourceRequired")),
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    startDate: dateField,
    endDate: dateField.nullable().optional(),
    maxOccurrences: z
      .number()
      .int()
      .positive(vmsg("validation.maxOccurrencesPositive"))
      .nullable()
      .optional(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    /* Tanggal akhir sebelum tanggal mulai bukan "templat yang tidak pernah
       berbunyi" melainkan templat yang salah ketik — dan yang membuatnya diam
       adalah aplikasi, bukan niat penggunanya. Jadi ditolak di muka. */
    path: ["endDate"],
    message: vmsg("validation.endBeforeStart"),
  });

export type RecurringTemplateInput = z.infer<typeof recurringTemplateSchema>;
