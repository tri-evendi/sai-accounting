"use client";

/**
 * Catat pembelian / pembayaran pemasok (issue #37).
 * Dikonversi ke token Ant Design pada issue #196.
 *
 * Keduanya auto-posting:
 *   purchase → D: Persediaan (+ D: PPN Masukan) / K: Hutang Usaha
 *   payment  → D: Hutang Usaha / K: Kas & Bank
 *
 * Kulitnya saja yang berubah. Dua hal yang sengaja DIPERTAHANKAN karena
 * keduanya membawa makna akuntansi, bukan gaya:
 *
 *  • **Arah uang tetap ikon + kata + warna.** "Menambah hutang" (panah naik,
 *    merah) dan "Mengurangi hutang" (panah turun, hijau) memakai varian `…Text`
 *    token, yang lolos ambang 4,5:1 untuk teks kecil — bukan `colorError`/
 *    `colorSuccess` penuh, yang di ukuran itu gagal.
 *  • **Nilai tanpa kurs ditulis dengan KATA.** Baris pembelian yang tak punya
 *    nilai IDR tidak pernah dirender sebagai Rp 0.
 */

import { useCallback, useState } from "react";
import { Alert, Col, Flex, Row, theme } from "antd";
import { DueDateField } from "@/components/shared/due-date-field";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, TextInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  CostCenterField,
  costCenterPayload,
  useCostCenters,
} from "@/components/shared/cost-center-field";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { ArrowDownOutlined, ArrowUpOutlined, LinkOutlined, PlusOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";
import { CASH_TYPES, CASH_TYPE_KEYS, type CashType } from "@/lib/constants";

const BASE_CURRENCY = "IDR";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const EPSILON = 0.005;

/** Lebar isian nominal alokasi (`w-40` lama = 10rem). */
const AMOUNT_INPUT_WIDTH = 160;
/** Lebar maksimum catatan pembelian sebelum dipotong (`max-w-64` lama). */
const NOTE_MAX_WIDTH = 256;

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

export function SupplierTransactionForm({ supplierId }: { supplierId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState<"purchase" | "payment">("purchase");
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  /* Kas/bank yang dipakai (migrasi 0059). Kosong = tidak disebut, dan itu
     memposting lewat akun kas bawaan persis seperti sebelumnya. Hanya berarti
     pada PEMBAYARAN: sebuah pembelian melahirkan utang, ia tidak mengeluarkan
     uang dari mana pun. */
  const [cashType, setCashType] = useState<CashType | "">("");
  // Controlled so the allocation prefill can cap itself at the payment amount
  // (the same `Math.min` the allocation editor applies).
  const [amount, setAmount] = useState("");

  // Allocation state (issue #37). `alloc` maps purchase id → amount typed by the
  // user, in the PAYMENT's currency. Absent key = not allocated.
  const [purchases, setPurchases] = useState<OutstandingPurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  // A failed outstanding-purchases fetch must not masquerade as "nothing
  // outstanding": the two states render differently below.
  const [purchasesError, setPurchasesError] = useState(false);
  const [alloc, setAlloc] = useState<Record<number, string>>({});
  // issue #98 — cabang/unit yang menanggung pembelian (atau membayarnya). Retur
  // pembeliannya mewarisi dimensi ini.
  const costCenters = useCostCenters();
  const [costCenterId, setCostCenterId] = useState("");

  const isForeign = currency !== BASE_CURRENCY;
  const isPurchase = type === "purchase";

  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    setPurchasesError(false);
    try {
      const res = await apiFetch(`/api/suppliers/${supplierId}/transactions?outstanding=1`);
      if (!res.ok) throw new Error();
      setPurchases(await res.json());
    } catch {
      // A failed lookup must not block recording the payment — allocation is
      // optional, and an unallocated payment is still a correct payment. But it
      // must SAY it failed rather than render as "nothing outstanding", so the
      // rows are withheld and an error message shown instead.
      setPurchases([]);
      setPurchasesError(true);
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
      // Dihilangkan sama sekali pada pembelian — skemanya menolaknya di sana.
      cashType: !isPurchase && cashType ? cashType : null,
    };

    const res = await apiFetch(`/api/suppliers/${supplierId}/transactions`, {
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
    setAmount("");
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <PlusOutlined aria-hidden="true" /> {t("suppliers.addTransaction")}
      </Button>
    );
  }

  const half = { xs: 24, sm: 12 } as const;
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  /** Keterangan kecil di bawah sebuah isian. */
  const hint = (text: string) => (
    <p style={{ margin: 0, marginTop: token.marginXXS, color: token.colorTextSecondary }}>
      <small>{text}</small>
    </p>
  );

  return (
    <div
      style={{
        marginTop: token.margin,
        borderRadius: token.borderRadiusLG,
        border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
        background: token.colorFillQuaternary,
        padding: token.padding,
      }}
    >
      <h4 style={{ margin: 0, marginBottom: token.marginSM }}>{t("suppliers.txFormTitle")}</h4>

      {error && (
        <div role="alert" style={{ marginBottom: token.marginSM }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Row gutter={[token.marginSM, token.marginSM]}>
          <Col {...half}>
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
            {/* Arah uang: ikon + kata + warna, tak pernah warna saja. */}
            <p
              style={{
                margin: 0,
                marginTop: token.marginXXS,
                display: "flex",
                alignItems: "center",
                gap: token.marginXXS,
                color: isPurchase ? token.colorErrorText : token.colorSuccessText,
              }}
            >
              {isPurchase ? (
                <ArrowUpOutlined aria-hidden="true" />
              ) : (
                <ArrowDownOutlined aria-hidden="true" />
              )}
              <small>
                {isPurchase ? t("suppliers.txEffectPurchase") : t("suppliers.txEffectPayment")}
              </small>
            </p>
          </Col>

          <Col {...half}>
            <Input
              id="trx-date"
              name="date"
              type="date"
              label={t("common.date")}
              defaultValue={new Date().toISOString().split("T")[0]}
              required
            />
          </Col>

          {isPurchase && (
            <Col {...half}>
              <DueDateField />
            </Col>
          )}

          <Col {...half}>
            <Input
              id="trx-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              style={numberStyle}
              label={isPurchase ? t("suppliers.txAmountPurchase") : t("suppliers.txAmountPayment")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Col>

          <Col {...half}>
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
          </Col>

          {isForeign && (
            <Col {...half}>
              <Input
                id="trx-rate"
                name="rate"
                type="number"
                step="0.000001"
                min="0"
                style={numberStyle}
                label={t("suppliers.txRateLabel", { currency })}
                required
              />
              {hint(t("common.rateRequiredHint"))}
            </Col>
          )}

          {!isPurchase && (
            <Col {...half}>
              <Select
                id="trx-cash-type"
                name="cashType"
                label={t("payments.cashAccount")}
                placeholder={t("payments.cashAccountUnset")}
                value={cashType}
                onChange={(e) => setCashType(e.target.value as CashType | "")}
                /* Kas fisik hanya untuk rupiah — slot pemetaannya tidak punya
                   baris per mata uang, jadi valas di situ mendarat di akun kas
                   rupiah. Skemanya menolaknya; daftar ini tidak menawarkannya. */
                options={(isForeign ? (["bank"] as const) : CASH_TYPES).map((v) => ({
                  value: v,
                  label: t(CASH_TYPE_KEYS[v]),
                }))}
              />
              {hint(
                isForeign
                  ? t("payments.cashAccountForeignHint", { currency })
                  : t("payments.cashAccountHint")
              )}
            </Col>
          )}

          {isPurchase && (
            <Col {...half}>
              <Input
                id="trx-tax"
                name="taxAmount"
                type="number"
                step="0.01"
                min="0"
                style={numberStyle}
                label={t("suppliers.txInputVat")}
                defaultValue="0"
              />
              {hint(t("suppliers.txInputVatHint"))}
            </Col>
          )}

          <Col span={24}>
            <CostCenterField
              costCenters={costCenters}
              value={costCenterId}
              onChange={setCostCenterId}
            />
          </Col>

          {!isPurchase && (
            <Col span={24}>
              <fieldset
                style={{
                  borderRadius: token.borderRadiusLG,
                  border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  background: token.colorBgContainer,
                  padding: token.paddingSM,
                }}
              >
                <legend
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: token.marginXXS,
                    paddingInline: token.paddingXXS,
                    fontWeight: token.fontWeightStrong,
                  }}
                >
                  <LinkOutlined aria-hidden="true" style={{ color: token.colorTextSecondary }} />
                  {t("suppliers.txAllocLegend")}
                </legend>

                <p
                  style={{
                    margin: 0,
                    marginBottom: token.marginSM,
                    color: token.colorTextSecondary,
                  }}
                >
                  <small>
                    {t("suppliers.txAllocHintA")} <strong>{t("suppliers.txAllocHintStrong")}</strong>{" "}
                    {t("suppliers.txAllocHintB")}
                  </small>
                </p>

                {loadingPurchases ? (
                  <p style={{ margin: 0, color: token.colorTextSecondary }}>
                    <small>{t("suppliers.allocLoading")}</small>
                  </p>
                ) : purchasesError ? (
                  <div role="alert">
                    <Alert type="error" showIcon message={t("suppliers.allocLoadFailed")} />
                  </div>
                ) : purchases.length === 0 ? (
                  <p style={{ margin: 0, color: token.colorTextSecondary }}>
                    <small>{t("suppliers.txNoOutstanding")}</small>
                  </p>
                ) : (
                  <Flex
                    vertical
                    gap={token.marginXS}
                    component="ul"
                    style={{ margin: 0, padding: 0, listStyle: "none" }}
                  >
                    {purchases.map((p) => {
                      const checked = alloc[p.id] !== undefined;
                      const noRate = p.remainingBase == null;
                      return (
                        <li
                          key={p.id}
                          style={{
                            borderRadius: token.borderRadius,
                            border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                            padding: token.paddingXS,
                          }}
                        >
                          <Flex
                            wrap
                            align="flex-start"
                            justify="space-between"
                            gap={token.marginXS}
                          >
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
                                      // Default to clearing the document in full
                                      // when the payment is in IDR — capped at the
                                      // payment amount, like the allocation editor;
                                      // otherwise leave blank rather than guess
                                      // across currencies.
                                      const paymentAmount = Number(amount);
                                      next[p.id] =
                                        !isForeign && p.remainingBase != null
                                          ? String(
                                              paymentAmount > 0
                                                ? Math.min(p.remainingBase, paymentAmount)
                                                : p.remainingBase
                                            )
                                          : "";
                                    } else delete next[p.id];
                                    return next;
                                  })
                                }
                              />
                              <span>
                                <span style={{ fontWeight: token.fontWeightStrong }}>
                                  TRX-{p.id}
                                </span>
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
                                      <>
                                        {" · "}
                                        {t("suppliers.dueShort", {
                                          date: formatDateShort(p.dueDate),
                                        })}
                                      </>
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
                                {noRate
                                  ? t("common.rateMissing")
                                  : formatCurrency(p.remainingBase!, "IDR")}
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
                              <Label htmlFor={`alloc-${p.id}`}>
                                <small
                                  style={{
                                    whiteSpace: "nowrap",
                                    color: token.colorTextSecondary,
                                  }}
                                >
                                  {t("suppliers.paidIn", { currency })}
                                </small>
                              </Label>
                              <TextInput
                                id={`alloc-${p.id}`}
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
                        </li>
                      );
                    })}
                  </Flex>
                )}

                {allocEntries.length > 0 && (
                  <p
                    style={{
                      margin: 0,
                      marginTop: token.marginSM,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: token.marginXS,
                      borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                      paddingTop: token.paddingXS,
                    }}
                  >
                    <span style={{ color: token.colorTextSecondary }}>
                      <small>{t("suppliers.totalAllocated")}</small>
                    </span>
                    <span
                      style={{
                        fontWeight: token.fontWeightStrong,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <small>{formatCurrency(allocTotal, currency)}</small>
                    </span>
                  </p>
                )}
              </fieldset>
            </Col>
          )}

          <Col span={24}>
            <Input id="trx-note" name="note" label={t("common.notesOptional")} />
          </Col>

          <Col span={24}>
            <Flex wrap gap={token.marginXS}>
              <Button variant="primary" type="submit" size="sm" disabled={loading}>
                {loading ? t("common.saving") : t("suppliers.txSubmit")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
            </Flex>
          </Col>
        </Row>
      </form>
    </div>
  );
}
