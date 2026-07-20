"use client";

/**
 * Customer + currency + rate + PPN block shared by the invoice create and edit
 * forms (issue #35).
 *
 * Kept in one component on purpose: the rule "a non-IDR invoice must carry its
 * own rate" has to read identically on both screens, and the IDR base preview is
 * the only place a user sees what will actually hit the ledger. Mirrors the
 * pattern already used by finance/new and shared/payment-form.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Info, Users } from "lucide-react";

const BASE_CURRENCY = "IDR";

interface CustomerOption {
  id: number;
  name: string;
}

export interface InvoiceFxValues {
  customerId: string;
  currency: string;
  rate: string;
  taxAmount: string;
}

interface InvoiceFxFieldsProps {
  value: InvoiceFxValues;
  onChange: (patch: Partial<InvoiceFxValues>) => void;
  /** Net line total, in the invoice's own currency. */
  subtotal: number;
}

export function InvoiceFxFields({ value, onChange, subtotal }: InvoiceFxFieldsProps) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const { customerId, currency, rate, taxAmount } = value;

  const isForeign = currency !== BASE_CURRENCY;
  const tax = Number(taxAmount) || 0;
  const total = subtotal + tax;
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

  return (
    <>
      <div className="sm:col-span-2">
        <Select
          id="customerId"
          name="customerId"
          label="Pelanggan (Customer)"
          placeholder="-- Pilih pelanggan --"
          value={customerId}
          onChange={(e) => onChange({ customerId: e.target.value })}
          options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
        />
        <p className="mt-1 flex items-start gap-1 text-xs text-gray-500">
          <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Menautkan faktur ke pelanggan agar Piutang Usaha bisa dirinci per pelanggan
            (umur piutang). Boleh dikosongkan untuk faktur lama.
          </span>
        </p>
      </div>

      <Select
        id="currency"
        name="currency"
        label="Mata Uang"
        value={currency}
        onChange={(e) => onChange({ currency: e.target.value })}
        options={[
          { value: "IDR", label: "IDR (Rupiah)" },
          { value: "USD", label: "USD" },
          { value: "CNY", label: "CNY" },
        ]}
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
            onChange={(e) => onChange({ rate: e.target.value })}
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Wajib untuk mata uang asing — nilai IDR di buku besar dihitung dari kurs ini.
          </p>
        </div>
      ) : (
        <div />
      )}

      <div>
        <Input
          id="taxAmount"
          name="taxAmount"
          type="number"
          step="0.01"
          min="0"
          className="text-right tabular-nums"
          label={`PPN Keluaran (${currency})`}
          value={taxAmount}
          onChange={(e) => onChange({ taxAmount: e.target.value })}
        />
        <p className="mt-1 flex items-start gap-1 text-xs text-gray-500">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Pajak yang ditagihkan ke pelanggan. Diposting sebagai Hutang PPN Keluaran.
            Isi 0 bila faktur tidak kena PPN.
          </span>
        </p>
      </div>

      <div className="sm:col-span-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
        <dl className="space-y-1">
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Subtotal ({currency})</dt>
            <dd className="tabular-nums text-gray-900">{formatCurrency(subtotal, currency)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">PPN Keluaran ({currency})</dt>
            <dd className="tabular-nums text-gray-900">{formatCurrency(tax, currency)}</dd>
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
  const isForeign = value.currency !== BASE_CURRENCY;
  return {
    customerId: value.customerId ? Number(value.customerId) : null,
    currency: value.currency,
    rate: isForeign ? Number(value.rate) || undefined : undefined,
    taxAmount: Number(value.taxAmount) || 0,
  };
}
