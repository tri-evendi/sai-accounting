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

export const depreciationMethodEnum = z.enum(DEPRECIATION_METHODS);

const accountId = z.coerce.number().int().positive();
const money = z.coerce.number().nonnegative();
const positiveMoney = z.coerce.number().positive();

/** Create/update a depreciation category (master data). */
export const fixedAssetCategorySchema = z.object({
  name: z.string().min(1, "Nama kategori wajib diisi").max(100).trim(),
  defaultMethod: depreciationMethodEnum.default("straight_line"),
  defaultUsefulLifeMonths: z.coerce
    .number()
    .int()
    .positive("Umur manfaat (bulan) harus lebih dari 0"),
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
    name: z.string().min(1, "Nama aset wajib diisi").max(150).trim(),
    categoryId: z.coerce.number().int().positive(),
    acquisitionDate: z.string().min(1, "Tanggal perolehan wajib diisi"),
    acquisitionCost: positiveMoney,
    residualValue: money.default(0),
    usefulLifeMonths: z.coerce.number().int().positive("Umur manfaat (bulan) harus lebih dari 0"),
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
        message: "Nilai residu harus lebih kecil dari nilai perolehan.",
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
  date: z.string().min(1, "Tanggal pelepasan wajib diisi"),
  proceeds: money.default(0),
  note: z.string().max(500).trim().optional(),
});
export type AssetDisposalInput = z.infer<typeof assetDisposalSchema>;

/** Move an asset to a new location. */
export const assetTransferSchema = z.object({
  date: z.string().min(1, "Tanggal pindah wajib diisi"),
  toLocation: z.string().min(1, "Lokasi tujuan wajib diisi").max(150).trim(),
  note: z.string().max(500).trim().optional(),
});
export type AssetTransferInput = z.infer<typeof assetTransferSchema>;
