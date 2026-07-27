import { z } from "zod";
import { lineStockKg } from "@/lib/delivery-orders";
import { vmsg } from "@/lib/i18n/validation";

/**
 * Zod for Surat Jalan / Delivery Order (issue #14).
 *
 * The DB is the source of truth for types (docs/DATABASE.md §1.4): lengths and
 * required-ness mirror the columns. The document `no` is NOT in the payload — it
 * is generated server-side (`nextDeliveryOrderNo`), the same posture as retur.
 * Money never appears here: a surat jalan moves quantity, not value.
 */

/** "" / null / undefined → null, else a positive int. Mirrors ContractItem's consigneeId. */
const nullableId = z
  .preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int().positive().nullable()
  )
  .default(null);

export const deliveryOrderItemSchema = z.object({
  /** FK to the stock Item — a surat jalan reduces a real inventory item. */
  itemId: z.coerce.number().int().positive(vmsg("validation.pickStockItem")),
  /** Snapshot of the item name for the printed document. */
  itemName: z.string().min(1, vmsg("validation.itemNameRequired")).max(100).trim(),
  /** Bags/kg shape follows ContractItem exactly. */
  bags: z.coerce.number().int().min(0, vmsg("validation.bagsMin0")),
  kgPerBag: z.coerce.number().min(0, vmsg("validation.kgPerBagMin0")),
});

export const deliveryOrderSchema = z
  .object({
    date: z.string().min(1, vmsg("validation.dateRequired")),
    /** Dokumen sumber (dokumen berantai #16) — keduanya opsional. */
    contractId: nullableId,
    invoiceId: nullableId,
    /** Consignee master (#22) — opsional. */
    consigneeId: nullableId,
    vehicleNo: z.string().max(50).trim().optional(),
    containerNo: z.string().max(50).trim().optional(),
    notes: z.string().max(2000).trim().optional(),
    items: z
      .array(deliveryOrderItemSchema)
      .min(1, vmsg("validation.minOneItem"))
      .max(50, vmsg("validation.maxFiftyItems")),
  })
  .superRefine((data, ctx) => {
    // Every line must ship a positive quantity of stock: a 0-kg line would post a
    // useless empty stock-out. bags × kg/bag > 0 is the quantity invariant.
    data.items.forEach((item, i) => {
      if (lineStockKg(item) <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i],
          message: vmsg("validation.lineQuantityPositive"),
        });
      }
    });
  });

export type DeliveryOrderInput = z.infer<typeof deliveryOrderSchema>;
export type DeliveryOrderItemInput = z.infer<typeof deliveryOrderItemSchema>;
