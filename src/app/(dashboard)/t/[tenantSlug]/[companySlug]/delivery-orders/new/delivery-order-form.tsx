"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/app-link";
import { Link } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { formatNumber } from "@/lib/utils";
import { findStockShortfalls } from "@/lib/delivery-orders";
import {
  closedPeriodIssue,
  humanizeFieldMessage,
  isLargeStockOut,
  largeStockOutMessage,
  negativeValueIssue,
  stockShortfallMessage,
  type ClosedPeriodRef,
} from "@/lib/form-guards";
import { useT } from "@/lib/i18n/client";
import { AlertCircle, Lock, Package, Trash2, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

interface ContractOption {
  id: number;
  contractNo: string;
  buyer: string;
  consigneeId: number | null;
}
interface InvoiceOption {
  id: number;
  invoiceNo: string;
  customerName: string | null;
}
interface ConsigneeOption {
  id: number;
  name: string;
  country: string | null;
  contact: string | null;
}
interface ItemOption {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

interface LineState {
  itemId: number | null;
  bags: number;
  kgPerBag: number;
}

interface Props {
  contracts: ContractOption[];
  invoices: InvoiceOption[];
  consignees: ConsigneeOption[];
  items: ItemOption[];
  closedPeriods: ClosedPeriodRef[];
  /** Modul `inventory` aktif DAN pengguna boleh menulisnya (issue #103) —
   *  dihitung di server; tanpa itu ajakan "Tambah/Kurangi Stok" memantul. */
  canUpdateStock: boolean;
}

/** Muatan POST /api/delivery-orders — dibangun sekali, dikirim setelah lolos. */
interface DeliveryPayload {
  date: string;
  contractId: number | null;
  invoiceId: number | null;
  consigneeId: number | null;
  vehicleNo: string;
  containerNo: string;
  notes: string;
  items: { itemId: number | null; itemName: string; bags: number; kgPerBag: number }[];
}

const lineKg = (l: LineState) => (l.bags || 0) * (l.kgPerBag || 0);

export function DeliveryOrderForm({
  contracts,
  invoices,
  consignees,
  items,
  closedPeriods,
  canUpdateStock,
}: Props) {
  const router = useAppRouter();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [consigneeId, setConsigneeId] = useState<number | null>(null);
  const [contractId, setContractId] = useState<number | null>(null);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [lines, setLines] = useState<LineState[]>([{ itemId: null, bags: 0, kgPerBag: 0 }]);
  const [date, setDate] = useState("");
  // Pengeluaran stok besar ditahan sebentar untuk dikonfirmasi (issue #6).
  const [pending, setPending] = useState<DeliveryPayload | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");

  const itemById = new Map(items.map((i) => [i.id, i]));

  // Requested kg per item, so the availability hint sums lines of the same item.
  const requestedByItem = new Map<number, number>();
  for (const l of lines) {
    if (l.itemId != null) {
      requestedByItem.set(l.itemId, (requestedByItem.get(l.itemId) ?? 0) + lineKg(l));
    }
  }

  const consigneeOptions: SearchableOption[] = consignees.map((c) => ({
    value: String(c.id),
    label: c.name,
    description: [c.country, c.contact].filter(Boolean).join(" · ") || undefined,
  }));
  const contractOptions: SearchableOption[] = contracts.map((c) => ({
    value: String(c.id),
    label: c.contractNo,
    description: c.buyer,
  }));
  const invoiceOptions: SearchableOption[] = invoices.map((i) => ({
    value: String(i.id),
    label: i.invoiceNo,
    description: i.customerName ?? undefined,
  }));
  const itemOptions: SearchableOption[] = items.map((i) => ({
    value: String(i.id),
    label: i.name,
    description: t("common.stockOption", { qty: formatNumber(i.currentStock), unit: i.unit || "kg" }),
  }));

  const totalBags = lines.reduce((s, l) => s + (l.bags || 0), 0);
  const totalKg = lines.reduce((s, l) => s + lineKg(l), 0);
  const periodIssue = closedPeriodIssue(date, closedPeriods, t("deliveryOrders.dateGuardLabel"));

  function updateLine(index: number, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { itemId: null, bags: 0, kgPerBag: 0 }]);
  }
  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  // Picking a contract offers to inherit its consignee (only when none chosen yet).
  function onContractChange(id: number | null) {
    setContractId(id);
    if (id != null && consigneeId == null) {
      const c = contracts.find((x) => x.id === id);
      if (c?.consigneeId != null) setConsigneeId(c.consigneeId);
    }
  }

  async function send(body: DeliveryPayload) {
    setLoading(true);
    const res = await apiFetch("/api/delivery-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const fieldMsg = data?.details?.fieldErrors
        ? Object.values(data.details.fieldErrors as Record<string, string[]>)
            .flat()
            .filter(Boolean)[0]
        : null;
      setError(
        humanizeFieldMessage(
          null,
          String(fieldMsg || data?.error || t("deliveryOrders.submitFailed"))
        )
      );
      setLoading(false);
    } else {
      const created = await res.json();
      router.push(`/delivery-orders/${created.id}`);
      router.refresh();
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const payloadItems = lines
      .filter((l) => l.itemId != null)
      .map((l) => ({
        itemId: l.itemId,
        itemName: itemById.get(l.itemId as number)?.name ?? "",
        bags: l.bags,
        kgPerBag: l.kgPerBag,
      }));

    if (payloadItems.length === 0) {
      setError(t("deliveryOrders.noItems"));
      return;
    }

    // ── Penjaga sebelum kirim (cermin dari penjaga server) ──
    const periodIssueNow = closedPeriodIssue(date, closedPeriods, t("deliveryOrders.dateGuardLabel"));
    if (periodIssueNow) {
      setError(periodIssueNow);
      return;
    }
    const negative = negativeValueIssue(
      lines.flatMap((l, i) => [
        { field: `bags-${i}`, value: l.bags, label: t("contracts.bagsRowLabel", { n: i + 1 }) },
        { field: `kgPerBag-${i}`, value: l.kgPerBag, label: t("contracts.kgPerBagRowLabel", { n: i + 1 }) },
      ])
    );
    if (negative) {
      setError(negative.message);
      return;
    }
    // `assertStockAvailable` di server memakai fungsi yang sama persis; ini hanya
    // memindahkan penolakannya ke layar sebelum apa pun dikirim.
    const shortfallMsg = stockShortfallMessage(
      findStockShortfalls(
        [...requestedByItem.entries()].map(([itemId, kg]) => ({
          itemId,
          itemName: itemById.get(itemId)?.name ?? t("common.item"),
          kg,
        })),
        new Map(items.map((i) => [i.id, i.currentStock]))
      )
    );
    if (shortfallMsg) {
      setError(shortfallMsg);
      return;
    }

    const formData = new FormData(e.currentTarget);
    const body: DeliveryPayload = {
      date: String(formData.get("date") ?? ""),
      contractId,
      invoiceId,
      consigneeId,
      vehicleNo: String(formData.get("vehicleNo") ?? ""),
      containerNo: String(formData.get("containerNo") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      items: payloadItems,
    };

    // Pengeluaran besar: satu ketukan konfirmasi sebelum stok berkurang dan
    // jurnal HPP terbentuk. Bukan larangan — hanya jeda.
    const large = [...requestedByItem.entries()].find(([itemId, kg]) =>
      isLargeStockOut(kg, itemById.get(itemId)?.currentStock ?? 0)
    );
    if (large) {
      const [itemId, kg] = large;
      const item = itemById.get(itemId);
      setConfirmMessage(
        largeStockOutMessage(item?.name ?? t("common.item"), kg, item?.currentStock ?? 0, item?.unit || "kg")
      );
      setPending(body);
      return;
    }

    void send(body);
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <TermTooltip term="surat_jalan">{t("deliveryOrders.detailsTitle")}</TermTooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                id="date"
                name="date"
                type="date"
                label={t("common.date")}
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
            <div className="space-y-1.5">
              <SearchableSelect
                id="consigneeId"
                label={t("deliveryOrders.colConsignee")}
                placeholder={t("deliveryOrders.pickConsignee")}
                searchPlaceholder={t("deliveryOrders.searchConsignee")}
                emptyText={t("deliveryOrders.noConsigneeMatch")}
                options={consigneeOptions}
                value={consigneeId != null ? String(consigneeId) : null}
                onChange={(v) => setConsigneeId(v == null ? null : Number(v))}
              />
              <p className="text-xs text-muted-foreground">
                {t("deliveryOrders.addConsigneePrompt")}{" "}
                <Link href="/consignees/new" target="_blank" className="text-primary hover:underline">
                  {t("deliveryOrders.addConsigneeLink")}
                </Link>
                {t("common.fullStop")}
              </p>
            </div>
            <SearchableSelect
              id="contractId"
              label={t("invoices.contractSourceOptional")}
              placeholder={t("invoices.pickContract")}
              searchPlaceholder={t("invoices.searchContract")}
              emptyText={t("invoices.noContractMatch")}
              options={contractOptions}
              value={contractId != null ? String(contractId) : null}
              onChange={(v) => onContractChange(v == null ? null : Number(v))}
            />
            <SearchableSelect
              id="invoiceId"
              label={t("deliveryOrders.invoiceSourceOptional")}
              placeholder={t("deliveryOrders.pickInvoice")}
              searchPlaceholder={t("deliveryOrders.searchInvoice")}
              emptyText={t("deliveryOrders.noInvoiceMatch")}
              options={invoiceOptions}
              value={invoiceId != null ? String(invoiceId) : null}
              onChange={(v) => setInvoiceId(v == null ? null : Number(v))}
            />
            <Input id="vehicleNo" name="vehicleNo" label={t("deliveryOrders.vehicleNoOptional")} />
            <Input id="containerNo" name="containerNo" label={t("deliveryOrders.containerNoOptional")} />
            <div className="sm:col-span-2">
              <Input id="notes" name="notes" label={t("common.notesOptional")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("deliveryOrders.goodsTitle")}</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              <Plus className="mr-1 h-4 w-4" /> {t("common.addItem")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState
              icon={<Package className="h-12 w-12" />}
              title={t("common.emptyStockTitle")}
              description={t("deliveryOrders.emptyStockDescription")}
              actionLabel={canUpdateStock ? t("common.addRemoveStock") : undefined}
              actionHref={canUpdateStock ? "/inventory/update" : undefined}
            />
          ) : (
          <div className="space-y-4">
            {lines.map((line, i) => {
              const item = line.itemId != null ? itemById.get(line.itemId) : null;
              const requested = line.itemId != null ? requestedByItem.get(line.itemId) ?? 0 : 0;
              const over = item != null && requested > item.currentStock;
              return (
                <div key={i} className="rounded-md border border-border p-3">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <SearchableSelect
                        label={t("common.item")}
                        placeholder={t("common.pickItem")}
                        searchPlaceholder={t("common.searchItem")}
                        emptyText={t("common.noItemMatch")}
                        options={itemOptions}
                        value={line.itemId != null ? String(line.itemId) : null}
                        onChange={(v) => updateLine(i, { itemId: v == null ? null : Number(v) })}
                      />
                    </div>
                    <div className="w-24">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("common.bags")}</label>
                      <TextInput
                        type="number"
                        min={0}
                        className="text-right tabular-nums"
                        value={line.bags}
                        onChange={(e) => updateLine(i, { bags: Number(e.target.value) })}
                      />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("common.kgPerBag")}</label>
                      <TextInput
                        type="number"
                        min={0}
                        step="0.01"
                        className="text-right tabular-nums"
                        value={line.kgPerBag}
                        onChange={(e) => updateLine(i, { kgPerBag: Number(e.target.value) })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(i)}
                      className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                      disabled={lines.length === 1}
                      aria-label={t("common.removeItemRow", { n: i + 1 })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className={over ? "font-medium text-destructive" : "text-muted-foreground"}>
                      {item
                        ? over
                          ? t("deliveryOrders.lineAvailableOver", {
                              stock: formatNumber(item.currentStock),
                              unit: item.unit || "kg",
                            })
                          : t("deliveryOrders.lineAvailable", {
                              stock: formatNumber(item.currentStock),
                              unit: item.unit || "kg",
                            })
                        : t("deliveryOrders.linePickItem")}
                    </span>
                    <span className="tabular-nums text-foreground">
                      = {formatNumber(lineKg(line))} kg
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="py-3">
          <dl className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t("deliveryOrders.totalBags")}</dt>
              <dd className="tabular-nums font-medium text-foreground">{formatNumber(totalBags)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="font-medium text-muted-foreground">{t("deliveryOrders.totalOutKg")}</dt>
              <dd className="text-lg font-bold tabular-nums text-foreground">
                {formatNumber(totalKg)} kg
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" className="cursor-pointer" disabled={loading}>
          {loading ? t("deliveryOrders.submitting") : t("deliveryOrders.submit")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="cursor-pointer"
          onClick={() => router.back()}
        >
          {t("common.cancel")}
        </Button>
      </div>

      {/* Konfirmasi pengeluaran stok besar (issue #6) — terkendali, karena
          pemicunya adalah tombol Simpan yang sudah ada, bukan tombol tersendiri. */}
      <ConfirmDialog
        title={t("deliveryOrders.confirmTitle")}
        message={confirmMessage}
        confirmLabel={t("deliveryOrders.confirmLabel")}
        confirmVariant="danger"
        open={pending != null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        onConfirm={async () => {
          if (pending) await send(pending);
        }}
      />
    </form>
  );
}
