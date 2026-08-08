"use client";

/**
 * Wizard "Penjualan Baru" (issue #5) — sisi peramban.
 *
 * Lima langkah: pelanggan → barang & harga → (opsional) surat jalan → tagihan →
 * ringkasan. Tidak satu pun dari empat langkah pertama menyentuh server: semua
 * isian hidup di draf (`useWizardDraft`), dan seluruhnya baru dikirim SEKALI ke
 * `POST /api/wizard/sales` yang menulisnya dalam satu `prisma.$transaction`.
 *
 * Aturan main, penjaga, dan aritmetikanya bukan milik berkas ini:
 *   • urutan langkah + penjaga  → `@/lib/wizard` (murni, diuji di tests/);
 *   • sisa & pola "Ambil"       → `@/lib/document-chain` (#15), dipakai apa adanya
 *     atas baris draf, bukan versi kedua yang ditulis ulang;
 *   • periode tertutup & stok   → `@/lib/form-guards` + `@/lib/delivery-orders`;
 *   • pemetaan galat → bagian   → `@/lib/form-sections` (#4).
 *
 * ── Konversi ke token Ant Design (issue #195, fase C3) ─────────────────────
 * Yang berubah HANYA kulitnya. Draf, penjaga, aritmetika, dan satu-satunya
 * panggilan tulis di langkah terakhir tidak disentuh sama sekali.
 *
 * Tiga hal yang perlu diketahui sebelum menyuntingnya lagi:
 *  • **Kuantitas bukan uang.** Kilogram di sini `Decimal(15,3)` — semuanya
 *    lewat `formatNumber` (id-ID) dengan `tabular-nums`, tidak pernah lewat
 *    topeng rupiah. Hanya nilai baris & total faktur yang memakai
 *    `formatCurrency`.
 *  • **Peringatan tidak pernah bergantung warna saja.** Kalimatnya sendiri
 *    ("melebihi sisa kontrak", "belum ada di daftar stok") yang membawa
 *    maknanya; warnanya penanda kedua.
 *  • **`divide-y` tidak punya padanan gaya sebaris**, jadi daftar ringkasan
 *    memakai `summaryList()` di bawah: pembungkus per baris dengan garis atas
 *    mulai baris kedua. Hasilnya sama, tanpa satu pun kelas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Flex, theme, Typography } from "antd";
import { Link } from "@/components/ui/app-link";
import { useAppRouter } from "@/components/ui/app-link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { ServerSearchableSelect } from "@/components/ui/server-searchable-select";
import { DisclosureSection } from "@/components/ui/disclosure-section";
import { EmptyState } from "@/components/ui/empty-state";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { DueDateField } from "@/components/shared/due-date-field";
import { Wizard, WizardSummaryRow } from "@/components/shared/wizard";
import { WizardPartnerStep } from "@/components/shared/wizard-partner-step";
import { useWizardDraft } from "@/components/shared/use-wizard-draft";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { humanizeFieldMessage } from "@/lib/form-guards";
import type { ClosedPeriodRef } from "@/lib/form-guards";
import { resolveSubmitFailure } from "@/lib/form-sections";
import { defaultInvoiceTax } from "@/lib/tax";
import { normalizeItemName, type ContractLineOutstanding } from "@/lib/document-chain";
import {
  SALES_STEPS,
  applySalesPull,
  buildSalesPayload,
  emptySalesDraft,
  emptySalesLine,
  fillDeliveryFromOrder,
  salesInvoiceSubtotal,
  salesInvoiceTax,
  salesInvoiceTotal,
  salesOrderValue,
  shipKg,
  validateSalesStep,
  type SalesDraft,
  type SalesLineDraft,
  type SalesStepId,
} from "@/lib/wizard";
import { useT } from "@/lib/i18n/client";
import { CheckCircleOutlined, ContainerOutlined, DeleteOutlined, DownloadOutlined, FileTextOutlined, PlusOutlined, TruckOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";

// ── Data yang disiapkan server shell ──────────────────────────────────────
// Pelanggan / kontrak / penerima tidak lagi dikirim sebagai daftar statis
// (audit: `take: 500/300/300` memotong daftar — baris lama tak terpilih).
// Pemilihnya mencari ke server; detail baris terpilih (bebas-PPN, sisa
// kontrak, label) dibaca dari endpoint detail masing-masing.
export interface ItemOption {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

/** Bentuk `GET /api/contracts/[id]/outstanding` — sama dengan formulir faktur. */
interface OutstandingResponse {
  contract: { id: number; contractNo: string; buyer: string; currency: string };
  lines: ContractLineOutstanding[];
  pull: { contract: { itemName: string; quantity: number; price: number; unit: string }[] };
}

