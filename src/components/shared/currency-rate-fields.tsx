"use client";

/**
 * Currency picker + conditional FX rate input — the one place the rule "a
 * non-IDR document must carry its own rate" is expressed in the UI.
 *
 * Extracted from InvoiceFxFields (issue #35) when contracts gained a stored rate
 * (issue #36), so both document types ask for the rate in identical words rather
 * than growing two drifting copies of the same field. The server-side twin of
 * this rule lives in `requireRateForForeign` (validations/fx.ts), which rejects a
 * rateless foreign document as a 400 field error.
 *
 * Renders two grid cells (currency, then rate) so it drops straight into the
 * `sm:grid-cols-2` form layouts both forms already use. The rate cell stays
 * present-but-empty for IDR to keep the grid from reflowing.
 */

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export const BASE_CURRENCY = "IDR";

export const CURRENCY_OPTIONS = [
  { value: "IDR", label: "IDR (Rupiah)" },
  { value: "USD", label: "USD" },
  { value: "CNY", label: "CNY" },
];

interface CurrencyRateFieldsProps {
  currency: string;
  /** Rate as raw form state, so a half-typed value isn't clobbered by Number(). */
  rate: string;
  onCurrencyChange: (currency: string) => void;
  onRateChange: (rate: string) => void;
  currencyLabel?: string;
  /** Explains what the rate is used for on this particular document. */
  rateHint?: string;
}

export function CurrencyRateFields({
  currency,
  rate,
  onCurrencyChange,
  onRateChange,
  currencyLabel = "Mata Uang",
  rateHint = "Wajib untuk mata uang asing — nilai IDR di buku besar dihitung dari kurs ini.",
}: CurrencyRateFieldsProps) {
  const isForeign = currency !== BASE_CURRENCY;

  return (
    <>
      <Select
        id="currency"
        name="currency"
        label={currencyLabel}
        value={currency}
        onChange={(e) => onCurrencyChange(e.target.value)}
        options={CURRENCY_OPTIONS}
      />

      {isForeign ? (
        <div>
          <Input
            id="rate"
            name="rate"
            type="number"
            step="0.000001"
            min="0"
            className="text-right tabular-nums"
            label={`Kurs 1 ${currency} ke IDR`}
            value={rate}
            onChange={(e) => onRateChange(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-gray-500">{rateHint}</p>
        </div>
      ) : (
        <div />
      )}
    </>
  );
}

/** True when this currency/rate pair has no IDR value yet. */
export function baseUnknown(currency: string, rate: string): boolean {
  return currency !== BASE_CURRENCY && !(Number(rate) > 0);
}

/**
 * The `currency` + `rate` request-body fields, from raw form state. `rate` is
 * omitted for IDR: the base currency is 1:1 and the schema wants it absent, not 1.
 */
export function currencyRatePayload(currency: string, rate: string) {
  return {
    currency,
    rate: currency === BASE_CURRENCY ? undefined : Number(rate) || undefined,
  };
}
