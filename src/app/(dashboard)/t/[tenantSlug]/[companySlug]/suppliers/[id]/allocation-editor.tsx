"use client";

/**
 * Re-allocate an existing supplier payment (issue #38).
 *
 * #37 let a user say which purchases a payment settles, but only while the
 * payment was being created. Getting it wrong — or recording a payment before
 * #37 existed at all — left no way back except deleting the payment and making
 * it again. This panel edits the allocation set directly: it PUTs the new set.
 *
 * For a PURE-IDR payment that write touches no journal — the allocation is
 * reporting data. For a FOREIGN-currency payment it is ledger-affecting (issue
 * #42): the allocation decides which slice of hutang is relieved at which
 * document rate, hence the realised selisih kurs, so the PUT reposts the payment
 * server-side. Either way the user just states the truth and the ledger follows.
 *
 * The set is always sent whole. Editing an amount, unticking a purchase and
 * allocating a payment that had nothing are then one operation with one
 * outcome, rather than three endpoints that can disagree.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TextInput } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { Link2, Loader2 } from "lucide-react";

const BASE_CURRENCY = "IDR";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const EPSILON = 0.005;

interface EditablePurchase {
  id: number;
  date: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  totalBase: number | null;
  allocatedBase: number;
  /**
   * Room left, IDR, measured from recorded allocations only and with THIS
   * payment's own allocations excluded by the API — so re-stating an existing
   * allocation is never blocked by itself, and a FIFO guess never blocks it at
   * all.
   */
  remainingBase: number | null;
  note: string | null;
}

interface EditorPayload {
  payment: { id: number; amount: number; currency: string; rate: number | null };
  current: { purchaseId: number; amount: number }[];
  purchases: EditablePurchase[];
}

