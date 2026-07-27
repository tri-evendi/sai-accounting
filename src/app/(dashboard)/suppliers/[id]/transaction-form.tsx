"use client";

import { useCallback, useState } from "react";
import { DueDateField } from "@/components/shared/due-date-field";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, TextInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  CostCenterField,
  costCenterPayload,
  useCostCenters,
} from "@/components/shared/cost-center-field";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { ArrowDownLeft, ArrowUpRight, Link2, Plus } from "lucide-react";

const BASE_CURRENCY = "IDR";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const EPSILON = 0.005;

/** An outstanding purchase offered to the allocation picker (issue #37). */
interface OutstandingPurchase {
  id: number;
  date: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  totalBase: number | null;
  allocatedBase: number;
  remainingBase: number | null;
  note: string | null;
}

/**
 * Records a supplier purchase or payment. Both auto-post:
 *   purchase → D: Persediaan (+ D: PPN Masukan) / K: Hutang Usaha
 *   payment  → D: Hutang Usaha / K: Kas & Bank
 */
export function SupplierTransactionForm({ supplierId }: { supplierId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState<"purchase" | "payment">("purchase");
  const [currency, setCurrency] = useState(BASE_CURRENCY);

  // Allocation state (issue #37). `alloc` maps purchase id → amount typed by the
  // user, in the PAYMENT's currency. Absent key = not allocated.
  const [purchases, setPurchases] = useState<OutstandingPurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [alloc, setAlloc] = useState<Record<number, string>>({});
  // issue #98 — cabang/unit yang menanggung pembelian (atau membayarnya). Retur
  // pembeliannya mewarisi dimensi ini.
  const costCenters = useCostCenters();
  const [costCenterId, setCostCenterId] = useState("");

  const isForeign = currency !== BASE_CURRENCY;
  const isPurchase = type === "purchase";

  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/transactions?outstanding=1`);
      setPurchases(res.ok ? await res.json() : []);
    } catch {
      // A failed lookup must not block recording the payment — allocation is
      // optional, and an unallocated payment is still a correct payment.
      setPurchases([]);
    }
    setLoadingPurchases(false);
  }, [supplierId]);

  /**
   * Switching type is the only thing that decides whether allocation applies, so
   * the fetch hangs off that event rather than an effect: only a payment can
   * settle a purchase, and a purchase clears any allocation already picked.
   */
  function handleTypeChange(next: "purchase" | "payment") {
    setType(next);
    if (next === "payment") loadPurchases();
    else setAlloc({});
  }

  const allocEntries = Object.entries(alloc)
    .map(([id, v]) => ({ purchaseId: Number(id), amount: Number(v) }))
    .filter((a) => Number.isFinite(a.amount) && a.amount > EPSILON);
  const allocTotal = allocEntries.reduce((s, a) => s + a.amount, 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get("amount"));

    // Caught here as well as server-side so the user sees it before a round trip.
    if (!isPurchase && allocTotal > amount + EPSILON) {
      setError(
        t("suppliers.txOverAlloc", {
          allocated: formatCurrency(allocTotal, currency),
          amount: formatCurrency(amount, currency),
        })
      );
      setLoading(false);
      return;
    }

    const body = {
      date: formData.get("date"),
      // Only a purchase can fall due; the API ignores it for a payment anyway.
      dueDate: isPurchase ? formData.get("dueDate") : null,
      type,
      amount,
      currency,
      rate: isForeign ? Number(formData.get("rate")) || undefined : undefined,
      taxAmount: isPurchase ? Number(formData.get("taxAmount")) || 0 : 0,
      note: formData.get("note") || undefined,
      // Omitted entirely on a purchase, and when a payment settles nothing in
      // particular — an unallocated payment is valid and falls back to FIFO.
      allocations: !isPurchase && allocEntries.length > 0 ? allocEntries : undefined,
      // Tak dipilih = null = "belum ditetapkan / seluruh perusahaan" (issue #98).
      costCenterId: costCenterPayload(costCenterId),
    };

    const res = await fetch(`/api/suppliers/${supplierId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || t("suppliers.txSaveFailed")));
      setLoading(false);
      return;
    }

    toast(t("suppliers.txSaved"));
    setOpen(false);
    setLoading(false);
    setAlloc({});
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" /> {t("suppliers.addTransaction")}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted p-4 mt-4">
      <h4 className="text-sm font-semibold text-foreground mb-3">{t("suppliers.txFormTitle")}</h4>

      {error && (
        <div className="mb-3 rounded-md bg-destructive-soft p-2 text-xs text-destructive-strong" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Select
            id="trx-type"
            name="type"
            label={t("suppliers.txTypeLabel")}
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as "purchase" | "payment")}
            options={[
              { value: "purchase", label: t("suppliers.txTypePurchase") },
              { value: "payment", label: t("suppliers.txTypePayment") },
            ]}
          />
          {isPurchase ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-destructive-strong">
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("suppliers.txEffectPurchase")}</span>
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1 text-xs text-success-strong">
              <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("suppliers.txEffectPayment")}</span>
            </p>
          )}
        </div>

        <Input
          id="trx-date"
          name="date"
          type="date"
          label={t("common.date")}
          defaultValue={new Date().toISOString().split("T")[0]}
          required
        />

        {isPurchase && <DueDateField />}

        <Input
          id="trx-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          className="text-right tabular-nums"
          label={isPurchase ? t("suppliers.txAmountPurchase") : t("suppliers.txAmountPayment")}
          required
        />

        <Select
          id="trx-currency"
          name="currency"
          label={t("common.currency")}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={[
            { value: "IDR", label: "IDR (Rupiah)" },
            { value: "USD", label: "USD" },
            { value: "CNY", label: "CNY" },
          ]}
        />

        {isForeign && (
          <div>
            <Input
              id="trx-rate"
              name="rate"
              type="number"
              step="0.000001"
              min="0"
              className="text-right tabular-nums"
              label={t("suppliers.txRateLabel", { currency })}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("common.rateRequiredHint")}</p>
          </div>
        )}

        {isPurchase && (
          <div>
            <Input
              id="trx-tax"
              name="taxAmount"
              type="number"
              step="0.01"
              min="0"
              className="text-right tabular-nums"
              label={t("suppliers.txInputVat")}
              defaultValue="0"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("suppliers.txInputVatHint")}</p>
          </div>
        )}

        <CostCenterField
          className="sm:col-span-2"
          costCenters={costCenters}
          value={costCenterId}
          onChange={setCostCenterId}
        />

        {!isPurchase && (
          <fieldset className="sm:col-span-2 rounded-lg border border-border bg-card p-3">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-foreground">
              <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t("suppliers.txAllocLegend")}
            </legend>

            <p className="mb-3 text-xs text-muted-foreground">
              {t("suppliers.txAllocHintA")} <strong>{t("suppliers.txAllocHintStrong")}</strong>{" "}
              {t("suppliers.txAllocHintB")}
            </p>

            {loadingPurchases ? (
              <p className="text-xs text-muted-foreground">{t("suppliers.allocLoading")}</p>
            ) : purchases.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("suppliers.txNoOutstanding")}</p>
            ) : (
              <ul className="space-y-2">
                {purchases.map((p) => {
                  const checked = alloc[p.id] !== undefined;
                  const noRate = p.remainingBase == null;
                  return (
                    <li
                      key={p.id}
                      className="rounded-md border border-border p-2.5 transition-colors duration-150 hover:border-border"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <Checkbox
                            className="mt-1"
                            checked={checked}
                            disabled={noRate}
                            onCheckedChange={(v) =>
                              setAlloc((prev) => {
                                const next = { ...prev };
                                if (v === true) {
                                  // Default to clearing the document in full when
                                  // the payment is in IDR; otherwise leave blank
                                  // rather than guess across currencies.
                                  next[p.id] =
                                    !isForeign && p.remainingBase != null
                                      ? String(p.remainingBase)
                                      : "";
                                } else delete next[p.id];
                                return next;
                              })
                            }
                          />
                          <span>
                            <span className="font-medium text-foreground">TRX-{p.id}</span>
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              {formatDateShort(p.date)}
                              {p.dueDate && (
                                <>
                                  {" · "}
                                  {t("suppliers.dueShort", { date: formatDateShort(p.dueDate) })}
                                </>
                              )}
                            </span>
                            {p.note && (
                              <span className="block max-w-64 truncate text-xs text-muted-foreground">
                                {p.note}
                              </span>
                            )}
                          </span>
                        </label>

                        <div className="text-right">
                          <span className="block text-xs text-muted-foreground">
                            {t("suppliers.outstandingDebt")}
                          </span>
                          <span className="block text-sm font-medium text-foreground tabular-nums">
                            {noRate
                              ? t("common.rateMissing")
                              : formatCurrency(p.remainingBase!, "IDR")}
                          </span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {t("suppliers.lineValue", {
                              amount: formatCurrency(p.amount, p.currency),
                            })}
                          </span>
                        </div>
                      </div>

                      {noRate && (
                        <p className="mt-1.5 text-xs text-warning-strong">
                          {t("suppliers.noRateLine")}
                        </p>
                      )}

                      {checked && (
                        <div className="mt-2 flex items-center gap-2">
                          <label
                            htmlFor={`alloc-${p.id}`}
                            className="text-xs text-muted-foreground whitespace-nowrap"
                          >
                            {t("suppliers.paidIn", { currency })}
                          </label>
                          <TextInput
                            id={`alloc-${p.id}`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={alloc[p.id]}
                            onChange={(e) =>
                              setAlloc((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            className="w-40 text-right tabular-nums"
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {allocEntries.length > 0 && (
              <p className="mt-3 flex justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">{t("suppliers.totalAllocated")}</span>
                <span className="font-medium text-foreground tabular-nums">
                  {formatCurrency(allocTotal, currency)}
                </span>
              </p>
            )}
          </fieldset>
        )}

        <div className="sm:col-span-2">
          <Input id="trx-note" name="note" label={t("common.notesOptional")} />
        </div>

        <div className="sm:col-span-2 flex gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? t("common.saving") : t("suppliers.txSubmit")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
