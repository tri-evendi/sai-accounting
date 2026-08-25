import "server-only";

/**
 * Penolakan pembayaran: penanda pembatalan + kalimatnya (issue #424, dibagi
 * pakai di #483).
 *
 * == Kenapa berkas sendiri ==================================================
 * Keduanya lahir di route pembayaran FAKTUR. Begitu jalur pembayaran KONTRAK
 * memakai penjaga yang sama (`checkPaymentFits`), menyalinnya berarti dua
 * salinan kalimat penolakan yang bisa menyimpang — dan menyimpangnya tidak akan
 * terlihat sampai seseorang membandingkan dua layar berdampingan.
 *
 * Aturannya sendiri tetap di `lib/document-payments.ts` dan tetap MURNI: ia
 * tidak tahu bahasa apa pun. Yang di sini justru yang tahu — dan karena itu
 * `server-only`: `getRequestI18n` membaca cookie permintaan.
 */
import { formatCurrency } from "@/lib/utils";
import { getRequestI18n } from "@/lib/i18n/server";
import type { PaymentProblem } from "@/lib/document-payments";

/**
 * Penanda pembatalan transaksi penjaga pembayaran — tak pernah sampai ke
 * pengguna. Dilempar di dalam `$transaction` supaya TIDAK ADA satu baris pun
 * tertulis; alasan sebenarnya dibaca dari `problem` sesudahnya.
 */
export class PaymentRefused extends Error {}

/**
 * Alasan penolakan menjadi kalimat, dalam bahasa pengguna.
 *
 * Nominal diformat DI SINI, bukan di penjaganya: penjaga itu murni dan tidak
 * tahu bahasa apa pun, sementara "Rp 8.000.000.000" hanya benar setelah
 * lokalnya diketahui.
 */
export async function paymentProblemMessage(problem: PaymentProblem): Promise<string> {
  const { t } = await getRequestI18n();
  switch (problem.code) {
    case "currency_mismatch":
      return t("errors.paymentCurrencyMismatch", {
        payment: problem.paymentCurrency,
        document: problem.documentCurrency,
      });
    case "document_value_unknown":
      return t("errors.paymentDocumentValueUnknown");
    case "exceeds_outstanding":
      return t("errors.paymentExceedsOutstanding", {
        attempted: formatCurrency(problem.attemptedBase),
        outstanding: formatCurrency(problem.outstandingBase),
      });
  }
}
