"use client";

/**
 * Recording a retur penjualan / pembelian (issue #27).
 *
 * The origin document is picked first; everything downstream (currency, prices,
 * how much is still returnable) is read from the server, never typed — the same
 * "server is authoritative on money" stance as the invoice form. Returnable
 * amounts are shown per line so the over-return cap is visible before submit, and
 * the same cap is re-enforced server-side.
 *
 * ── Konversi ke token Ant Design (issue #195, fase C3) ─────────────────────
 * Kulitnya saja. Batas retur, pembacaan dokumen asal, dan muatan POST tidak
 * disentuh. Dua hal yang berubah bentuknya, keduanya disengaja:
 *  • **Tabel baris retur penjualan kini `StaticTable`** — sama seperti tabel
 *    lain di modul ini. Kolomnya membawa isian (kuantitas) dan pemilih barang
 *    stok; `render` boleh mengembalikan apa pun, termasuk kendali.
 *  • **Baris retur pembelian tidak lagi kisi 12 kolom.** `sm:grid-cols-12`
 *    memaksa lima kendali berdampingan pada 640px, tempat kolom "Item" tinggal
 *    ±120px. Kini `Row`/`Col` yang membungkus.
 */
import { useState, useEffect, useCallback } from "react";
import { Alert, Col, Flex, Row, Spin, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ServerSearchableSelect } from "@/components/ui/server-searchable-select";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { DeleteOutlined, InfoCircleOutlined, PlusOutlined } from "@ant-design/icons";
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

