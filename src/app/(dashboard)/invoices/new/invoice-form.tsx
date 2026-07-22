"use client";

/**
 * Buat Faktur — form + pola "Ambil" (issue #15).
 *
 * "Ambil" (pull) is the point of this screen: pick the source contract and the
 * faktur lines are filled from what is still OUTSTANDING — never from the
 * contract's original quantity — so nothing is re-typed and nothing is invoiced
 * twice. Two remainders are offered:
 *   • "Sisa kontrak"      — everything not yet invoiced;
 *   • "Sudah dikirim"     — only what a surat jalan has actually shipped and that
 *                           is not yet invoiced (Accurate's DO → Invoice flow).
 *
 * The remainders shown here are a CONVENIENCE. The same arithmetic re-runs inside
 * POST /api/invoices' transaction (`assertWithinContract`), so a stale page or a
 * hand-edited quantity still cannot over-invoice a contract.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { DisclosureSection, focusFormField } from "@/components/ui/disclosure-section";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { DueDateField } from "@/components/shared/due-date-field";
import {
  InvoiceCustomerField,
  InvoiceFxAdvancedFields,
  InvoiceTotalsSummary,
  invoiceFxPayload,
  useInvoiceCustomers,
  type InvoiceFxValues,
} from "@/components/shared/invoice-fx-fields";
import { invoiceSubtotal } from "@/lib/validations/invoice";
import { defaultInvoiceTax } from "@/lib/tax";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { resolveSubmitFailure } from "@/lib/form-sections";
import {
  closedPeriodIssue,
  negativeValueIssue,
  type ClosedPeriodRef,
} from "@/lib/form-guards";
import type { ContractLineOutstanding, PulledInvoiceLine } from "@/lib/document-chain";
import { Trash2, Plus, Download, Info, Loader2, AlertCircle, Lock } from "lucide-react";

interface ContractOption {
  id: number;
  contractNo: string;
  buyer: string;
  currency: string;
}

interface InvoiceItem {
  itemName: string;
  quantity: number;
  price: number;
  unit: string;
}

/** Shape of GET /api/contracts/[id]/outstanding. */
interface OutstandingResponse {
  contract: { id: number; contractNo: string; buyer: string; currency: string; status: string };
  lines: ContractLineOutstanding[];
  totals: { remainingKg: number; remainingValue: number; readyToInvoiceKg: number };
  pull: { contract: PulledInvoiceLine[]; delivery: PulledInvoiceLine[] };
}

const emptyItem = (): InvoiceItem => ({ itemName: "", quantity: 0, price: 0, unit: "kg" });

/** Is the item list still the untouched default? Then a pull replaces it silently. */
const isPristine = (items: InvoiceItem[]) =>
  items.every((i) => !i.itemName.trim() && !i.quantity && !i.price);

