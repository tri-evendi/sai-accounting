import { z } from "zod";
// Pure module (no Prisma singleton) — safe to pull into schemas that client
// components import.
import { round2 } from "@/lib/posting/rules";
import { vmsg, type ValidationKey } from "@/lib/i18n/validation";

/** Currencies the app transacts in. IDR is the reporting/base currency. */
export const CURRENCY_VALUES = ["USD", "CNY", "IDR"] as const;
export const currencyEnum = z.enum(CURRENCY_VALUES);
export type CurrencyCode = (typeof CURRENCY_VALUES)[number];

export const BASE_CURRENCY: CurrencyCode = "IDR";

/**
 * Mata uang yang TERSIMPAN (kolom `VarChar(5)`) menjadi mata uang yang DIKENAL.
 *
 * Kolomnya teks, dan enumnya hidup di zod — jadi sebuah baris warisan bisa saja
 * membawa kode di luar ketiganya. Yang begitu jatuh ke mata uang dasar buku,
 * bukan dilemparkan: fungsi ini dipakai untuk MENAMPILKAN dan untuk memberi
 * bawaan formulir, dan halaman yang meledak karena satu baris lama berkode aneh
 * jauh lebih buruk daripada satu label yang berbunyi IDR.
 *
 * Bukan pengganti validasi: jalur TULIS tetap lewat `currencyEnum`.
 */
export function asCurrency(value: string | null | undefined): CurrencyCode {
  return (CURRENCY_VALUES as readonly string[]).includes(value ?? "")
    ? (value as CurrencyCode)
    : BASE_CURRENCY;
}

/**
 * Exchange rate to IDR. Optional in the schema, but `requireRateForForeign`
 * makes it mandatory whenever the currency isn't IDR — the posting engine
 * refuses to guess a rate, and booking USD at 1:1 would silently wreck the
 * ledger. Decimal(18,6) in the DB.
 */
export const rateField = z.coerce
  .number()
  .positive(vmsg("validation.ratePositive"))
  .optional();

/**
 * "Kurs wajib" per mata uang asing — SATU KUNCI PER MATA UANG, bukan satu kunci
 * berpenampung `{currency}`.
 *
 * Alasannya jalur client: pesan ini muncul inline di form pembayaran, dan
 * `zodResolver` hanya meneruskan `message` ke react-hook-form — nilai penampung
 * tidak ikut, jadi `{currency}` akan tampil mentah di layar. Mata uangnya
 * berjumlah tiga dan berasal dari enum tertutup, jadi kunci terpisah adalah
 * ongkos yang murah dan jujur. `Exclude<…, "IDR">` membuat `tsc` menuntut kunci
 * baru begitu ada mata uang asing baru di `CURRENCY_VALUES`.
 */
const RATE_REQUIRED_KEY: Record<Exclude<CurrencyCode, "IDR">, ValidationKey> = {
  USD: "validation.rateRequiredUsd",
  CNY: "validation.rateRequiredCny",
};

/**
 * Reject a foreign-currency amount that carries no rate, at validation time
 * (400 with a field error) rather than letting the posting engine throw later.
 */
export function requireRateForForeign(
  data: { currency?: string; rate?: number },
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["rate"]
) {
  if (data.currency && data.currency !== BASE_CURRENCY && !data.rate) {
    // `currency` diketik longgar (`string`) supaya fungsi ini bisa dipanggil
    // dari mana saja; mata uang di luar enum jatuh ke kalimat umum.
    const key = RATE_REQUIRED_KEY[data.currency as Exclude<CurrencyCode, "IDR">];
    ctx.addIssue({
      code: "custom",
      path,
      message: vmsg(key ?? "validation.rateRequiredForeign"),
    });
  }
}

/**
 * Rate + IDR base value to persist alongside a foreign-currency amount.
 * IDR is always 1:1. Callers have already been through `requireRateForForeign`,
 * so a missing rate here can only mean a non-validated call path — throw rather
 * than default to 1.
 */
export function fxAmounts(
  currency: string,
  amount: number,
  rate?: number
): { rate: number; baseAmount: number } {
  if (currency === BASE_CURRENCY) return { rate: 1, baseAmount: round2(amount) };
  if (!rate || rate <= 0) {
    throw new Error(`Kurs ke ${BASE_CURRENCY} wajib diisi untuk mata uang ${currency}.`);
  }
  return { rate, baseAmount: round2(amount * rate) };
}
