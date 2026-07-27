import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

/**
 * Pusat biaya — master dimensi (issue #91).
 *
 * Satu skema, dua sisi (Konvensi Form MASTER.md): form client dan route
 * handler mengimpor yang INI, bukan salinannya.
 *
 * `isActive` ikut di sini (tidak seperti `accountSchema` yang membuatnya
 * opsional) karena menonaktifkan adalah cara SATU-SATUNYA menyingkirkan pusat
 * biaya yang sudah dipakai — jadi ia isian form yang sesungguhnya, bukan
 * kolom administratif. Panjangnya mencerminkan kolom DB persis: VarChar(20)
 * dan VarChar(150).
 */
export const costCenterSchema = z.object({
  code: z.string().min(1, vmsg("validation.costCenterCodeRequired")).max(20).trim(),
  name: z.string().min(1, vmsg("validation.costCenterNameRequired")).max(150).trim(),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
});

export type CostCenterInput = z.infer<typeof costCenterSchema>;
