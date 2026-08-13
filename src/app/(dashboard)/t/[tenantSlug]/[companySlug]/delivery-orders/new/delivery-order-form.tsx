"use client";

/**
 * Buat Surat Jalan — dikonversi ke token Ant Design pada issue #195 (fase C3).
 *
 * Kulitnya saja yang berubah. Penjaga sebelum-kirim (periode tertutup, nilai
 * negatif, kekurangan stok) dan konfirmasi pengeluaran besar tidak disentuh —
 * pasangan servernya (`assertStockAvailable`) tetap penjaga terakhir.
 *
 * Semua angka di layar ini KUANTITAS (`Decimal(15,3)`): karung × kg/karung.
 * Semuanya lewat `formatNumber` id-ID dengan `tabular-nums`, tidak satu pun
 * lewat topeng rupiah.
 */

import { useState } from "react";
import { Alert, Col, Flex, Row, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Link } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ContainerOutlined, DeleteOutlined, LockOutlined, PlusOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2`. `max(280px, (100% − gutter)/2)` menahan jumlah kolomnya di
 * dua; titik patahnya jatuh tepat di 576px, `sm` AntD.
 */
const FIELD_MIN = 280;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});

/** Lebar dasar kolom angka pada baris barang (`w-24`/`w-28` lama). */
const QTY_COL_BASIS = 112;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

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
  const { token } = theme.useToken();
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

  /** Label mikro di atas satu isian angka. */
  const microLabel = (htmlFor: string, text: string) => (
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

  /** Isian angka — rata kanan + `tabular-nums`. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        /* Galat tingkat formulir sebagai `Alert` AntD — ikon + teks
           `colorText` di atas `colorErrorBg`. `role="alert"` tetap milik kita. */
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>
            <TermTooltip term="surat_jalan">{t("deliveryOrders.detailsTitle")}</TermTooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div style={twoColumnGrid(token.margin)}>
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
                /* Periode terkunci: ikon gembok + kalimat; warnanya penanda
                   kedua, bukan satu-satunya. */
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
            <div>
              <SearchableSelect
                id="consigneeId"
                label={t("deliveryOrders.colConsignee")}
                placeholder={t("deliveryOrders.pickConsignee")}
                emptyText={t("deliveryOrders.noConsigneeMatch")}
                options={consigneeOptions}
                value={consigneeId != null ? String(consigneeId) : null}
                onChange={(v) => setConsigneeId(v == null ? null : Number(v))}
              />
              <Typography.Text
                type="secondary"
                style={{
                  display: "block",
                  marginTop: token.marginXXS,
                  fontSize: token.fontSizeSM,
                }}
              >
                {t("deliveryOrders.addConsigneePrompt")}{" "}
                <Link
                  href="/consignees/new"
                  target="_blank"
                  style={{ color: token.colorLink }}
                >
                  {t("deliveryOrders.addConsigneeLink")}
                </Link>
                {t("common.fullStop")}
              </Typography.Text>
            </div>
            <SearchableSelect
              id="contractId"
              label={t("invoices.contractSourceOptional")}
              placeholder={t("invoices.pickContract")}
              emptyText={t("invoices.noContractMatch")}
              options={contractOptions}
              value={contractId != null ? String(contractId) : null}
              onChange={(v) => onContractChange(v == null ? null : Number(v))}
            />
            <SearchableSelect
              id="invoiceId"
              label={t("deliveryOrders.invoiceSourceOptional")}
              placeholder={t("deliveryOrders.pickInvoice")}
              emptyText={t("deliveryOrders.noInvoiceMatch")}
              options={invoiceOptions}
              value={invoiceId != null ? String(invoiceId) : null}
              onChange={(v) => setInvoiceId(v == null ? null : Number(v))}
            />
            <Input id="vehicleNo" name="vehicleNo" label={t("deliveryOrders.vehicleNoOptional")} />
            <Input id="containerNo" name="containerNo" label={t("deliveryOrders.containerNoOptional")} />
            <div style={{ gridColumn: "1 / -1" }}>
              <Input id="notes" name="notes" label={t("common.notesOptional")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
            <CardTitle level={2}>{t("deliveryOrders.goodsTitle")}</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              <PlusOutlined aria-hidden="true" /> {t("common.addItem")}
            </Button>
          </Flex>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState
              flat
              icon={<ContainerOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("common.emptyStockTitle")}
              description={t("deliveryOrders.emptyStockDescription")}
              actionLabel={canUpdateStock ? t("common.addRemoveStock") : undefined}
              actionHref={canUpdateStock ? "/inventory/update" : undefined}
            />
          ) : (
          <Flex vertical gap={token.margin}>
            {lines.map((line, i) => {
              const item = line.itemId != null ? itemById.get(line.itemId) : null;
              const requested = line.itemId != null ? requestedByItem.get(line.itemId) ?? 0 : 0;
              const over = item != null && requested > item.currentStock;
              return (
                <div
                  key={i}
                  style={{
                    padding: token.paddingSM,
                    borderRadius: token.borderRadius,
                    border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  {/* `Row` yang membungkus: di 375px pemilih barang dan kedua
                      isian angka dulu saling menghimpit dalam satu baris flex. */}
                  <Row gutter={[token.marginSM, token.marginSM]} align="bottom">
                    <Col xs={24} md={12} style={{ minWidth: 0 }}>
                      <SearchableSelect
                        label={t("common.item")}
                        placeholder={t("common.pickItem")}
                        emptyText={t("common.noItemMatch")}
                        options={itemOptions}
                        value={line.itemId != null ? String(line.itemId) : null}
                        onChange={(v) => updateLine(i, { itemId: v == null ? null : Number(v) })}
                      />
                    </Col>
                    <Col flex={`1 1 ${QTY_COL_BASIS}px`}>
                      {microLabel(`bags-${i}`, t("common.bags"))}
                      <TextInput
                        id={`bags-${i}`}
                        type="number"
                        min={0}
                        style={numberStyle}
                        value={line.bags}
                        onChange={(e) => updateLine(i, { bags: Number(e.target.value) })}
                      />
                    </Col>
                    <Col flex={`1 1 ${QTY_COL_BASIS}px`}>
                      {microLabel(`kgPerBag-${i}`, t("common.kgPerBag"))}
                      {/* KUANTITAS (`Decimal(15,3)`) — desimalnya utuh. */}
                      <TextInput
                        id={`kgPerBag-${i}`}
                        type="number"
                        min={0}
                        step="0.01"
                        style={numberStyle}
                        value={line.kgPerBag}
                        onChange={(e) => updateLine(i, { kgPerBag: Number(e.target.value) })}
                      />
                    </Col>
                    <Col flex="none">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(i)}
                        style={{ color: token.colorError }}
                        disabled={lines.length === 1}
                        aria-label={t("common.removeItemRow", { n: i + 1 })}
                      >
                        <DeleteOutlined aria-hidden="true" />
                      </Button>
                    </Col>
                  </Row>
                  <Flex
                    wrap
                    justify="space-between"
                    gap={token.marginXS}
                    style={{ marginTop: token.marginXS, fontSize: token.fontSizeSM }}
                  >
                    {/* Kalimatnya yang membawa makna ("melebihi stok");
                        warnanya penanda kedua. */}
                    <span
                      style={{
                        color: over ? token.colorMoneyNegative : token.colorTextSecondary,
                        fontWeight: over ? token.fontWeightStrong : undefined,
                      }}
                    >
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
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      = {formatNumber(lineKg(line))} kg
                    </span>
                  </Flex>
                </div>
              );
            })}
          </Flex>
          )}
        </CardContent>
      </Card>

      <Card style={{ marginBottom: token.marginLG }}>
        <CardContent style={{ paddingBlock: token.paddingSM }}>
          <dl style={{ margin: 0 }}>
            <Flex align="center" justify="space-between" gap={token.marginSM}>
              <dt style={{ color: token.colorTextSecondary }}>
                {t("deliveryOrders.totalBags")}
              </dt>
              <dd
                style={{
                  margin: 0,
                  fontWeight: token.fontWeightStrong,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatNumber(totalBags)}
              </dd>
            </Flex>
            <Flex
              align="center"
              justify="space-between"
              gap={token.marginSM}
              style={{ marginTop: token.marginXXS }}
            >
              <dt style={{ color: token.colorTextSecondary, fontWeight: token.fontWeightStrong }}>
                {t("deliveryOrders.totalOutKg")}
              </dt>
              <dd
                style={{
                  margin: 0,
                  fontSize: token.fontSizeLG,
                  fontWeight: token.fontWeightStrong,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatNumber(totalKg)} kg
              </dd>
            </Flex>
          </dl>
        </CardContent>
      </Card>

      <Flex wrap gap={token.marginSM}>
        <Button variant="primary" type="submit" disabled={loading}>
          {loading ? t("deliveryOrders.submitting") : t("deliveryOrders.submit")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
      </Flex>

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
