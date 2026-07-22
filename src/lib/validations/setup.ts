/**
 * Setup wizard + Saldo Awal payload validation — issue #20.
 *
 * The division of labour issue #9 set: whatever is knowable from the payload
 * alone is here (currency needs a rate, amounts positive, at least one balance);
 * whatever needs the database (does this account/customer/supplier exist, is the
 * company already set up) is left to `@/lib/opening-balance`, which is
 * authoritative — a Zod check that passes is still re-checked against real rows
 * and the run-once guards.
 */
import { z } from "zod";
import { currencyEnum, rateField, requireRateForForeign } from "./fx";

/** One opening cash/bank balance — the user picks a concrete cash_bank account. */
export const openingCashSchema = z
  .object({
    accountId: z.coerce.number().int().positive(),
    currency: currencyEnum.default("IDR"),
    amount: z.coerce.number().positive("Saldo harus lebih besar dari 0"),
    rate: rateField,
  })
  .superRefine((data, ctx) => requireRateForForeign(data, ctx));

/** One opening receivable/payable, per partner. */
export const openingPartnerSchema = z
  .object({
    partnerId: z.coerce.number().int().positive(),
    currency: currencyEnum.default("IDR"),
    amount: z.coerce.number().positive("Saldo harus lebih besar dari 0"),
    rate: rateField,
  })
  .superRefine((data, ctx) => requireRateForForeign(data, ctx));

/**
 * Seller tax identity (issue #17) — the NPWP + tax name/address any e-Faktur
 * output needs. All optional: a legacy setup predates them, and the e-Faktur
 * export surfaces a missing NPWP rather than the wizard forcing it here.
 */
export const companyTaxIdentitySchema = z.object({
  npwp: z.string().max(30).trim().optional(),
  taxName: z.string().max(150).trim().optional(),
  taxAddress: z.string().max(1000).trim().optional(),
});

export const companyIdentitySchema = z
  .object({
    name: z.string().min(1, "Nama perusahaan wajib diisi").max(150).trim(),
    address: z.string().max(1000).trim().optional(),
    baseCurrency: currencyEnum.default("IDR"),
    /** Awal tahun buku (YYYY-MM-DD). The opening journal is dated here. */
    fiscalYearStart: z.string().min(1, "Awal tahun buku wajib diisi"),
  })
  .merge(companyTaxIdentitySchema);

export type CompanyTaxIdentityInput = z.infer<typeof companyTaxIdentitySchema>;

/**
 * The whole wizard submission. `superRefine` enforces that SOMETHING is being
 * opened — an empty opening journal is meaningless and the poster would refuse
 * it anyway, so we say so at the field level (422 → 400).
 */
export const setupSchema = z
  .object({
    company: companyIdentitySchema,
    cash: z.array(openingCashSchema).max(200).default([]),
    receivables: z.array(openingPartnerSchema).max(1000).default([]),
    payables: z.array(openingPartnerSchema).max(1000).default([]),
    /** Persediaan awal, IDR base. */
    inventory: z.coerce.number().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    const hasAny =
      data.cash.length > 0 ||
      data.receivables.length > 0 ||
      data.payables.length > 0 ||
      (data.inventory ?? 0) > 0;
    if (!hasAny) {
      ctx.addIssue({
        code: "custom",
        path: ["cash"],
        message:
          "Isi minimal satu saldo awal (kas/bank, piutang, utang, atau persediaan).",
      });
    }

    // No partner may appear twice on the same side — one opening balance per
    // customer / per supplier keeps the memo sub-ledger unambiguous.
    for (const side of ["receivables", "payables"] as const) {
      const seen = new Set<number>();
      data[side].forEach((row, i) => {
        if (seen.has(row.partnerId)) {
          ctx.addIssue({
            code: "custom",
            path: [side, i, "partnerId"],
            message: "Partner yang sama muncul lebih dari sekali.",
          });
        }
        seen.add(row.partnerId);
      });
    }
  });

export type SetupInput = z.infer<typeof setupSchema>;
