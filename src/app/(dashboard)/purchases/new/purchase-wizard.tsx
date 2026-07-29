"use client";

/**
 * Wizard "Pembelian Baru" (issue #5) — sisi peramban.
 *
 * Lima langkah: pemasok → barang & harga → (opsional) barang masuk gudang →
 * catat pembelian → ringkasan. Seperti sisi penjualan, tidak satu pun langkah
 * menyentuh server; seluruh isian dikirim SEKALI ke `POST /api/wizard/purchase`
 * yang menulisnya dalam satu `prisma.$transaction`.
 *
 * Dua hal yang sengaja TIDAK dikarang di sini:
 *  • Pembelian tetap satu baris `supplier_transactions` bertipe `purchase` —
 *    persis yang dicatat formulir di halaman pemasok. Tabel barisnya memang
 *    tidak ada, jadi rincian barang ikut ke catatan (`purchaseNote`).
 *  • Barang masuk gudang dicatat sebagai pergerakan stok `in`, yang tidak
 *    menghasilkan jurnal — persediaan sudah didebet oleh jurnal pembeliannya.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { DisclosureSection } from "@/components/ui/disclosure-section";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { DueDateField } from "@/components/shared/due-date-field";
import { CostCenterField, useCostCenters } from "@/components/shared/cost-center-field";
import { Wizard, WizardSummaryRow } from "@/components/shared/wizard";
import { WizardPartnerStep } from "@/components/shared/wizard-partner-step";
import { useWizardDraft } from "@/components/shared/use-wizard-draft";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { humanizeFieldMessage, type ClosedPeriodRef } from "@/lib/form-guards";
import {
  PURCHASE_STEPS,
  buildPurchasePayload,
  emptyPurchaseDraft,
  emptyPurchaseLine,
  fillReceiptFromOrder,
  purchaseTotal,
  purchaseValue,
  validatePurchaseStep,
  type PurchaseDraft,
  type PurchaseLineDraft,
  type PurchaseStepId,
} from "@/lib/wizard";
import { useT } from "@/lib/i18n/client";
import { CheckCircle2, PackagePlus, Plus, ShoppingCart, Trash2 } from "lucide-react";

// Pemasok tidak lagi dikirim sebagai daftar statis (audit: `take: 500`
// memotong daftar — pemasok lama tak terpilih). Pemilihnya mencari ke server;
// nama pemasok terpilih dibaca dari endpoint detailnya.
export interface ItemOption {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

interface PurchaseResult {
  supplierId: number;
  supplierName: string;
  purchase: { id: number; amount: number; currency: string };
  receiptCount: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export function PurchaseWizard({
  items,
  closedPeriods,
}: {
  items: ItemOption[];
  closedPeriods: ClosedPeriodRef[];
}) {
  const router = useRouter();
  const t = useT();
  const { draft, setDraft, clear, ready, notice, dismissNotice } = useWizardDraft<PurchaseDraft>(
    "purchase",
    () => emptyPurchaseDraft(todayISO())
  );
  const [stepId, setStepId] = useState<PurchaseStepId>("pemasok");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  // Nama pemasok yang terpilih di pemilih cari-ke-server — untuk label saat
  // draf dipulihkan dan untuk baris ringkasan. Diisi dari endpoint detail.
  const [supplierInfo, setSupplierInfo] = useState<Record<number, { name: string }>>({});

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // issue #91/#98 — dimensi pusat biaya, pemilih yang sama dengan formulir di
  // halaman pemasok. Perusahaan tanpa pusat biaya mendapat daftar kosong dan
  // pemilihnya tidak dirender sama sekali.
  const costCenters = useCostCenters();
  const guardContext = useMemo(() => ({ closedPeriods }), [closedPeriods]);
  const blockers = validatePurchaseStep(draft, stepId, guardContext);

  const patch = useCallback(
    (updater: (prev: PurchaseDraft) => PurchaseDraft) => setDraft(updater),
    [setDraft]
  );
  const updateLine = useCallback(
    (index: number, values: Partial<PurchaseLineDraft>) =>
      patch((d) => ({
        ...d,
        lines: d.lines.map((l, i) => (i === index ? { ...l, ...values } : l)),
      })),
    [patch]
  );

  // Nama pemasok terpilih — dibaca sekali dari endpoint detail lalu di-cache;
  // menutup label pemilih pada draf yang dipulihkan dan baris ringkasan.
  useEffect(() => {
    const id = draft.supplier.mode === "existing" ? draft.supplier.id : null;
    if (id == null || supplierInfo[id]) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/suppliers/${id}`);
      if (!res.ok || cancelled) return;
      const s = (await res.json()) as { name: string };
      if (cancelled) return;
      setSupplierInfo((m) => ({ ...m, [id]: { name: s.name } }));
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.supplier.mode, draft.supplier.id, supplierInfo]);

  const selectedSupplierId =
    draft.supplier.mode === "existing" ? draft.supplier.id : null;
  const selectedSupplier =
    selectedSupplierId != null ? supplierInfo[selectedSupplierId] : undefined;

  const itemOptions: SearchableOption[] = items.map((i) => ({
    value: String(i.id),
    label: i.name,
    description: t("common.stockOption", { qty: formatNumber(i.currentStock), unit: i.unit || "kg" }),
  }));

  const currency = draft.purchase.currency;

  async function finish() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/wizard/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPurchasePayload(draft)),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string; step?: PurchaseStepId }
        | null;
      setError(humanizeFieldMessage(null, data?.error ?? t("purchases.saveFailed")));
      setBusy(false);
      if (data?.step) setStepId(data.step);
      return;
    }

    const created = (await res.json()) as PurchaseResult;
    clear();
    setResult(created);
    setBusy(false);
    router.refresh();
  }

  function cancel() {
    clear();
    router.push("/suppliers");
  }

  if (result) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success-strong" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">
                {t("purchases.savedTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("purchases.savedHint")}</p>
              <dl className="mt-4 divide-y divide-border">
                <WizardSummaryRow label={t("purchases.rowSupplier")} value={result.supplierName} />
                <WizardSummaryRow
                  label={t("purchases.rowPurchaseValue")}
                  value={formatCurrency(result.purchase.amount, result.purchase.currency)}
                  strong
                />
                <WizardSummaryRow
                  label={t("purchases.rowReceipt")}
                  value={
                    result.receiptCount > 0
                      ? t("common.rowCount", { count: result.receiptCount })
                      : t("common.notRecorded")
                  }
                />
              </dl>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/suppliers/${result.supplierId}`}>
                  <Button className="cursor-pointer">{t("purchases.viewSupplier")}</Button>
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => {
                    setResult(null);
                    setStepId("pemasok");
                    setDraft(emptyPurchaseDraft(todayISO()));
                  }}
                >
                  {t("purchases.recordAnother")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">{t("common.preparingForm")}</p>;
  }

  return (
    <Wizard
      steps={PURCHASE_STEPS}
      currentId={stepId}
      onNavigate={(id) => {
        dismissNotice();
        setStepId(id as PurchaseStepId);
      }}
      blockers={blockers}
      onFinish={finish}
      onCancel={cancel}
      busy={busy}
      error={error}
      notice={notice}
      finishLabel={t("common.finishAndSave")}
    >
      {/* ── 1. Pemasok ────────────────────────────────────────────────── */}
      {stepId === "pemasok" && (
        <WizardPartnerStep
          kind="supplier"
          fetchUrl="/api/suppliers?active=1&picker=1"
          initialOption={
            selectedSupplierId != null && selectedSupplier
              ? { value: String(selectedSupplierId), label: selectedSupplier.name }
              : null
          }
          value={draft.supplier}
          manageHref="/suppliers"
          onChange={(values) =>
            patch((d) => ({ ...d, supplier: { ...d.supplier, ...values } }))
          }
        />
      )}

      {/* ── 2. Barang & harga ─────────────────────────────────────────── */}
      {stepId === "barang" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("purchases.goodsBoughtTitle")}</CardTitle>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => patch((d) => ({ ...d, lines: [...d.lines, emptyPurchaseLine()] }))}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {t("common.addItemLower")}
              </Button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("purchases.goodsHintA")}{" "}
              <TermTooltip term="utang">{t("purchases.goodsHintTerm")}</TermTooltip>{" "}
              {t("purchases.goodsHintB")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {draft.lines.map((line, i) => (
              <div key={i} className="rounded-md border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SearchableSelect
                    label={t("common.itemFromStockList")}
                    placeholder={t("common.pickItem")}
                    searchPlaceholder={t("common.searchItem")}
                    emptyText={t("common.noItemMatch")}
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
                    id={`purchaseItemName-${i}`}
                    label={t("common.itemNameOnDocument")}
                    value={line.itemName}
                    onChange={(e) => updateLine(i, { itemName: e.target.value })}
                    maxLength={100}
                    required
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="w-32">
                    <label
                      htmlFor={`purchaseQty-${i}`}
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      {t("purchases.quantityUnit", { unit: line.unit || "kg" })}
                    </label>
                    <TextInput
                      id={`purchaseQty-${i}`}
                      type="number"
                      min={0}
                      step="0.001"
                      className="text-right tabular-nums"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="w-40">
                    <label
                      htmlFor={`purchasePrice-${i}`}
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      {t("purchases.purchasePriceUnit", { unit: line.unit || "kg", currency })}
                    </label>
                    <TextInput
                      id={`purchasePrice-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      className="text-right tabular-nums"
                      value={line.price}
                      onChange={(e) => updateLine(i, { price: Number(e.target.value) })}
                    />
                  </div>
                  <div className="ml-auto text-right">
                    <span className="block text-xs text-muted-foreground">{t("common.lineValue")}</span>
                    <span className="block text-sm font-medium tabular-nums text-foreground">
                      {formatCurrency(line.quantity * line.price, currency)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      patch((d) => ({
                        ...d,
                        lines: d.lines.length > 1 ? d.lines.filter((_, x) => x !== i) : d.lines,
                      }))
                    }
                    disabled={draft.lines.length === 1}
                    aria-label={t("common.removeItemRow", { n: i + 1 })}
                    className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                {line.itemId == null && (
                  <p className="mt-2 text-xs text-warning-strong">
                    {t("purchases.lineNotInStock")}
                  </p>
                )}
              </div>
            ))}

            <dl className="border-t border-border pt-3">
              <WizardSummaryRow
                label={t("purchases.valueBeforeTaxLine")}
                value={formatCurrency(purchaseValue(draft), currency)}
                strong
              />
            </dl>
          </CardContent>
        </Card>
      )}

      {/* ── 3. Barang masuk (opsional) ────────────────────────────────── */}
      {stepId === "penerimaan" && (
        <Card>
          <CardContent className="space-y-4 py-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors duration-150 hover:bg-muted">
              <Checkbox
                className="mt-1"
                checked={draft.receipt.include}
                onCheckedChange={(v) =>
                  patch((d) => {
                    const checked = v === true;
                    const next = { ...d, receipt: { ...d.receipt, include: checked } };
                    return checked ? fillReceiptFromOrder(next) : next;
                  })
                }
              />
              <span className="text-sm">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <PackagePlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t("purchases.receiptCheckboxA")}{" "}
                  <TermTooltip term="persediaan">{t("purchases.receiptTerm")}</TermTooltip>
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  {t("purchases.receiptHintA")}{" "}
                  <TermTooltip term="hpp">{t("purchases.receiptHintTerm")}</TermTooltip>{" "}
                  {t("purchases.receiptHintB")}
                </span>
              </span>
            </label>

            {draft.receipt.include && (
              <>
                <Input
                  id="receiptDate"
                  type="date"
                  label={t("purchases.receiptDate")}
                  value={draft.receipt.date}
                  onChange={(e) =>
                    patch((d) => ({ ...d, receipt: { ...d.receipt, date: e.target.value } }))
                  }
                  required
                />

                <div className="space-y-3">
                  {draft.lines.map((line, i) => {
                    const master = line.itemId != null ? itemById.get(line.itemId) : null;
                    const over = line.receiveQuantity > line.quantity;
                    return (
                      <div key={i} className="rounded-md border border-border p-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={line.receive}
                            disabled={line.itemId == null}
                            onCheckedChange={(v) =>
                              updateLine(i, {
                                receive: v === true,
                                receiveQuantity:
                                  line.receiveQuantity > 0 ? line.receiveQuantity : line.quantity,
                              })
                            }
                          />
                          <span className="font-medium text-foreground">
                            {line.itemName || t("common.rowN", { n: i + 1 })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t("purchases.bought", {
                              qty: formatNumber(line.quantity),
                              unit: line.unit || "kg",
                            })}
                          </span>
                          {line.itemId == null && (
                            <Badge variant="warning">{t("common.notInStockList")}</Badge>
                          )}
                        </label>

                        {line.receive && (
                          <div className="mt-3 flex flex-wrap items-end gap-3">
                            <div className="w-36">
                              <label
                                htmlFor={`receiveQty-${i}`}
                                className="mb-1 block text-xs font-medium text-muted-foreground"
                              >
                                {t("purchases.receiveQty", { unit: line.unit || "kg" })}
                              </label>
                              <TextInput
                                id={`receiveQty-${i}`}
                                type="number"
                                min={0}
                                step="0.001"
                                className="text-right tabular-nums"
                                value={line.receiveQuantity}
                                onChange={(e) =>
                                  updateLine(i, { receiveQuantity: Number(e.target.value) })
                                }
                              />
                            </div>
                            <div className="ml-auto text-right">
                              <span className="block text-xs text-muted-foreground">
                                {t("purchases.currentStock")}
                              </span>
                              <span className="block text-sm tabular-nums text-foreground">
                                {formatNumber(master?.currentStock ?? 0)} {line.unit || "kg"}
                              </span>
                            </div>
                          </div>
                        )}
                        {over && (
                          <p className="mt-2 text-xs font-medium text-destructive-strong">
                            {t("purchases.overReceive")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {currency !== "IDR" && (
                  <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                    {t("purchases.fxCostHint", { currency })}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 4. Catat pembelian ────────────────────────────────────────── */}
      {stepId === "pembelian" && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>
                <TermTooltip term="pembelian">{t("purchases.detailTitle")}</TermTooltip>
              </CardTitle>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {t("purchases.detailHintA")}{" "}
                  <TermTooltip term="utang">{t("purchases.detailHintTerm")}</TermTooltip>{" "}
                  {t("purchases.detailHintB")}
                </span>
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="purchaseDate"
                  type="date"
                  label={t("purchases.purchaseDate")}
                  value={draft.purchase.date}
                  onChange={(e) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, date: e.target.value } }))
                  }
                  required
                />
                <DueDateField
                  value={draft.purchase.dueDate}
                  onChange={(v) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, dueDate: v } }))
                  }
                />
              </div>

              <CostCenterField
                className="mt-4"
                costCenters={costCenters}
                value={draft.purchase.costCenterId ?? ""}
                onChange={(v) =>
                  patch((d) => ({ ...d, purchase: { ...d.purchase, costCenterId: v } }))
                }
              />

              <dl className="mt-4 border-t border-border pt-3">
                <WizardSummaryRow
                  label={t("purchases.valueBeforeVat")}
                  value={formatCurrency(purchaseValue(draft), currency)}
                />
                <WizardSummaryRow
                  label={<TermTooltip term="ppn">{t("purchases.inputVat")}</TermTooltip>}
                  value={formatCurrency(draft.purchase.taxAmount || 0, currency)}
                />
                <WizardSummaryRow
                  label={t("purchases.totalPayable")}
                  value={formatCurrency(purchaseTotal(draft), currency)}
                  strong
                />
              </dl>
            </CardContent>
          </Card>

          <DisclosureSection
            description={t("purchases.advancedDescription")}
            summary={[
              currency === "IDR"
                ? t("common.rupiahIdr")
                : t("invoices.advCurrencyForeign", {
                    currency,
                    rate: draft.purchase.rate > 0 ? draft.purchase.rate : t("common.notEntered"),
                  }),
              t("purchases.advSummaryVat", {
                amount: formatNumber(draft.purchase.taxAmount || 0),
              }),
            ].join(" · ")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="purchaseCurrency"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  {t("common.currencyField")}
                </label>
                <NativeSelect
                  id="purchaseCurrency"
                  options={[
                    { value: "IDR", label: "IDR (Rupiah)" },
                    { value: "USD", label: "USD" },
                    { value: "CNY", label: "CNY" },
                  ]}
                  value={currency}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      purchase: { ...d.purchase, currency: e.target.value },
                    }))
                  }
                />
              </div>
              {currency !== "IDR" && (
                <div>
                  <label
                    htmlFor="purchaseRate"
                    className="mb-1 block text-sm font-medium text-foreground"
                  >
                    <TermTooltip term="kurs">{t("common.rateTerm")}</TermTooltip> 1 {currency}{" "}
                    {t("common.rateTo")}
                  </label>
                  <TextInput
                    id="purchaseRate"
                    type="number"
                    min={0}
                    step="0.000001"
                    className="text-right tabular-nums"
                    value={draft.purchase.rate || ""}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        purchase: { ...d.purchase, rate: Number(e.target.value) },
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("common.rateRequiredHint")}
                  </p>
                </div>
              )}
              <div>
                <label
                  htmlFor="taxAmount"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  {t("purchases.inputVatCurrency", { currency })}
                </label>
                <TextInput
                  id="taxAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  className="text-right tabular-nums"
                  value={draft.purchase.taxAmount}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      purchase: { ...d.purchase, taxAmount: Number(e.target.value) },
                    }))
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("purchases.inputVatHint")}</p>
              </div>
              <div className="sm:col-span-2">
                <Input
                  id="purchaseNote"
                  label={t("common.notesOptional")}
                  value={draft.purchase.note}
                  onChange={(e) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, note: e.target.value } }))
                  }
                  maxLength={300}
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("purchases.noteHint")}</p>
              </div>
            </div>
          </DisclosureSection>
        </>
      )}

      {/* ── 5. Ringkasan ──────────────────────────────────────────────── */}
      {stepId === "ringkasan" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("common.checkBeforeSaving")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("common.checkBeforeSavingHint")}
            </p>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <WizardSummaryRow
                label={t("purchases.rowSupplier")}
                value={
                  draft.supplier.mode === "new"
                    ? t("purchases.summaryNew", { name: draft.supplier.name })
                    : (selectedSupplier?.name ?? "—")
                }
              />
              <WizardSummaryRow
                label={t("purchases.summaryGoods")}
                value={t("common.rowCount", {
                  count: draft.lines.filter((l) => l.itemName.trim()).length,
                })}
                hint={draft.lines
                  .filter((l) => l.itemName.trim())
                  .map((l) => `${l.itemName} ${formatNumber(l.quantity)} ${l.unit || "kg"}`)
                  .join(" · ")}
              />
              <WizardSummaryRow
                label={t("purchases.rowReceipt")}
                value={
                  draft.receipt.include
                    ? t("common.rowCount", {
                        count: draft.lines.filter((l) => l.receive && l.receiveQuantity > 0)
                          .length,
                      })
                    : t("common.notRecorded")
                }
                hint={
                  draft.receipt.include
                    ? t("purchases.receiptSummaryHint", { date: draft.receipt.date })
                    : t("common.stockUnchanged")
                }
              />
              <WizardSummaryRow
                label={t("purchases.rowPurchaseValue")}
                value={formatCurrency(purchaseValue(draft), currency)}
              />
              <WizardSummaryRow
                label={<TermTooltip term="ppn">{t("purchases.inputVat")}</TermTooltip>}
                value={formatCurrency(draft.purchase.taxAmount || 0, currency)}
              />
              <WizardSummaryRow
                label={t("purchases.totalPayable")}
                value={formatCurrency(purchaseTotal(draft), currency)}
                hint={t("purchases.purchaseDateHint", { date: draft.purchase.date })}
                strong
              />
            </dl>
          </CardContent>
        </Card>
      )}
    </Wizard>
  );
}
