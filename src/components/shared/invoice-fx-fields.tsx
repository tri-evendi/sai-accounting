"use client";

/**
 * Customer + currency + rate + PPN block shared by the invoice create and edit
 * forms (issues #35, #16).
 *
 * Kept in one file on purpose: the rule "a non-IDR invoice must carry its own
 * rate" and the PPN DPP/PPN/Total breakdown have to read identically on both
 * screens, and the IDR base preview is the only place a user sees what will
 * actually hit the ledger. Mirrors the pattern already used by finance/new and
 * shared/payment-form.
 *
 * PPN (issue #16) is a first-class control here: a "Kena PPN" toggle plus a rate
 * (%) field, defaulting to 11% for domestic IDR invoices and to 0% (non-VAT) for
 * foreign/export invoices or a tax-exempt customer — all overridable. The form
 * sends `taxable` + `taxRate`; the server recomputes the PPN amount from them.
 *
 * BAGIAN-BAGIAN (issue #4). Progressive disclosure memisahkan blok ini: pelanggan
 * dan ringkasan nilai tetap terlihat, sedangkan mata uang/kurs/PPN/PEB masuk ke
 * "Detail lengkap" yang terlipat. Karena itu isinya dipecah jadi tiga komponen
 * kecil yang bisa ditempatkan terpisah, sementara `InvoiceFxFields` tetap ada
 * sebagai gabungan ketiganya — halaman Ubah Faktur memakainya tanpa perubahan,
 * jadi tidak ada dua salinan aturan PPN yang bisa saling menyimpang.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TermTooltip } from "@/components/ui/term-tooltip";
import {
  BASE_CURRENCY,
  CurrencyRateFields,
  currencyRatePayload,
} from "@/components/shared/currency-rate-fields";
import { computeTax, defaultInvoiceTax, DEFAULT_TAX_RATE } from "@/lib/tax";
import { formatCurrency } from "@/lib/utils";
import { Info, Users, ReceiptText, Ship } from "lucide-react";

export interface CustomerOption {
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
  // ── Dokumen ekspor / PEB (issue #17) — only meaningful on an export/0% invoice.
  /** Nomor PEB (Pemberitahuan Ekspor Barang). */
  pebNumber: string;
  /** Tanggal PEB, as a `YYYY-MM-DD` string. */
  pebDate: string;
  /** Free-text export-document note. */
  exportNote: string;
}

type Patch = (patch: Partial<InvoiceFxValues>) => void;

/**
 * Daftar pelanggan aktif. Diekspor supaya halaman yang menempatkan bagian-bagian
 * blok ini terpisah tetap mengambilnya SEKALI, lalu meneruskannya ke tiap bagian.
 */
export function useInvoiceCustomers(): CustomerOption[] {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

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

  return customers;
}

/** The PPN default (taxable + rate string) implied by a currency/customer. */
function applyTaxDefault(
  current: InvoiceFxValues,
  next: { currency?: string; customerTaxExempt?: boolean }
) {
  const d = defaultInvoiceTax({
    currency: next.currency ?? current.currency,
    customerTaxExempt: next.customerTaxExempt,
  });
  return { taxable: d.taxable, taxRate: String(d.taxRate) };
}

/** True when this invoice is an export / 0% document, where a PEB applies. */
export function isExportDocument(value: InvoiceFxValues): boolean {
  const effectiveRate = value.taxable ? Number(value.taxRate) || 0 : 0;
  return value.currency !== BASE_CURRENCY || !value.taxable || effectiveRate === 0;
}

// ────────────────────────────── Bagian: pelanggan ──────────────────────────────

