import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

/**
 * Dokumen biaya impor (issue #495 butir 1).
 *
 * ⚠ TIDAK ADA SATU PUN ANGKA UANG DI SINI, DAN ITU DISENGAJA.
 *
 * Klien mengirim WHAT saja: tagihan mana yang disebar, ke penerimaan mana, dan
 * dengan dasar apa. Berapa rupiahnya diambil server dari tagihannya, nilai tiap
 * baris dari `unit_cost` penerimaannya, dan saldo barangnya dari gerakannya —
 * pola yang sama dengan retur (#27), dan alasannya sama: nilai basi atau nilai
 * yang diutak-atik tidak akan pernah bisa mencapai buku besar.
 *
 * Yang bisa dilakukan penyerang dengan payload ini paling jauh MEMILIH baris
 * yang salah — dan itu terlihat di layar, bisa ditinjau, dan bisa dibatalkan.
 */
export const landedCostSchema = z.object({
  /** Baris `supplier_transactions` bertipe `purchase` — tagihan yang disebar. */
  purchaseId: z.coerce.number().int().positive(),
  date: z.string().min(1, vmsg("validation.dateRequired")),
  /**
   * `value` sebanding NILAI baris (lazim di ERP), `weight` sebanding KUANTITAS.
   * Untuk ongkos angkut, berat lebih dekat ke sebabnya. Nilai yang sama dengan
   * `AdditionalCostBasis` (#510) — satu kosakata, bukan dua.
   */
  basis: z.enum(["value", "weight"]).default("value"),
  /** Gerakan `in` yang menanggung biayanya — minimal satu. */
  movementIds: z
    .array(z.coerce.number().int().positive())
    .min(1, vmsg("validation.minOneItem"))
    .max(200),
  note: z.string().max(1000).trim().optional(),
});

export type LandedCostInput = z.infer<typeof landedCostSchema>;
