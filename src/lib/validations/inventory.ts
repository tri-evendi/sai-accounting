import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

export const stockUpdateSchema = z
  .object({
    itemId: z.coerce.number().int(),
    quantity: z.coerce.number().positive(vmsg("validation.quantityPositive")),
    type: z.enum(["in", "out"]),
    date: z.string().min(1, vmsg("validation.dateRequired")),
    /**
     * IDR cost per unit. Required on `in` movements: it is the only input to the
     * weighted-average COGS the engine posts when stock later goes `out`.
     * Without it the outgoing movement books no COGS at all and profit is
     * silently overstated. Ignored on `out` (cost is derived, never re-entered).
     */
    unitCost: z.coerce.number().positive(vmsg("validation.unitCostPositive")).optional(),
    note: z.string().max(500).trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "in" && !data.unitCost) {
      ctx.addIssue({
        code: "custom",
        path: ["unitCost"],
        message: vmsg("validation.unitCostRequiredForStockIn"),
      });
    }
  });

export const itemSchema = z.object({
  name: z.string().min(1, vmsg("validation.itemNameRequired")).max(100).trim(),
  unit: z.string().max(20).trim().optional(),
});

/**
 * Stok opname (issue #57) — hitungan fisik per barang pada satu tanggal. Server
 * menghitung selisih (fisik − sistem) dan hanya menulis penyesuaian untuk yang
 * berselisih. `physicalQty` boleh 0 (barang habis saat dihitung).
 */
export const opnameSchema = z.object({
  date: z.string().min(1, vmsg("validation.dateRequired")),
  counts: z
    .array(
      z.object({
        itemId: z.coerce.number().int(),
        physicalQty: z.coerce.number().min(0, vmsg("validation.physicalQtyNotNegative")),
      })
    )
    .min(1, vmsg("validation.opnameMinOneItem")),
});

export type StockUpdateInput = z.infer<typeof stockUpdateSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
export type OpnameInput = z.infer<typeof opnameSchema>;