/** Pemilih pelanggan — isian INTI faktur, tidak pernah disembunyikan. */
export function InvoiceCustomerField({
  customers,
  value,
  onChange,
}: {
  customers: CustomerOption[];
  value: InvoiceFxValues;
  onChange: Patch;
}) {
  function handleCustomerChange(id: string) {
    const picked = customers.find((c) => String(c.id) === id);
    onChange({ customerId: id, ...applyTaxDefault(value, { customerTaxExempt: picked?.taxExempt }) });
  }

  return (
    <div className="sm:col-span-2">
      <Select
        id="customerId"
        name="customerId"
        label={<TermTooltip term="pelanggan">Pelanggan (Customer)</TermTooltip>}
        placeholder="-- Pilih pelanggan --"
        value={value.customerId}
        onChange={(e) => handleCustomerChange(e.target.value)}
        options={customers.map((c) => ({
          value: String(c.id),
          label: c.taxExempt ? `${c.name} · bebas PPN` : c.name,
        }))}
      />
      <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Menautkan faktur ke pelanggan agar Piutang Usaha bisa dirinci per pelanggan
          (umur piutang). Boleh dikosongkan untuk faktur lama.
        </span>
      </p>
    </div>
  );
}

// ─────────────────────── Bagian: valas + PPN + dokumen ekspor ───────────────────────

/**
 * Mata uang, kurs, PPN, dan PEB — isian LANJUTAN. Faktur rupiah biasa memakai
 * seluruh nilai standarnya (IDR, PPN 11%), jadi bagian ini boleh tidak dibuka
 * sama sekali; kalau kursnya ternyata wajib, penolakan server membuka kembali
 * bagian ini dan memfokuskan isian `rate`.
 */
