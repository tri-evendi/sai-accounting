/**
 * Skema AKSI TULIS konsol operator (issue #155) — SATU skema, dua sisi
 * (Konvensi Form MASTER.md): form client memvalidasi dengan skema yang sama
 * yang diurai ulang server action (`app/(operator)/operator/tenants/[id]/
 * actions.ts`). Pesan lewat KUNCI kamus (`vmsg`) — kalimatnya disusun di
 * batas tampilan, mengikuti bahasa pengguna.
 *
 * MURNI: tanpa React/Prisma/next/server-only — diimpor komponen client DAN
 * server action. Rumahnya `src/lib/validations/` bersama skema lain, bukan
 * `src/lib/operator/`: penjaga `tests/i18n-validation.test.tsx` menyapu
 * direktori ini untuk memastikan tidak ada kalimat mentah tertinggal di skema
 * dan tidak ada kunci `validation.*` yang menganggur — skema yang bersembunyi
 * di luar sini lolos dari kedua penjaga itu.
 *
 * `reason` WAJIB di SEMUA skema (aturan #155): tindakan tanpa alasan adalah
 * tindakan yang tidak bisa ditinjau ulang. Minimal 5 karakter — "ok" bukan
 * alasan.
 */

import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

/** Alasan yang diketik operator — masuk ke jejak audit apa adanya. */
export const operatorReasonField = z
  .string()
  .trim()
  .min(5, vmsg("validation.operatorReasonRequired"))
  .max(500);

const tenantIdField = z.number().int().positive();

/* ── 1. Tandai tagihan lunas (transfer manual) ─────────────────────────────── */

export const manualPaymentSchema = z.object({
  tenantId: tenantIdField,
  invoiceNumber: z.string().trim().min(1, vmsg("validation.invoiceRequired")),
  /** Nominal DITERIMA di rekening (IDR, bulat — `MoneyInput` decimals 0). */
  amount: z.coerce.number().positive(vmsg("validation.amountPositive")),
  /** Tanggal transfer di rekening koran (yyyy-mm-dd). */
  transferDate: z.string().min(1, vmsg("validation.dateRequired")),
  /** Referensi/berita transfer — kunci anti-duplikat (`gateway_ref` UNIQUE). */
  bankRef: z.string().trim().min(3, vmsg("validation.bankRefRequired")).max(100),
  reason: operatorReasonField,
});
export type ManualPaymentFormInput = z.infer<typeof manualPaymentSchema>;

/* ── 2. Ganti paket ────────────────────────────────────────────────────────── */

export const changePlanSchema = z.object({
  tenantId: tenantIdField,
  planKey: z.string().trim().min(1, vmsg("validation.planRequired")),
  reason: operatorReasonField,
});
export type ChangePlanFormInput = z.infer<typeof changePlanSchema>;

/* ── 3. Suspensi / pemulihan manual ────────────────────────────────────────── */

export const suspensionSchema = z.object({
  tenantId: tenantIdField,
  mode: z.enum(["suspend", "restore"]),
  reason: operatorReasonField,
});
export type SuspensionFormInput = z.infer<typeof suspensionSchema>;

/* ── 4. Eksekusi penghapusan ───────────────────────────────────────────────── */

export const deletionExecuteSchema = z.object({
  tenantId: tenantIdField,
  /** Ketik ulang SLUG tenant — konfirmasi bukti; server mencocokkannya lagi
   *  dengan slug sesungguhnya (client hanya gerbang pertama). */
  confirmSlug: z.string().trim().min(1, vmsg("validation.confirmSlugRequired")),
  reason: operatorReasonField,
});
export type DeletionExecuteFormInput = z.infer<typeof deletionExecuteSchema>;
