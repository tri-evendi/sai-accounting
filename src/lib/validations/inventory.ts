import { z } from "zod";

export const stockUpdateSchema = z.object({
  itemId: z.coerce.number().int(),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  type: z.enum(["in", "out"]),
  date: z.string().min(1, "Date is required"),
  note: z.string().max(500).trim().optional(),
});

export const itemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(100).trim(),
  unit: z.string().max(20).trim().optional(),
});

export type StockUpdateInput = z.infer<typeof stockUpdateSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
