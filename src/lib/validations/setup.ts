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
import { businessModulesPayloadSchema } from "./modules";
import { vmsg } from "@/lib/i18n/validation";

/** One opening cash/bank balance — the user picks a concrete cash_bank account. */
export const openingCashSchema = z
  .object({
    accountId: z.coerce.number().int().positive(),
    currency: currencyEnum.default("IDR"),
    amount: z.coerce.number().positive(vmsg("validation.openingBalancePositive")),
    rate: rateField,
  })
  .superRefine((data, ctx) => requireRateForForeign(data, ctx));

/** One opening receivable/payable, per partner. */
export const openingPartnerSchema = z
  .object({
    partnerId: z.coerce.number().int().positive(),
    currency: currencyEnum.default("IDR"),
    amount: z.coerce.number().positive(vmsg("validation.openingBalancePositive")),
    rate: rateField,
  })
  .superRefine((data, ctx) => requireRateForForeign(data, ctx));

/**
 * Satu baris saldo awal PERSEDIAAN, per barang (issue #379).
 *
 * Menggantikan `inventory: number` — satu angka gelondongan yang menerbitkan
 * jurnal TANPA satu pun gerakan stok, sehingga Neraca menunjukkan persediaan
 * sementara laporan stok kosong. Per barang, jalur pembukaan bisa menerbitkan
 * KEDUA sisinya seperti pembelian: jurnalnya dan gerakan stoknya.
 *
 * Kuantitas `Decimal(15,3)` dan harga pokok `Decimal(15,2)` mengikuti
 * docs/DATABASE.md — dan keduanya WAJIB positif: baris nol tidak menambah apa
 * pun ke jurnal maupun ke stok, jadi ia hanya baris yang membingungkan
 * pembacanya. Selalu IDR: harga pokok persediaan adalah nilai base.
 */
export const openingStockSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(vmsg("validation.openingStockPositive")),
  unitCost: z.coerce.number().positive(vmsg("validation.openingStockCostPositive")),
});

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
    name: z.string().min(1, vmsg("validation.companyNameRequired")).max(150).trim(),
    address: z.string().max(1000).trim().optional(),
    baseCurrency: currencyEnum.default("IDR"),
    /** Awal tahun buku (YYYY-MM-DD). The opening journal is dated here. */
    fiscalYearStart: z.string().min(1, vmsg("validation.fiscalYearStartRequired")),
  })
  .merge(companyTaxIdentitySchema)
  /**
   * Modul per kategori usaha (issue #99). Bentuknya DIPAKAI ULANG dari skema
   * API modul (`validations/modules.ts`), bukan disalin — wizard dan halaman
   * Pengaturan tidak boleh bisa menyimpang diam-diam (Konvensi Form MASTER.md).
   *
   * Keduanya opsional, dan itu memang intinya: wizard yang melewati langkah ini
   * meninggalkan kolomnya NULL, dan NULL berarti semua modul aktif — aplikasi
   * berperilaku persis seperti sebelum fitur ini ada.
   */
  .merge(businessModulesPayloadSchema.partial());

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
    /** Saldo awal persediaan, PER BARANG (issue #379). */
    inventory: z.array(openingStockSchema).max(2000).default([]),
  })
  .superRefine((data, ctx) => {
    const hasAny =
      data.cash.length > 0 ||
      data.receivables.length > 0 ||
      data.payables.length > 0 ||
      data.inventory.length > 0;
    if (!hasAny) {
      ctx.addIssue({
        code: "custom",
        path: ["cash"],
        message: vmsg("validation.atLeastOneOpeningBalance"),
      });
    }

    /* Satu barang hanya boleh punya SATU baris saldo awal. Dua baris untuk
       barang yang sama akan menerbitkan dua gerakan stok pembuka dengan harga
       pokok berbeda — dan rata-rata tertimbangnya menjadi angka yang tidak
       pernah dimaksudkan siapa pun. */
    const seenItems = new Set<number>();
    data.inventory.forEach((row, index) => {
      if (seenItems.has(row.itemId)) {
        ctx.addIssue({
          code: "custom",
          path: ["inventory", index, "itemId"],
          message: vmsg("validation.openingStockDuplicateItem"),
        });
      }
      seenItems.add(row.itemId);
    });

    // No partner may appear twice on the same side — one opening balance per
    // customer / per supplier keeps the memo sub-ledger unambiguous.
    for (const side of ["receivables", "payables"] as const) {
      const seen = new Set<number>();
      data[side].forEach((row, i) => {
        if (seen.has(row.partnerId)) {
          ctx.addIssue({
            code: "custom",
            path: [side, i, "partnerId"],
            message: vmsg("validation.partnerTwice"),
          });
        }
        seen.add(row.partnerId);
      });
    }
  });

export type SetupInput = z.infer<typeof setupSchema>;