/** Lebar isian kuantitas retur di dalam sel tabel (`w-28` lama). */
const QTY_INPUT_WIDTH = 112;

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
  items,
}: {
  initialType: "sales" | "purchase";
  items: ItemOption[];
}) {
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();

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
    const res = await apiFetch(`/api/returns/sales?invoiceId=${id}`);
    if (res.ok) setInvoiceDetail(await res.json());
  }, []);

  const loadPurchase = useCallback(async (id: string) => {
    setPurchaseDetail(null);
    if (!id) return;
    const res = await apiFetch(`/api/returns/purchase?purchaseId=${id}`);
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
      const res = await apiFetch(url, {
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

  /** Kolom tabel baris retur penjualan; `render` boleh membawa kendali. */
  const salesColumns: SaiColumns<InvoiceLine> = [
    {
      key: "itemName",
      dataIndex: "itemName",
      title: t("common.item"),
      align: "left",
      render: (_v, ln) => (
        <>
          {ln.itemName}
          {ln.unit && (
            <Typography.Text type="secondary"> ({ln.unit})</Typography.Text>
          )}
        </>
      ),
    },
    {
      key: "price",
      dataIndex: "price",
      title: t("common.price"),
      align: "right",
      render: (_v, ln) => (
        <Money value={ln.price} currency={invoiceDetail?.currency ?? "IDR"} />
      ),
    },
    {
      key: "returnable",
      dataIndex: "returnable",
      title: t("returns.colReturnable"),
      align: "right",
      // KUANTITAS, bukan uang — desimalnya utuh (`round3`), tanpa "Rp".
      render: (_v, ln) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {round3(ln.returnable)}
          <Typography.Text
            type="secondary"
            style={{ display: "block", fontSize: token.fontSizeSM }}
          >
            {t("returns.fromQty", { qty: round3(ln.quantity) })}
          </Typography.Text>
        </span>
      ),
    },
    {
      key: "qty",
      dataIndex: "invoiceItemId",
      title: t("returns.colReturnQty"),
      align: "right",
      render: (_v, ln) => {
        const v = salesLines[ln.invoiceItemId];
        const over = (Number(v?.qty) || 0) > ln.returnable + 1e-6;
        return (
          <div style={{ display: "inline-block", textAlign: "right" }}>
            <Input
              id={`qty-${ln.invoiceItemId}`}
              type="number"
              step="0.001"
              min="0"
              max={ln.returnable}
              /* Batas retur terlampaui ditandai KEADAAN isian (`invalid` →
                 `status="error"` AntD) plus kalimatnya di bawah — bukan satu
                 kelas border merah yang tak diumumkan pembaca layar. */
              invalid={over}
              style={{ width: QTY_INPUT_WIDTH, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              value={v?.qty ?? ""}
              onChange={(e) => setSalesQty(ln.invoiceItemId, e.target.value)}
              disabled={ln.returnable <= 0}
            />
            {over && (
              <Typography.Text
                style={{
                  display: "block",
                  marginTop: token.marginXXS,
                  fontSize: token.fontSizeSM,
                  color: token.colorError,
                }}
              >
                {t("returns.overReturnable")}
              </Typography.Text>
            )}
          </div>
        );
      },
    },
    {
      key: "stockItem",
      dataIndex: "invoiceItemId",
      title: t("returns.colStockItem"),
      align: "left",
      render: (_v, ln) => (
        <Select
          id={`item-${ln.invoiceItemId}`}
          value={salesLines[ln.invoiceItemId]?.itemId ?? ""}
          onChange={(e) => setSalesItem(ln.invoiceItemId, e.target.value)}
          options={itemOptions}
        />
      ),
    },
  ];

  return (
    <Flex vertical gap={token.marginLG} component="form" onSubmit={handleSubmit}>
      <Card>
        <CardContent>
          <div style={twoColumnGrid(token.margin)}>
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

            {/* Pemilih dokumen asal mencari ke server (audit: daftar statis
                `take: 300` membuat faktur/pembelian lama mustahil diretur).
                Detail moneternya tetap dibaca dari endpoint detail yang sama
                begitu satu dokumen terpilih — lihat loadInvoice/loadPurchase. */}
            <div style={{ gridColumn: "1 / -1" }}>
              {type === "sales" ? (
                <ServerSearchableSelect
                  id="invoiceId"
                  label={t("returns.originInvoice")}
                  placeholder={t("returns.pickInvoice")}
                  fetchUrl="/api/invoices?picker=1"
                  value={invoiceId || null}
                  onChange={(v) => setInvoiceId(v ?? "")}
                />
              ) : (
                <ServerSearchableSelect
                  id="purchaseId"
                  label={t("returns.originPurchase")}
                  placeholder={t("returns.pickPurchase")}
                  fetchUrl="/api/returns/purchase"
                  searchParam="searchOrigin"
                  value={purchaseId || null}
                  onChange={(v) => setPurchaseId(v ?? "")}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales: per-line returnable table */}
      {type === "sales" && invoiceDetail && (
        <Card>
          <StaticTable
            columns={salesColumns}
            rows={invoiceDetail.items}
            rowKey={(ln) => ln.invoiceItemId}
          />
        </Card>
      )}

      {/* Purchase: free-text lines + remaining value */}
      {type === "purchase" && purchaseDetail && (
        <Card>
          <CardContent>
            <Typography.Paragraph
              type="secondary"
              style={{ marginTop: 0, fontVariantNumeric: "tabular-nums" }}
            >
              {t("returns.remainingReturnableLabel")}{" "}
              <strong>
                {formatCurrency(purchaseDetail.returnable, purchaseDetail.currency)}
              </strong>{" "}
              {t("returns.remainingReturnableOf", {
                amount: formatCurrency(purchaseDetail.amount, purchaseDetail.currency),
              })}
            </Typography.Paragraph>
            <Flex vertical gap={token.marginSM}>
              {purchaseLines.map((l, i) => (
                /* `sm:grid-cols-12` lama memaksa lima kendali berdampingan di
                   640px, tempat kolom "Item" tinggal ±120px. `Row` yang
                   membungkus memberi tiap kendali lebar minimum yang layak. */
                <Row key={i} gutter={[token.marginXS, token.marginXS]} align="bottom">
                  <Col xs={24} md={8} style={{ minWidth: 0 }}>
                    <Input
                      id={`pname-${i}`}
                      label={i === 0 ? t("common.item") : undefined}
                      value={l.itemName}
                      onChange={(e) => updatePurchaseLine(i, { itemName: e.target.value })}
                      maxLength={100}
                    />
                  </Col>
                  <Col xs={12} md={4}>
                    {/* KUANTITAS (`Decimal(15,3)`) — desimalnya utuh. */}
                    <Input
                      id={`pqty-${i}`}
                      label={i === 0 ? t("common.quantity") : undefined}
                      type="number"
                      step="0.001"
                      min="0"
                      style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      value={l.quantity}
                      onChange={(e) => updatePurchaseLine(i, { quantity: e.target.value })}
                    />
                  </Col>
                  <Col xs={12} md={4}>
                    <Input
                      id={`pprice-${i}`}
                      label={i === 0 ? t("common.price") : undefined}
                      type="number"
                      step="0.01"
                      min="0"
                      style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      value={l.price}
                      onChange={(e) => updatePurchaseLine(i, { price: e.target.value })}
                    />
                  </Col>
                  <Col xs={20} md={6}>
                    <Select
                      id={`pitem-${i}`}
                      label={i === 0 ? t("returns.colStockItem") : undefined}
                      value={l.itemId}
                      onChange={(e) => updatePurchaseLine(i, { itemId: e.target.value })}
                      options={itemOptions}
                    />
                  </Col>
                  <Col xs={4} md={2}>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setPurchaseLines((prev) =>
                          prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev
                        )
                      }
                      aria-label={t("returns.removeRow")}
                    >
                      <DeleteOutlined aria-hidden="true" />
                    </Button>
                  </Col>
                </Row>
              ))}
            </Flex>
            <div style={{ marginTop: token.marginSM }}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setPurchaseLines((prev) => [
                    ...prev,
                    { itemName: "", quantity: "", price: "", itemId: "" },
                  ])
                }
              >
                <PlusOutlined aria-hidden="true" />
                {t("returns.addRow")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Input
            id="reason"
            label={t("returns.reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
          />

          {(salesSubtotal > 0 || purchaseSubtotal > 0) && (
            <Typography.Paragraph
              type="secondary"
              style={{
                margin: 0,
                marginTop: token.margin,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {t("returns.returnValueLabel")}{" "}
              <strong>
                {formatCurrency(type === "sales" ? salesSubtotal : purchaseSubtotal, currency)}
              </strong>
            </Typography.Paragraph>
          )}

          {/* Penjelasan dampak jurnal: `Alert` informatif — ikon + teks
              `colorText` di atas `colorInfoBg`, keduanya token. */}
          <div style={{ marginTop: token.margin }}>
            <Alert
              type="info"
              showIcon
              icon={<InfoCircleOutlined aria-hidden="true" />}
              message={
                <>
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
                </>
              }
            />
          </div>

          {error && (
            <div role="alert" style={{ marginTop: token.margin }}>
              <Alert type="error" showIcon message={error} />
            </div>
          )}
        </CardContent>
      </Card>

      <Flex wrap gap={token.marginXS}>
        <Button variant="primary" type="submit" disabled={saving}>
          {/* `Spin` menggantikan `Loader2 animate-spin`: gerakannya mengikuti
              token gerak AntD, yang menghormati `prefers-reduced-motion`. */}
          {saving && <Spin size="small" />}
          {t("returns.submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(`/returns?tab=${type}`)}>
          {t("common.cancel")}
        </Button>
      </Flex>
    </Flex>
  );
}
