import { z } from "zod";
import { BASE_CURRENCY, currencyEnum, rateField, requireRateForForeign } from "./fx";
import { CASH_TYPES } from "@/lib/constants";
import { vmsg } from "@/lib/i18n/validation";

/**
 * Kas/bank yang dipakai sebuah pelunasan (migrasi 0059).
 *
 * NULL = tidak disebut, dan itu bukan isian yang terlewat melainkan perilaku
 * LAMA yang dipertahankan: `cashKeyForType(null)` memulangkan slot
 * `cash_default`, persis yang dipakai setiap pembayaran sebelum kolom ini ada.
 */
export const cashTypeField = z
  .preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.enum(CASH_TYPES).nullable()
  )
  .default(null);

/**
 * Kas fisik hanya untuk dokumen RUPIAH.
 *
 * Slot pemetaan `cash_kas_besar`/`cash_kas_kecil` sengaja TIDAK punya baris per
 * mata uang — lihat catatan panjang di `posting/mapping.ts`. Karena
 * `resolveAccountIds` jatuh ke baris agnostik bila tak ada yang cocok, membiarkan
 * pembayaran USD memilih "kas besar" akan MENGKREDIT akun kas rupiah dengan
 * nominal dolar: bukan galat, bukan penolakan, hanya angka yang salah tempat.
 *
 * Itu persis cacat warisan yang catatan di mapping.ts peringatkan ("foreign
 * payments already posted into 110102 Kas Besar"). Penjaga ini menutup pintu
 * yang melahirkannya, alih-alih menambah satu generasi lagi baris yang harus
 * diperbaiki satu per satu di kemudian hari.
 *
 * `bank` tetap boleh untuk mata uang apa pun: slot itu MEMANG punya baris IDR,
 * USD, dan CNY sendiri.
 */
export function requireBankForForeignCash(
  data: { currency?: string; cashType?: string | null },
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["cashType"]
) {
  const cashType = data.cashType;
  if (!cashType || cashType === "bank") return;
  if ((data.currency || BASE_CURRENCY) === BASE_CURRENCY) return;
  ctx.addIssue({ code: "custom", path, message: vmsg("validation.cashPhysicalIdrOnly") });
}

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
  cashType: cashTypeField,
};

/**
 * Skema yang dipakai form pembayaran di client. Sengaja TANPA id dokumen —
 * `contractId`/`invoiceId` disuntik server dari URL, bukan diketik pengguna.
 */
export const paymentFormSchema = z
  .object(paymentFormFields)
  .superRefine((data, ctx) => {
    requireRateForForeign(data, ctx);
    requireBankForForeignCash(data, ctx);
  });

export type PaymentFormInput = z.infer<typeof paymentFormSchema>;
