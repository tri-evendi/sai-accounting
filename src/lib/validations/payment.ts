import { z } from "zod";
import { currencyEnum, rateField, requireRateForForeign } from "./fx";

/**
 * Field yang muncul di FORM pembayaran — sama persis untuk pembayaran kontrak
 * maupun faktur (issue #53). Diekspor sebagai objek agar dipakai ulang, bukan
 * disalin: `contractPaymentSchema` dan `invoicePaymentSchema` menyusun dirinya
 * dari field yang sama ini lalu menambahkan `contractId`/`invoiceId`, dan form
 * client memakai `paymentFormSchema` di bawah. Dengan begitu validasi client
 * dan server tidak bisa menyimpang diam-diam — inti tuntutan issue ini.
 *
 * Pesan error berbahasa Indonesia yang ramah awam (prinsip MASTER.md): form
 * kini menampilkannya langsung ke pengguna, bukan lagi hanya dipakai server.
 */
export const paymentFormFields = {
  date: z.string().min(1, "Tanggal wajib diisi"),
  amount: z.coerce.number().positive("Jumlah harus lebih besar dari 0"),
  currency: currencyEnum.default("USD"),
  // Wajib untuk valas; `requireRateForForeign` yang menegakkannya di refine.
  rate: rateField,
  note: z.string().max(500).trim().optional(),
};

/**
 * Skema yang dipakai form pembayaran di client. Sengaja TANPA id dokumen —
 * `contractId`/`invoiceId` disuntik server dari URL, bukan diketik pengguna.
 */
export const paymentFormSchema = z
  .object(paymentFormFields)
  .superRefine(requireRateForForeign);

export type PaymentFormInput = z.infer<typeof paymentFormSchema>;
