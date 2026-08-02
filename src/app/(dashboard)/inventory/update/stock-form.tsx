"use client";

/**
 * Tambah / Kurangi Stok — validasi anti-salah (issue #6).
 *
 * Layar ini adalah satu-satunya tempat stok berubah dengan tangan, dan
 * konsekuensinya besar: barang keluar langsung membentuk jurnal HPP dengan
 * harga pokok rata-rata tertimbang. Karena itu tiga larangan server ditampilkan
 * lebih dulu di sini — periode yang sudah ditutup, jumlah negatif, dan
 * pengeluaran melebihi saldo — ditambah satu ketukan konfirmasi untuk
 * pengeluaran besar. Tidak satu pun menggantikan penjaga di `/api/inventory`,
 * yang tetap menolak hal yang sama di dalam transaksinya sendiri.
 */

import { useState } from "react";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertCircle, Info, Lock, Package } from "lucide-react";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";
import {
  CostCenterField,
  costCenterPayload,
  useCostCenters,
} from "@/components/shared/cost-center-field";
import { formatNumber } from "@/lib/utils";
import {
  closedPeriodIssue,
  humanizeFieldMessage,
  isLargeStockOut,
  largeStockOutMessage,
  negativeValueIssue,
  stockShortfallMessage,
  type ClosedPeriodRef,
} from "@/lib/form-guards";
import { findStockShortfalls } from "@/lib/delivery-orders";
import { useT } from "@/lib/i18n/client";

