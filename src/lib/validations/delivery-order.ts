import { z } from "zod";
import { lineStockKg } from "@/lib/delivery-orders";

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
  itemId: z.coerce.number().int().positive("Pilih barang dari master stok."),
  /** Snapshot of the item name for the printed document. */
  itemName: z.string().min(1, "Nama barang wajib diisi").max(100).trim(),
  /** Bags/kg shape follows ContractItem exactly. */
  bags: z.coerce.number().int().min(0, "Bags harus 0 atau lebih"),
  kgPerBag: z.coerce.number().min(0, "Kg per bag harus 0 atau lebih"),
});

export const deliveryOrderSchema = z
  .object({
    date: z.string().min(1, "Tanggal wajib diisi"),
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
      .min(1, "Minimal satu barang")
      .max(50, "Maksimal 50 barang"),
  })
  .superRefine((data, ctx) => {
    // Every line must ship a positive quantity of stock: a 0-kg line would post a
    // useless empty stock-out. bags × kg/bag > 0 is the quantity invariant.
    data.items.forEach((item, i) => {
      if (lineStockKg(item) <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i],
          message: "Kuantitas (bags × kg/bag) harus lebih besar dari nol.",
        });
      }
    });
  });

export type DeliveryOrderInput = z.infer<typeof deliveryOrderSchema>;
export type DeliveryOrderItemInput = z.infer<typeof deliveryOrderItemSchema>;