export function InvoiceFxAdvancedFields({
  customers,
  value,
  onChange,
}: {
  customers: CustomerOption[];
  value: InvoiceFxValues;
  onChange: Patch;
}) {
  const { customerId, currency, rate, taxable, taxRate, pebNumber, pebDate, exportNote } = value;
  const effectiveRate = taxable ? Number(taxRate) || 0 : 0;

  function handleCurrencyChange(c: string) {
    const picked = customers.find((cust) => String(cust.id) === customerId);
    onChange({
      currency: c,
      ...applyTaxDefault(value, { currency: c, customerTaxExempt: picked?.taxExempt }),
    });
  }

  return (
    <>
      <CurrencyRateFields
        currency={currency}
        rate={rate}
        onCurrencyChange={handleCurrencyChange}
        onRateChange={(r) => onChange({ rate: r })}
      />

      {/* PPN control (issue #16) */}
      <div className="sm:col-span-2 rounded-md border border-border p-3">
        <label htmlFor="taxable" className="flex cursor-pointer items-center gap-2">
          <input
            id="taxable"
            name="taxable"
            type="checkbox"
            className="h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-ring"
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
          <span className="flex items-center gap-1 text-sm font-medium text-foreground">
            <ReceiptText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <TermTooltip term="ppn">Kena PPN (PPN Keluaran)</TermTooltip>
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
            <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Standar PPN Indonesia 11%. Isi 0 untuk ekspor / tidak kena PPN.</span>
            </p>
          </div>
        ) : (
          <p className="mt-2 flex items-start gap-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Tidak kena PPN (0%) — biasa untuk ekspor / pelanggan bebas PPN. Tidak ada baris
              PPN pada jurnal.
            </span>
          </p>
        )}
      </div>

      {/* Dokumen ekspor / PEB (issue #17) — shown only for an export/0% invoice. */}
      {(currency !== BASE_CURRENCY || !taxable || effectiveRate === 0) && (
        <div className="sm:col-span-2 rounded-md border border-border p-3">
          <p className="flex items-center gap-1 text-sm font-medium text-foreground">
            <Ship className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Dokumen Ekspor (PEB)
          </p>
          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Untuk penjualan ekspor (PPN 0%), nomor PEB menggantikan nomor Faktur Pajak
              dan dipakai pada ekspor e-Faktur. Opsional.
            </span>
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              id="pebNumber"
              name="pebNumber"
              label="Nomor PEB"
              value={pebNumber}
              onChange={(e) => onChange({ pebNumber: e.target.value })}
            />
            <Input
              id="pebDate"
              name="pebDate"
              type="date"
              label="Tanggal PEB"
              value={pebDate}
              onChange={(e) => onChange({ pebDate: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                id="exportNote"
                name="exportNote"
                label="Keterangan ekspor"
                value={exportNote}
                onChange={(e) => onChange({ exportNote: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────── Bagian: ringkasan nilai ───────────────────────────

/**
 * DPP / PPN / Total / nilai dasar IDR. Ini UANG-nya, jadi tidak pernah ikut
 * terlipat: apa pun yang disembunyikan di "Detail lengkap", akibatnya tetap
 * terbaca di sini.
 */
export function InvoiceTotalsSummary({
  value,
  subtotal,
}: {
  value: InvoiceFxValues;
  subtotal: number;
}) {
  const { currency, rate, taxable, taxRate } = value;
  const isForeign = currency !== BASE_CURRENCY;
  const effectiveRate = taxable ? Number(taxRate) || 0 : 0;
  // Reuse the exact server-side computation for the preview so the figure shown
  // and the figure posted can never disagree.
  const { dpp, taxAmount, total } = computeTax(subtotal, effectiveRate);
  const rateValue = Number(rate) || 0;
  const baseTotal = isForeign ? total * rateValue : total;
  const baseUnknown = isForeign && rateValue <= 0;

  return (
    <div className="sm:col-span-2 rounded-md border border-border bg-muted px-3 py-2 text-sm">
      <dl className="space-y-1">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">DPP · Dasar Pengenaan Pajak ({currency})</dt>
          <dd className="tabular-nums text-foreground">{formatCurrency(dpp, currency)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">
            PPN {taxable ? `(${effectiveRate}%)` : "(tidak kena)"} ({currency})
          </dt>
          <dd className="tabular-nums text-foreground">{formatCurrency(taxAmount, currency)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1 font-medium">
          <dt className="text-foreground">Total tagihan ({currency})</dt>
          <dd className="tabular-nums text-foreground">{formatCurrency(total, currency)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Nilai dasar buku besar (IDR)</dt>
          <dd className="tabular-nums font-medium text-foreground">
            {baseUnknown ? "— isi kurs dulu" : formatCurrency(baseTotal, "IDR")}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ──────────────────────────────── Gabungan ────────────────────────────────

interface InvoiceFxFieldsProps {
  value: InvoiceFxValues;
  onChange: Patch;
  /** Net line total (DPP), in the invoice's own currency. */
  subtotal: number;
}

/**
 * Ketiga bagian berurutan, seperti sebelum issue #4. Dipakai halaman Ubah
 * Faktur, yang formulirnya memang tidak dilipat.
 */
export function InvoiceFxFields({ value, onChange, subtotal }: InvoiceFxFieldsProps) {
  const customers = useInvoiceCustomers();

  return (
    <>
      <InvoiceCustomerField customers={customers} value={value} onChange={onChange} />
      <InvoiceFxAdvancedFields customers={customers} value={value} onChange={onChange} />
      <InvoiceTotalsSummary value={value} subtotal={subtotal} />
    </>
  );
}

/** Request body fields for the invoice API, from the form's string state. */
export function invoiceFxPayload(value: InvoiceFxValues) {
  // PEB only belongs on an export/0% document; a domestic taxable invoice clears
  // it so a value typed before switching modes is not persisted by accident.
  const exportDoc = isExportDocument(value);
  return {
    customerId: value.customerId ? Number(value.customerId) : null,
    ...currencyRatePayload(value.currency, value.rate),
    taxable: value.taxable,
    taxRate: value.taxable ? Number(value.taxRate) || 0 : 0,
    pebNumber: exportDoc ? value.pebNumber || null : null,
    pebDate: exportDoc ? value.pebDate || null : null,
    exportNote: exportDoc ? value.exportNote || null : null,
  };
}
