import { z } from "zod";

export const contractItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required").max(100).trim(),
  bags: z.coerce.number().int().min(0, "Bags must be 0 or more"),
  kgPerBag: z.coerce.number().min(0, "Kg per bag must be 0 or more"),
  pricePerKg: z.coerce.number().min(0, "Price must be 0 or more"),
});

export const contractSchema = z.object({
  contractNo: z.string().min(1, "Contract number is required").max(50).trim(),
  date: z.string().min(1, "Date is required"),
  buyer: z.string().min(1, "Buyer is required").max(100).trim(),
  consignee: z.string().max(100).trim().optional(),
  packaging: z.string().max(100).trim().optional(),
  shipment: z.string().max(200).trim().optional(),
  top1: z.string().max(200).trim().optional(),
  top2: z.string().max(200).trim().optional(),
  currency: z.enum(["USD", "CNY", "IDR"]).default("USD"),
  status: z.enum(["signed", "pending", "canceled"]).default("pending"),
  items: z.array(contractItemSchema).min(1, "At least one item is required").max(50),
});

export const contractPaymentSchema = z.object({
  contractId: z.coerce.number().int(),
  date: z.string().min(1, "Date is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
  currency: z.enum(["USD", "CNY", "IDR"]).default("USD"),
  note: z.string().max(500).trim().optional(),
});

export type ContractInput = z.infer<typeof contractSchema>;
export type ContractItemInput = z.infer<typeof contractItemSchema>;
export type ContractPaymentInput = z.infer<typeof contractPaymentSchema>;
