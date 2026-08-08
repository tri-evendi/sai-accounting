"use client";

/**
 * Wizard "Pembelian Baru" (issue #5) — sisi peramban.
 *
 * Lima langkah: pemasok → barang & harga → (opsional) barang masuk gudang →
 * catat pembelian → ringkasan. Seperti sisi penjualan, tidak satu pun langkah
 * menyentuh server; seluruh isian dikirim SEKALI ke `POST /api/wizard/purchase`
 * yang menulisnya dalam satu `prisma.$transaction`.
 *
 * Dua hal yang sengaja TIDAK dikarang di sini:
 *  • Pembelian tetap satu baris `supplier_transactions` bertipe `purchase` —
 *    persis yang dicatat formulir di halaman pemasok. Tabel barisnya memang
 *    tidak ada, jadi rincian barang ikut ke catatan (`purchaseNote`).
 *  • Barang masuk gudang dicatat sebagai pergerakan stok `in`, yang tidak
 *    menghasilkan jurnal — persediaan sudah didebet oleh jurnal pembeliannya.
 *
 * ── Konversi ke token Ant Design (issue #195, fase C3) ─────────────────────
 * Kulitnya saja. Draf, penjaga langkah, dan satu-satunya panggilan tulis tidak
 * disentuh. Dua aturan domain yang sengaja dipertegas saat mengonversinya:
 *  • **Kuantitas bukan uang** — jumlah barang & penerimaan lewat `formatNumber`
 *    (`step="0.001"`, `Decimal(15,3)`); hanya nilai baris, PPN, dan total yang
 *    lewat `formatCurrency`.
 *  • **Valas** — isian kurs hanya dirender saat mata uangnya bukan IDR, dan
 *    peringatan biaya valas hanya muncul di kondisi yang sama.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { DisclosureSection } from "@/components/ui/disclosure-section";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { DueDateField } from "@/components/shared/due-date-field";
import { CostCenterField, useCostCenters } from "@/components/shared/cost-center-field";
import { Wizard, WizardSummaryRow } from "@/components/shared/wizard";
import { WizardPartnerStep } from "@/components/shared/wizard-partner-step";
import { useWizardDraft } from "@/components/shared/use-wizard-draft";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { humanizeFieldMessage, type ClosedPeriodRef } from "@/lib/form-guards";
import {
  PURCHASE_STEPS,
  buildPurchasePayload,
  emptyPurchaseDraft,
  emptyPurchaseLine,
  fillReceiptFromOrder,
  purchaseTotal,
  purchaseValue,
  validatePurchaseStep,
  type PurchaseDraft,
  type PurchaseLineDraft,
  type PurchaseStepId,
} from "@/lib/wizard";
import { useT } from "@/lib/i18n/client";
import { AppstoreAddOutlined, CheckCircleOutlined, DeleteOutlined, PlusOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";

// Pemasok tidak lagi dikirim sebagai daftar statis (audit: `take: 500`
// memotong daftar — pemasok lama tak terpilih). Pemilihnya mencari ke server;
// nama pemasok terpilih dibaca dari endpoint detailnya.
export interface ItemOption {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

interface PurchaseResult {
  supplierId: number;
  supplierName: string;
  purchase: { id: number; amount: number; currency: string };
  receiptCount: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

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

/** Lebar dasar kolom angka pada baris barang (`w-32`…`w-40` lama). */
const QTY_COL_BASIS = 128;

