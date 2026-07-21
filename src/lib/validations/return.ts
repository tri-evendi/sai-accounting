import { z } from "zod";
import { round2 } from "@/lib/posting/rules";

/**
 * Retur penjualan & pembelian (issue #27).
 *
 * The client sends only WHAT and HOW MUCH is being returned — the origin
 * document id and the per-line quantities. Everything that decides the money —
 * currency, rate, unit price, the DPP and the proportional PPN — is derived
 * server-side from the origin document, never trusted from the payload, so a
 * stale or tampered client value can never reach the ledger. That mirrors how the
 * invoice route recomputes PPN authoritatively (issue #16).
 */

export const salesReturnItemSchema = z.object({
  /** The invoice line being returned — the source line the cap is measured on. */
  invoiceItemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive("Jumlah retur harus lebih besar dari nol"),
  /** Optional stock Item to move the goods back IN. Blank = not tracked. */
  itemId: z.coerce.number().int().positive().nullish(),
});

export const salesReturnSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  date: z.string().min(1, "Tanggal wajib diisi"),
  reason: z.string().max(1000).trim().optional(),
  items: z.array(salesReturnItemSchema).min(1, "Minimal satu baris retur").max(50),
});

export const purchaseReturnItemSchema = z.object({
  itemName: z.string().min(1, "Nama barang wajib diisi").max(100).trim(),
  quantity: z.coerce.number().positive("Jumlah retur harus lebih besar dari nol"),
  price: z.coerce.number().min(0),
  /** Optional stock Item to move the goods OUT. Blank = not tracked. */
  itemId: z.coerce.number().int().positive().nullish(),
});

export const purchaseReturnSchema = z.object({
  purchaseId: z.coerce.number().int().positive(),
  date: z.string().min(1, "Tanggal wajib diisi"),
  reason: z.string().max(1000).trim().optional(),
  items: z.array(purchaseReturnItemSchema).min(1, "Minimal satu baris retur").max(50),
});

/** Net line value (Σ qty × price) in the document's currency. */
export function returnSubtotal(items: { quantity: number; price: number }[]): number {
  return round2(items.reduce((sum, i) => sum + i.quantity * i.price, 0));
}

export type SalesReturnInput = z.infer<typeof salesReturnSchema>;
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;
