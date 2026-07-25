import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "IDR") {
  const localeMap: Record<string, string> = {
    IDR: "id-ID",
    USD: "en-US",
    CNY: "zh-CN",
  };

  try {
    return new Intl.NumberFormat(localeMap[currency] || "id-ID", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(amount);
  } catch {
    // `Intl.NumberFormat` throws `RangeError: Invalid currency code` for any code
    // that is not valid ISO-4217 (legacy/dirty data such as "Rp" or "S$"). A bad
    // string on a single document must never 500 a whole ledger page, so fall back
    // to the plain number followed by the raw code as a visible label. Fix the
    // underlying value through the document's edit form.
    return `${new Intl.NumberFormat("id-ID").format(amount)} ${currency}`.trim();
  }
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateShort(date: Date | string) {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}
