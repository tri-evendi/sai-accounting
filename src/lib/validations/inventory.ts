import { z } from "zod";

export const stockUpdateSchema = z
  .object({
    itemId: z.coerce.number().int(),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    type: z.enum(["in", "out"]),
    date: z.string().min(1, "Date is required"),
    /**
     * IDR cost per unit. Required on `in` movements: it is the only input to the
     * weighted-average COGS the engine posts when stock later goes `out`.
     * Without it the outgoing movement books no COGS at all and profit is
     * silently overstated. Ignored on `out` (cost is derived, never re-entered).
     */
    unitCost: z.coerce.number().positive("Harga pokok per unit harus lebih besar dari 0").optional(),
    note: z.string().max(500).trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "in" && !data.unitCost) {
      ctx.addIssue({
        code: "custom",
        path: ["unitCost"],
        message:
          "Harga pokok per unit (IDR) wajib diisi untuk barang masuk, " +
          "agar HPP saat barang keluar dapat dihitung.",
      });
    }
  });

export const itemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(100).trim(),
  unit: z.string().max(20).trim().optional(),
});

/**
 * Stok opname (issue #57) — hitungan fisik per barang pada satu tanggal. Server
 * menghitung selisih (fisik − sistem) dan hanya menulis penyesuaian untuk yang
 * berselisih. `physicalQty` boleh 0 (barang habis saat dihitung).
 */
export const opnameSchema = z.object({
  date: z.string().min(1, "Tanggal wajib diisi"),
  counts: z
    .array(
      z.object({
        itemId: z.coerce.number().int(),
        physicalQty: z.coerce.number().min(0, "Jumlah fisik tidak boleh negatif"),
      })
    )
    .min(1, "Isi minimal satu barang untuk dihitung"),
});

export type StockUpdateInput = z.infer<typeof stockUpdateSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
export type OpnameInput = z.infer<typeof opnameSchema>;
