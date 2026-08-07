/**
 * Anggaran & Target payload validation — issue #29.
 *
 * Whatever is knowable from the payload alone lives here; whatever needs the
 * database (does the account/customer/item exist) is enforced by the route and
 * the FK. Budgets/targets are IDR-only, so there is no currency/rate field.
 */
import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

const year = z.coerce.number().int().min(2000).max(2100);
const month = z.coerce.number().int().min(1).max(12);

/**
 * IDR base amount. Non-negative — a plan is never a negative number here.
 *
 * `preprocess` adalah yang membuat isian KOSONG berarti "belum diisi", bukan
 * `0` (issue #216). `Number("")` adalah `0`, dan di sini nol adalah angka yang
 * SAH ("tidak dianggarkan bulan ini") — jadi tanpa langkah ini sebuah formulir
 * yang dikirim dengan nominal tak tersentuh akan tersimpan sebagai rencana nol
 * rupiah, tak bisa dibedakan dari kekeliruan. Sampai #188 `required` peramban
 * yang menahannya; sekarang skema ini, di kedua sisi kawat.
 */
const money = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce
    .number({ error: vmsg("validation.amountRequired") })
    .nonnegative(vmsg("validation.amountNotNegative"))
    .max(9_999_999_999_999, vmsg("validation.amountTooLarge"))
);

/**
 * Pelanggan/barang pada target: penanda perencanaan yang boleh kosong. Isian
 * pilihan yang tak dipilih tiba sebagai `""` dan `Number("")` adalah `0` — id
 * yang tak pernah ada — jadi ia dinormalkan lebih dulu menjadi `null` ("berlaku
 * untuk SEMUA"), bukan ditolak sebagai id tak sah.
 */
const optionalId = z.preprocess(
  (value) => (value === "" ? null : value),
  z.coerce.number().int().positive().optional().nullable()
);
const note = z.string().max(1000).trim().optional();

/** Create/upsert one budget: an account's planned amount for one month. */
export const budgetSchema = z.object({
  accountId: z.coerce.number().int().positive(vmsg("validation.accountRequired")),
  year,
  month,
  amount: money,
  note,
});
export type BudgetInput = z.infer<typeof budgetSchema>;

/** Create/upsert one sales target for a period, optionally per customer/item. */
export const salesTargetSchema = z.object({
  year,
  month,
  customerId: optionalId,
  itemId: optionalId,
  amount: money,
  note,
});
export type SalesTargetInput = z.infer<typeof salesTargetSchema>;
