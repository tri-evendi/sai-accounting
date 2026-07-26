"use client";

/**
 * Recording a retur penjualan / pembelian (issue #27).
 *
 * The origin document is picked first; everything downstream (currency, prices,
 * how much is still returnable) is read from the server, never typed — the same
 * "server is authoritative on money" stance as the invoice form. Returnable
 * amounts are shown per line so the over-return cap is visible before submit, and
 * the same cap is re-enforced server-side.
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { Loader2, Info, Trash2, Plus } from "lucide-react";

interface InvoiceOption {
  id: number;
  invoiceNo: string;
  date: string;
  currency: string;
  customerName: string | null;
}
interface PurchaseOption {
  id: number;
  date: string;
  currency: string;
  amount: number;
  supplierName: string | null;
}
interface ItemOption {
  id: number;
  name: string;
}

interface InvoiceLine {
  invoiceItemId: number;
  itemName: string;
  unit: string | null;
  price: number;
  quantity: number;
  returned: number;
  returnable: number;
}
interface InvoiceDetail {
  invoiceNo: string;
  currency: string;
  rate: number | null;
  taxRate: number | null;
  items: InvoiceLine[];
}
interface PurchaseDetail {
  currency: string;
  rate: number | null;
  amount: number;
  returned: number;
  returnable: number;
  supplier: { name: string } | null;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ReturnForm({
  initialType,
  invoices,
  purchases,
  items,
}: {
  initialType: "sales" | "purchase";
  invoices: InvoiceOption[];
  purchases: PurchaseOption[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();

  const [type, setType] = useState<"sales" | "purchase">(initialType);
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sales side
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null);
  const [salesLines, setSalesLines] = useState<Record<number, { qty: string; itemId: string }>>({});

  // Purchase side
  const [purchaseId, setPurchaseId] = useState("");
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseDetail | null>(null);
  const [purchaseLines, setPurchaseLines] = useState<
    { itemName: string; quantity: string; price: string; itemId: string }[]
  >([{ itemName: "", quantity: "", price: "", itemId: "" }]);

  const loadInvoice = useCallback(async (id: string) => {
    setInvoiceDetail(null);
    setSalesLines({});
    if (!id) return;
    const res = await fetch(`/api/returns/sales?invoiceId=${id}`);
    if (res.ok) setInvoiceDetail(await res.json());
  }, []);

  const loadPurchase = useCallback(async (id: string) => {
    setPurchaseDetail(null);
    if (!id) return;
    const res = await fetch(`/api/returns/purchase?purchaseId=${id}`);
    if (res.ok) setPurchaseDetail(await res.json());
  }, []);

  useEffect(() => {
    if (type === "sales") loadInvoice(invoiceId);
  }, [type, invoiceId, loadInvoice]);
  useEffect(() => {
    if (type === "purchase") loadPurchase(purchaseId);
  }, [type, purchaseId, loadPurchase]);

  // ── Derived totals for the live ledger preview ──
  const currency =
    type === "sales" ? invoiceDetail?.currency ?? "IDR" : purchaseDetail?.currency ?? "IDR";

  const salesSubtotal = invoiceDetail
    ? round2(
        invoiceDetail.items.reduce((s, ln) => {
          const qty = Number(salesLines[ln.invoiceItemId]?.qty) || 0;
          return s + qty * ln.price;
        }, 0)
      )
    : 0;

  const purchaseSubtotal = round2(
    purchaseLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0)
  );

  function setSalesQty(id: number, qty: string) {
    setSalesLines((prev) => ({ ...prev, [id]: { qty, itemId: prev[id]?.itemId ?? "" } }));
  }
  function setSalesItem(id: number, itemId: string) {
    setSalesLines((prev) => ({ ...prev, [id]: { qty: prev[id]?.qty ?? "", itemId } }));
  }

  function updatePurchaseLine(i: number, patch: Partial<(typeof purchaseLines)[number]>) {
    setPurchaseLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let url: string;
    let payload: Record<string, unknown>;

    if (type === "sales") {
      if (!invoiceId) return setError(t("returns.pickInvoiceFirst"));
      const lineItems = Object.entries(salesLines)
        .map(([id, v]) => ({
          invoiceItemId: Number(id),
          quantity: round3(Number(v.qty) || 0),
          itemId: v.itemId ? Number(v.itemId) : undefined,
        }))
        .filter((l) => l.quantity > 0);
      if (lineItems.length === 0) return setError(t("returns.fillOneLine"));
      url = "/api/returns/sales";
      payload = { invoiceId: Number(invoiceId), date, reason: reason || undefined, items: lineItems };
    } else {
      if (!purchaseId) return setError(t("returns.pickPurchaseFirst"));
      const lineItems = purchaseLines
        .map((l) => ({
          itemName: l.itemName.trim(),
          quantity: round3(Number(l.quantity) || 0),
          price: round2(Number(l.price) || 0),
          itemId: l.itemId ? Number(l.itemId) : undefined,
        }))
        .filter((l) => l.itemName && l.quantity > 0);
      if (lineItems.length === 0) return setError(t("returns.fillOneItem"));
      url = "/api/returns/purchase";
      payload = { purchaseId: Number(purchaseId), date, reason: reason || undefined, items: lineItems };
    }

    setSaving(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? t("returns.saveFailed"));
        return;
      }
      toast(t("returns.saved"), "success");
      router.push(`/returns?tab=${type}`);
      router.refresh();
    } catch {
      setError(t("returns.networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  const itemOptions = [
    { value: "", label: t("returns.noStockTrack") },
    ...items.map((it) => ({ value: String(it.id), label: it.name })),
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="type"
            label={t("returns.typeLabel")}
            value={type}
            onChange={(e) => {
              setType(e.target.value as "sales" | "purchase");
              setError(null);
            }}
            options={[
              { value: "sales", label: t("returns.typeSales") },
              { value: "purchase", label: t("returns.typePurchase") },
            ]}
          />
          <Input
            id="date"
            type="date"
            label={t("common.date")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          {type === "sales" ? (
            <div className="sm:col-span-2">
              <Select
                id="invoiceId"
                label={t("returns.originInvoice")}
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                placeholder={t("returns.pickInvoice")}
                options={invoices.map((i) => ({
                  value: String(i.id),
                  label: `${i.invoiceNo} · ${i.currency} · ${i.customerName ?? "—"}`,
                }))}
                required
              />
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Select
                id="purchaseId"
                label={t("returns.originPurchase")}
                value={purchaseId}
                onChange={(e) => setPurchaseId(e.target.value)}
                placeholder={t("returns.pickPurchase")}
                options={purchases.map((p) => ({
                  value: String(p.id),
                  label: `TRX-${p.id} · ${p.currency} ${formatCurrency(p.amount, p.currency)} · ${
                    p.supplierName ?? "—"
                  }`,
                }))}
                required
              />
            </div>
          )}
        </div>
      </Card>

      {/* Sales: per-line returnable table */}
      {type === "sales" && invoiceDetail && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("common.item")}</TableHead>
                <TableHead className="text-right">{t("common.price")}</TableHead>
                <TableHead className="text-right">{t("returns.colReturnable")}</TableHead>
                <TableHead className="text-right">{t("returns.colReturnQty")}</TableHead>
                <TableHead>{t("returns.colStockItem")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoiceDetail.items.map((ln) => {
                const v = salesLines[ln.invoiceItemId];
                const qty = Number(v?.qty) || 0;
                const over = qty > ln.returnable + 1e-6;
                return (
                  <TableRow key={ln.invoiceItemId} className="hover:bg-transparent">
                    <TableCell className="text-foreground">
                      {ln.itemName}
                      {ln.unit && <span className="text-muted-foreground"> ({ln.unit})</span>}
                    </TableCell>
                    <TableCell className="p-0">
                      <MoneyCell
                        className="text-foreground"
                        value={ln.price}
                        currency={invoiceDetail.currency}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {round3(ln.returnable)}
                      <span className="block text-xs text-muted-foreground">
                        {t("returns.fromQty", { qty: round3(ln.quantity) })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        id={`qty-${ln.invoiceItemId}`}
                        type="number"
                        step="0.001"
                        min="0"
                        max={ln.returnable}
                        className={`w-28 text-right tabular-nums ${over ? "border-destructive" : ""}`}
                        value={v?.qty ?? ""}
                        onChange={(e) => setSalesQty(ln.invoiceItemId, e.target.value)}
                        disabled={ln.returnable <= 0}
                      />
                      {over && (
                        <span className="mt-0.5 block text-xs text-destructive">{t("returns.overReturnable")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        id={`item-${ln.invoiceItemId}`}
                        value={v?.itemId ?? ""}
                        onChange={(e) => setSalesItem(ln.invoiceItemId, e.target.value)}
                        options={itemOptions}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Purchase: free-text lines + remaining value */}
      {type === "purchase" && purchaseDetail && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-muted-foreground tabular-nums">
            {t("returns.remainingReturnableLabel")}{" "}
            <strong className="text-foreground">
              {formatCurrency(purchaseDetail.returnable, purchaseDetail.currency)}
            </strong>{" "}
            {t("returns.remainingReturnableOf", {
              amount: formatCurrency(purchaseDetail.amount, purchaseDetail.currency),
            })}
          </p>
          <div className="space-y-3">
            {purchaseLines.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-4">
                  <Input
                    id={`pname-${i}`}
                    label={i === 0 ? t("common.item") : undefined}
                    value={l.itemName}
                    onChange={(e) => updatePurchaseLine(i, { itemName: e.target.value })}
                    maxLength={100}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    id={`pqty-${i}`}
                    label={i === 0 ? t("common.quantity") : undefined}
                    type="number"
                    step="0.001"
                    min="0"
                    className="text-right tabular-nums"
                    value={l.quantity}
                    onChange={(e) => updatePurchaseLine(i, { quantity: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    id={`pprice-${i}`}
                    label={i === 0 ? t("common.price") : undefined}
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-right tabular-nums"
                    value={l.price}
                    onChange={(e) => updatePurchaseLine(i, { price: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Select
                    id={`pitem-${i}`}
                    label={i === 0 ? t("returns.colStockItem") : undefined}
                    value={l.itemId}
                    onChange={(e) => updatePurchaseLine(i, { itemId: e.target.value })}
                    options={itemOptions}
                  />
                </div>
                <div className="sm:col-span-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setPurchaseLines((prev) =>
                        prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev
                      )
                    }
                    className="text-muted-foreground"
                    aria-label={t("returns.removeRow")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 cursor-pointer"
            onClick={() =>
              setPurchaseLines((prev) => [...prev, { itemName: "", quantity: "", price: "", itemId: "" }])
            }
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("returns.addRow")}
          </Button>
        </Card>
      )}

      <Card className="p-6">
        <Input
          id="reason"
          label={t("returns.reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />

        {(salesSubtotal > 0 || purchaseSubtotal > 0) && (
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">
            {t("returns.returnValueLabel")}{" "}
            <strong className="text-foreground">
              {formatCurrency(type === "sales" ? salesSubtotal : purchaseSubtotal, currency)}
            </strong>
          </p>
        )}

        <p className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {type === "sales" ? (
              <>
                {t("returns.reduces")} <strong>{t("returns.accountsReceivable")}</strong>{" "}
                {t("returns.and")} <strong>{t("returns.salesAccount")}</strong>
                {t("returns.reverses")} <strong>{t("returns.outputVat")}</strong>{" "}
                {t("returns.effectSalesTail")} <strong>{t("returns.stockIn")}</strong>
                {t("common.fullStop")}
              </>
            ) : (
              <>
                {t("returns.reduces")} <strong>{t("returns.accountsPayable")}</strong>{" "}
                {t("returns.and")} <strong>{t("returns.inventoryAccount")}</strong>
                {t("returns.reverses")} <strong>{t("returns.inputVat")}</strong>{" "}
                {t("returns.effectPurchaseTail")} <strong>{t("returns.stockOut")}</strong>
                {t("common.fullStop")}
              </>
            )}{" "}
            {t("returns.effectSuffix")}
          </span>
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">
            {error}
          </p>
        )}
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="cursor-pointer">
          {saving && (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          {t("returns.submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => router.push(`/returns?tab=${type}`)}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
