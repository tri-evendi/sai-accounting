"use client";

/**
 * Ubah Tagihan — dikonversi ke token Ant Design pada issue #195 (fase C3).
 *
 * Kulitnya saja yang berubah; mesin formulirnya (state lokal + PUT) tidak
 * disentuh. **Kisinya tetap CSS grid, bukan `Row`/`Col`**: `InvoiceFxFields`
 * dan `CostCenterField` membentang dengan `gridColumn: "1 / -1"`, yang hanya
 * berarti sesuatu di dalam CSS grid (lihat `FULL_ROW` di
 * `shared/invoice-fx-fields.tsx`).
 *
 * Satu perbaikan ikut karena konversinya memaksa menyebut idnya: label baris
 * barang dulu `<label>` TANPA `htmlFor` — tidak tertaut ke isian mana pun.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { DueDateField } from "@/components/shared/due-date-field";
import {
  InvoiceFxFields,
  invoiceFxPayload,
  type InvoiceFxValues,
} from "@/components/shared/invoice-fx-fields";
import {
  CostCenterField,
  costCenterPayload,
  useCostCenters,
} from "@/components/shared/cost-center-field";
import { invoiceSubtotal } from "@/lib/validations/invoice";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2`, tetap CSS grid. `max(280px, (100% − gutter)/2)` menahan
 * jumlah kolomnya di dua; titik patahnya jatuh di 576px, `sm` AntD.
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

export function EditInvoiceForm() {
  const router = useAppRouter();
  const params = useParams();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("pending");
  // Kontrak sumber (issue #15). Not editable here, but it MUST be carried back to
  // the API: the PUT body is authoritative, so omitting it would silently detach a
  // pulled faktur from its contract and corrupt that contract's outstanding.
  const [contractId, setContractId] = useState<number | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  // issue #98 — pusat biaya faktur. Dimuat dari fakturnya supaya sebuah edit tak
  // pernah diam-diam melepas tag yang sudah ada, dan bisa dipindah cabang.
  const costCenters = useCostCenters();
  const [costCenterId, setCostCenterId] = useState("");
  const [fx, setFx] = useState<InvoiceFxValues>({
    customerId: "",
    currency: "IDR",
    rate: "",
    taxable: false,
    taxRate: "11",
    pebNumber: "",
    pebDate: "",
    exportNote: "",
  });

  const subtotal = invoiceSubtotal(items);

  useEffect(() => {
    apiFetch(`/api/invoices/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error(t("invoices.loadFailed"));
        return res.json();
      })
      .then((data) => {
        setInvoiceNo(data.invoiceNo);
        setDate(new Date(data.date).toISOString().split("T")[0]);
        // Blank stays blank: a null due date is "unknown", not "today".
        setDueDate(data.dueDate ? new Date(data.dueDate).toISOString().split("T")[0] : "");
        setStatus(data.status);
        setContractId(data.contractId ?? null);
        setCostCenterId(data.costCenterId ? String(data.costCenterId) : "");
        // A legacy taxed row (taxable false but tax_amount > 0) is shown as taxed,
        // with the rate inferred from amount ÷ DPP so the user sees a sensible
        // percentage rather than a blank. A stored tax_rate always wins.
        const legacyTaxed = !data.taxable && Number(data.taxAmount) > 0;
        const subtotal = (data.items ?? []).reduce(
          (s: number, i: { quantity: number; price: number }) =>
            s + Number(i.quantity) * Number(i.price),
          0
        );
        const inferredRate =
          data.taxRate != null
            ? Number(data.taxRate)
            : legacyTaxed && subtotal > 0
              ? Math.round((Number(data.taxAmount) / subtotal) * 10000) / 100
              : 11;
        setFx({
          customerId: data.customerId ? String(data.customerId) : "",
          // Legacy rows may predate the column; treat a missing value as IDR,
          // which is how they have been posted all along.
          currency: data.currency || "IDR",
          rate: data.rate != null ? String(Number(data.rate)) : "",
          taxable: Boolean(data.taxable) || legacyTaxed,
          taxRate: String(inferredRate),
          pebNumber: data.pebNumber || "",
          pebDate: data.pebDate ? new Date(data.pebDate).toISOString().split("T")[0] : "",
          exportNote: data.exportNote || "",
        });
        setItems(
          data.items.map((item: InvoiceItem & { id?: number }) => ({
            itemName: item.itemName,
            quantity: Number(item.quantity),
            price: Number(item.price),
            unit: item.unit || "kg",
          }))
        );
        setFetching(false);
      })
      .catch((err) => {
        setError(err.message);
        setFetching(false);
      });
  }, [params.id, t]);

  function addItem() {
    setItems([...items, { itemName: "", quantity: 0, price: 0, unit: "kg" }]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body = {
      invoiceNo,
      date,
      dueDate,
      status,
      contractId,
      costCenterId: costCenterPayload(costCenterId),
      ...invoiceFxPayload(fx),
      items,
    };

    const res = await apiFetch(`/api/invoices/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || t("invoices.updateFailed")));
      setLoading(false);
    } else {
      router.push(`/invoices/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message={t("invoices.loadingInvoice")} />;
  if (!invoiceNo && !fetching) {
    return (
      <div role="alert">
        <Alert type="error" showIcon message={t("invoices.notFound")} />
      </div>
    );
  }

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

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("invoices.breadcrumb"), href: "/invoices" },
          { label: t("invoices.editTitle", { no: invoiceNo }) },
        ]}
        title={t("invoices.editTitle", { no: invoiceNo })}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader><CardTitle>{t("invoices.dataTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div style={twoColumnGrid(token.margin)}>
              <Input id="invoiceNo" label={t("invoices.invoiceNo")} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required />
              <Input id="date" type="date" label={t("common.date")} value={date} onChange={(e) => setDate(e.target.value)} required />
              <DueDateField value={dueDate} onChange={setDueDate} />
              {/* Status lewat peta label bahasa tugas; nilai enum DB tidak
                  pernah tampil mentah. */}
              <Select
                id="status" label={t("common.status")} value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={[
                  { value: "pending", label: t("status.contract.pending") },
                  { value: "signed", label: t("status.contract.signed") },
                  { value: "canceled", label: t("status.contract.canceled") },
                ]}
              />
              {/* Valas: `InvoiceFxFields` memunculkan isian kurs hanya untuk
                  mata uang bukan-IDR, dan blok PPN/PEB-nya membentang penuh
                  lewat `gridColumn: 1 / -1` — karena itu kisinya CSS grid. */}
              <InvoiceFxFields
                value={fx}
                onChange={(patch) => setFx((prev) => ({ ...prev, ...patch }))}
                subtotal={subtotal}
              />
              <div style={{ gridColumn: "1 / -1" }}>
                <CostCenterField
                  costCenters={costCenters}
                  value={costCenterId}
                  onChange={setCostCenterId}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
              <CardTitle>{t("invoices.goodsSoldTitle")}</CardTitle>
              <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                <Plus aria-hidden="true" /> {t("common.addItem")}
              </Button>
            </Flex>
          </CardHeader>
          <CardContent>
            <Flex vertical gap={token.margin}>
              {items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: token.paddingSM,
                    borderRadius: token.borderRadius,
                    border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  {/* `Row` yang membungkus menggantikan satu baris flex kaku:
                      di 375px kelima kendali dulu saling menghimpit. */}
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
                      {/* KUANTITAS (`Decimal(15,3)`), bukan uang. */}
                      <TextInput
                        id={`quantity-${i}`}
                        type="number"
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
                        aria-label={t("common.removeItemRow", { n: i + 1 })}
                        style={{ color: token.colorError }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </Col>
                  </Row>
                </div>
              ))}
            </Flex>
          </CardContent>
        </Card>

        <Flex wrap gap={token.marginSM}>
          <Button type="submit" disabled={loading}>{loading ? t("common.saving") : t("common.save")}</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>{t("common.cancel")}</Button>
        </Flex>
      </form>
    </div>
  );
}
