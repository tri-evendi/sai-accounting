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
 *
 * ── Konversi ke token Ant Design (issue #195, fase C3) ─────────────────────
 * Yang berubah hanya kulitnya: `className` Tailwind → token `theme.useToken()`
 * dan tata letak AntD. Mesin formulir (state + `FormData`), penjaga
 * sebelum-kirim, dan seluruh aritmetika "Ambil" TIDAK disentuh.
 *
 * **Kisinya tetap CSS grid, bukan `Row`/`Col`.** Itu bukan selera: tiga blok
 * bersama yang dijatuhkan ke dalamnya — `InvoiceCustomerField`,
 * `InvoiceTotalsSummary`, `InvoiceFxAdvancedFields` — membentang dengan
 * `gridColumn: "1 / -1"` (lihat `FULL_ROW` di `shared/invoice-fx-fields.tsx`,
 * ditulis di #194 dengan catatan yang menyebut issue ini). Di dalam `Col`
 * flexbox properti itu tidak berarti apa-apa dan ketiganya akan diam-diam
 * berhenti membentang penuh.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Col, Flex, Row, Spin, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import {
  ServerSearchableSelect,
  type PickerOption,
} from "@/components/ui/server-searchable-select";
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
import {
  CostCenterField,
  costCenterPayload,
  useCostCenters,
} from "@/components/shared/cost-center-field";
import { invoiceSubtotal } from "@/lib/validations/invoice";
import { defaultInvoiceTax } from "@/lib/tax";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { resolveSubmitFailure } from "@/lib/form-sections";
import {
  closedPeriodIssue,
  negativeValueIssue,
  type ClosedPeriodRef,
} from "@/lib/form-guards";
import { useT } from "@/lib/i18n/client";
import type { ContractLineOutstanding, PulledInvoiceLine } from "@/lib/document-chain";
import { DeleteOutlined, DownloadOutlined, InfoCircleOutlined, LockOutlined, PlusOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2`, tetap CSS grid (lihat catatan `FULL_ROW` di kepala berkas).
 * `max(280px, (100% − gutter)/2)` menahan jumlah kolomnya di dua, sehingga di
 * 1440px kisinya tidak diam-diam berkembang jadi lima; titik patahnya jatuh
 * tepat di 576px, `sm` AntD.
 */
const FIELD_MIN = 280;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});

/** Lebar dasar kolom angka pada baris barang (`w-24`/`w-28`/`w-20` lama). */
const QTY_COL_BASIS = 96;

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
  initialContract,
  closedPeriods,
}: {
  /** Kontrak yang sudah terpilih lewat `?contractId=` — label + hint-nya dibaca
   *  server supaya pemilih tidak menunggu halaman hasil memuatnya. */
  initialContract: PickerOption | null;
  closedPeriods: ClosedPeriodRef[];
}) {
  const initialContractId = initialContract ? Number(initialContract.value) : null;
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
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
  // issue #98 — dimensi cabang/unit faktur ini. Ikut diwarisi surat jalan yang
  // menyebutnya, sehingga HPP-nya mendarat di cabang yang sama.
  const costCenters = useCostCenters();
  const [costCenterId, setCostCenterId] = useState("");

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
  const periodIssue = closedPeriodIssue(date, closedPeriods, t("invoices.dateGuardLabel"));

  /** Baris yang melebihi sisa kontrak — cermin UI dari `assertWithinContract`. */
  function overContractLines(): string[] {
    if (!outstanding) return [];
    return items.flatMap((item) => {
      const key = item.itemName.trim().toLowerCase().replace(/\s+/g, " ");
      const line = outstanding.lines.find((l) => l.key === key);
      if (!line || item.quantity <= line.remainingKg) return [];
      return [
        t("invoices.overContractLine", {
          item: line.itemName,
          invoiced: formatNumber(item.quantity),
          remaining: formatNumber(line.remainingKg),
        }),
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
      const res = await apiFetch(`/api/contracts/${contractId}/outstanding`);
      if (cancelled) return;
      setLoadingOutstanding(false);
      if (!res.ok) {
        setError(t("invoices.loadOutstandingFailed"));
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
  }, [contractId, adoptCurrency, t]);

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
          ? t("invoices.pullNoneDelivery")
          : t("invoices.pullNoneContract")
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
      t("invoices.pullNote", {
        count: lines.length,
        source:
          source === "delivery"
            ? t("invoices.pullSourceDelivery")
            : t("invoices.pullSourceContract"),
        contractNo: outstanding.contract.contractNo,
      })
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
        { field: `quantity-${i}`, value: item.quantity, label: t("invoices.qtyRowLabel", { n: i + 1 }) },
        { field: `price-${i}`, value: item.price, label: t("invoices.priceRowLabel", { n: i + 1 }) },
      ]),
    ]);
    if (negative) {
      reportFailure(negative.message, negative.field, negative.field === "rate" || negative.field === "taxRate");
      return;
    }
    const over = overContractLines();
    if (over.length > 0) {
      reportFailure(t("invoices.overContractMessage", { lines: over.join("; ") }), null, false);
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
      costCenterId: costCenterPayload(costCenterId),
      ...invoiceFxPayload(fx),
      items,
    };

    const res = await apiFetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const failure = resolveSubmitFailure("faktur", data, t("invoices.saveFailed"));
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
      ? t("common.rupiahIdr")
      : t("invoices.advCurrencyForeign", {
          currency: fx.currency,
          rate: Number(fx.rate) > 0 ? fx.rate : t("common.notEntered"),
        }),
    fx.taxable ? t("invoices.advTaxOn", { rate: Number(fx.taxRate) || 0 }) : t("invoices.advTaxOff"),
    dueDate ? t("invoices.advDueDate", { date: dueDate }) : t("invoices.advNoDueDate"),
  ].join(" · ");

  /** Label mikro di atas satu isian baris barang. */
  const itemLabel = (htmlFor: string, text: string) => (
    <Label
      htmlFor={htmlFor}
      style={{
        marginBottom: token.marginXXS,
        fontSize: token.fontSizeSM,
        color: token.colorTextSecondary,
      }}
    >
      {text}
    </Label>
  );

  /** Isian angka baris barang — rata kanan + `tabular-nums`. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  /** Sel KUANTITAS pada tabel sisa kontrak — id-ID, tanpa topeng rupiah. */
  const qty = (value: number, strong = false) => (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: strong ? token.fontWeightStrong : undefined,
      }}
    >
      {formatNumber(value)}
    </span>
  );

  const outstandingColumns: SaiColumns<ContractLineOutstanding> = [
    {
      key: "itemName",
      dataIndex: "itemName",
      title: t("common.item"),
      align: "left",
      render: (_v, l) => (
        <Flex wrap align="center" gap={token.marginXXS}>
          <span>{l.itemName}</span>
          {l.remainingKg === 0 && (
            <Badge variant="success">{t("invoices.fullyInvoicedBadge")}</Badge>
          )}
        </Flex>
      ),
    },
    {
      key: "contractedKg",
      dataIndex: "contractedKg",
      title: t("contracts.colContractedKg"),
      align: "right",
      render: (_v, l) => qty(l.contractedKg),
    },
    {
      key: "deliveredKg",
      dataIndex: "deliveredKg",
      title: t("contracts.colDeliveredKg"),
      align: "right",
      render: (_v, l) => qty(l.deliveredKg),
    },
    {
      key: "invoicedKg",
      dataIndex: "invoicedKg",
      title: t("contracts.colInvoicedKg"),
      align: "right",
      render: (_v, l) => qty(l.invoicedKg),
    },
    {
      key: "remainingKg",
      dataIndex: "remainingKg",
      title: t("contracts.colRemainingKg"),
      align: "right",
      render: (_v, l) => qty(l.remainingKg, true),
    },
    {
      key: "readyToInvoiceKg",
      dataIndex: "readyToInvoiceKg",
      title: t("invoices.colReadyToInvoice"),
      align: "right",
      render: (_v, l) => qty(l.readyToInvoiceKg),
    },
  ];

  return (
    <>
      {error && (
        /* Galat tingkat formulir sebagai `Alert` AntD — teks `colorText` di atas
           `colorErrorBg` + ikon, jadi maknanya tidak bergantung warna.
           `role="alert"` tetap milik kita; AntD tidak memasangnya. */
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ── Ambil dari kontrak (issue #15) ── */}
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <CardTitle>{t("invoices.pullTitle")}</CardTitle>
            <Typography.Text
              type="secondary"
              style={{ display: "block", marginTop: token.marginXXS }}
            >
              {t("invoices.pullDescriptionA")}{" "}
              <strong>{t("invoices.pullDescriptionStrong")}</strong>{" "}
              {t("invoices.pullDescriptionB")}
            </Typography.Text>
          </CardHeader>
          <CardContent>
            <div style={twoColumnGrid(token.margin)}>
              {/* Mencari ke server (audit: daftar statis `take: 300` membuat
                  kontrak lama tak terpilih). Detail barisnya tetap dari
                  `/api/contracts/[id]/outstanding` begitu terpilih. */}
              <ServerSearchableSelect
                id="contractId"
                label={t("invoices.contractSourceOptional")}
                placeholder={t("invoices.pickContract")}
                searchPlaceholder={t("invoices.searchContract")}
                emptyText={t("invoices.noContractMatch")}
                fetchUrl="/api/contracts?picker=1"
                initialOption={initialContract}
                value={contractId != null ? String(contractId) : null}
                onChange={(v) => chooseContract(v == null ? null : Number(v))}
              />
              <Flex wrap align="flex-end" gap={token.marginXS}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!outstanding || outstanding.pull.contract.length === 0}
                  onClick={() => pull("contract")}
                >
                  <DownloadOutlined aria-hidden /> {t("invoices.pullContractRemainder")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!outstanding || outstanding.pull.delivery.length === 0}
                  onClick={() => pull("delivery")}
                >
                  <DownloadOutlined aria-hidden /> {t("invoices.pullShipped")}
                </Button>
              </Flex>
            </div>

            {loadingOutstanding && (
              /* `Spin` AntD menggantikan `Loader2 animate-spin`: ia menghormati
                 `prefers-reduced-motion` lewat token gerak AntD, dan membawa
                 `aria-live` sendiri. */
              <Flex align="center" gap={token.marginXS} style={{ marginTop: token.margin }}>
                <Spin size="small" />
                <Typography.Text type="secondary">
                  {t("invoices.loadingOutstanding")}
                </Typography.Text>
              </Flex>
            )}

            {outstanding && !loadingOutstanding && (
              <div
                style={{
                  marginTop: token.margin,
                  borderRadius: token.borderRadius,
                  border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  overflow: "hidden",
                }}
              >
                <StaticTable
                  columns={outstandingColumns}
                  rows={outstanding.lines}
                  rowKey={(l) => l.key}
                  empty={
                    <Typography.Paragraph
                      type="secondary"
                      style={{ margin: 0, padding: token.paddingSM, textAlign: "center" }}
                    >
                      {t("invoices.noContractLines")}
                    </Typography.Paragraph>
                  }
                />
              </div>
            )}

            {pullNote && (
              <Flex
                align="flex-start"
                gap={token.marginXXS}
                style={{ marginTop: token.marginSM }}
              >
                <InfoCircleOutlined aria-hidden style={{ fontSize: token.fontSize, flexShrink: 0, marginTop: 2 }} />
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {pullNote}
                </Typography.Text>
              </Flex>
            )}
          </CardContent>
        </Card>

        <Card style={{ marginBottom: token.marginLG }} data-tour="faktur-identitas">
          <CardHeader>
            <CardTitle>{t("invoices.identityTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* CSS grid, bukan `Row`/`Col`: `InvoiceCustomerField` dan
                `InvoiceTotalsSummary` membentang dengan `gridColumn: 1 / -1`. */}
            <div style={twoColumnGrid(token.margin)}>
              <Input id="invoiceNo" name="invoiceNo" label={t("invoices.invoiceNo")} required />
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
                  <Typography.Paragraph
                    role="alert"
                    style={{
                      margin: 0,
                      marginTop: token.marginXXS,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: token.marginXXS,
                      fontSize: token.fontSizeSM,
                      color: token.colorError,
                    }}
                  >
                    <LockOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{periodIssue}</span>
                  </Typography.Paragraph>
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

        <Card style={{ marginBottom: token.marginLG }} data-tour="faktur-barang">
          <CardHeader>
            <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
              <CardTitle>
                <TermTooltip term="faktur">{t("invoices.goodsSoldTitle")}</TermTooltip>
              </CardTitle>
              <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                <PlusOutlined aria-hidden /> {t("common.addItem")}
              </Button>
            </Flex>
          </CardHeader>
          <CardContent>
            <Flex vertical gap={token.margin}>
              {items.map((item, i) => {
                // Remainder hint for a line drawn from the contract, so an
                // over-invoice is visible before the server refuses it.
                const line = outstanding?.lines.find(
                  (l) => l.key === item.itemName.trim().toLowerCase().replace(/\s+/g, " ")
                );
                const over = line != null && item.quantity > line.remainingKg;
                return (
                  <div
                    key={i}
                    style={{
                      padding: token.paddingSM,
                      borderRadius: token.borderRadius,
                      border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    {/* `Row` yang membungkus, bukan satu baris flex kaku: di
                        375px kelima kendali dulu saling menghimpit. */}
                    <Row gutter={[token.marginSM, token.marginSM]} align="bottom">
                      <Col xs={24} md={8} style={{ minWidth: 0 }}>
                        {itemLabel(`itemName-${i}`, t("common.itemName"))}
                        <TextInput
                          id={`itemName-${i}`}
                          value={item.itemName}
                          onChange={(e) => updateItem(i, "itemName", e.target.value)}
                          required
                        />
                      </Col>
                      <Col flex={`1 1 ${QTY_COL_BASIS}px`}>
                        {itemLabel(`quantity-${i}`, t("common.quantity"))}
                        {/* KUANTITAS (`Decimal(15,3)`), bukan uang — desimalnya
                            utuh dan tanpa "Rp". */}
                        <TextInput
                          id={`quantity-${i}`}
                          type="number"
                          min={0}
                          step="0.01"
                          style={numberStyle}
                          value={item.quantity}
                          onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                        />
                      </Col>
                      <Col flex={`1 1 ${QTY_COL_BASIS}px`}>
                        {itemLabel(`price-${i}`, t("common.price"))}
                        <TextInput
                          id={`price-${i}`}
                          type="number"
                          min={0}
                          step="0.01"
                          style={numberStyle}
                          value={item.price}
                          onChange={(e) => updateItem(i, "price", Number(e.target.value))}
                        />
                      </Col>
                      <Col flex={`1 1 ${QTY_COL_BASIS}px`}>
                        {itemLabel(`unit-${i}`, t("common.unit"))}
                        <TextInput
                          id={`unit-${i}`}
                          value={item.unit}
                          onChange={(e) => updateItem(i, "unit", e.target.value)}
                        />
                      </Col>
                      <Col flex="none">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(i)}
                          style={{ color: token.colorError }}
                          disabled={items.length === 1}
                          aria-label={t("common.removeItemRow", { n: i + 1 })}
                        >
                          <DeleteOutlined aria-hidden />
                        </Button>
                      </Col>
                    </Row>
                    <Flex
                      wrap
                      align="center"
                      justify="space-between"
                      gap={token.marginXS}
                      style={{ marginTop: token.marginXS, fontSize: token.fontSizeSM }}
                    >
                      {/* Kelebihan faktur ditandai WARNA + KATA: kalimatnya
                          sendiri berbunyi "melebihi sisa", jadi warnanya bukan
                          penanda tunggal. */}
                      <span
                        style={{
                          color: over ? token.colorError : token.colorTextSecondary,
                          fontWeight: over ? token.fontWeightStrong : undefined,
                        }}
                      >
                        {line
                          ? over
                            ? t("invoices.lineRemainingOver", { kg: formatNumber(line.remainingKg) })
                            : t("invoices.lineRemaining", { kg: formatNumber(line.remainingKg) })
                          : contractId != null && item.itemName.trim()
                            ? t("invoices.lineOutsideContract")
                            : ""}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        = {formatCurrency(item.quantity * item.price, fx.currency)}
                      </span>
                    </Flex>
                  </div>
                );
              })}
            </Flex>
          </CardContent>
        </Card>

        {/* ── Detail lengkap (issue #4) — tertutup secara default ── */}
        <div style={{ marginBottom: token.marginLG }}>
          <DisclosureSection
            description={t("invoices.advancedDescription")}
            summary={advancedSummary}
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            invalid={advancedInvalid}
          >
            {/* Tetap CSS grid: `InvoiceFxAdvancedFields` menaruh kotak PPN & PEB
                dengan `gridColumn: 1 / -1`, dan `CostCenterField` di bawahnya
                membentang penuh lewat gaya yang sama. */}
            <div style={twoColumnGrid(token.margin)}>
              <DueDateField value={dueDate} onChange={setDueDate} />
              {/* Status lewat peta label bahasa tugas — nilai enum DB tidak
                  pernah tampil mentah. */}
              <Select
                id="status"
                name="status"
                label={t("common.status")}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={[
                  { value: "pending", label: t("status.contract.pending") },
                  { value: "signed", label: t("status.contract.signed") },
                  { value: "canceled", label: t("status.contract.canceled") },
                ]}
              />
              <InvoiceFxAdvancedFields
                customers={customers}
                value={fx}
                onChange={(patch) => setFx((prev) => ({ ...prev, ...patch }))}
              />
              <div style={{ gridColumn: "1 / -1" }}>
                <CostCenterField
                  costCenters={costCenters}
                  value={costCenterId}
                  onChange={setCostCenterId}
                />
              </div>
            </div>
          </DisclosureSection>
        </div>

        <Flex wrap gap={token.marginSM} data-tour="faktur-simpan">
          <Button type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("invoices.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </Flex>
      </form>
    </>
  );
}
