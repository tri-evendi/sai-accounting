/**
 * Aset Tetap payload validation — issue #28.
 *
 * Whatever is knowable from the payload alone lives here; whatever needs the
 * database (does the category exist, is the period open, is the asset already
 * disposed) is enforced by the service layer and the posting engine, which stay
 * authoritative. Fixed assets are IDR-only, so there is no currency/rate field.
 */
import { z } from "zod";
import { DEPRECIATION_METHODS } from "@/lib/depreciation";
import { vmsg } from "@/lib/i18n/validation";

export const depreciationMethodEnum = z.enum(DEPRECIATION_METHODS);

/*
 * Ketiga akun dan kategorinya datang dari isian PILIHAN. Pilihan yang belum
 * dijatuhkan tiba sebagai `""`, dan `Number("")` adalah `0` — jadi `positive`
 * di sini bukan pagar teoretis melainkan tepat pesan "wajib dipilih" yang
 * dibaca pengguna sejak isian pilihan kehilangan `required` peramban (#216).
 */
const accountId = z.coerce.number().int().positive(vmsg("validation.accountRequired"));
const money = z.coerce.number().nonnegative();
const positiveMoney = z.coerce.number().positive(vmsg("validation.amountPositive"));

/** Create/update a depreciation category (master data). */
export const fixedAssetCategorySchema = z.object({
  name: z.string().min(1, vmsg("validation.categoryNameRequired")).max(100).trim(),
  defaultMethod: depreciationMethodEnum.default("straight_line"),
  defaultUsefulLifeMonths: z.coerce
    .number()
    .int()
    .positive(vmsg("validation.usefulLifePositive")),
  assetAccountId: accountId,
  accumulatedAccountId: accountId,
  expenseAccountId: accountId,
});
export type FixedAssetCategoryInput = z.infer<typeof fixedAssetCategorySchema>;

/**
 * Register a fixed asset. The three account ids default from the category on the
 * client, but are sent explicitly so an override is a first-class choice. Residual
 * must not reach the cost (nothing left to depreciate) — checked here since both
 * are in the payload.
 */
export const fixedAssetSchema = z
  .object({
    name: z.string().min(1, vmsg("validation.assetNameRequired")).max(150).trim(),
    categoryId: z.coerce.number().int().positive(vmsg("validation.categoryRequired")),
    acquisitionDate: z.string().min(1, vmsg("validation.acquisitionDateRequired")),
    acquisitionCost: positiveMoney,
    residualValue: money.default(0),
    usefulLifeMonths: z.coerce.number().int().positive(vmsg("validation.usefulLifePositive")),
    depreciationMethod: depreciationMethodEnum.default("straight_line"),
    assetAccountId: accountId,
    accumulatedAccountId: accountId,
    expenseAccountId: accountId,
    location: z.string().max(150).trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.residualValue >= data.acquisitionCost) {
      ctx.addIssue({
        code: "custom",
        path: ["residualValue"],
        message: vmsg("validation.residualBelowCost"),
      });
    }
  });
export type FixedAssetInput = z.infer<typeof fixedAssetSchema>;

/** Run monthly depreciation for one period. */
export const depreciationRunSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type DepreciationRunInput = z.infer<typeof depreciationRunSchema>;

/** Dispose/sell an asset. Proceeds may be 0 (scrapped). */
export const assetDisposalSchema = z.object({
  date: z.string().min(1, vmsg("validation.disposalDateRequired")),
  proceeds: money.default(0),
  note: z.string().max(500).trim().optional(),
});
export type AssetDisposalInput = z.infer<typeof assetDisposalSchema>;

/** Move an asset to a new location. */
export const assetTransferSchema = z.object({
  date: z.string().min(1, vmsg("validation.transferDateRequired")),
  toLocation: z.string().min(1, vmsg("validation.toLocationRequired")).max(150).trim(),
  note: z.string().max(500).trim().optional(),
});
export type AssetTransferInput = z.infer<typeof assetTransferSchema>;
