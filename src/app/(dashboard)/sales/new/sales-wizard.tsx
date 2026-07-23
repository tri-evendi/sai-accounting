"use client";

/**
 * Wizard "Penjualan Baru" (issue #5) — sisi peramban.
 *
 * Lima langkah: pelanggan → barang & harga → (opsional) surat jalan → tagihan →
 * ringkasan. Tidak satu pun dari empat langkah pertama menyentuh server: semua
 * isian hidup di draf (`useWizardDraft`), dan seluruhnya baru dikirim SEKALI ke
 * `POST /api/wizard/sales` yang menulisnya dalam satu `prisma.$transaction`.
 *
 * Aturan main, penjaga, dan aritmetikanya bukan milik berkas ini:
 *   • urutan langkah + penjaga  → `@/lib/wizard` (murni, diuji di tests/);
 *   • sisa & pola "Ambil"       → `@/lib/document-chain` (#15), dipakai apa adanya
 *     atas baris draf, bukan versi kedua yang ditulis ulang;
 *   • periode tertutup & stok   → `@/lib/form-guards` + `@/lib/delivery-orders`;
 *   • pemetaan galat → bagian   → `@/lib/form-sections` (#4).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { DisclosureSection } from "@/components/ui/disclosure-section";
import { EmptyState } from "@/components/ui/empty-state";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { DueDateField } from "@/components/shared/due-date-field";
import { Wizard, WizardSummaryRow } from "@/components/shared/wizard";
import { WizardPartnerStep } from "@/components/shared/wizard-partner-step";
import { useWizardDraft } from "@/components/shared/use-wizard-draft";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { humanizeFieldMessage } from "@/lib/form-guards";
import type { ClosedPeriodRef } from "@/lib/form-guards";
import { resolveSubmitFailure } from "@/lib/form-sections";
import { defaultInvoiceTax } from "@/lib/tax";
import { normalizeItemName, type ContractLineOutstanding } from "@/lib/document-chain";
import {
  SALES_STEPS,
  applySalesPull,
  buildSalesPayload,
  emptySalesDraft,
  emptySalesLine,
  fillDeliveryFromOrder,
  salesInvoiceSubtotal,
  salesInvoiceTax,
  salesInvoiceTotal,
  salesOrderValue,
  shipKg,
  validateSalesStep,
  type SalesDraft,
  type SalesLineDraft,
  type SalesStepId,
} from "@/lib/wizard";
import {
  CheckCircle2,
  Download,
  FileText,
  Package,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";

// ── Data yang disiapkan server shell ──────────────────────────────────────
export interface CustomerOption {
  id: number;
  name: string;
  taxExempt: boolean;
}
export interface ContractOption {
  id: number;
  contractNo: string;
  buyer: string;
  currency: string;
}
export interface ConsigneeOption {
  id: number;
  name: string;
  country: string | null;
}
export interface ItemOption {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

/** Bentuk `GET /api/contracts/[id]/outstanding` — sama dengan formulir faktur. */
interface OutstandingResponse {
  contract: { id: number; contractNo: string; buyer: string; currency: string };
  lines: ContractLineOutstanding[];
  pull: { contract: { itemName: string; quantity: number; price: number; unit: string }[] };
}