export function NewInvoiceForm({
  contracts,
  initialContractId,
  closedPeriods,
}: {
  contracts: ContractOption[];
  initialContractId: number | null;
  closedPeriods: ClosedPeriodRef[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const customers = useInvoiceCustomers();
  // Progressive disclosure (issue #4): jatuh tempo, status, valas, PPN & PEB.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedInvalid, setAdvancedInvalid] = useState(false);
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("pending");

  // ── Pola "Ambil" ──
  const [contractId, setContractId] = useState<number | null>(initialContractId);
  const [outstanding, setOutstanding] = useState<OutstandingResponse | null>(null);
  // Starts true when a contract arrives pre-selected (`?contractId=` from the
  // contract detail page), so the first paint says "memuat" instead of "kosong".
  const [loadingOutstanding, setLoadingOutstanding] = useState(initialContractId != null);
  const [pullNote, setPullNote] = useState("");

  // Currency drives which extra fields the accounting engine needs from the user.
  // A new domestic IDR invoice defaults to PPN 11%; choosing a foreign currency
  // or a tax-exempt customer flips it to 0% (see InvoiceFxFields).
  const [fx, setFx] = useState<InvoiceFxValues>({
    customerId: "",
    currency: "IDR",
    rate: "",
    taxable: true,
    taxRate: "11",
    pebNumber: "",
    pebDate: "",
    exportNote: "",
  });

  const subtotal = invoiceSubtotal(items);
  const periodIssue = closedPeriodIssue(date, closedPeriods, "Tanggal tagihan");

  /** Baris yang melebihi sisa kontrak — cermin UI dari `assertWithinContract`. */
  function overContractLines(): string[] {
    if (!outstanding) return [];
    return items.flatMap((item) => {
      const key = item.itemName.trim().toLowerCase().replace(/\s+/g, " ");
      const line = outstanding.lines.find((l) => l.key === key);
      if (!line || item.quantity <= line.remainingKg) return [];
      return [
        `${line.itemName} (ditagihkan ${formatNumber(item.quantity)} kg, sisa kontrak ${formatNumber(
          line.remainingKg
        )} kg)`,
      ];
    });
  }

  /** Match the faktur's currency to the contract it draws on — pulled prices are
   *  quoted in the contract's currency, so anything else would misstate them. */
  const adoptCurrency = useCallback((currency: string) => {
    setFx((prev) => {
      if (prev.currency === currency) return prev;
      const d = defaultInvoiceTax({ currency });
      return { ...prev, currency, taxable: d.taxable, taxRate: String(d.taxRate) };
    });
  }, []);

  // Fetch the picked contract's outstanding — an external system, so an effect is
  // the right home. All state changes happen in the async callback (the reset on
  // selection lives in the change handler below), never synchronously in the body.
  useEffect(() => {
    if (contractId == null) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/contracts/${contractId}/outstanding`);
      if (cancelled) return;
      setLoadingOutstanding(false);
      if (!res.ok) {
        setError("Gagal memuat sisa kontrak.");
        return;
      }
      const data: OutstandingResponse = await res.json();
      if (cancelled) return;
      setOutstanding(data);
      adoptCurrency(data.contract.currency);
    })();
    return () => {
      cancelled = true;
    };
  }, [contractId, adoptCurrency]);

  /** Picking (or clearing) the source contract resets everything derived from it. */
  function chooseContract(id: number | null) {
    setContractId(id);
    setOutstanding(null);
    setPullNote("");
    setError("");
    setLoadingOutstanding(id != null);
  }

  function pull(source: "contract" | "delivery") {
    if (!outstanding) return;
    const lines = outstanding.pull[source];
    if (lines.length === 0) {
      setPullNote(
        source === "delivery"
          ? "Tidak ada barang yang sudah dikirim dan belum difakturkan."
          : "Semua barang pada kontrak ini sudah difakturkan."
      );
      return;
    }
    const pulled: InvoiceItem[] = lines.map((l) => ({
      itemName: l.itemName,
      quantity: l.quantity,
      price: l.price,
      unit: l.unit,
    }));
    const replacing = isPristine(items);
    setItems(replacing ? pulled : [...items.filter((i) => i.itemName.trim()), ...pulled]);
    setPullNote(
      `${lines.length} baris diambil dari ${
        source === "delivery" ? "surat jalan (sudah dikirim)" : "sisa kontrak"
      } ${outstanding.contract.contractNo}. Jumlah boleh dikurangi, tidak boleh melebihi sisa.`
    );
  }

  function addItem() {
    setItems([...items, emptyItem()]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  /** Tampilkan galat, buka bagian yang menyembunyikannya, lalu fokuskan isiannya. */
  function reportFailure(message: string, field: string | null, inAdvanced: boolean) {
    setError(message);
    setAdvancedInvalid(inAdvanced);
    if (inAdvanced) setAdvancedOpen(true);
    if (field) requestAnimationFrame(() => focusFormField(field));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setAdvancedInvalid(false);

    // ── Penjaga sebelum kirim (cermin dari penjaga server) ──
    if (periodIssue) {
      reportFailure(periodIssue, "date", false);
      return;
    }
    const negative = negativeValueIssue([
      { field: "rate", value: Number(fx.rate) },
      { field: "taxRate", value: Number(fx.taxRate) },
      ...items.flatMap((item, i) => [
        { field: `quantity-${i}`, value: item.quantity, label: `Jumlah baris ${i + 1}` },
        { field: `price-${i}`, value: item.price, label: `Harga baris ${i + 1}` },
      ]),
    ]);
    if (negative) {
      reportFailure(negative.message, negative.field, negative.field === "rate" || negative.field === "taxRate");
      return;
    }
    const over = overContractLines();
    if (over.length > 0) {
      reportFailure(
        `Jumlah yang ditagihkan melebihi sisa kontrak: ${over.join("; ")}. ` +
          `Kurangi jumlahnya sampai sama dengan sisa, atau buat kontrak baru untuk kelebihannya.`,
        null,
        false
      );
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const body = {
      invoiceNo: formData.get("invoiceNo"),
      date: formData.get("date"),
      dueDate: formData.get("dueDate"),
      status: formData.get("status"),
      contractId,
      ...invoiceFxPayload(fx),
      items,
    };

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const failure = resolveSubmitFailure("faktur", data, "Tagihan belum bisa disimpan.");
      setLoading(false);
      reportFailure(failure.message, failure.field, failure.section === "lanjutan");
    } else {
      router.push("/invoices");
      router.refresh();
    }
  }

  /** Ringkasan isian lanjutan supaya nilainya tidak ikut hilang saat terlipat. */
  const advancedSummary = [
    fx.currency === "IDR"
      ? "Rupiah (IDR)"
      : `${fx.currency} · kurs ${Number(fx.rate) > 0 ? fx.rate : "belum diisi"}`,
    fx.taxable ? `PPN ${Number(fx.taxRate) || 0}%` : "tidak kena PPN",
    dueDate ? `jatuh tempo ${dueDate}` : "tanpa jatuh tempo",
  ].join(" · ");

  const contractOptions: SearchableOption[] = contracts.map((c) => ({
    value: String(c.id),
    label: c.contractNo,
    description: `${c.buyer} · ${c.currency}`,
  }));

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ── Ambil dari kontrak (issue #15) ── */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Ambil dari Kontrak</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Pilih kontrak sumber, lalu tarik barangnya. Yang ditarik adalah{" "}
              <strong>sisa</strong> yang belum difakturkan — jadi satu barang tidak bisa
              tertagih dua kali.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <SearchableSelect
                id="contractId"
                label="Kontrak sumber (opsional)"
                placeholder="Pilih kontrak…"
                searchPlaceholder="Cari no. kontrak / buyer…"
                emptyText="Tidak ada kontrak cocok"
                options={contractOptions}
                value={contractId != null ? String(contractId) : null}
                onChange={(v) => chooseContract(v == null ? null : Number(v))}
              />
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!outstanding || outstanding.pull.contract.length === 0}
                  onClick={() => pull("contract")}
                >
                  <Download className="mr-1 h-4 w-4" aria-hidden /> Ambil sisa kontrak
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!outstanding || outstanding.pull.delivery.length === 0}
                  onClick={() => pull("delivery")}
                >
                  <Download className="mr-1 h-4 w-4" aria-hidden /> Ambil yang sudah dikirim
                </Button>
              </div>
            </div>

            {loadingOutstanding && (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Memuat sisa kontrak…
              </p>
            )}

            {outstanding && !loadingOutstanding && (
              <div className="mt-4 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left">
                      <th className="px-3 py-2 font-medium text-muted-foreground">Barang</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Kontrak (kg)
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Dikirim (kg)
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Difakturkan (kg)
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Sisa (kg)
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Siap difakturkan (kg)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstanding.lines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-3 text-center text-muted-foreground">
                          Kontrak ini belum punya baris barang.
                        </td>
                      </tr>
                    ) : (
                      outstanding.lines.map((l) => (
                        <tr key={l.key} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-foreground">
                            {l.itemName}
                            {l.remainingKg === 0 && (
                              <Badge variant="success" className="ml-2">
                                Sudah penuh
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">
                            {formatNumber(l.contractedKg)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">
                            {formatNumber(l.deliveredKg)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">
                            {formatNumber(l.invoicedKg)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                            {formatNumber(l.remainingKg)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">
                            {formatNumber(l.readyToInvoiceKg)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {pullNote && (
              <p className="mt-3 flex items-start gap-1 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{pullNote}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6" data-tour="faktur-identitas">
          <CardHeader>
            <CardTitle>Identitas Tagihan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="invoiceNo" name="invoiceNo" label="Nomor Tagihan" required />
              <div>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  label="Tanggal"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                {periodIssue && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-destructive-strong" role="alert">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{periodIssue}</span>
                  </p>
                )}
              </div>
              <InvoiceCustomerField
                customers={customers}
                value={fx}
                onChange={(patch) => setFx((prev) => ({ ...prev, ...patch }))}
              />
              <InvoiceTotalsSummary value={fx} subtotal={subtotal} />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6" data-tour="faktur-barang">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                <TermTooltip term="faktur">Barang yang Dijual</TermTooltip>
              </CardTitle>
              <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                <Plus className="mr-1 h-4 w-4" aria-hidden /> Tambah Barang
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, i) => {
                // Remainder hint for a line drawn from the contract, so an
                // over-invoice is visible before the server refuses it.
                const line = outstanding?.lines.find(
                  (l) => l.key === item.itemName.trim().toLowerCase().replace(/\s+/g, " ")
                );
                const over = line != null && item.quantity > line.remainingKg;
                return (
                  <div key={i} className="rounded-md border border-border p-3">
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label
                          htmlFor={`itemName-${i}`}
                          className="mb-1 block text-xs font-medium text-muted-foreground"
                        >
                          Nama Barang
                        </label>
                        <input
                          id={`itemName-${i}`}
                          className="block w-full rounded-md border border-border px-3 py-2 text-sm"
                          value={item.itemName}
                          onChange={(e) => updateItem(i, "itemName", e.target.value)}
                          required
                        />
                      </div>
                      <div className="w-24">
                        <label
                          htmlFor={`quantity-${i}`}
                          className="mb-1 block text-xs font-medium text-muted-foreground"
                        >
                          Jumlah
                        </label>
                        <input
                          id={`quantity-${i}`}
                          type="number"
                          min={0}
                          step="0.01"
                          className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                        />
                      </div>
                      <div className="w-28">
                        <label
                          htmlFor={`price-${i}`}
                          className="mb-1 block text-xs font-medium text-muted-foreground"
                        >
                          Harga
                        </label>
                        <input
                          id={`price-${i}`}
                          type="number"
                          min={0}
                          step="0.01"
                          className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                          value={item.price}
                          onChange={(e) => updateItem(i, "price", Number(e.target.value))}
                        />
                      </div>
                      <div className="w-20">
                        <label
                          htmlFor={`unit-${i}`}
                          className="mb-1 block text-xs font-medium text-muted-foreground"
                        >
                          Satuan
                        </label>
                        <input
                          id={`unit-${i}`}
                          className="block w-full rounded-md border border-border px-3 py-2 text-sm"
                          value={item.unit}
                          onChange={(e) => updateItem(i, "unit", e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="cursor-pointer pb-2 text-destructive transition-colors duration-150 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={items.length === 1}
                        aria-label={`Hapus baris barang ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className={over ? "font-medium text-destructive" : "text-muted-foreground"}>
                        {line
                          ? `Sisa kontrak ${formatNumber(line.remainingKg)} kg${
                              over ? " — melebihi sisa, faktur akan ditolak!" : ""
                            }`
                          : contractId != null && item.itemName.trim()
                            ? "Di luar baris kontrak — tidak dibatasi sisa."
                            : ""}
                      </span>
                      <span className="tabular-nums text-foreground">
                        = {formatCurrency(item.quantity * item.price, fx.currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Detail lengkap (issue #4) — tertutup secara default ── */}
        <DisclosureSection
          className="mb-6"
          description="Jatuh tempo, status, mata uang & kurs, PPN, dan dokumen ekspor (PEB). Faktur rupiah biasa memakai nilai standar dan tidak perlu membukanya."
          summary={advancedSummary}
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
          invalid={advancedInvalid}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <DueDateField value={dueDate} onChange={setDueDate} />
            <Select
              id="status"
              name="status"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: "pending", label: "Menunggu" },
                { value: "signed", label: "Sah" },
                { value: "canceled", label: "Dibatalkan" },
              ]}
            />
            <InvoiceFxAdvancedFields
              customers={customers}
              value={fx}
              onChange={(patch) => setFx((prev) => ({ ...prev, ...patch }))}
            />
          </div>
        </DisclosureSection>

        <div className="flex gap-3" data-tour="faktur-simpan">
          <Button type="submit" disabled={loading}>
            {loading ? "Menyimpan…" : "Simpan Tagihan"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Batal
          </Button>
        </div>
      </form>
    </>
  );
}