export interface StockItemOption {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

interface StockPayload {
  itemId: number;
  quantity: number;
  type: "in" | "out";
  date: string;
  unitCost?: number;
  note: string;
  /** issue #98 — dimensi HPP gerakan ini. `null` = belum ditetapkan. */
  costCenterId: number | null;
}

export function StockUpdateForm({
  items: initialItems,
  closedPeriods,
}: {
  items: StockItemOption[];
  closedPeriods: ClosedPeriodRef[];
}) {
  const t = useT();
  const router = useAppRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [items, setItems] = useState<StockItemOption[]>(initialItems);
  // Cost is captured on the way in; on the way out it is derived (weighted
  // average) and posted as HPP, so the field only applies to `in`.
  const [movementType, setMovementType] = useState<"in" | "out">("in");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [pending, setPending] = useState<StockPayload | null>(null);
  // issue #98 — pengeluaran stok MANUAL adalah satu-satunya jalur HPP tanpa
  // dokumen sumber untuk diwarisi, jadi dimensinya hanya bisa datang dari sini.
  const costCenters = useCostCenters();
  const [costCenterId, setCostCenterId] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");

  // New item form
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("kg");

  const selected = items.find((i) => String(i.id) === itemId) ?? null;
  const periodIssue = closedPeriodIssue(date, closedPeriods, "Tanggal pergerakan stok");
  const qtyValue = Number(quantity) || 0;
  const overStock =
    movementType === "out" && selected != null && qtyValue > selected.currentStock;

  async function refreshItems() {
    // `active=1`: barang yang dinonaktifkan tidak ditawarkan untuk gerakan BARU
    // (issue #104); saldo & riwayatnya tetap tampil di laporan stok.
    const res = await fetch("/api/inventory?active=1");
    if (!res.ok) return;
    const data: { id: number; name: string; unit: string | null; currentStock: number }[] =
      await res.json();
    setItems(
      data.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        currentStock: i.currentStock ?? 0,
      }))
    );
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_item", name: newItemName, unit: newItemUnit }),
    });

    if (res.ok) {
      setNewItemName("");
      setNewItemUnit("kg");
      setShowNewItem(false);
      await refreshItems();
      setSuccess(t("inventory.itemSaved"));
      setTimeout(() => setSuccess(""), 3000);
    } else {
      const data = await res.json().catch(() => null);
      setError(
        humanizeFieldMessage("itemName", data?.error ?? t("inventory.itemSaveFailed"))
      );
    }
  }

  async function send(body: StockPayload) {
    setLoading(true);
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const fieldErrors = data?.details?.fieldErrors as
        | Record<string, string[] | undefined>
        | undefined;
      const firstField = fieldErrors
        ? Object.entries(fieldErrors).find(([, msgs]) => msgs?.length)
        : undefined;
      setError(
        firstField
          ? humanizeFieldMessage(firstField[0], firstField[1]?.[0])
          : humanizeFieldMessage(null, data?.error ?? t("inventory.movementSaveFailed"))
      );
      setLoading(false);
    } else {
      setSuccess(t("inventory.movementSaved"));
      setLoading(false);
      setQuantity("");
      await refreshItems();
      router.refresh();
      setTimeout(() => setSuccess(""), 3000);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const formData = new FormData(e.currentTarget);
    const itemIdVal = Number(formData.get("itemId")) || 0;
    if (!itemIdVal) {
      setError(t("inventory.pickItemFirst"));
      return;
    }

    if (periodIssue) {
      setError(periodIssue);
      return;
    }

    const unitCost = Number(formData.get("unitCost"));
    const negative = negativeValueIssue([
      { field: "quantity", value: qtyValue },
      ...(movementType === "in" ? [{ field: "unitCost", value: unitCost }] : []),
    ]);
    if (negative) {
      setError(negative.message);
      return;
    }
    if (!(qtyValue > 0)) {
      setError(t("inventory.qtyPositive"));
      return;
    }

    const item = items.find((i) => i.id === itemIdVal);
    if (movementType === "out" && item) {
      // Penjaga yang sama dengan surat jalan & `/api/inventory`: stok tidak
      // pernah boleh negatif.
      const shortfall = stockShortfallMessage(
        findStockShortfalls(
          [{ itemId: item.id, itemName: item.name, kg: qtyValue }],
          new Map([[item.id, item.currentStock]])
        )
      );
      if (shortfall) {
        setError(shortfall);
        return;
      }
    }

    const body: StockPayload = {
      itemId: itemIdVal,
      quantity: qtyValue,
      type: movementType,
      date: String(formData.get("date") ?? ""),
      unitCost: movementType === "in" ? unitCost || undefined : undefined,
      note: String(formData.get("note") ?? ""),
      costCenterId: costCenterPayload(costCenterId),
    };

    if (movementType === "out" && item && isLargeStockOut(qtyValue, item.currentStock)) {
      setConfirmMessage(
        largeStockOutMessage(item.name, qtyValue, item.currentStock, item.unit || "kg")
      );
      setPending(body);
      return;
    }

    void send(body);
  }

  return (
    <div className="w-full">
      <PageHeader
        className="mb-1"
        // Sub-halaman Stok tanpa remah roti memaksa pengguna kembali lewat menu
        // samping — satu-satunya jalan pulang sebelum ini.
        breadcrumbs={[
          { label: t("nav.items.inventory"), href: "/inventory" },
          { label: t("common.addRemoveStock") },
        ]}
        title={<TermTooltip term="persediaan">{t("common.addRemoveStock")}</TermTooltip>}
        description={t("inventory.updateDescription")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 cursor-pointer"
            onClick={() => setShowNewItem(!showNewItem)}
          >
            {showNewItem ? t("common.cancel") : t("inventory.newItemToggle")}
          </Button>
        }
      />
      <LearnMore term="hpp" className="mt-1 mb-6" label={t("inventory.learnMoreCogs")} />

      {error && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-md bg-success-soft p-3 text-sm text-success-strong" role="status">
          {success}
        </div>
      )}

      {/* New Item Form */}
      {showNewItem && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{t("inventory.newItemTitle")}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateItem} className="flex items-end gap-3">
              <div className="flex-1">
                <Input id="newItemName" label={t("common.itemName")} value={newItemName} onChange={(e) => setNewItemName(e.target.value)} required />
              </div>
              <div className="w-28">
                <Input id="newItemUnit" label={t("common.unit")} value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} />
              </div>
              <Button type="submit" size="sm" className="cursor-pointer">{t("common.save")}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Stock Update Form */}
      <Card>
        <CardHeader><CardTitle>{t("inventory.movementTitle")}</CardTitle></CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState
              icon={<Package className="h-12 w-12" />}
              title={t("inventory.emptyFormTitle")}
              description={t("inventory.emptyFormDescription")}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Select
                  id="itemId"
                  name="itemId"
                  label={t("common.item")}
                  placeholder={t("inventory.pickItemPlaceholder")}
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  options={items.map((item) => ({
                    value: String(item.id),
                    label: `${item.name}${item.unit ? ` (${item.unit})` : ""}`,
                  }))}
                  required
                />
                {selected && (
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {t("inventory.currentStockHint", {
                      qty: formatNumber(selected.currentStock),
                      unit: selected.unit || "kg",
                    })}
                  </p>
                )}
              </div>
              <Select
                id="type"
                name="type"
                label={t("inventory.movementTypeLabel")}
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as "in" | "out")}
                options={[
                  { value: "in", label: t("inventory.movementIn") },
                  { value: "out", label: t("inventory.movementOut") },
                ]}
              />
              <div>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-right tabular-nums"
                  label={t("common.quantity")}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
                {overStock && selected && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-destructive-strong" role="alert">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {t("inventory.overStockWarning", {
                        qty: formatNumber(selected.currentStock),
                        unit: selected.unit || "kg",
                      })}
                    </span>
                  </p>
                )}
              </div>
              {movementType === "in" ? (
                <div>
                  <Input
                    id="unitCost"
                    name="unitCost"
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-right tabular-nums"
                    label={<TermTooltip term="hpp">{t("inventory.unitCostLabel")}</TermTooltip>}
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("inventory.unitCostHint")}
                  </p>
                </div>
              ) : (
                <p className="flex items-start gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{t("inventory.cogsAutoHint")}</span>
                </p>
              )}
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
              <Input id="note" name="note" label={t("common.notesOptional")} />

              <CostCenterField
                costCenters={costCenters}
                value={costCenterId}
                onChange={setCostCenterId}
                hint={t("costCenters.stockPickerHint")}
              />

              <div className="flex gap-3">
                <Button type="submit" className="cursor-pointer" disabled={loading}>
                  {loading ? t("common.saving") : t("inventory.submitMovement")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => router.push("/inventory")}
                >
                  {t("inventory.backToInventory")}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Konfirmasi pengeluaran stok besar (issue #6). */}
      <ConfirmDialog
        title={t("inventory.largeOutTitle")}
        message={confirmMessage}
        confirmLabel={t("inventory.largeOutConfirm")}
        confirmVariant="danger"
        open={pending != null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        onConfirm={async () => {
          if (pending) await send(pending);
        }}
      />
    </div>
  );
}