export function PurchaseWizard({
  items,
  closedPeriods,
}: {
  items: ItemOption[];
  closedPeriods: ClosedPeriodRef[];
}) {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const { draft, setDraft, clear, ready, notice, dismissNotice } = useWizardDraft<PurchaseDraft>(
    "purchase",
    () => emptyPurchaseDraft(todayISO())
  );
  const [stepId, setStepId] = useState<PurchaseStepId>("pemasok");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  // Nama pemasok yang terpilih di pemilih cari-ke-server — untuk label saat
  // draf dipulihkan dan untuk baris ringkasan. Diisi dari endpoint detail.
  const [supplierInfo, setSupplierInfo] = useState<Record<number, { name: string }>>({});

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // issue #91/#98 — dimensi pusat biaya, pemilih yang sama dengan formulir di
  // halaman pemasok. Perusahaan tanpa pusat biaya mendapat daftar kosong dan
  // pemilihnya tidak dirender sama sekali.
  const costCenters = useCostCenters();
  const guardContext = useMemo(() => ({ closedPeriods }), [closedPeriods]);
  const blockers = validatePurchaseStep(draft, stepId, guardContext);

  const patch = useCallback(
    (updater: (prev: PurchaseDraft) => PurchaseDraft) => setDraft(updater),
    [setDraft]
  );
  const updateLine = useCallback(
    (index: number, values: Partial<PurchaseLineDraft>) =>
      patch((d) => ({
        ...d,
        lines: d.lines.map((l, i) => (i === index ? { ...l, ...values } : l)),
      })),
    [patch]
  );

  // Nama pemasok terpilih — dibaca sekali dari endpoint detail lalu di-cache;
  // menutup label pemilih pada draf yang dipulihkan dan baris ringkasan.
  useEffect(() => {
    const id = draft.supplier.mode === "existing" ? draft.supplier.id : null;
    if (id == null || supplierInfo[id]) return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch(`/api/suppliers/${id}`);
      if (!res.ok || cancelled) return;
      const s = (await res.json()) as { name: string };
      if (cancelled) return;
      setSupplierInfo((m) => ({ ...m, [id]: { name: s.name } }));
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.supplier.mode, draft.supplier.id, supplierInfo]);

  const selectedSupplierId =
    draft.supplier.mode === "existing" ? draft.supplier.id : null;
  const selectedSupplier =
    selectedSupplierId != null ? supplierInfo[selectedSupplierId] : undefined;

  const itemOptions: SearchableOption[] = items.map((i) => ({
    value: String(i.id),
    label: i.name,
    description: t("common.stockOption", { qty: formatNumber(i.currentStock), unit: i.unit || "kg" }),
  }));

  const currency = draft.purchase.currency;

  async function finish() {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/wizard/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPurchasePayload(draft)),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string; step?: PurchaseStepId }
        | null;
      setError(humanizeFieldMessage(null, data?.error ?? t("purchases.saveFailed")));
      setBusy(false);
      if (data?.step) setStepId(data.step);
      return;
    }

    const created = (await res.json()) as PurchaseResult;
    clear();
    setResult(created);
    setBusy(false);
    router.refresh();
  }

  function cancel() {
    clear();
    router.push("/suppliers");
  }

  /**
   * Daftar ringkasan bergaris pemisah — pengganti `divide-y divide-border`,
   * yang tidak punya padanan gaya sebaris. Garisnya per baris mulai baris kedua.
   */
  const summaryList = (rows: React.ReactNode[]) => {
    const shown = rows.filter(Boolean);
    return (
      <dl style={{ margin: 0 }}>
        {shown.map((row, i) => (
          <div
            key={i}
            style={{
              borderTop:
                i === 0
                  ? undefined
                  : `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
            }}
          >
            {row}
          </div>
        ))}
      </dl>
    );
  };

  /** Label mikro di atas satu isian angka. */
  const microLabel = (htmlFor: string, text: React.ReactNode) => (
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

  /** Pasangan keterangan-kecil + nilai di ujung kanan sebuah baris. */
  const rightStat = (caption: string, value: React.ReactNode, strong = true) => (
    <div style={{ marginInlineStart: "auto", textAlign: "right" }}>
      <Typography.Text
        type="secondary"
        style={{ display: "block", fontSize: token.fontSizeSM }}
      >
        {caption}
      </Typography.Text>
      <span
        style={{
          fontWeight: strong ? token.fontWeightStrong : undefined,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );

  /** Kotak baris — batas + sudut + padding, semuanya token. */
  const rowBox: React.CSSProperties = {
    padding: token.paddingSM,
    borderRadius: token.borderRadius,
    border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
  };

  if (result) {
    return (
      <Card>
        <CardContent style={{ paddingBlock: token.paddingLG }}>
          <Flex align="flex-start" gap={token.marginSM}>
            {/* Warna centang dari token uang positif (#186) — penanda KEDUA;
                yang pertama adalah judulnya. */}
            <CheckCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSizeHeading3, flexShrink: 0, marginTop: 2, color: token.colorMoneyPositive }} />
            <div style={{ minWidth: 0 }}>
              <Typography.Title level={2} style={{ fontSize: token.fontSizeLG, marginTop: 0 }}>
                {t("purchases.savedTitle")}
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginTop: token.marginXXS }}>
                {t("purchases.savedHint")}
              </Typography.Paragraph>
              <div style={{ marginTop: token.margin }}>
                {summaryList([
                  <WizardSummaryRow
                    key="supplier"
                    label={t("purchases.rowSupplier")}
                    value={result.supplierName}
                  />,
                  <WizardSummaryRow
                    key="value"
                    label={t("purchases.rowPurchaseValue")}
                    value={formatCurrency(result.purchase.amount, result.purchase.currency)}
                    strong
                  />,
                  <WizardSummaryRow
                    key="receipt"
                    label={t("purchases.rowReceipt")}
                    value={
                      result.receiptCount > 0
                        ? t("common.rowCount", { count: result.receiptCount })
                        : t("common.notRecorded")
                    }
                  />,
                ])}
              </div>
              <Flex wrap gap={token.marginSM} style={{ marginTop: token.marginLG }}>
                {/*
                  `<ButtonLink>`, bukan `<Button href>` — jalan keluar wisaya ini
                  TIDAK butuh pemuatan penuh, dan memaksanya justru membatalkan
                  dua hal yang sudah ditulis berkas ini sendiri.

                  Keadaan wisaya tidak perlu "dibuang" oleh pemuatan penuh: draf
                  sudah dihapus `clear()` sebelum layar ini tampil, dan tujuannya
                  rute lain — jadi komponen ini dilepas oleh navigasi mana pun.
                  Kesegaran data juga sudah diurus: `router.refresh()` dipanggil
                  tepat setelah simpan berhasil, dan itu hanya berarti sesuatu
                  bagi navigasi SISI-KLIEN. Yang tersisa dari pemuatan penuh
                  cuma ongkosnya.

                  Berkas ini pun sudah menavigasi sisi-klien di jalur sebelahnya
                  (`cancel()` -> `router.push("/suppliers")`); dua jalan keluar
                  dari layar yang sama dengan perilaku berbeda adalah cacat yang
                  hanya terlihat kalau seseorang kebetulan memakai keduanya.
                */}
                <ButtonLink href={`/suppliers/${result.supplierId}`} variant="primary">
                  {t("purchases.viewSupplier")}
                </ButtonLink>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setResult(null);
                    setStepId("pemasok");
                    setDraft(emptyPurchaseDraft(todayISO()));
                  }}
                >
                  {t("purchases.recordAnother")}
                </Button>
              </Flex>
            </div>
          </Flex>
        </CardContent>
      </Card>
    );
  }

  if (!ready) {
    return <Typography.Text type="secondary">{t("common.preparingForm")}</Typography.Text>;
  }

  return (
    <Wizard
      steps={PURCHASE_STEPS}
      currentId={stepId}
      onNavigate={(id) => {
        dismissNotice();
        setStepId(id as PurchaseStepId);
      }}
      blockers={blockers}
      onFinish={finish}
      onCancel={cancel}
      busy={busy}
      error={error}
      notice={notice}
      finishLabel={t("common.finishAndSave")}
    >
      {/* ── 1. Pemasok ────────────────────────────────────────────────── */}
      {stepId === "pemasok" && (
        <WizardPartnerStep
          kind="supplier"
          fetchUrl="/api/suppliers?active=1&picker=1"
          initialOption={
            selectedSupplierId != null && selectedSupplier
              ? { value: String(selectedSupplierId), label: selectedSupplier.name }
              : null
          }
          value={draft.supplier}
          manageHref="/suppliers"
          onChange={(values) =>
            patch((d) => ({ ...d, supplier: { ...d.supplier, ...values } }))
          }
        />
      )}

      {/* ── 2. Barang & harga ─────────────────────────────────────────── */}
      {stepId === "barang" && (
        <Card>
          <CardHeader>
            <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
              <CardTitle>{t("purchases.goodsBoughtTitle")}</CardTitle>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => patch((d) => ({ ...d, lines: [...d.lines, emptyPurchaseLine()] }))}
              >
                <PlusOutlined aria-hidden="true" /> {t("common.addItemLower")}
              </Button>
            </Flex>
            <Typography.Text
              type="secondary"
              style={{ display: "block", marginTop: token.marginXXS }}
            >
              {t("purchases.goodsHintA")}{" "}
              <TermTooltip term="utang">{t("purchases.goodsHintTerm")}</TermTooltip>{" "}
              {t("purchases.goodsHintB")}
            </Typography.Text>
          </CardHeader>
          <CardContent>
            <Flex vertical gap={token.margin}>
            {draft.lines.map((line, i) => (
              <div key={i} style={rowBox}>
                <div style={twoColumnGrid(token.marginSM)}>
                  <SearchableSelect
                    label={t("common.itemFromStockList")}
                    placeholder={t("common.pickItem")}
                    searchPlaceholder={t("common.searchItem")}
                    emptyText={t("common.noItemMatch")}
                    options={itemOptions}
                    value={line.itemId != null ? String(line.itemId) : null}
                    onChange={(v) => {
                      const master = v == null ? null : itemById.get(Number(v));
                      updateLine(i, {
                        itemId: master?.id ?? null,
                        itemName: master?.name ?? line.itemName,
                        unit: master?.unit || line.unit || "kg",
                      });
                    }}
                  />
                  <Input
                    id={`purchaseItemName-${i}`}
                    label={t("common.itemNameOnDocument")}
                    value={line.itemName}
                    onChange={(e) => updateLine(i, { itemName: e.target.value })}
                    maxLength={100}
                    required
                  />
                </div>
                <Flex
                  wrap
                  align="flex-end"
                  gap={token.marginSM}
                  style={{ marginTop: token.marginSM }}
                >
                  <div style={{ flex: `1 1 ${QTY_COL_BASIS}px`, maxWidth: 200 }}>
                    {microLabel(
                      `purchaseQty-${i}`,
                      t("purchases.quantityUnit", { unit: line.unit || "kg" })
                    )}
                    {/* KUANTITAS (`Decimal(15,3)`) — desimalnya utuh, tanpa "Rp". */}
                    <TextInput
                      id={`purchaseQty-${i}`}
                      type="number"
                      min={0}
                      step="0.001"
                      style={numberStyle}
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div style={{ flex: `1 1 ${QTY_COL_BASIS}px`, maxWidth: 200 }}>
                    {microLabel(
                      `purchasePrice-${i}`,
                      t("purchases.purchasePriceUnit", { unit: line.unit || "kg", currency })
                    )}
                    <TextInput
                      id={`purchasePrice-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      style={numberStyle}
                      value={line.price}
                      onChange={(e) => updateLine(i, { price: Number(e.target.value) })}
                    />
                  </div>
                  {rightStat(
                    t("common.lineValue"),
                    formatCurrency(line.quantity * line.price, currency)
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      patch((d) => ({
                        ...d,
                        lines: d.lines.length > 1 ? d.lines.filter((_, x) => x !== i) : d.lines,
                      }))
                    }
                    disabled={draft.lines.length === 1}
                    aria-label={t("common.removeItemRow", { n: i + 1 })}
                    style={{ color: token.colorError }}
                  >
                    <DeleteOutlined aria-hidden="true" />
                  </Button>
                </Flex>
                {line.itemId == null && (
                  <Typography.Paragraph
                    style={{
                      margin: 0,
                      marginTop: token.marginXS,
                      fontSize: token.fontSizeSM,
                      color: token.colorMoneyPending,
                    }}
                  >
                    {t("purchases.lineNotInStock")}
                  </Typography.Paragraph>
                )}
              </div>
            ))}

            <dl
              style={{
                margin: 0,
                borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                paddingTop: token.paddingSM,
              }}
            >
              <WizardSummaryRow
                label={t("purchases.valueBeforeTaxLine")}
                value={formatCurrency(purchaseValue(draft), currency)}
                strong
              />
            </dl>
            </Flex>
          </CardContent>
        </Card>
      )}

      {/* ── 3. Barang masuk (opsional) ────────────────────────────────── */}
      {stepId === "penerimaan" && (
        <Card>
          <CardContent>
            <Flex vertical gap={token.margin}>
            {/* Kotak pilihan "catat barang masuk". Tetap `<label>` telanjang:
                seluruh kotak harus bisa ditekan dan isinya dua baris. */}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: token.marginSM,
                padding: token.paddingSM,
                borderRadius: token.borderRadiusLG,
                border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                cursor: "pointer",
              }}
            >
              <Checkbox
                style={{ marginTop: token.marginXXS }}
                checked={draft.receipt.include}
                onCheckedChange={(v) =>
                  patch((d) => {
                    const checked = v === true;
                    const next = { ...d, receipt: { ...d.receipt, include: checked } };
                    return checked ? fillReceiptFromOrder(next) : next;
                  })
                }
              />
              <span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: token.marginXS,
                    fontWeight: token.fontWeightStrong,
                  }}
                >
                  <AppstoreAddOutlined aria-hidden="true" style={{ color: token.colorIcon }} />
                  {t("purchases.receiptCheckboxA")}{" "}
                  <TermTooltip term="persediaan">{t("purchases.receiptTerm")}</TermTooltip>
                </span>
                <Typography.Text
                  type="secondary"
                  style={{ display: "block", marginTop: token.marginXXS }}
                >
                  {t("purchases.receiptHintA")}{" "}
                  <TermTooltip term="hpp">{t("purchases.receiptHintTerm")}</TermTooltip>{" "}
                  {t("purchases.receiptHintB")}
                </Typography.Text>
              </span>
            </label>

            {draft.receipt.include && (
              <>
                <Input
                  id="receiptDate"
                  type="date"
                  label={t("purchases.receiptDate")}
                  value={draft.receipt.date}
                  onChange={(e) =>
                    patch((d) => ({ ...d, receipt: { ...d.receipt, date: e.target.value } }))
                  }
                  required
                />

                <Flex vertical gap={token.marginSM}>
                  {draft.lines.map((line, i) => {
                    const master = line.itemId != null ? itemById.get(line.itemId) : null;
                    const over = line.receiveQuantity > line.quantity;
                    return (
                      <div key={i} style={rowBox}>
                        <label
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: token.marginXS,
                            cursor: "pointer",
                          }}
                        >
                          <Checkbox
                            checked={line.receive}
                            disabled={line.itemId == null}
                            onCheckedChange={(v) =>
                              updateLine(i, {
                                receive: v === true,
                                receiveQuantity:
                                  line.receiveQuantity > 0 ? line.receiveQuantity : line.quantity,
                              })
                            }
                          />
                          <span style={{ fontWeight: token.fontWeightStrong }}>
                            {line.itemName || t("common.rowN", { n: i + 1 })}
                          </span>
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                          >
                            {t("purchases.bought", {
                              qty: formatNumber(line.quantity),
                              unit: line.unit || "kg",
                            })}
                          </Typography.Text>
                          {line.itemId == null && (
                            <Badge variant="warning">{t("common.notInStockList")}</Badge>
                          )}
                        </label>

                        {line.receive && (
                          <Flex
                            wrap
                            align="flex-end"
                            gap={token.marginSM}
                            style={{ marginTop: token.marginSM }}
                          >
                            <div style={{ flex: `1 1 ${QTY_COL_BASIS}px`, maxWidth: 200 }}>
                              {microLabel(
                                `receiveQty-${i}`,
                                t("purchases.receiveQty", { unit: line.unit || "kg" })
                              )}
                              {/* KUANTITAS `Decimal(15,3)` — desimalnya utuh. */}
                              <TextInput
                                id={`receiveQty-${i}`}
                                type="number"
                                min={0}
                                step="0.001"
                                style={numberStyle}
                                value={line.receiveQuantity}
                                onChange={(e) =>
                                  updateLine(i, { receiveQuantity: Number(e.target.value) })
                                }
                              />
                            </div>
                            {rightStat(
                              t("purchases.currentStock"),
                              `${formatNumber(master?.currentStock ?? 0)} ${line.unit || "kg"}`,
                              false
                            )}
                          </Flex>
                        )}
                        {/* Kalimatnya sendiri berbunyi "melebihi yang dibeli";
                            warnanya penanda kedua. */}
                        {over && (
                          <Typography.Paragraph
                            style={{
                              margin: 0,
                              marginTop: token.marginXS,
                              fontSize: token.fontSizeSM,
                              fontWeight: token.fontWeightStrong,
                              color: token.colorMoneyNegative,
                            }}
                          >
                            {t("purchases.overReceive")}
                          </Typography.Paragraph>
                        )}
                      </div>
                    );
                  })}
                </Flex>

                {/* Hanya untuk valas: biaya perolehan dinilai dengan kurs
                    pembeliannya. */}
                {currency !== "IDR" && (
                  <Typography.Paragraph
                    type="secondary"
                    style={{
                      margin: 0,
                      padding: token.paddingSM,
                      borderRadius: token.borderRadius,
                      background: token.colorFillAlter,
                      fontSize: token.fontSizeSM,
                    }}
                  >
                    {t("purchases.fxCostHint", { currency })}
                  </Typography.Paragraph>
                )}
              </>
            )}
            </Flex>
          </CardContent>
        </Card>
      )}

      {/* ── 4. Catat pembelian ────────────────────────────────────────── */}
      {stepId === "pembelian" && (
        <>
          <Card style={{ marginBottom: token.marginLG }}>
            <CardHeader>
              <CardTitle>
                <TermTooltip term="pembelian">{t("purchases.detailTitle")}</TermTooltip>
              </CardTitle>
              <Typography.Paragraph
                type="secondary"
                style={{
                  margin: 0,
                  marginTop: token.marginXXS,
                  display: "flex",
                  alignItems: "center",
                  gap: token.marginXXS,
                }}
              >
                <ShoppingCartOutlined aria-hidden="true" style={{ flexShrink: 0 }} />
                <span>
                  {t("purchases.detailHintA")}{" "}
                  <TermTooltip term="utang">{t("purchases.detailHintTerm")}</TermTooltip>{" "}
                  {t("purchases.detailHintB")}
                </span>
              </Typography.Paragraph>
            </CardHeader>
            <CardContent>
              <div style={twoColumnGrid(token.margin)}>
                <Input
                  id="purchaseDate"
                  type="date"
                  label={t("purchases.purchaseDate")}
                  value={draft.purchase.date}
                  onChange={(e) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, date: e.target.value } }))
                  }
                  required
                />
                <DueDateField
                  value={draft.purchase.dueDate}
                  onChange={(v) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, dueDate: v } }))
                  }
                />
              </div>

              <div style={{ marginTop: token.margin }}>
                <CostCenterField
                  costCenters={costCenters}
                  value={draft.purchase.costCenterId ?? ""}
                  onChange={(v) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, costCenterId: v } }))
                  }
                />
              </div>

              <dl
                style={{
                  margin: 0,
                  marginTop: token.margin,
                  borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  paddingTop: token.paddingSM,
                }}
              >
                <WizardSummaryRow
                  label={t("purchases.valueBeforeVat")}
                  value={formatCurrency(purchaseValue(draft), currency)}
                />
                <WizardSummaryRow
                  label={<TermTooltip term="ppn">{t("purchases.inputVat")}</TermTooltip>}
                  value={formatCurrency(draft.purchase.taxAmount || 0, currency)}
                />
                <WizardSummaryRow
                  label={t("purchases.totalPayable")}
                  value={formatCurrency(purchaseTotal(draft), currency)}
                  strong
                />
              </dl>
            </CardContent>
          </Card>

          <DisclosureSection
            description={t("purchases.advancedDescription")}
            summary={[
              currency === "IDR"
                ? t("common.rupiahIdr")
                : t("invoices.advCurrencyForeign", {
                    currency,
                    rate: draft.purchase.rate > 0 ? draft.purchase.rate : t("common.notEntered"),
                  }),
              t("purchases.advSummaryVat", {
                amount: formatNumber(draft.purchase.taxAmount || 0),
              }),
            ].join(" · ")}
          >
            <div style={twoColumnGrid(token.margin)}>
              <div>
                <Label htmlFor="purchaseCurrency" style={{ marginBottom: token.marginXXS }}>
                  {t("common.currencyField")}
                </Label>
                <SelectField
                  id="purchaseCurrency"
                  options={[
                    { value: "IDR", label: "IDR (Rupiah)" },
                    { value: "USD", label: "USD" },
                    { value: "CNY", label: "CNY" },
                  ]}
                  value={currency}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      purchase: { ...d.purchase, currency: e.target.value },
                    }))
                  }
                />
              </div>
              {/* Progressive disclosure valas: isian kurs HANYA dirender saat
                  mata uangnya bukan IDR — pasangan client dari aturan
                  "dokumen valas wajib membawa kursnya sendiri". */}
              {currency !== "IDR" && (
                <div>
                  <Label htmlFor="purchaseRate" style={{ marginBottom: token.marginXXS }}>
                    <TermTooltip term="kurs">{t("common.rateTerm")}</TermTooltip> 1 {currency}{" "}
                    {t("common.rateTo")}
                  </Label>
                  <TextInput
                    id="purchaseRate"
                    type="number"
                    min={0}
                    step="0.000001"
                    style={numberStyle}
                    value={draft.purchase.rate || ""}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        purchase: { ...d.purchase, rate: Number(e.target.value) },
                      }))
                    }
                  />
                  <Typography.Text
                    type="secondary"
                    style={{
                      display: "block",
                      marginTop: token.marginXXS,
                      fontSize: token.fontSizeSM,
                    }}
                  >
                    {t("common.rateRequiredHint")}
                  </Typography.Text>
                </div>
              )}
              <div>
                <Label htmlFor="taxAmount" style={{ marginBottom: token.marginXXS }}>
                  {t("purchases.inputVatCurrency", { currency })}
                </Label>
                <TextInput
                  id="taxAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  style={numberStyle}
                  value={draft.purchase.taxAmount}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      purchase: { ...d.purchase, taxAmount: Number(e.target.value) },
                    }))
                  }
                />
                <Typography.Text
                  type="secondary"
                  style={{
                    display: "block",
                    marginTop: token.marginXXS,
                    fontSize: token.fontSizeSM,
                  }}
                >
                  {t("purchases.inputVatHint")}
                </Typography.Text>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <Input
                  id="purchaseNote"
                  label={t("common.notesOptional")}
                  value={draft.purchase.note}
                  onChange={(e) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, note: e.target.value } }))
                  }
                  maxLength={300}
                />
                <Typography.Text
                  type="secondary"
                  style={{
                    display: "block",
                    marginTop: token.marginXXS,
                    fontSize: token.fontSizeSM,
                  }}
                >
                  {t("purchases.noteHint")}
                </Typography.Text>
              </div>
            </div>
          </DisclosureSection>
        </>
      )}

      {/* ── 5. Ringkasan ──────────────────────────────────────────────── */}
      {stepId === "ringkasan" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("common.checkBeforeSaving")}</CardTitle>
            <Typography.Text
              type="secondary"
              style={{ display: "block", marginTop: token.marginXXS }}
            >
              {t("common.checkBeforeSavingHint")}
            </Typography.Text>
          </CardHeader>
          <CardContent>
            {summaryList([
              <WizardSummaryRow
                key="supplier"
                label={t("purchases.rowSupplier")}
                value={
                  draft.supplier.mode === "new"
                    ? t("purchases.summaryNew", { name: draft.supplier.name })
                    : (selectedSupplier?.name ?? "—")
                }
              />,
              <WizardSummaryRow
                key="goods"
                label={t("purchases.summaryGoods")}
                value={t("common.rowCount", {
                  count: draft.lines.filter((l) => l.itemName.trim()).length,
                })}
                hint={draft.lines
                  .filter((l) => l.itemName.trim())
                  .map((l) => `${l.itemName} ${formatNumber(l.quantity)} ${l.unit || "kg"}`)
                  .join(" · ")}
              />,
              <WizardSummaryRow
                key="receipt"
                label={t("purchases.rowReceipt")}
                value={
                  draft.receipt.include
                    ? t("common.rowCount", {
                        count: draft.lines.filter((l) => l.receive && l.receiveQuantity > 0)
                          .length,
                      })
                    : t("common.notRecorded")
                }
                hint={
                  draft.receipt.include
                    ? t("purchases.receiptSummaryHint", { date: draft.receipt.date })
                    : t("common.stockUnchanged")
                }
              />,
              <WizardSummaryRow
                key="value"
                label={t("purchases.rowPurchaseValue")}
                value={formatCurrency(purchaseValue(draft), currency)}
              />,
              <WizardSummaryRow
                key="vat"
                label={<TermTooltip term="ppn">{t("purchases.inputVat")}</TermTooltip>}
                value={formatCurrency(draft.purchase.taxAmount || 0, currency)}
              />,
              <WizardSummaryRow
                key="total"
                label={t("purchases.totalPayable")}
                value={formatCurrency(purchaseTotal(draft), currency)}
                hint={t("purchases.purchaseDateHint", { date: draft.purchase.date })}
                strong
              />,
            ])}
          </CardContent>
        </Card>
      )}
    </Wizard>
  );
}
