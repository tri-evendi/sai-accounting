import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";
import { booleanField } from "./common";

/**
 * Skema manufaktur (issue #495 butir 3).
 *
 * Aritmetikanya hidup di `@/lib/manufacturing/*` dan murni; yang di sini hanya
 * BENTUK masukan. Dua hal yang ditolak di sini karena tidak ada tempat lain
 * yang bisa menolaknya lebih awal:
 *   • keluaran resep nol — pembagi yang tidak ada (`explodeBom`);
 *   • susut ≥ 100% — bukan resep melainkan pembuangan (`kebutuhanKotor`).
 */

export const workCenterSchema = z.object({
  code: z.string().min(1, vmsg("validation.codeRequired")).max(20).trim(),
  name: z.string().min(1, vmsg("validation.nameRequired")).max(100).trim(),
  /**
   * Tarif per JAM, IDR. Boleh nol: stasiun yang tidak membebankan apa pun tetap
   * berguna sebagai penanda langkah kerja — dan nol di sini berarti "memang
   * tidak dibebankan", bukan "belum diisi".
   */
  laborRate: z.coerce.number().min(0, vmsg("validation.rateNotNegative")).default(0),
  overheadRate: z.coerce.number().min(0, vmsg("validation.rateNotNegative")).default(0),
  /* `booleanField`, bukan `coerce` — `Boolean("false")` bernilai TRUE, jadi
     "nonaktifkan" yang dikirim sebagai string justru mengaktifkan. Lihat
     catatan panjang di `validations/common.ts`. */
  isActive: booleanField(true),
});

export const bomComponentSchema = z.object({
  itemId: z.coerce.number().int().positive(vmsg("validation.pickStockItem")),
  quantity: z.coerce.number().positive(vmsg("validation.quantityPositive")),
  /** Susut yang DIHARAPKAN. 100 ke atas ditolak — pembaginya nol. */
  scrapPercent: z.coerce
    .number()
    .min(0, vmsg("validation.scrapNotNegative"))
    .lt(100, vmsg("validation.scrapBelow100"))
    .default(0),
});

export const bomOperationSchema = z.object({
  sequence: z.coerce.number().int().positive(),
  name: z.string().min(1, vmsg("validation.nameRequired")).max(100).trim(),
  workCenterId: z.coerce.number().int().positive(vmsg("validation.pickWorkCenter")),
  standardHours: z.coerce.number().min(0, vmsg("validation.hoursNotNegative")).default(0),
});

export const bomSchema = z.object({
  code: z.string().min(1, vmsg("validation.codeRequired")).max(30).trim(),
  outputItemId: z.coerce.number().int().positive(vmsg("validation.pickStockItem")),
  /** Harus > 0: nol adalah pembagi yang tidak ada saat resep diturunkan. */
  outputQuantity: z.coerce.number().positive(vmsg("validation.quantityPositive")),
  notes: z.string().max(500).trim().optional(),
  /* `booleanField`, bukan `coerce` — `Boolean("false")` bernilai TRUE, jadi
     "nonaktifkan" yang dikirim sebagai string justru mengaktifkan. Lihat
     catatan panjang di `validations/common.ts`. */
  isActive: booleanField(true),
  components: z.array(bomComponentSchema).min(1, vmsg("validation.atLeastOneItem")).max(50),
  operations: z.array(bomOperationSchema).max(20).default([]),
});

export const productionOrderSchema = z.object({
  bomId: z.coerce.number().int().positive(vmsg("validation.pickBom")),
  date: z.string().min(1, vmsg("validation.dateRequired")),
  plannedQuantity: z.coerce.number().positive(vmsg("validation.quantityPositive")),
  notes: z.string().max(500).trim().optional(),
  costCenterId: z.coerce.number().int().positive().nullish(),
});

/** Jam sungguhan per langkah, dilaporkan saat menyelesaikan perintah. */
export const productionFinishSchema = z.object({
  /** Keluaran SUNGGUHAN. Harus > 0 — nol adalah susut proses, bukan produksi. */
  producedQuantity: z.coerce.number().positive(vmsg("validation.producedPositive")),
  operations: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        actualHours: z.coerce.number().min(0, vmsg("validation.hoursNotNegative")),
      })
    )
    .max(20)
    .default([]),
});

export type WorkCenterInput = z.infer<typeof workCenterSchema>;
export type BomInputSchema = z.infer<typeof bomSchema>;
export type ProductionOrderInput = z.infer<typeof productionOrderSchema>;
export type ProductionFinishInput = z.infer<typeof productionFinishSchema>;