export function AllocationEditor({
  supplierId,
  paymentId,
  paymentAmount,
  paymentCurrency,
  allocatedCount,
  autoOpen = false,
}: {
  supplierId: number;
  paymentId: number;
  paymentAmount: number;
  paymentCurrency: string;
  allocatedCount: number;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  // Arriving from the "Perkiraan" badge on /payables opens the panel straight
  // away, so the user lands on the fix rather than hunting for it. Seeded as
  // initial state rather than set from an effect — the panel is open from the
  // first render, with no flash of the collapsed button.
  const [open, setOpen] = useState(autoOpen);
  const [loading, setLoading] = useState(autoOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<EditorPayload | null>(null);
  /** purchase id → amount as typed, in the PAYMENT's currency. Absent = unallocated. */
  const [alloc, setAlloc] = useState<Record<number, string>>({});

  const isForeign = paymentCurrency !== BASE_CURRENCY;

  /**
   * Load the editor's data whenever the panel is open.
   *
   * The fetch is an effect because it synchronises with an external system (the
   * API), and every state update lands in a promise callback rather than the
   * effect body — a synchronous setState here would cascade renders. `alive`
   * drops the result of a request the user has already closed the panel on.
   */
  useEffect(() => {
    if (!open) return;
    let alive = true;

    fetch(`/api/suppliers/${supplierId}/transactions?allocations=1&paymentId=${paymentId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(String(body.error || t("suppliers.allocLoadFailed")));
        }
        return (await res.json()) as EditorPayload;
      })
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        // Pre-fill with what the payment says today: the user is correcting an
        // existing statement, not starting from a blank one.
        const initial: Record<number, string> = {};
        for (const c of payload.current) initial[c.purchaseId] = String(c.amount);
        setAlloc(initial);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message || t("suppliers.allocLoadFailed"));
        setData(null);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open, supplierId, paymentId, t]);

  function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError("");
  }

  const entries = Object.entries(alloc)
    .map(([id, v]) => ({ purchaseId: Number(id), amount: Number(v) }))
    .filter((a) => Number.isFinite(a.amount) && a.amount > EPSILON);
  const total = entries.reduce((s, a) => s + a.amount, 0);
  const overAllocated = total > paymentAmount + EPSILON;
  const unallocated = Math.max(0, paymentAmount - total);

  async function save(next: { purchaseId: number; amount: number }[]) {
    setSaving(true);
    setError("");

    const res = await fetch(`/api/suppliers/${supplierId}/transactions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: paymentId, allocations: next }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const fieldMsg = body.details?.fieldErrors
        ? Object.values(body.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || body.error || t("suppliers.allocSaveFailed")));
      setSaving(false);
      return;
    }

    toast(
      next.length === 0 ? t("suppliers.allocToastCleared") : t("suppliers.allocToastSaved")
    );
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={handleOpen} className="cursor-pointer">
        <Link2 className="h-4 w-4 mr-1" aria-hidden="true" />
        {allocatedCount > 0 ? t("suppliers.allocEdit") : t("suppliers.allocate")}
      </Button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted p-3 text-left">
      <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t("suppliers.allocPanelTitle")}
      </h4>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("suppliers.allocPanelHintA")}{" "}
        <strong>{t("suppliers.allocPanelHintStrong")}</strong>{" "}
        {t("suppliers.allocPanelHintB")} <strong>{t("suppliers.allocPanelHintStrong2")}</strong>{" "}
        {t("suppliers.allocPanelHintC")}
      </p>

      {error && (
        <div className="mb-3 rounded-md bg-destructive-soft p-2 text-xs text-destructive-strong" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("suppliers.allocLoading")}
        </p>
      ) : !data ? null : data.purchases.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("suppliers.allocNoPurchases")}</p>
      ) : (
        <ul className="space-y-2">
          {data.purchases.map((p) => {
            const checked = alloc[p.id] !== undefined;
            const noRate = p.remainingBase == null;
            const typed = Number(alloc[p.id]);
            // The API's own ceiling for this line, shown before the round trip.
            const overLine =
              checked &&
              p.remainingBase != null &&
              Number.isFinite(typed) &&
              typed * (isForeign && data.payment.rate ? data.payment.rate : 1) >
                p.remainingBase + EPSILON;

            return (
              <li
                key={p.id}
                className="rounded-md border border-border bg-card p-2.5 transition-colors duration-150 hover:border-border"
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
                            // Default to clearing the document in full when the
                            // payment is in IDR; otherwise leave blank rather
                            // than guess a figure across currencies.
                            next[p.id] =
                              !isForeign && p.remainingBase != null
                                ? String(Math.min(p.remainingBase, paymentAmount))
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
                          <> · {t("suppliers.dueShort", { date: formatDateShort(p.dueDate) })}</>
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
                      {noRate ? t("common.rateMissing") : formatCurrency(p.remainingBase!, "IDR")}
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
                      htmlFor={`realloc-${paymentId}-${p.id}`}
                      className="whitespace-nowrap text-xs text-muted-foreground"
                    >
                      {t("suppliers.paidIn", { currency: paymentCurrency })}
                    </label>
                    <TextInput
                      id={`realloc-${paymentId}-${p.id}`}
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

                {overLine && (
                  <p className="mt-1.5 text-xs text-destructive-strong" role="alert">
                    {t("suppliers.allocOverLine")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t("suppliers.paymentAmount")}</span>
          <span className="font-medium text-foreground tabular-nums">
            {formatCurrency(paymentAmount, paymentCurrency)}
          </span>
        </p>
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t("suppliers.totalAllocated")}</span>
          <span
            className={`font-medium tabular-nums ${overAllocated ? "text-destructive-strong" : "text-foreground"}`}
          >
            {formatCurrency(total, paymentCurrency)}
          </span>
        </p>
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t("suppliers.unallocated")}</span>
          <span className="font-medium text-foreground tabular-nums">
            {formatCurrency(unallocated, paymentCurrency)}
          </span>
        </p>
      </div>

      {overAllocated && (
        <p className="mt-2 rounded-md bg-destructive-soft p-2 text-xs text-destructive-strong" role="alert">
          {t("suppliers.allocOverTotal")}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="cursor-pointer"
          disabled={saving || loading || overAllocated}
          onClick={() => save(entries)}
        >
          {saving ? t("common.saving") : t("suppliers.allocSave")}
        </Button>
        {allocatedCount > 0 && (
          /* `window.confirm` diganti ConfirmDialog (issue #6): pesan bawaan
             peramban tidak bisa menjelaskan akibatnya dengan tenang, tidak
             mengikuti bahasa app, dan tidak bisa ditata. */
          <ConfirmDialog
            title={t("suppliers.allocDeleteTitle")}
            message={t("suppliers.allocDeleteMessage")}
            confirmLabel={t("suppliers.allocDelete")}
            onConfirm={() => save([])}
            trigger={
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="cursor-pointer"
                disabled={saving || loading}
              >
                {t("suppliers.allocDelete")}
              </Button>
            }
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={() => setOpen(false)}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