interface SalesResult {
  customerId: number;
  customerName: string | null;
  deliveryOrder: { id: number; no: string } | null;
  invoice: { id: number; invoiceNo: string };
  approval: { message: string } | null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export function SalesWizard({
  customers,
  contracts,
  consignees,
  items,
  closedPeriods,
}: {
  customers: CustomerOption[];
  contracts: ContractOption[];
  consignees: ConsigneeOption[];
  items: ItemOption[];
  closedPeriods: ClosedPeriodRef[];
}) {
  const router = useRouter();
  const { draft, setDraft, clear, ready, notice, dismissNotice } = useWizardDraft<SalesDraft>(
    "sales",
    () => emptySalesDraft(todayISO())
  );
  const [stepId, setStepId] = useState<SalesStepId>("pelanggan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingResponse | null>(null);
  const [pullNote, setPullNote] = useState("");
  const [result, setResult] = useState<SalesResult | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const stockByItem = useMemo(() => new Map(items.map((i) => [i.id, i.currentStock])), [items]);
  const contractRemainingKg = useMemo(
    () => (outstanding ? new Map(outstanding.lines.map((l) => [l.key, l.remainingKg])) : undefined),
    [outstanding]
  );

  const guardContext = useMemo(
    () => ({ closedPeriods, stockByItem, contractRemainingKg }),
    [closedPeriods, stockByItem, contractRemainingKg]
  );
  const blockers = validateSalesStep(draft, stepId, guardContext);

  const patch = useCallback(
    (updater: (prev: SalesDraft) => SalesDraft) => setDraft(updater),
    [setDraft]
  );
  const updateLine = useCallback(
    (index: number, values: Partial<SalesLineDraft>) =>
      patch((d) => ({
        ...d,
        lines: d.lines.map((l, i) => (i === index ? { ...l, ...values } : l)),
      })),
    [patch]
  );

  // Sisa kontrak sumber — satu-satunya panggilan jaringan sebelum "Selesai", dan
  // ia hanya MEMBACA. Tidak ada dokumen yang lahir karenanya.
  useEffect(() => {
    const contractId = draft.contractId;
    let cancelled = false;
    // Semua perubahan state terjadi di dalam callback async — badan efeknya
    // sendiri tidak pernah memanggil setState (lihat `/invoices/new`).
    (async () => {
      if (contractId == null) {
        if (!cancelled) setOutstanding(null);
        return;
      }
      const res = await fetch(`/api/contracts/${contractId}/outstanding`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Sisa kontrak gagal dimuat. Barang boleh tetap diisi manual.");
        return;
      }
      const data = (await res.json()) as OutstandingResponse;
      if (!cancelled) setOutstanding(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.contractId]);

  const customerOptions: SearchableOption[] = customers.map((c) => ({
    value: String(c.id),
    label: c.name,
    description: c.taxExempt ? "Bebas PPN" : undefined,
  }));
  const contractOptions: SearchableOption[] = contracts.map((c) => ({
    value: String(c.id),
    label: c.contractNo,
    description: `${c.buyer} · ${c.currency}`,
  }));
  const consigneeOptions: SearchableOption[] = consignees.map((c) => ({
    value: String(c.id),
    label: c.name,
    description: c.country ?? undefined,
  }));
  const itemOptions: SearchableOption[] = items.map((i) => ({
    value: String(i.id),
    label: i.name,
    description: `Stok: ${formatNumber(i.currentStock)} ${i.unit || "kg"}`,
  }));

  const currency = draft.invoice.currency;

  /** Ambil baris dari sisa kontrak sumber (#15) — bukan diketik ulang. */
  function pullFromContract() {
    if (!outstanding) return;
    const lines = outstanding.pull.contract;
    if (lines.length === 0) {
      setPullNote("Semua barang pada kontrak ini sudah difakturkan.");
      return;
    }
    const byName = new Map(items.map((i) => [normalizeItemName(i.name), i]));
    patch((d) => ({
      ...d,
      lines: lines.map((l) => {
        const master = byName.get(normalizeItemName(l.itemName));
        return {
          ...emptySalesLine(),
          itemId: master?.id ?? null,
          itemName: l.itemName,
          quantity: l.quantity,
          price: l.price,
          unit: l.unit || master?.unit || "kg",
        };
      }),
      invoice: { ...d.invoice, currency: outstanding.contract.currency },
    }));
    setPullNote(
      `${lines.length} baris diambil dari sisa kontrak ${outstanding.contract.contractNo}. ` +
        `Jumlahnya boleh dikurangi, tidak boleh melebihi sisa.`
    );
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/wizard/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSalesPayload(draft)),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string; step?: SalesStepId; details?: unknown }
        | null;
      // Galat lapangan dimanusiakan lewat mesin yang sama dengan formulir biasa
      // (#4) — `details` dari server memang berbentuk `z.flatten()`. Lompatan ke
      // langkah yang benar datang dari `step`, bukan dari peta bagian formulir.
      const failure = resolveSubmitFailure(
        "faktur",
        data,
        humanizeFieldMessage(null, data?.error ?? "Penjualan belum bisa disimpan.")
      );
      setError(failure.message);
      setBusy(false);
      if (data?.step) setStepId(data.step);
      return;
    }

    const created = (await res.json()) as SalesResult;
    clear();
    setResult(created);
    setBusy(false);
    router.refresh();
  }

  function cancel() {
    clear();
    router.push("/invoices");
  }

  // ── Layar selesai ────────────────────────────────────────────────────────
  if (result) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success-strong" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">Penjualan tersimpan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Semua dokumen di bawah dibuat sekaligus dalam satu penyimpanan.
              </p>
              <dl className="mt-4 divide-y divide-border">
                {result.customerName && (
                  <WizardSummaryRow label="Pelanggan" value={result.customerName} />
                )}
                {result.deliveryOrder && (
                  <WizardSummaryRow
                    label="Surat jalan"
                    value={
                      <Link
                        href={`/delivery-orders/${result.deliveryOrder.id}`}
                        className="text-primary hover:underline"
                      >
                        {result.deliveryOrder.no}
                      </Link>
                    }
                  />
                )}
                <WizardSummaryRow
                  label="Tagihan"
                  value={
                    <Link
                      href={`/invoices/${result.invoice.id}`}
                      className="text-primary hover:underline"
                    >
                      {result.invoice.invoiceNo}
                    </Link>
                  }
                  strong
                />
              </dl>
              {result.approval && (
                <p
                  role="status"
                  className="mt-4 rounded-md bg-warning-soft p-3 text-sm text-warning-strong"
                >
                  {result.approval.message}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/invoices/${result.invoice.id}`}>
                  <Button className="cursor-pointer">Lihat tagihan</Button>
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => {
                    setResult(null);
                    setStepId("pelanggan");
                    setDraft(emptySalesDraft(todayISO()));
                    setOutstanding(null);
                    setPullNote("");
                  }}
                >
                  Catat penjualan lagi
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Menyiapkan formulir…</p>;
  }

  return (
    <Wizard
      steps={SALES_STEPS}
      currentId={stepId}
      onNavigate={(id) => {
        dismissNotice();
        setStepId(id as SalesStepId);
      }}
      blockers={blockers}
      onFinish={finish}
      onCancel={cancel}
      busy={busy}
      error={error}
      notice={notice}
      finishLabel="Selesai & Simpan"
    >
      {/* ── 1. Pelanggan ──────────────────────────────────────────────── */}
      {stepId === "pelanggan" && (
        <WizardPartnerStep
          noun="pelanggan"
          options={customerOptions}
          value={draft.customer}
          withCustomerFields
          manageHref="/customers"
          onChange={(values) =>
            patch((d) => {
              const customer = { ...d.customer, ...values };
              // Pelanggan bebas PPN → tagihannya default tanpa PPN (#16).
              const exempt =
                customer.mode === "new"
                  ? customer.taxExempt
                  : (customers.find((c) => c.id === customer.id)?.taxExempt ?? false);
              const tax = defaultInvoiceTax({
                currency: d.invoice.currency,
                customerTaxExempt: exempt,
              });
              return {
                ...d,
                customer,
                invoice: { ...d.invoice, taxable: tax.taxable, taxRate: tax.taxRate },
              };
            })
          }
        />
      )}

      {/* ── 2. Barang & harga ─────────────────────────────────────────── */}
      {stepId === "barang" && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>
                <TermTooltip term="kontrak">Ambil dari kontrak (opsional)</TermTooltip>
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Bila penjualan ini menagih kontrak yang sudah ada, pilih kontraknya: barang,
                sisa jumlah, dan harganya terisi sendiri, dan tagihannya nanti tidak bisa
                melebihi sisa kontrak.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <SearchableSelect
                  id="contractId"
                  label="Kontrak sumber"
                  placeholder="Pilih kontrak…"
                  searchPlaceholder="Cari no. kontrak / buyer…"
                  emptyText="Tidak ada kontrak cocok"
                  options={contractOptions}
                  value={draft.contractId != null ? String(draft.contractId) : null}
                  onChange={(v) => {
                    setPullNote("");
                    patch((d) => ({ ...d, contractId: v == null ? null : Number(v) }));
                  }}
                />
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="cursor-pointer"
                    disabled={!outstanding || outstanding.pull.contract.length === 0}
                    onClick={pullFromContract}
                  >
                    <Download className="mr-1 h-4 w-4" aria-hidden="true" /> Ambil sisa kontrak
                  </Button>
                </div>
              </div>
              {pullNote && <p className="mt-3 text-xs text-muted-foreground">{pullNote}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Barang yang dijual</CardTitle>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => patch((d) => ({ ...d, lines: [...d.lines, emptySalesLine()] }))}
                >
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Tambah barang
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {draft.lines.map((line, i) => {
                const sisa = contractRemainingKg?.get(normalizeItemName(line.itemName));
                const over = sisa != null && line.quantity > sisa;
                return (
                  <div key={i} className="rounded-md border border-border p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SearchableSelect
                        label="Barang dari daftar stok"
                        placeholder="Pilih barang…"
                        searchPlaceholder="Cari barang…"
                        emptyText="Tidak ada barang cocok"
                        options={itemOptions}
                        value={line.itemId != null ? String(line.itemId) : null}
                        onChange={(v) => {
                          const master = v == null ? null : itemById.get(Number(v));
                          updateLine(i, {
                            itemId: master?.id ?? null,
                            itemName: master?.name ?? line.itemName,
                            unit: master?.unit || line.unit || "kg",
                          });
                        }}
                      />
                      <Input
                        id={`itemName-${i}`}
                        label="Nama barang di dokumen"
                        value={line.itemName}
                        onChange={(e) => updateLine(i, { itemName: e.target.value })}
                        maxLength={100}
                        required
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <div className="w-32">
                        <label
                          htmlFor={`quantity-${i}`}
                          className="mb-1 block text-xs font-medium text-muted-foreground"
                        >
                          Jumlah (kg)
                        </label>
                        <input
                          id={`quantity-${i}`}
                          type="number"
                          min={0}
                          step="0.001"
                          className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                        />
                      </div>
                      <div className="w-40">
                        <label
                          htmlFor={`price-${i}`}
                          className="mb-1 block text-xs font-medium text-muted-foreground"
                        >
                          Harga per kg ({currency})
                        </label>
                        <input
                          id={`price-${i}`}
                          type="number"
                          min={0}
                          step="0.01"
                          className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                          value={line.price}
                          onChange={(e) => updateLine(i, { price: Number(e.target.value) })}
                        />
                      </div>
                      <div className="ml-auto text-right">
                        <span className="block text-xs text-muted-foreground">Nilai baris</span>
                        <span className="block text-sm font-medium tabular-nums text-foreground">
                          {formatCurrency(line.quantity * line.price, currency)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          patch((d) => ({
                            ...d,
                            lines:
                              d.lines.length > 1 ? d.lines.filter((_, x) => x !== i) : d.lines,
                          }))
                        }
                        disabled={draft.lines.length === 1}
                        aria-label={`Hapus baris barang ${i + 1}`}
                        className="cursor-pointer pb-2 text-destructive transition-colors duration-150 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="mt-2 text-xs">
                      {line.itemId == null ? (
                        <span className="text-warning-strong">
                          Barang ini tidak ada di daftar stok, jadi tidak bisa dibuatkan surat
                          jalan. Tagihannya tetap bisa dibuat.
                        </span>
                      ) : (
                        <span className={over ? "font-medium text-destructive-strong" : "text-muted-foreground"}>
                          Stok tersedia{" "}
                          {formatNumber(itemById.get(line.itemId)?.currentStock ?? 0)} kg
                          {sisa != null && ` · sisa kontrak ${formatNumber(sisa)} kg`}
                          {over && " — melebihi sisa kontrak!"}
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}

              <dl className="border-t border-border pt-3">
                <WizardSummaryRow
                  label="Nilai pesanan"
                  value={formatCurrency(salesOrderValue(draft), currency)}
                  strong
                />
              </dl>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── 3. Surat jalan (opsional) ─────────────────────────────────── */}
      {stepId === "pengiriman" && (
        <Card>
          <CardContent className="space-y-4 py-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors duration-150 hover:bg-muted">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 cursor-pointer rounded border-border"
                checked={draft.delivery.include}
                onChange={(e) =>
                  patch((d) => {
                    const next = {
                      ...d,
                      delivery: { ...d.delivery, include: e.target.checked },
                    };
                    return e.target.checked ? fillDeliveryFromOrder(next) : next;
                  })
                }
              />
              <span className="text-sm">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Barangnya sudah dikirim — buatkan{" "}
                  <TermTooltip term="surat_jalan">surat jalan</TermTooltip>
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  Surat jalan mengurangi stok dan membentuk jurnal HPP. Kalau barang belum
                  berangkat, biarkan kosong dan lanjut saja — surat jalan bisa dibuat
                  belakangan.
                </span>
              </span>
            </label>

            {draft.delivery.include && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    id="deliveryDate"
                    type="date"
                    label="Tanggal kirim"
                    value={draft.delivery.date}
                    onChange={(e) =>
                      patch((d) => ({ ...d, delivery: { ...d.delivery, date: e.target.value } }))
                    }
                    required
                  />
                  <SearchableSelect
                    id="consigneeId"
                    label="Penerima barang (opsional)"
                    placeholder="Pilih penerima…"
                    searchPlaceholder="Cari nama / negara…"
                    emptyText="Tidak ada penerima cocok"
                    options={consigneeOptions}
                    value={
                      draft.delivery.consigneeId != null
                        ? String(draft.delivery.consigneeId)
                        : null
                    }
                    onChange={(v) =>
                      patch((d) => ({
                        ...d,
                        delivery: {
                          ...d.delivery,
                          consigneeId: v == null ? null : Number(v),
                        },
                      }))
                    }
                  />
                </div>

                {items.length === 0 ? (
                  <EmptyState
                    icon={<Package className="h-12 w-12" />}
                    title="Belum ada barang di daftar stok"
                    description="Surat jalan mengurangi stok, jadi barangnya harus tercatat lebih dulu."
                    actionLabel="Tambah / Kurangi Stok"
                    actionHref="/inventory/update"
                  />
                ) : (
                  <div className="space-y-3">
                    {draft.lines.map((line, i) => {
                      const master = line.itemId != null ? itemById.get(line.itemId) : null;
                      const kg = shipKg(line);
                      const overOrder = kg > line.quantity;
                      const overStock = master != null && kg > master.currentStock;
                      return (
                        <div key={i} className="rounded-md border border-border p-3">
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer rounded border-border"
                              checked={line.ship}
                              disabled={line.itemId == null}
                              onChange={(e) =>
                                updateLine(i, {
                                  ship: e.target.checked,
                                  shipKgPerBag:
                                    line.shipKgPerBag > 0 ? line.shipKgPerBag : line.quantity,
                                  shipBags: line.shipBags > 0 ? line.shipBags : 1,
                                })
                              }
                            />
                            <span className="font-medium text-foreground">
                              {line.itemName || `Baris ${i + 1}`}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              dipesan {formatNumber(line.quantity)} kg
                            </span>
                            {line.itemId == null && (
                              <Badge variant="warning">Tidak ada di daftar stok</Badge>
                            )}
                          </label>

                          {line.ship && (
                            <>
                              <div className="mt-3 flex flex-wrap items-end gap-3">
                                <div className="w-28">
                                  <label
                                    htmlFor={`shipBags-${i}`}
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                  >
                                    Jumlah bags
                                  </label>
                                  <input
                                    id={`shipBags-${i}`}
                                    type="number"
                                    min={0}
                                    className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                                    value={line.shipBags}
                                    onChange={(e) =>
                                      updateLine(i, { shipBags: Number(e.target.value) })
                                    }
                                  />
                                </div>
                                <div className="w-32">
                                  <label
                                    htmlFor={`shipKgPerBag-${i}`}
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                  >
                                    Kg per bag
                                  </label>
                                  <input
                                    id={`shipKgPerBag-${i}`}
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                                    value={line.shipKgPerBag}
                                    onChange={(e) =>
                                      updateLine(i, { shipKgPerBag: Number(e.target.value) })
                                    }
                                  />
                                </div>
                                <div className="ml-auto text-right">
                                  <span className="block text-xs text-muted-foreground">
                                    Total dikirim
                                  </span>
                                  <span className="block text-sm font-medium tabular-nums text-foreground">
                                    {formatNumber(kg)} kg
                                  </span>
                                </div>
                              </div>
                              <p className="mt-2 text-xs">
                                <span
                                  className={
                                    overOrder || overStock
                                      ? "font-medium text-destructive-strong"
                                      : "text-muted-foreground"
                                  }
                                >
                                  Stok tersedia {formatNumber(master?.currentStock ?? 0)} kg
                                  {overStock && " — melebihi stok, surat jalan akan ditolak!"}
                                  {overOrder && " — melebihi jumlah yang dipesan!"}
                                </span>
                              </p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <DisclosureSection
                  description="Nomor kendaraan, nomor kontainer, dan catatan pengiriman."
                  summary={
                    [draft.delivery.vehicleNo, draft.delivery.containerNo]
                      .filter(Boolean)
                      .join(" · ") || "belum diisi"
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="vehicleNo"
                      label="No. kendaraan"
                      value={draft.delivery.vehicleNo}
                      onChange={(e) =>
                        patch((d) => ({
                          ...d,
                          delivery: { ...d.delivery, vehicleNo: e.target.value },
                        }))
                      }
                      maxLength={50}
                    />
                    <Input
                      id="containerNo"
                      label="No. kontainer"
                      value={draft.delivery.containerNo}
                      onChange={(e) =>
                        patch((d) => ({
                          ...d,
                          delivery: { ...d.delivery, containerNo: e.target.value },
                        }))
                      }
                      maxLength={50}
                    />
                    <div className="sm:col-span-2">
                      <Input
                        id="deliveryNotes"
                        label="Catatan"
                        value={draft.delivery.notes}
                        onChange={(e) =>
                          patch((d) => ({
                            ...d,
                            delivery: { ...d.delivery, notes: e.target.value },
                          }))
                        }
                        maxLength={2000}
                      />
                    </div>
                  </div>
                </DisclosureSection>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 4. Tagihan ────────────────────────────────────────────────── */}
      {stepId === "faktur" && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>
                <TermTooltip term="faktur">Identitas tagihan</TermTooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="invoiceNo"
                  label="Nomor tagihan"
                  value={draft.invoice.invoiceNo}
                  onChange={(e) =>
                    patch((d) => ({ ...d, invoice: { ...d.invoice, invoiceNo: e.target.value } }))
                  }
                  maxLength={50}
                  required
                />
                <Input
                  id="date"
                  type="date"
                  label="Tanggal tagihan"
                  value={draft.invoice.date}
                  onChange={(e) =>
                    patch((d) => ({ ...d, invoice: { ...d.invoice, date: e.target.value } }))
                  }
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Yang ditagihkan</CardTitle>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => patch((d) => applySalesPull(d, "order"))}
                  >
                    <Download className="mr-1 h-4 w-4" aria-hidden="true" /> Ambil semua
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="cursor-pointer"
                    disabled={!draft.delivery.include}
                    onClick={() => patch((d) => applySalesPull(d, "delivery"))}
                  >
                    <Download className="mr-1 h-4 w-4" aria-hidden="true" /> Ambil yang dikirim
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Jumlahnya ditarik dari langkah sebelumnya, bukan diketik ulang. Boleh
                dikurangi bila hanya sebagian yang ditagihkan sekarang.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft.lines.map((line, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-40 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {line.itemName || `Baris ${i + 1}`}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      dipesan {formatNumber(line.quantity)} kg · dikirim{" "}
                      {formatNumber(shipKg(line))} kg ·{" "}
                      {formatCurrency(line.price, currency)}/kg
                    </span>
                  </div>
                  <div className="w-36">
                    <label
                      htmlFor={`billQuantity-${i}`}
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      Ditagihkan (kg)
                    </label>
                    <input
                      id={`billQuantity-${i}`}
                      type="number"
                      min={0}
                      step="0.001"
                      className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                      value={line.billQuantity}
                      onChange={(e) => updateLine(i, { billQuantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="w-32 text-right">
                    <span className="block text-xs text-muted-foreground">Nilai</span>
                    <span className="block text-sm font-medium tabular-nums text-foreground">
                      {formatCurrency(line.billQuantity * line.price, currency)}
                    </span>
                  </div>
                </div>
              ))}

              <dl className="border-t border-border pt-3">
                <WizardSummaryRow
                  label="Nilai sebelum PPN (DPP)"
                  value={formatCurrency(salesInvoiceSubtotal(draft), currency)}
                />
                <WizardSummaryRow
                  label={<TermTooltip term="ppn">PPN</TermTooltip>}
                  value={formatCurrency(salesInvoiceTax(draft), currency)}
                />
                <WizardSummaryRow
                  label="Total tagihan"
                  value={formatCurrency(salesInvoiceTotal(draft), currency)}
                  strong
                />
              </dl>
            </CardContent>
          </Card>

          <DisclosureSection
            description="Jatuh tempo, mata uang & kurs, dan PPN. Tagihan rupiah biasa memakai nilai standar dan tidak perlu membukanya."
            summary={[
              currency === "IDR"
                ? "Rupiah (IDR)"
                : `${currency} · kurs ${draft.invoice.rate > 0 ? draft.invoice.rate : "belum diisi"}`,
              draft.invoice.taxable ? `PPN ${draft.invoice.taxRate}%` : "tidak kena PPN",
              draft.invoice.dueDate ? `jatuh tempo ${draft.invoice.dueDate}` : "tanpa jatuh tempo",
            ].join(" · ")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <DueDateField
                value={draft.invoice.dueDate}
                onChange={(v) => patch((d) => ({ ...d, invoice: { ...d.invoice, dueDate: v } }))}
              />
              <div>
                <label
                  htmlFor="currency"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Mata uang
                </label>
                <select
                  id="currency"
                  className="block w-full cursor-pointer rounded-md border border-border px-3 py-2 text-sm"
                  value={currency}
                  onChange={(e) =>
                    patch((d) => {
                      const next = e.target.value;
                      const tax = defaultInvoiceTax({ currency: next });
                      return {
                        ...d,
                        invoice: {
                          ...d.invoice,
                          currency: next,
                          taxable: tax.taxable,
                          taxRate: tax.taxRate,
                        },
                      };
                    })
                  }
                >
                  <option value="IDR">IDR (Rupiah)</option>
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                </select>
              </div>
              {currency !== "IDR" && (
                <div>
                  <label htmlFor="rate" className="mb-1 block text-sm font-medium text-foreground">
                    <TermTooltip term="kurs">Kurs</TermTooltip> 1 {currency} ke IDR
                  </label>
                  <input
                    id="rate"
                    type="number"
                    min={0}
                    step="0.000001"
                    className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                    value={draft.invoice.rate || ""}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        invoice: { ...d.invoice, rate: Number(e.target.value) },
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Wajib diisi — buku besar mencatat nilai IDR.
                  </p>
                </div>
              )}
              <div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-border"
                    checked={draft.invoice.taxable}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        invoice: { ...d.invoice, taxable: e.target.checked },
                      }))
                    }
                  />
                  Kena <TermTooltip term="ppn">PPN</TermTooltip>
                </label>
                {draft.invoice.taxable && (
                  <div className="mt-2 w-32">
                    <label
                      htmlFor="taxRate"
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      Tarif PPN (%)
                    </label>
                    <input
                      id="taxRate"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                      value={draft.invoice.taxRate}
                      onChange={(e) =>
                        patch((d) => ({
                          ...d,
                          invoice: { ...d.invoice, taxRate: Number(e.target.value) },
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </DisclosureSection>
        </>
      )}

      {/* ── 5. Ringkasan ──────────────────────────────────────────────── */}
      {stepId === "ringkasan" && (
        <Card>
          <CardHeader>
            <CardTitle>Periksa sebelum disimpan</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Semua di bawah ini akan dicatat sekaligus. Bila salah satunya gagal, tidak ada
              satu pun yang tersimpan.
            </p>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <WizardSummaryRow
                label="Pelanggan"
                value={
                  draft.customer.mode === "new"
                    ? `${draft.customer.name} (baru)`
                    : (customers.find((c) => c.id === draft.customer.id)?.name ?? "—")
                }
              />
              {draft.contractId != null && (
                <WizardSummaryRow
                  label="Kontrak sumber"
                  value={
                    contracts.find((c) => c.id === draft.contractId)?.contractNo ??
                    `#${draft.contractId}`
                  }
                />
              )}
              <WizardSummaryRow
                label="Barang"
                value={`${draft.lines.filter((l) => l.itemName.trim()).length} baris`}
                hint={draft.lines
                  .filter((l) => l.itemName.trim())
                  .map((l) => `${l.itemName} ${formatNumber(l.quantity)} kg`)
                  .join(" · ")}
              />
              <WizardSummaryRow
                label="Surat jalan"
                value={
                  draft.delivery.include ? (
                    <span className="inline-flex items-center gap-1">
                      <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {formatNumber(draft.lines.reduce((s, l) => s + shipKg(l), 0))} kg
                    </span>
                  ) : (
                    "Tidak dibuat"
                  )
                }
                hint={
                  draft.delivery.include
                    ? `Tanggal ${draft.delivery.date} — stok berkurang & jurnal HPP terbentuk.`
                    : "Stok tidak berubah."
                }
              />
              <WizardSummaryRow
                label={
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Tagihan {draft.invoice.invoiceNo}
                  </span>
                }
                value={formatCurrency(salesInvoiceTotal(draft), currency)}
                hint={`Tanggal ${draft.invoice.date} · DPP ${formatCurrency(
                  salesInvoiceSubtotal(draft),
                  currency
                )} · PPN ${formatCurrency(salesInvoiceTax(draft), currency)}`}
                strong
              />
            </dl>
            <p className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
              Setelah disimpan, sisa tagihan yang belum dibayar muncul di daftar
              &ldquo;Pelanggan Belum Bayar&rdquo;. Bila nilainya mencapai ambang persetujuan,
              tagihan tersimpan tetapi jurnalnya ditahan sampai disetujui.
            </p>
          </CardContent>
        </Card>
      )}
    </Wizard>
  );
}
