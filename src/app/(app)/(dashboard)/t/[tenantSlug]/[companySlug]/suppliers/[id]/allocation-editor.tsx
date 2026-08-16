"use client";

/**
 * Re-allocate an existing supplier payment (issue #38).
 * Dikonversi ke token Ant Design pada issue #196.
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
 *
 * ── Catatan konversi #196 ───────────────────────────────────────────────────
 * `Loader2 animate-spin` diganti `Spin` AntD (menghormati
 * `prefers-reduced-motion` lewat komponennya), dan ketiga pesan galat menjadi
 * `Alert`. Ringkasan tiga baris di bawah (dibayar / dialokasikan / belum
 * dialokasikan) tetap `<p>` berpasangan, bukan tabel: ia tiga PERNYATAAN
 * tentang satu pembayaran, bukan tiga baris data yang sebanding.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, Spin, theme } from "antd";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TextInput } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { LinkOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";

const BASE_CURRENCY = "IDR";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const EPSILON = 0.005;

/** Lebar isian nominal alokasi (`w-40` lama = 10rem). */
const AMOUNT_INPUT_WIDTH = 160;
/** Lebar maksimum catatan pembelian sebelum dipotong (`max-w-64` lama). */
const NOTE_MAX_WIDTH = 256;

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
  const { token } = theme.useToken();
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

    apiFetch(`/api/suppliers/${supplierId}/transactions?allocations=1&paymentId=${paymentId}`)
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

    const res = await apiFetch(`/api/suppliers/${supplierId}/transactions`, {
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
      <Button variant="ghost" size="sm" onClick={handleOpen}>
        <LinkOutlined aria-hidden="true" />
        {allocatedCount > 0 ? t("suppliers.allocEdit") : t("suppliers.allocate")}
      </Button>
    );
  }

  /** Satu baris ringkasan: istilah di kiri, nominal di kanan. */
  const totalsLine = (label: string, value: string, emphasised = false) => (
    <p style={{ margin: 0, display: "flex", justifyContent: "space-between", gap: token.marginXS }}>
      <span style={{ color: token.colorTextSecondary }}>
        <small>{label}</small>
      </span>
      <span
        style={{
          fontWeight: token.fontWeightStrong,
          fontVariantNumeric: "tabular-nums",
          color: emphasised ? token.colorErrorText : token.colorText,
        }}
      >
        <small>{value}</small>
      </span>
    </p>
  );

  return (
    <div
      style={{
        marginTop: token.marginXS,
        borderRadius: token.borderRadiusLG,
        border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
        background: token.colorFillQuaternary,
        padding: token.paddingSM,
        textAlign: "left",
      }}
    >
      <h4
        style={{
          margin: 0,
          marginBottom: token.marginXXS,
          display: "flex",
          alignItems: "center",
          gap: token.marginXXS,
        }}
      >
        <LinkOutlined aria-hidden="true" style={{ color: token.colorTextSecondary }} />
        {t("suppliers.allocPanelTitle")}
      </h4>
      <p style={{ margin: 0, marginBottom: token.marginSM, color: token.colorTextSecondary }}>
        <small>
          {t("suppliers.allocPanelHintA")}{" "}
          <strong>{t("suppliers.allocPanelHintStrong")}</strong>{" "}
          {t("suppliers.allocPanelHintB")} <strong>{t("suppliers.allocPanelHintStrong2")}</strong>{" "}
          {t("suppliers.allocPanelHintC")}
        </small>
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: token.marginSM }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      {loading ? (
        <Flex align="center" gap={token.marginXXS} style={{ color: token.colorTextSecondary }}>
          <Spin size="small" />
          <small>{t("suppliers.allocLoading")}</small>
        </Flex>
      ) : !data ? null : data.purchases.length === 0 ? (
        <p style={{ margin: 0, color: token.colorTextSecondary }}>
          <small>{t("suppliers.allocNoPurchases")}</small>
        </p>
      ) : (
        <Flex
          vertical
          gap={token.marginXS}
          component="ul"
          style={{ margin: 0, padding: 0, listStyle: "none" }}
        >
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
                style={{
                  borderRadius: token.borderRadius,
                  border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  background: token.colorBgContainer,
                  padding: token.paddingXS,
                }}
              >
                <Flex wrap align="flex-start" justify="space-between" gap={token.marginXS}>
                  <label
                    style={{
                      display: "flex",
                      cursor: "pointer",
                      alignItems: "flex-start",
                      gap: token.marginXS,
                    }}
                  >
                    <Checkbox
                      style={{ marginTop: token.marginXXS }}
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
                      <span style={{ fontWeight: token.fontWeightStrong }}>TRX-{p.id}</span>
                      <span
                        style={{
                          display: "block",
                          color: token.colorTextSecondary,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <small>
                          {formatDateShort(p.date)}
                          {p.dueDate && (
                            <> · {t("suppliers.dueShort", { date: formatDateShort(p.dueDate) })}</>
                          )}
                        </small>
                      </span>
                      {p.note && (
                        <span
                          style={{
                            display: "block",
                            maxWidth: NOTE_MAX_WIDTH,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: token.colorTextSecondary,
                          }}
                          title={p.note}
                        >
                          <small>{p.note}</small>
                        </span>
                      )}
                    </span>
                  </label>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ display: "block", color: token.colorTextSecondary }}>
                      <small>{t("suppliers.outstandingDebt")}</small>
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontWeight: token.fontWeightStrong,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {/* Tanpa kurs, nilainya BELUM DIKETAHUI — ditulis dengan
                          kata, tak pernah Rp 0. */}
                      {noRate ? t("common.rateMissing") : formatCurrency(p.remainingBase!, "IDR")}
                    </span>
                    <span
                      style={{
                        display: "block",
                        color: token.colorTextSecondary,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <small>
                        {t("suppliers.lineValue", {
                          amount: formatCurrency(p.amount, p.currency),
                        })}
                      </small>
                    </span>
                  </div>
                </Flex>

                {noRate && (
                  <p
                    style={{
                      margin: 0,
                      marginTop: token.marginXXS,
                      color: token.colorWarningText,
                    }}
                  >
                    <small>{t("suppliers.noRateLine")}</small>
                  </p>
                )}

                {checked && (
                  <Flex
                    align="center"
                    gap={token.marginXS}
                    style={{ marginTop: token.marginXS }}
                  >
                    <Label htmlFor={`realloc-${paymentId}-${p.id}`}>
                      <small style={{ whiteSpace: "nowrap", color: token.colorTextSecondary }}>
                        {t("suppliers.paidIn", { currency: paymentCurrency })}
                      </small>
                    </Label>
                    <TextInput
                      id={`realloc-${paymentId}-${p.id}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={alloc[p.id]}
                      onChange={(e) =>
                        setAlloc((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      style={{
                        width: AMOUNT_INPUT_WIDTH,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    />
                  </Flex>
                )}

                {overLine && (
                  <p
                    role="alert"
                    style={{
                      margin: 0,
                      marginTop: token.marginXXS,
                      color: token.colorErrorText,
                    }}
                  >
                    <small>{t("suppliers.allocOverLine")}</small>
                  </p>
                )}
              </li>
            );
          })}
        </Flex>
      )}

      <Flex
        vertical
        gap={token.marginXXS}
        style={{
          marginTop: token.marginSM,
          borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
          paddingTop: token.paddingXS,
        }}
      >
        {totalsLine(
          t("suppliers.paymentAmount"),
          formatCurrency(paymentAmount, paymentCurrency)
        )}
        {totalsLine(
          t("suppliers.totalAllocated"),
          formatCurrency(total, paymentCurrency),
          overAllocated
        )}
        {totalsLine(
          t("suppliers.unallocated"),
          formatCurrency(unallocated, paymentCurrency)
        )}
      </Flex>

      {overAllocated && (
        <div role="alert" style={{ marginTop: token.marginXS }}>
          <Alert type="error" showIcon message={t("suppliers.allocOverTotal")} />
        </div>
      )}

      <Flex wrap gap={token.marginXS} style={{ marginTop: token.marginSM }}>
        <Button variant="primary"
          type="button"
          size="sm"
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
              <Button type="button" variant="danger" size="sm" disabled={saving || loading}>
                {t("suppliers.allocDelete")}
              </Button>
            }
          />
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </Flex>
    </div>
  );
}