interface SalesResult {
  customerId: number;
  customerName: string | null;
  deliveryOrder: { id: number; no: string } | null;
  invoice: { id: number; invoiceNo: string };
  approval: { message: string } | null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2`. `max(280px, (100% − gutter)/2)` menahan jumlah kolomnya di
 * dua (tanpa itu kisi `auto-fit` akan berkembang jadi lima di 1440px); titik
 * patahnya jatuh tepat di 576px, `sm` AntD.
 */
const FIELD_MIN = 280;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});

/** Lebar dasar kolom angka pada baris barang (`w-28`…`w-40` lama). */
const QTY_COL_BASIS = 128;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

export function SalesWizard({
  items,
  closedPeriods,
  canUpdateStock,
}: {
  items: ItemOption[];
  closedPeriods: ClosedPeriodRef[];
  /** Modul `inventory` aktif DAN pengguna boleh menulisnya (issue #103) —
   *  dihitung di server; tanpa itu ajakan "Tambah/Kurangi Stok" memantul. */
  canUpdateStock: boolean;
}) {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const { draft, setDraft, clear, ready, notice, dismissNotice } = useWizardDraft<SalesDraft>(
    "sales",
    () => emptySalesDraft(todayISO())
  );
  const [stepId, setStepId] = useState<SalesStepId>("pelanggan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingResponse | null>(null);
  const [pullNote, setPullNote] = useState("");
  const [result, setResult] = useState<SalesResult | null>(null);
  // Detail baris yang terpilih di pemilih cari-ke-server: nama (label ringkasan
  // & label pemilih saat draf dipulihkan) dan bebas-PPN pelanggan. Diisi dari
  // endpoint detail, bukan dari daftar statis yang sudah tidak ada lagi.
  const [customerInfo, setCustomerInfo] = useState<
    Record<number, { name: string; taxExempt: boolean }>
  >({});
  const [consigneeInfo, setConsigneeInfo] = useState<
    Record<number, { name: string; country: string | null }>
  >({});
  /** Pelanggan yang BARU dipilih dan defaults pajaknya masih menunggu detail
   *  bebas-PPN — draf yang dipulihkan tidak boleh ikut ditimpa. */
  const pendingTaxCustomerId = useRef<number | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const stockByItem = useMemo(() => new Map(items.map((i) => [i.id, i.currentStock])), [items]);
  const contractRemainingKg = useMemo(
    () => (outstanding ? new Map(outstanding.lines.map((l) => [l.key, l.remainingKg])) : undefined),
    [outstanding]
  );

  const guardContext = useMemo(
    () => ({ closedPeriods, stockByItem, contractRemainingKg }),
    [closedPeriods, stockByItem, contractRemainingKg]
  );
  const blockers = validateSalesStep(draft, stepId, guardContext);

  const patch = useCallback(
    (updater: (prev: SalesDraft) => SalesDraft) => setDraft(updater),
    [setDraft]
  );
  const updateLine = useCallback(
    (index: number, values: Partial<SalesLineDraft>) =>
      patch((d) => ({
        ...d,
        lines: d.lines.map((l, i) => (i === index ? { ...l, ...values } : l)),
      })),
    [patch]
  );

  // Sisa kontrak sumber — satu-satunya panggilan jaringan sebelum "Selesai", dan
  // ia hanya MEMBACA. Tidak ada dokumen yang lahir karenanya.
  useEffect(() => {
    const contractId = draft.contractId;
    let cancelled = false;
    // Semua perubahan state terjadi di dalam callback async — badan efeknya
    // sendiri tidak pernah memanggil setState (lihat `/invoices/new`).
    (async () => {
      if (contractId == null) {
        if (!cancelled) setOutstanding(null);
        return;
      }
      const res = await apiFetch(`/api/contracts/${contractId}/outstanding`);
      if (cancelled) return;
      if (!res.ok) {
        setError(t("sales.outstandingLoadFailed"));
        return;
      }
      const data = (await res.json()) as OutstandingResponse;
      if (!cancelled) setOutstanding(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.contractId, t]);

  // Detail pelanggan terpilih — nama untuk label/ringkasan, bebas-PPN untuk
  // default pajak. Saat cache siap DAN pemilihan baru saja terjadi, default
  // pajaknya diterapkan; draf yang dipulihkan hanya mendapat labelnya.
  useEffect(() => {
    const id = draft.customer.mode === "existing" ? draft.customer.id : null;
    if (id == null) return;
    const cached = customerInfo[id];
    if (cached) {
      if (pendingTaxCustomerId.current === id) {
        pendingTaxCustomerId.current = null;
        patch((d) => {
          if (d.customer.mode !== "existing" || d.customer.id !== id) return d;
          const tax = defaultInvoiceTax({
            currency: d.invoice.currency,
            customerTaxExempt: cached.taxExempt,
          });
          return { ...d, invoice: { ...d.invoice, taxable: tax.taxable, taxRate: tax.taxRate } };
        });
      }
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await apiFetch(`/api/customers/${id}`);
      if (!res.ok || cancelled) return;
      const c = (await res.json()) as { name: string; taxExempt?: boolean };
      if (cancelled) return;
      setCustomerInfo((m) => ({
        ...m,
        [id]: { name: c.name, taxExempt: Boolean(c.taxExempt) },
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.customer.mode, draft.customer.id, customerInfo, patch]);

  // Label penerima barang terpilih — untuk pemilih & draf yang dipulihkan.
  useEffect(() => {
    const id = draft.delivery.consigneeId;
    if (id == null || consigneeInfo[id]) return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch(`/api/consignees/${id}`);
      if (!res.ok || cancelled) return;
      const c = (await res.json()) as { name: string; country: string | null };
      if (cancelled) return;
      setConsigneeInfo((m) => ({ ...m, [id]: { name: c.name, country: c.country ?? null } }));
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.delivery.consigneeId, consigneeInfo]);

  const selectedCustomerId =
    draft.customer.mode === "existing" ? draft.customer.id : null;
  const selectedCustomer =
    selectedCustomerId != null ? customerInfo[selectedCustomerId] : undefined;
  const selectedConsignee =
    draft.delivery.consigneeId != null
      ? consigneeInfo[draft.delivery.consigneeId]
      : undefined;

  const itemOptions: SearchableOption[] = items.map((i) => ({
    value: String(i.id),
    label: i.name,
    description: t("common.stockOption", { qty: formatNumber(i.currentStock), unit: i.unit || "kg" }),
  }));

  const currency = draft.invoice.currency;

  /** Ambil baris dari sisa kontrak sumber (#15) — bukan diketik ulang. */
  function pullFromContract() {
    if (!outstanding) return;
    const lines = outstanding.pull.contract;
    if (lines.length === 0) {
      setPullNote(t("sales.pullNoneContract"));
      return;
    }
    const byName = new Map(items.map((i) => [normalizeItemName(i.name), i]));
    patch((d) => ({
      ...d,
      lines: lines.map((l) => {
        const master = byName.get(normalizeItemName(l.itemName));
        return {
          ...emptySalesLine(),
          itemId: master?.id ?? null,
          itemName: l.itemName,
          quantity: l.quantity,
          price: l.price,
          unit: l.unit || master?.unit || "kg",
        };
      }),
      invoice: { ...d.invoice, currency: outstanding.contract.currency },
    }));
    setPullNote(
      t("sales.pullNote", {
        count: lines.length,
        contractNo: outstanding.contract.contractNo,
      })
    );
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/wizard/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSalesPayload(draft)),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string; step?: SalesStepId; details?: unknown }
        | null;
      // Galat lapangan dimanusiakan lewat mesin yang sama dengan formulir biasa
      // (#4) — `details` dari server memang berbentuk `z.flatten()`. Lompatan ke
      // langkah yang benar datang dari `step`, bukan dari peta bagian formulir.
      const failure = resolveSubmitFailure(
        "faktur",
        data,
        humanizeFieldMessage(null, data?.error ?? t("sales.saveFailed"))
      );
      setError(failure.message);
      setBusy(false);
      if (data?.step) setStepId(data.step);
      return;
    }

    const created = (await res.json()) as SalesResult;
    clear();
    setResult(created);
    setBusy(false);
    router.refresh();
  }

  function cancel() {
    clear();
    router.push("/invoices");
  }

  /**
   * Daftar ringkasan bergaris pemisah — pengganti `divide-y divide-border`,
   * yang tidak punya padanan gaya sebaris (tidak ada selektor `> * + *`).
   * Garisnya dipasang per baris mulai baris KEDUA, jadi hasilnya identik dan
   * baris yang dirender bersyarat tidak meninggalkan garis menggantung.
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

  /** Isian angka — rata kanan + `tabular-nums` (kuantitas maupun harga). */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  /** Pasangan keterangan-kecil + nilai tebal di ujung kanan sebuah baris. */
  const rightStat = (caption: string, value: React.ReactNode) => (
    <div style={{ marginInlineStart: "auto", textAlign: "right" }}>
      <Typography.Text
        type="secondary"
        style={{ display: "block", fontSize: token.fontSizeSM }}
      >
        {caption}
      </Typography.Text>
      <span
        style={{ fontWeight: token.fontWeightStrong, fontVariantNumeric: "tabular-nums" }}
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

  // ── Layar selesai ────────────────────────────────────────────────────────
  if (result) {
    return (
      <Card>
        <CardContent style={{ paddingBlock: token.paddingLG }}>
          <Flex align="flex-start" gap={token.marginSM}>
            {/* Ikon centang memakai warna "uang positif" (#186) — anak tangga
                yang sudah diukur lolos 4,5:1 di kedua tema. Ia penanda KEDUA;
                yang pertama adalah judulnya sendiri. */}
            <CheckCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSizeHeading3, flexShrink: 0, marginTop: 2, color: token.colorMoneyPositive }} />
            <div style={{ minWidth: 0 }}>
              <Typography.Title level={2} style={{ fontSize: token.fontSizeLG, marginTop: 0 }}>
                {t("sales.savedTitle")}
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginTop: token.marginXXS }}>
                {t("sales.savedHint")}
              </Typography.Paragraph>
              <div style={{ marginTop: token.margin }}>
                {summaryList([
                  result.customerName ? (
                    <WizardSummaryRow
                      key="customer"
                      label={t("sales.rowCustomer")}
                      value={result.customerName}
                    />
                  ) : null,
                  result.deliveryOrder ? (
                    <WizardSummaryRow
                      key="do"
                      label={t("sales.rowDeliveryOrder")}
                      value={
                        <Link
                          href={`/delivery-orders/${result.deliveryOrder.id}`}
                          style={{ color: token.colorLink }}
                        >
                          {result.deliveryOrder.no}
                        </Link>
                      }
                    />
                  ) : null,
                  <WizardSummaryRow
                    key="invoice"
                    label={t("sales.rowInvoice")}
                    value={
                      <Link
                        href={`/invoices/${result.invoice.id}`}
                        style={{ color: token.colorLink }}
                      >
                        {result.invoice.invoiceNo}
                      </Link>
                    }
                    strong
                  />,
                ])}
              </div>
              {/* Kabar persetujuan: `Alert` berjenis peringatan — ikonnya
                  penanda non-warna, `role="status"` tetap milik kita. */}
              {result.approval && (
                <div role="status" style={{ marginTop: token.margin }}>
                  <Alert type="warning" showIcon message={result.approval.message} />
                </div>
              )}
              <Flex wrap gap={token.marginSM} style={{ marginTop: token.marginLG }}>
                {/*
                  `<ButtonLink>`, bukan `<Button href>` — alasan yang sama persis
                  dengan kembarannya di `purchases/new/purchase-wizard.tsx`, dan
                  ditulis di sini juga supaya keduanya tidak menyimpang: draf
                  sudah dihapus `clear()`, tujuannya rute lain (jadi wisaya ini
                  dilepas oleh navigasi mana pun), dan `router.refresh()` setelah
                  simpan hanya berarti sesuatu bagi navigasi sisi-klien. Jalur
                  sebelahnya (`cancel()` -> `router.push("/invoices")`) pun sudah
                  sisi-klien.

                  Tautan teks ke faktur yang sama, beberapa baris di atas, tetap
                  `<Link>`: ia bukan tombol, jadi ia tidak pernah menjadi sarang.
                */}
                <ButtonLink href={`/invoices/${result.invoice.id}`} variant="primary">
                  {t("sales.viewInvoice")}
                </ButtonLink>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setResult(null);
                    setStepId("pelanggan");
                    setDraft(emptySalesDraft(todayISO()));
                    setOutstanding(null);
                    setPullNote("");
                  }}
                >
                  {t("sales.recordAnother")}
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
      steps={SALES_STEPS}
      currentId={stepId}
      onNavigate={(id) => {
        dismissNotice();
        setStepId(id as SalesStepId);
      }}
      blockers={blockers}
      onFinish={finish}
      onCancel={cancel}
      busy={busy}
      error={error}
      notice={notice}
      finishLabel={t("common.finishAndSave")}
    >
      {/* ── 1. Pelanggan ──────────────────────────────────────────────── */}
      {stepId === "pelanggan" && (
        <WizardPartnerStep
          kind="customer"
          fetchUrl="/api/customers?active=1&picker=1"
          initialOption={
            selectedCustomerId != null && selectedCustomer
              ? {
                  value: String(selectedCustomerId),
                  label: selectedCustomer.name,
                  ...(selectedCustomer.taxExempt ? { hint: t("sales.taxExempt") } : {}),
                }
              : null
          }
          value={draft.customer}
          withCustomerFields
          manageHref="/customers"
          onChange={(values) => {
            // Bebas-PPN pelanggan yang baru dipilih datang menyusul dari
            // endpoint detail — efek `customerInfo` yang menerapkannya.
            if (values.id !== undefined) pendingTaxCustomerId.current = values.id;
            patch((d) => {
              const customer = { ...d.customer, ...values };
              // Pelanggan bebas PPN → tagihannya default tanpa PPN (#16).
              const exempt =
                customer.mode === "new"
                  ? customer.taxExempt
                  : customer.id != null
                    ? (customerInfo[customer.id]?.taxExempt ?? false)
                    : false;
              const tax = defaultInvoiceTax({
                currency: d.invoice.currency,
                customerTaxExempt: exempt,
              });
              return {
                ...d,
                customer,
                invoice: { ...d.invoice, taxable: tax.taxable, taxRate: tax.taxRate },
              };
            });
          }}
        />
      )}

      {/* ── 2. Barang & harga ─────────────────────────────────────────── */}
      {stepId === "barang" && (
        <>
          <Card style={{ marginBottom: token.marginLG }}>
            <CardHeader>
              <CardTitle>
                <TermTooltip term="kontrak">{t("sales.pullTitle")}</TermTooltip>
              </CardTitle>
              <Typography.Text
                type="secondary"
                style={{ display: "block", marginTop: token.marginXXS }}
              >
                {t("sales.pullDescription")}
              </Typography.Text>
            </CardHeader>
            <CardContent>
              <div style={twoColumnGrid(token.margin)}>
                {/* Mencari ke server (audit: daftar statis `take: 300`).
                    Sisa & label kontrak terpilih datang dari endpoint
                    `outstanding` yang sama seperti sebelumnya. */}
                <ServerSearchableSelect
                  id="contractId"
                  label={t("sales.contractSource")}
                  placeholder={t("invoices.pickContract")}
                  searchPlaceholder={t("invoices.searchContract")}
                  emptyText={t("invoices.noContractMatch")}
                  fetchUrl="/api/contracts?picker=1"
                  initialOption={
                    outstanding != null &&
                    draft.contractId != null &&
                    outstanding.contract.id === draft.contractId
                      ? {
                          value: String(outstanding.contract.id),
                          label: outstanding.contract.contractNo,
                          hint: `${outstanding.contract.buyer} · ${outstanding.contract.currency}`,
                        }
                      : null
                  }
                  value={draft.contractId != null ? String(draft.contractId) : null}
                  onChange={(v) => {
                    setPullNote("");
                    patch((d) => ({ ...d, contractId: v == null ? null : Number(v) }));
                  }}
                />
                <Flex align="flex-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!outstanding || outstanding.pull.contract.length === 0}
                    onClick={pullFromContract}
                  >
                    {/* Jarak ikon–teks dari `iconGap` `.ant-btn`. */}
                    <DownloadOutlined aria-hidden="true" /> {t("invoices.pullContractRemainder")}
                  </Button>
                </Flex>
              </div>
              {pullNote && (
                <Typography.Paragraph
                  type="secondary"
                  style={{
                    margin: 0,
                    marginTop: token.marginSM,
                    fontSize: token.fontSizeSM,
                  }}
                >
                  {pullNote}
                </Typography.Paragraph>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
                <CardTitle>{t("sales.goodsSoldTitle")}</CardTitle>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => patch((d) => ({ ...d, lines: [...d.lines, emptySalesLine()] }))}
                >
                  <PlusOutlined aria-hidden="true" /> {t("common.addItemLower")}
                </Button>
              </Flex>
            </CardHeader>
            <CardContent>
              <Flex vertical gap={token.margin}>
              {draft.lines.map((line, i) => {
                const sisa = contractRemainingKg?.get(normalizeItemName(line.itemName));
                const over = sisa != null && line.quantity > sisa;
                return (
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
                        id={`itemName-${i}`}
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
                        {microLabel(`quantity-${i}`, t("sales.quantityKg"))}
                        {/* KUANTITAS (`Decimal(15,3)`) — `step="0.001"` dan
                            tanpa topeng rupiah. */}
                        <TextInput
                          id={`quantity-${i}`}
                          type="number"
                          min={0}
                          step="0.001"
                          style={numberStyle}
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                        />
                      </div>
                      <div style={{ flex: `1 1 ${QTY_COL_BASIS}px`, maxWidth: 200 }}>
                        {microLabel(`price-${i}`, t("sales.pricePerKgCurrency", { currency }))}
                        <TextInput
                          id={`price-${i}`}
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
                            lines:
                              d.lines.length > 1 ? d.lines.filter((_, x) => x !== i) : d.lines,
                          }))
                        }
                        disabled={draft.lines.length === 1}
                        aria-label={t("common.removeItemRow", { n: i + 1 })}
                        style={{ color: token.colorError }}
                      >
                        <DeleteOutlined aria-hidden="true" />
                      </Button>
                    </Flex>
                    {/* Kalimatnya yang membawa makna; warnanya penanda kedua. */}
                    <Typography.Paragraph
                      style={{
                        margin: 0,
                        marginTop: token.marginXS,
                        fontSize: token.fontSizeSM,
                      }}
                    >
                      {line.itemId == null ? (
                        <span style={{ color: token.colorMoneyPending }}>
                          {t("sales.lineNoStockItem")}
                        </span>
                      ) : (
                        <span
                          style={{
                            color: over ? token.colorMoneyNegative : token.colorTextSecondary,
                            fontWeight: over ? token.fontWeightStrong : undefined,
                          }}
                        >
                          {sisa == null
                            ? t("sales.lineStock", {
                                stock: formatNumber(itemById.get(line.itemId)?.currentStock ?? 0),
                              })
                            : over
                              ? t("sales.lineStockAndRemainingOver", {
                                  stock: formatNumber(
                                    itemById.get(line.itemId)?.currentStock ?? 0
                                  ),
                                  remaining: formatNumber(sisa),
                                })
                              : t("sales.lineStockAndRemaining", {
                                  stock: formatNumber(
                                    itemById.get(line.itemId)?.currentStock ?? 0
                                  ),
                                  remaining: formatNumber(sisa),
                                })}
                        </span>
                      )}
                    </Typography.Paragraph>
                  </div>
                );
              })}

              <dl
                style={{
                  margin: 0,
                  borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  paddingTop: token.paddingSM,
                }}
              >
                <WizardSummaryRow
                  label={t("sales.orderValue")}
                  value={formatCurrency(salesOrderValue(draft), currency)}
                  strong
                />
              </dl>
              </Flex>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── 3. Surat jalan (opsional) ─────────────────────────────────── */}
      {stepId === "pengiriman" && (
        <Card>
          <CardContent>
            <Flex vertical gap={token.margin}>
            {/* Kotak pilihan "buat surat jalan". Tetap `<label>` telanjang:
                `Checkbox` primitif tidak menerima blok penjelas dua baris di
                dalamnya, dan seluruh kotak memang harus bisa ditekan. */}
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
                checked={draft.delivery.include}
                onCheckedChange={(v) =>
                  patch((d) => {
                    const checked = v === true;
                    const next = {
                      ...d,
                      delivery: { ...d.delivery, include: checked },
                    };
                    return checked ? fillDeliveryFromOrder(next) : next;
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
                  <TruckOutlined aria-hidden="true" style={{ color: token.colorIcon }} />
                  {t("sales.shipCheckboxA")}{" "}
                  <TermTooltip term="surat_jalan">{t("sales.shipTerm")}</TermTooltip>
                </span>
                <Typography.Text
                  type="secondary"
                  style={{ display: "block", marginTop: token.marginXXS }}
                >
                  {t("sales.shipCheckboxHint")}
                </Typography.Text>
              </span>
            </label>

            {draft.delivery.include && (
              <>
                <div style={twoColumnGrid(token.margin)}>
                  <Input
                    id="deliveryDate"
                    type="date"
                    label={t("sales.shipDate")}
                    value={draft.delivery.date}
                    onChange={(e) =>
                      patch((d) => ({ ...d, delivery: { ...d.delivery, date: e.target.value } }))
                    }
                    required
                  />
                  <ServerSearchableSelect
                    id="consigneeId"
                    label={t("sales.consigneeOptional")}
                    placeholder={t("sales.pickConsignee")}
                    searchPlaceholder={t("sales.searchConsignee")}
                    emptyText={t("sales.noConsigneeMatch")}
                    fetchUrl="/api/consignees?active=1&picker=1"
                    initialOption={
                      draft.delivery.consigneeId != null && selectedConsignee
                        ? {
                            value: String(draft.delivery.consigneeId),
                            label: selectedConsignee.name,
                            hint: selectedConsignee.country ?? undefined,
                          }
                        : null
                    }
                    value={
                      draft.delivery.consigneeId != null
                        ? String(draft.delivery.consigneeId)
                        : null
                    }
                    onChange={(v) =>
                      patch((d) => ({
                        ...d,
                        delivery: {
                          ...d.delivery,
                          consigneeId: v == null ? null : Number(v),
                        },
                      }))
                    }
                  />
                </div>

                {items.length === 0 ? (
                  <EmptyState
                    icon={<ContainerOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
                    title={t("common.emptyStockTitle")}
                    description={t("sales.emptyStockDescription")}
                    actionLabel={canUpdateStock ? t("common.addRemoveStock") : undefined}
                    actionHref={canUpdateStock ? "/inventory/update" : undefined}
                  />
                ) : (
                  <Flex vertical gap={token.marginSM}>
                    {draft.lines.map((line, i) => {
                      const master = line.itemId != null ? itemById.get(line.itemId) : null;
                      const kg = shipKg(line);
                      const overOrder = kg > line.quantity;
                      const overStock = master != null && kg > master.currentStock;
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
                              checked={line.ship}
                              disabled={line.itemId == null}
                              onCheckedChange={(v) =>
                                updateLine(i, {
                                  ship: v === true,
                                  shipKgPerBag:
                                    line.shipKgPerBag > 0 ? line.shipKgPerBag : line.quantity,
                                  shipBags: line.shipBags > 0 ? line.shipBags : 1,
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
                              {t("sales.ordered", { qty: formatNumber(line.quantity) })}
                            </Typography.Text>
                            {line.itemId == null && (
                              <Badge variant="warning">{t("common.notInStockList")}</Badge>
                            )}
                          </label>

                          {line.ship && (
                            <>
                              <Flex
                                wrap
                                align="flex-end"
                                gap={token.marginSM}
                                style={{ marginTop: token.marginSM }}
                              >
                                <div style={{ flex: `1 1 ${QTY_COL_BASIS}px`, maxWidth: 200 }}>
                                  {microLabel(`shipBags-${i}`, t("sales.shipBags"))}
                                  <TextInput
                                    id={`shipBags-${i}`}
                                    type="number"
                                    min={0}
                                    style={numberStyle}
                                    value={line.shipBags}
                                    onChange={(e) =>
                                      updateLine(i, { shipBags: Number(e.target.value) })
                                    }
                                  />
                                </div>
                                <div style={{ flex: `1 1 ${QTY_COL_BASIS}px`, maxWidth: 200 }}>
                                  {microLabel(`shipKgPerBag-${i}`, t("sales.shipKgPerBag"))}
                                  {/* KUANTITAS `Decimal(15,3)` — desimalnya utuh. */}
                                  <TextInput
                                    id={`shipKgPerBag-${i}`}
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    style={numberStyle}
                                    value={line.shipKgPerBag}
                                    onChange={(e) =>
                                      updateLine(i, { shipKgPerBag: Number(e.target.value) })
                                    }
                                  />
                                </div>
                                {rightStat(t("sales.totalShipped"), `${formatNumber(kg)} kg`)}
                              </Flex>
                              <Typography.Paragraph
                                style={{
                                  margin: 0,
                                  marginTop: token.marginXS,
                                  fontSize: token.fontSizeSM,
                                }}
                              >
                                <span
                                  style={{
                                    color:
                                      overOrder || overStock
                                        ? token.colorMoneyNegative
                                        : token.colorTextSecondary,
                                    fontWeight:
                                      overOrder || overStock ? token.fontWeightStrong : undefined,
                                  }}
                                >
                                  {overStock && overOrder
                                    ? t("sales.shipStockOverBoth", {
                                        stock: formatNumber(master?.currentStock ?? 0),
                                      })
                                    : overStock
                                      ? t("sales.shipStockOverStock", {
                                          stock: formatNumber(master?.currentStock ?? 0),
                                        })
                                      : overOrder
                                        ? t("sales.shipStockOverOrder", {
                                            stock: formatNumber(master?.currentStock ?? 0),
                                          })
                                        : t("sales.lineStock", {
                                            stock: formatNumber(master?.currentStock ?? 0),
                                          })}
                                </span>
                              </Typography.Paragraph>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </Flex>
                )}

                <DisclosureSection
                  description={t("sales.deliveryAdvancedDescription")}
                  summary={
                    [draft.delivery.vehicleNo, draft.delivery.containerNo]
                      .filter(Boolean)
                      .join(" · ") || t("common.notEntered")
                  }
                >
                  <div style={twoColumnGrid(token.margin)}>
                    <Input
                      id="vehicleNo"
                      label={t("sales.vehicleNo")}
                      value={draft.delivery.vehicleNo}
                      onChange={(e) =>
                        patch((d) => ({
                          ...d,
                          delivery: { ...d.delivery, vehicleNo: e.target.value },
                        }))
                      }
                      maxLength={50}
                    />
                    <Input
                      id="containerNo"
                      label={t("sales.containerNo")}
                      value={draft.delivery.containerNo}
                      onChange={(e) =>
                        patch((d) => ({
                          ...d,
                          delivery: { ...d.delivery, containerNo: e.target.value },
                        }))
                      }
                      maxLength={50}
                    />
                    <div style={{ gridColumn: "1 / -1" }}>
                      <Input
                        id="deliveryNotes"
                        label={t("common.notes")}
                        value={draft.delivery.notes}
                        onChange={(e) =>
                          patch((d) => ({
                            ...d,
                            delivery: { ...d.delivery, notes: e.target.value },
                          }))
                        }
                        maxLength={2000}
                      />
                    </div>
                  </div>
                </DisclosureSection>
              </>
            )}
            </Flex>
          </CardContent>
        </Card>
      )}

      {/* ── 4. Tagihan ────────────────────────────────────────────────── */}
      {stepId === "faktur" && (
        <>
          <Card style={{ marginBottom: token.marginLG }}>
            <CardHeader>
              <CardTitle>
                <TermTooltip term="faktur">{t("sales.invoiceIdentityTitle")}</TermTooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={twoColumnGrid(token.margin)}>
                <Input
                  id="invoiceNo"
                  label={t("sales.invoiceNo")}
                  value={draft.invoice.invoiceNo}
                  onChange={(e) =>
                    patch((d) => ({ ...d, invoice: { ...d.invoice, invoiceNo: e.target.value } }))
                  }
                  maxLength={50}
                  required
                />
                <Input
                  id="date"
                  type="date"
                  label={t("sales.invoiceDate")}
                  value={draft.invoice.date}
                  onChange={(e) =>
                    patch((d) => ({ ...d, invoice: { ...d.invoice, date: e.target.value } }))
                  }
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card style={{ marginBottom: token.marginLG }}>
            <CardHeader>
              <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
                <CardTitle>{t("sales.billedTitle")}</CardTitle>
                <Flex wrap gap={token.marginXS}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => patch((d) => applySalesPull(d, "order"))}
                  >
                    <DownloadOutlined aria-hidden="true" /> {t("sales.pullAll")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!draft.delivery.include}
                    onClick={() => patch((d) => applySalesPull(d, "delivery"))}
                  >
                    <DownloadOutlined aria-hidden="true" /> {t("sales.pullShipped")}
                  </Button>
                </Flex>
              </Flex>
              <Typography.Text
                type="secondary"
                style={{ display: "block", marginTop: token.marginXXS }}
              >
                {t("sales.billedHint")}
              </Typography.Text>
            </CardHeader>
            <CardContent>
              <Flex vertical gap={token.marginSM}>
              {draft.lines.map((line, i) => (
                <Flex key={i} wrap align="flex-end" gap={token.marginSM} style={rowBox}>
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: token.fontWeightStrong }}>
                      {line.itemName || t("common.rowN", { n: i + 1 })}
                    </span>
                    <Typography.Text
                      type="secondary"
                      style={{ display: "block", fontSize: token.fontSizeSM }}
                    >
                      {t("sales.lineOrderedShipped", {
                        ordered: formatNumber(line.quantity),
                        shipped: formatNumber(shipKg(line)),
                        price: formatCurrency(line.price, currency),
                      })}
                    </Typography.Text>
                  </div>
                  <div style={{ flex: `1 1 ${QTY_COL_BASIS}px`, maxWidth: 200 }}>
                    {microLabel(`billQuantity-${i}`, t("sales.billedKg"))}
                    {/* KUANTITAS `Decimal(15,3)` — desimalnya utuh, tanpa "Rp". */}
                    <TextInput
                      id={`billQuantity-${i}`}
                      type="number"
                      min={0}
                      step="0.001"
                      style={numberStyle}
                      value={line.billQuantity}
                      onChange={(e) => updateLine(i, { billQuantity: Number(e.target.value) })}
                    />
                  </div>
                  {rightStat(
                    t("sales.lineValueShort"),
                    formatCurrency(line.billQuantity * line.price, currency)
                  )}
                </Flex>
              ))}

              <dl
                style={{
                  margin: 0,
                  borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  paddingTop: token.paddingSM,
                }}
              >
                <WizardSummaryRow
                  label={t("sales.subtotalDpp")}
                  value={formatCurrency(salesInvoiceSubtotal(draft), currency)}
                />
                <WizardSummaryRow
                  label={<TermTooltip term="ppn">{t("common.vat")}</TermTooltip>}
                  value={formatCurrency(salesInvoiceTax(draft), currency)}
                />
                <WizardSummaryRow
                  label={t("sales.invoiceTotal")}
                  value={formatCurrency(salesInvoiceTotal(draft), currency)}
                  strong
                />
              </dl>
              </Flex>
            </CardContent>
          </Card>

          <DisclosureSection
            description={t("sales.invoiceAdvancedDescription")}
            summary={[
              currency === "IDR"
                ? t("common.rupiahIdr")
                : t("invoices.advCurrencyForeign", {
                    currency,
                    rate: draft.invoice.rate > 0 ? draft.invoice.rate : t("common.notEntered"),
                  }),
              draft.invoice.taxable
                ? t("invoices.advTaxOn", { rate: draft.invoice.taxRate })
                : t("invoices.advTaxOff"),
              draft.invoice.dueDate
                ? t("invoices.advDueDate", { date: draft.invoice.dueDate })
                : t("invoices.advNoDueDate"),
            ].join(" · ")}
          >
            <div style={twoColumnGrid(token.margin)}>
              <DueDateField
                value={draft.invoice.dueDate}
                onChange={(v) => patch((d) => ({ ...d, invoice: { ...d.invoice, dueDate: v } }))}
              />
              <div>
                <Label htmlFor="currency" style={{ marginBottom: token.marginXXS }}>
                  {t("common.currencyField")}
                </Label>
                <SelectField
                  id="currency"
                  options={[
                    { value: "IDR", label: "IDR (Rupiah)" },
                    { value: "USD", label: "USD" },
                    { value: "CNY", label: "CNY" },
                  ]}
                  value={currency}
                  onChange={(e) =>
                    patch((d) => {
                      const next = e.target.value;
                      const tax = defaultInvoiceTax({ currency: next });
                      return {
                        ...d,
                        invoice: {
                          ...d.invoice,
                          currency: next,
                          taxable: tax.taxable,
                          taxRate: tax.taxRate,
                        },
                      };
                    })
                  }
                />
              </div>
              {/* Progressive disclosure valas: isian kurs HANYA dirender saat
                  mata uangnya bukan IDR — pasangan client dari aturan
                  "dokumen valas wajib membawa kursnya sendiri". Selnya ikut
                  hilang; kisi `auto-fit` menutup celahnya sendiri. */}
              {currency !== "IDR" && (
                <div>
                  <Label htmlFor="rate" style={{ marginBottom: token.marginXXS }}>
                    <TermTooltip term="kurs">{t("common.rateTerm")}</TermTooltip> 1 {currency}{" "}
                    {t("common.rateTo")}
                  </Label>
                  <TextInput
                    id="rate"
                    type="number"
                    min={0}
                    step="0.000001"
                    style={numberStyle}
                    value={draft.invoice.rate || ""}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        invoice: { ...d.invoice, rate: Number(e.target.value) },
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
                    checked={draft.invoice.taxable}
                    onCheckedChange={(v) =>
                      patch((d) => ({
                        ...d,
                        invoice: { ...d.invoice, taxable: v === true },
                      }))
                    }
                  />
                  {t("sales.vatChargeable")} <TermTooltip term="ppn">{t("common.vat")}</TermTooltip>
                </label>
                {draft.invoice.taxable && (
                  <div style={{ marginTop: token.marginXS, maxWidth: 160 }}>
                    {microLabel("taxRate", t("common.taxRatePercent"))}
                    <TextInput
                      id="taxRate"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      style={numberStyle}
                      value={draft.invoice.taxRate}
                      onChange={(e) =>
                        patch((d) => ({
                          ...d,
                          invoice: { ...d.invoice, taxRate: Number(e.target.value) },
                        }))
                      }
                    />
                  </div>
                )}
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
                key="customer"
                label={t("sales.rowCustomer")}
                value={
                  draft.customer.mode === "new"
                    ? t("sales.summaryNew", { name: draft.customer.name })
                    : (selectedCustomer?.name ?? "—")
                }
              />,
              draft.contractId != null ? (
                <WizardSummaryRow
                  key="contract"
                  label={t("sales.summaryContract")}
                  value={
                    outstanding?.contract.id === draft.contractId
                      ? outstanding.contract.contractNo
                      : `#${draft.contractId}`
                  }
                />
              ) : null,
              <WizardSummaryRow
                key="goods"
                label={t("sales.summaryGoods")}
                value={t("common.rowCount", {
                  count: draft.lines.filter((l) => l.itemName.trim()).length,
                })}
                hint={draft.lines
                  .filter((l) => l.itemName.trim())
                  .map((l) => `${l.itemName} ${formatNumber(l.quantity)} kg`)
                  .join(" · ")}
              />,
              <WizardSummaryRow
                key="delivery"
                label={t("sales.rowDeliveryOrder")}
                value={
                  draft.delivery.include ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: token.marginXXS,
                      }}
                    >
                      <TruckOutlined aria-hidden="true" style={{ color: token.colorIcon }} />
                      {formatNumber(draft.lines.reduce((s, l) => s + shipKg(l), 0))} kg
                    </span>
                  ) : (
                    t("sales.deliveryNotCreated")
                  )
                }
                hint={
                  draft.delivery.include
                    ? t("sales.deliveryHint", { date: draft.delivery.date })
                    : t("common.stockUnchanged")
                }
              />,
              <WizardSummaryRow
                key="invoice"
                label={
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: token.marginXXS,
                    }}
                  >
                    <FileTextOutlined aria-hidden="true" style={{ color: token.colorIcon }} />
                    {t("sales.summaryInvoice", { no: draft.invoice.invoiceNo })}
                  </span>
                }
                value={formatCurrency(salesInvoiceTotal(draft), currency)}
                hint={t("sales.invoiceHint", {
                  date: draft.invoice.date,
                  dpp: formatCurrency(salesInvoiceSubtotal(draft), currency),
                  tax: formatCurrency(salesInvoiceTax(draft), currency),
                })}
                strong
              />,
            ])}
            {/* Catatan kaki di bidang yang sedikit lebih pekat dari kartunya
                (`colorFillAlter`) — peran yang sama dengan `bg-muted` lama. */}
            <Typography.Paragraph
              type="secondary"
              style={{
                margin: 0,
                marginTop: token.margin,
                padding: token.paddingSM,
                borderRadius: token.borderRadius,
                background: token.colorFillAlter,
                fontSize: token.fontSizeSM,
              }}
            >
              {t("sales.summaryFooter")}
            </Typography.Paragraph>
          </CardContent>
        </Card>
      )}
    </Wizard>
  );
}
