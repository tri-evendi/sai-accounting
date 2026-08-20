import { z } from "zod";
import { BASE_CURRENCY, currencyEnum, rateField, requireRateForForeign } from "./fx";
import { vmsg } from "@/lib/i18n/validation";

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
  date: z.string().min(1, vmsg("validation.dateRequired")),
  amount: z.coerce.number().positive(vmsg("validation.amountPositive")),
  /*
   * Bawaannya IDR, bukan USD (issue #424).
   *
   * `default("USD")` di aplikasi pembukuan rupiah adalah ranjau yang sudah
   * meledak: buku produksi memuat enam pembayaran tahun 2022 berlabel USD
   * dengan nominal yang jelas rupiah (Rp88,2 juta, Rp638 juta) dan TANPA kurs —
   * sehingga nilai IDR-nya tidak diketahui dan umur piutang tidak bisa
   * menghitungnya sama sekali. Permintaan yang lupa menyebut mata uang kini
   * jatuh ke mata uang dasar buku, yang benar untuk hampir setiap baris; yang
   * benar-benar valas tetap harus menyebutkannya, dan `requireRateForForeign`
   * tetap menuntut kursnya.
   */
  currency: currencyEnum.default(BASE_CURRENCY),
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
