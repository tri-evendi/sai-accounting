"use client";

/**
 * Customer + currency + rate + PPN block shared by the invoice create and edit
 * forms (issues #35, #16).
 *
 * Kept in one component on purpose: the rule "a non-IDR invoice must carry its
 * own rate" and the PPN DPP/PPN/Total breakdown have to read identically on both
 * screens, and the IDR base preview is the only place a user sees what will
 * actually hit the ledger. Mirrors the pattern already used by finance/new and
 * shared/payment-form.
 *
 * PPN (issue #16) is a first-class control here: a "Kena PPN" toggle plus a rate
 * (%) field, defaulting to 11% for domestic IDR invoices and to 0% (non-VAT) for
 * foreign/export invoices or a tax-exempt customer — all overridable. The form
 * sends `taxable` + `taxRate`; the server recomputes the PPN amount from them.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  BASE_CURRENCY,
  CurrencyRateFields,
  currencyRatePayload,
} from "@/components/shared/currency-rate-fields";
import { computeTax, defaultInvoiceTax, DEFAULT_TAX_RATE } from "@/lib/tax";
import { formatCurrency } from "@/lib/utils";
import { Info, Users, ReceiptText } from "lucide-react";

interface CustomerOption {
  id: number;
  name: string;
  taxExempt?: boolean;
}

export interface InvoiceFxValues {
  customerId: string;
  currency: string;
  rate: string;
  /** Whether PPN Keluaran applies. */
  taxable: boolean;
  /** PPN rate in percent, as a form string (e.g. "11"). */
  taxRate: string;
}

interface InvoiceFxFieldsProps {
  value: InvoiceFxValues;
  onChange: (patch: Partial<InvoiceFxValues>) => void;
  /** Net line total (DPP), in the invoice's own currency. */
  subtotal: number;
}

export function InvoiceFxFields({ value, onChange, subtotal }: InvoiceFxFieldsProps) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const { customerId, currency, rate, taxable, taxRate } = value;

  const isForeign = currency !== BASE_CURRENCY;
  const effectiveRate = taxable ? Number(taxRate) || 0 : 0;
  // Reuse the exact server-side computation for the preview so the figure shown
  // and the figure posted can never disagree.
  const { dpp, taxAmount, total } = computeTax(subtotal, effectiveRate);
  const rateValue = Number(rate) || 0;
  const baseTotal = isForeign ? total * rateValue : total;
  const baseUnknown = isForeign && rateValue <= 0;

  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      const res = await fetch("/api/customers");
      if (!res.ok || cancelled) return;
      const data: CustomerOption[] = await res.json();
      if (!cancelled) setCustomers(data);
    }

    void loadCustomers();
    return () => {
      cancelled = true;
    };
  }, []);

  /** The PPN default (taxable + rate string) implied by a currency/customer. */
  function applyTaxDefault(next: { currency?: string; customerTaxExempt?: boolean }) {
    const d = defaultInvoiceTax({
      currency: next.currency ?? currency,
      customerTaxExempt: next.customerTaxExempt,
    });
    return { taxable: d.taxable, taxRate: String(d.taxRate) };
  }

  function handleCustomerChange(id: string) {
    const picked = customers.find((c) => String(c.id) === id);
    onChange({ customerId: id, ...applyTaxDefault({ customerTaxExempt: picked?.taxExempt }) });
  }

  function handleCurrencyChange(c: string) {
    const picked = customers.find((cust) => String(cust.id) === customerId);
    onChange({
      currency: c,
      ...applyTaxDefault({ currency: c, customerTaxExempt: picked?.taxExempt }),
    });
  }

  return (
    <>
      <div className="sm:col-span-2">
        <Select
          id="customerId"
          name="customerId"
          label="Pelanggan (Customer)"
          placeholder="-- Pilih pelanggan --"
          value={customerId}
          onChange={(e) => handleCustomerChange(e.target.value)}
          options={customers.map((c) => ({
            value: String(c.id),
            label: c.taxExempt ? `${c.name} · bebas PPN` : c.name,
          }))}
        />
        <p className="mt-1 flex items-start gap-1 text-xs text-gray-500">
          <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Menautkan faktur ke pelanggan agar Piutang Usaha bisa dirinci per pelanggan
            (umur piutang). Boleh dikosongkan untuk faktur lama.
          </span>
        </p>
      </div>

      <CurrencyRateFields
        currency={currency}
        rate={rate}
        onCurrencyChange={handleCurrencyChange}
        onRateChange={(r) => onChange({ rate: r })}
      />

      {/* PPN control (issue #16) */}
      <div className="sm:col-span-2 rounded-md border border-gray-200 p-3">
        <label htmlFor="taxable" className="flex cursor-pointer items-center gap-2">
          <input
            id="taxable"
            name="taxable"
            type="checkbox"
            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={taxable}
            onChange={(e) =>
              onChange({
                taxable: e.target.checked,
                // Turning PPN on with no rate yet gives the statutory default.
                taxRate:
                  e.target.checked && !(Number(taxRate) > 0) ? String(DEFAULT_TAX_RATE) : taxRate,
              })
            }
          />
          <span className="flex items-center gap-1 text-sm font-medium text-gray-700">
            <ReceiptText className="h-4 w-4 text-gray-400" aria-hidden="true" />
            Kena PPN (PPN Keluaran)
          </span>
        </label>

        {taxable ? (
          <div className="mt-3">
            <Input
              id="taxRate"
              name="taxRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="max-w-[140px] text-right tabular-nums"
              label="Tarif PPN (%)"
              value={taxRate}
              onChange={(e) => onChange({ taxRate: e.target.value })}
            />
            <p className="mt-1 flex items-start gap-1 text-xs text-gray-500">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Standar PPN Indonesia 11%. Isi 0 untuk ekspor / tidak kena PPN.</span>
            </p>
          </div>
        ) : (
          <p className="mt-2 flex items-start gap-1 text-xs text-gray-500">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Tidak kena PPN (0%) — biasa untuk ekspor / pelanggan bebas PPN. Tidak ada baris
              PPN pada jurnal.
            </span>
          </p>
        )}
      </div>

      <div className="sm:col-span-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
        <dl className="space-y-1">
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">DPP · Dasar Pengenaan Pajak ({currency})</dt>
            <dd className="tabular-nums text-gray-900">{formatCurrency(dpp, currency)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">
              PPN {taxable ? `(${effectiveRate}%)` : "(tidak kena)"} ({currency})
            </dt>
            <dd className="tabular-nums text-gray-900">{formatCurrency(taxAmount, currency)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-1 font-medium">
            <dt className="text-gray-700">Total tagihan ({currency})</dt>
            <dd className="tabular-nums text-gray-900">{formatCurrency(total, currency)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Nilai dasar buku besar (IDR)</dt>
            <dd className="tabular-nums font-medium text-gray-900">
              {baseUnknown ? "— isi kurs dulu" : formatCurrency(baseTotal, "IDR")}
            </dd>
          </div>
        </dl>
      </div>
    </>
  );
}

/** Request body fields for the invoice API, from the form's string state. */
export function invoiceFxPayload(value: InvoiceFxValues) {
  return {
    customerId: value.customerId ? Number(value.customerId) : null,
    ...currencyRatePayload(value.currency, value.rate),
    taxable: value.taxable,
    taxRate: value.taxable ? Number(value.taxRate) || 0 : 0,
  };
}
