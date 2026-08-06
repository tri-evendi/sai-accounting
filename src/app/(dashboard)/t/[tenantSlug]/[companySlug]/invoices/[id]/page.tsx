/**
 * Rincian Tagihan Penjualan — dikonversi ke token Ant Design pada issue #195.
 *
 * **Tetap server component**, jadi tanpa `antd` dan tanpa `theme.useToken()`.
 * Warna: primitif yang mewarnai dirinya sendiri (`Badge`, `Money`,
 * `StatusBadge`) + variabel `--ant-…` yang HANYA dipakai di dalam pohon
 * `<Card>` AntD. Peringatan "pembayaran belum berkurs" memakai ikon + kata,
 * bukan warna — aturan yang sama dengan `shared/aging.tsx`.
 *
 * Kaki tabel barang punya EMPAT baris (DPP, PPN, Total, dasar IDR). Sampai
 * issue #229 `StaticTable.summary` hanya menerima SATU baris, dan itulah
 * satu-satunya alasan tabel barang bertahan sebagai primitif JSX; sejak
 * `summary` menerima LARIK baris, ia ikut pindah. Perataan & warnanya lewat
 * `style`, jadi nol `className`.
 */

import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { Link } from "@/components/ui/app-link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-auth";
import { canEffective } from "@/lib/authz-effective";
import { DeleteDocumentButton } from "@/components/shared/delete-document-button";
import { EmptyState } from "@/components/ui/empty-state";
import { DollarCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, formatDateShort, formatCurrency, formatNumber } from "@/lib/utils";
import { toBase } from "@/lib/receivables";
import { PageHeader } from "@/components/ui/page-header";
import { InvoicePaymentSection } from "./payment-section";
import { InvoicePDFButtonWrapper } from "./pdf-button";
import { InvoiceAdvanceSection } from "./advance-section";
import { getAdvances, getAdvanceTargetState } from "@/lib/advances";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `marginXS` 8 · `marginXXS` 4 — token AntD sebagai angka,
 *  karena berkas ini tak boleh memanggil `theme.useToken()`. */
const SECTION_GAP = 24;
const INLINE_GAP = 8;
const TIGHT_GAP = 4;
/** Lebar dasar satu pasang istilah–nilai pada daftar info faktur. */
const INFO_BASIS = 240;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  const { id } = await params;
  const session = await requirePagePermission("invoice.read", params);
  const t = await getT();

  const invoice = await prisma.invoice.findUnique({
    where: { id: parseInt(id) },
    include: {
      items: true,
      payments: true,
      customer: true,
      /// issue #15 — kontrak sumber, untuk menautkan kembali ke rantai dokumen.
      contract: { select: { id: true, contractNo: true } },
      // Uang muka already compensated into this invoice (issue #26).
      advanceApplications: { include: { advance: true }, orderBy: { date: "asc" } },
    },
  });

  if (!invoice) notFound();

  // Sales advances this customer still has on account, plus what the invoice
  // still owes — both needed by the compensation panel. Only offered once the
  // invoice is linked to a customer: an advance belongs to a party, and without
  // one there is no way to know whose money this is.
  const [openAdvances, targetState] = await Promise.all([
    invoice.customerId
      ? getAdvances({ type: "sales", customerId: invoice.customerId, openOnly: true })
      : Promise.resolve([]),
    getAdvanceTargetState("invoice", invoice.id),
  ]);

  // Everything on this document is denominated in the invoice's own currency —
  // formatting it as IDR would misstate a USD/CNY invoice by the exchange rate.
  const currency = invoice.currency || "IDR";
  const isForeign = currency !== "IDR";
  const rate = invoice.rate != null ? Number(invoice.rate) : null;
  const taxAmount = Number(invoice.taxAmount ?? 0);
  // PPN as a first-class field (issue #16). A legacy row (taxable false but a
  // stored amount) still reads as taxed so its PPN row stays labelled.
  const taxable = invoice.taxable ?? taxAmount > 0;
  const taxRate = invoice.taxRate != null ? Number(invoice.taxRate) : null;
  const ppnLabel = taxable
    ? taxRate != null
      ? t("invoices.vatWithRate", { rate: taxRate })
      : t("invoices.vatOutput")
    : t("invoices.vatExport");

  const subtotal = invoice.items.reduce((sum, item) => {
    return sum + Number(item.quantity) * Number(item.price);
  }, 0);
  const totalValue = subtotal + taxAmount;
  const baseAmount =
    invoice.baseAmount != null
      ? Number(invoice.baseAmount)
      : rate != null
        ? totalValue * rate
        : isForeign
          ? null
          : totalValue;

  // Payments can be in a different currency from the invoice, so they only add
  // up in IDR base. A payment with no rate has no IDR value to add — count it
  // separately rather than folding a foreign amount in at face value.
  const paymentsWithoutRate = invoice.payments.filter(
    (p) => p.baseAmount == null && (p.currency || "IDR") !== "IDR"
  ).length;
  // Uang muka yang sudah dikompensasi (issue #26) ikut melunasi faktur ini,
  // jadi angka "Dibayar" menghitungnya juga — sama seperti /receivables dan
  // panel uang muka di bawah. Dinilai lewat `toBase` (base_amount dulu, IDR
  // 1:1, lalu amount×kurs); yang tanpa kurs TIDAK dijumlahkan mentah-mentah,
  // melainkan masuk hitungan peringatan "belum berkurs".
  const applicationBases = invoice.advanceApplications.map((a) => toBase(a));
  const applicationsWithoutRate = applicationBases.filter((b) => b == null).length;
  const unratedCount = paymentsWithoutRate + applicationsWithoutRate;
  const totalPaidBase =
    invoice.payments.reduce((sum, p) => {
      if (p.baseAmount != null) return sum + Number(p.baseAmount);
      return (p.currency || "IDR") === "IDR" ? sum + Number(p.amount) : sum;
    }, 0) + applicationBases.reduce((sum: number, b) => sum + (b ?? 0), 0);

  const paymentRows = invoice.payments.map((p) => ({
    id: p.id,
    date: formatDate(p.date),
    amount: Number(p.amount),
    currency: p.currency,
    note: p.note ?? "-",
  }));

  const paymentColumns: SaiColumns<(typeof paymentRows)[number]> = [
    { key: "date", dataIndex: "date", title: t("common.date"), align: "left" },
    {
      key: "amount",
      dataIndex: "amount",
      title: t("common.amount"),
      align: "right",
      render: (_v, row) => (
        <Money
          style={{ fontWeight: "var(--ant-font-weight-strong)" }}
          value={row.amount}
          currency={row.currency}
        />
      ),
    },
    {
      key: "note",
      dataIndex: "note",
      title: t("common.notes"),
      align: "left",
      render: (_v, row) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{row.note}</span>
      ),
    },
  ];

  const itemRows = invoice.items.map((item) => ({
    id: item.id,
    itemName: item.itemName,
    unit: item.unit || "-",
    quantity: Number(item.quantity),
    price: Number(item.price),
    total: Number(item.quantity) * Number(item.price),
  }));

  const itemColumns: SaiColumns<(typeof itemRows)[number]> = [
    { key: "itemName", dataIndex: "itemName", title: t("common.item"), align: "left" },
    {
      key: "unit",
      dataIndex: "unit",
      title: t("common.unit"),
      align: "left",
      render: (_v, row) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{row.unit}</span>
      ),
    },
    {
      // KUANTITAS (`Decimal(15,3)`) — id-ID dengan desimalnya utuh, tanpa "Rp".
      // 12,5 kg tidak boleh membulat jadi Rp 13.
      key: "quantity",
      dataIndex: "quantity",
      title: t("common.quantity"),
      align: "right",
      render: (_v, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.quantity)}</span>
      ),
    },
    {
      key: "price",
      dataIndex: "price",
      title: t("common.price"),
      align: "right",
      render: (_v, row) => <Money value={row.price} currency={currency} />,
    },
    {
      key: "total",
      dataIndex: "total",
      title: t("common.total"),
      align: "right",
      render: (_v, row) => (
        <Money
          style={{ fontWeight: "var(--ant-font-weight-strong)" }}
          value={row.total}
          currency={currency}
        />
      ),
    },
  ];

  /**
   * Kaki tabel barang: EMPAT baris (DPP, PPN, Total, dasar IDR). Sampai issue
   * #229 `StaticTable.summary` hanya menerima SATU baris, dan itulah satu-satunya
   * alasan tabel ini bertahan sebagai primitif JSX. `colSpan` menaruh labelnya
   * membentang di atas empat kolom pertama, rata kanan menempel pada angkanya.
   */
  const labelCell = (content: React.ReactNode) => ({
    content,
    colSpan: 4,
    align: "right" as const,
  });
  const mutedLabel: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };
  const strong: React.CSSProperties = { fontWeight: "var(--ant-font-weight-strong)" };
  /*
   * Kaki ini RINCIAN, bukan satu baris total: bawaan tebal milik `StaticTable`
   * dimatikan per baris, dan yang tebal hanya sel yang memang menyatakannya.
   */
  const plainRow: React.CSSProperties = { fontWeight: "normal" };

  const itemSummary = [
    {
      style: plainRow,
      cells: {
        itemName: labelCell(<span style={mutedLabel}>{t("invoices.dpp")}</span>),
        total: <Money value={subtotal} currency={currency} />,
      },
    },
    {
      style: plainRow,
      cells: {
        itemName: labelCell(<span style={mutedLabel}>{ppnLabel}</span>),
        total: <Money value={taxAmount} currency={currency} />,
      },
    },
    {
      // Garis tebal memisahkan rincian pajak dari angka yang ditagihkan.
      style: { ...plainRow, borderTop: "2px solid var(--ant-color-border-secondary)" },
      cells: {
        itemName: labelCell(
          <span style={strong}>{t("invoices.totalCurrency", { currency })}</span>
        ),
        total: <Money style={strong} value={totalValue} currency={currency} />,
      },
    },
    ...(isForeign
      ? [
          {
            style: plainRow,
            cells: {
              itemName: labelCell(<span style={mutedLabel}>{t("common.ledgerBaseIdr")}</span>),
              // Tanpa kurs, nilai dasarnya BELUM DIKETAHUI — ditulis dengan
              // kata, tidak pernah Rp 0.
              total:
                baseAmount != null ? (
                  <Money value={baseAmount} currency="IDR" />
                ) : (
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {t("common.rateMissing")}
                  </span>
                ),
            },
          },
        ]
      : []),
  ];

  /** Satu pasang istilah–nilai pada kartu "Informasi Faktur". */
  const infoItem = (label: React.ReactNode, value: React.ReactNode, wide = false) => (
    <div style={{ flex: wide ? "1 1 100%" : `1 1 ${INFO_BASIS}px`, minWidth: 0 }}>
      <dt
        style={{
          color: "var(--ant-color-text-secondary)",
          fontWeight: "var(--ant-font-weight-strong)",
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("invoices.breadcrumb"), href: "/invoices" },
          { label: invoice.invoiceNo },
        ]}
        title={t("invoices.detailTitle", { no: invoice.invoiceNo })}
        description={formatDate(invoice.date)}
        actions={
          <>
          <InvoicePDFButtonWrapper
            invoice={{
              invoiceNo: invoice.invoiceNo,
              date: invoice.date.toISOString(),
              status: invoice.status,
              currency,
              taxAmount,
              taxable,
              taxRate,
              pebNumber: invoice.pebNumber ?? null,
              pebDate: invoice.pebDate ? invoice.pebDate.toISOString() : null,
              exportNote: invoice.exportNote ?? null,
              customerName: invoice.customer?.name ?? null,
              items: invoice.items.map((i) => ({
                itemName: i.itemName,
                quantity: Number(i.quantity),
                price: Number(i.price),
                unit: i.unit,
              })),
              payments: invoice.payments.map((p) => ({
                date: p.date.toISOString(),
                amount: Number(p.amount),
                currency: p.currency,
                note: p.note,
              })),
            }}
          />
          <Link href={`/invoices/${id}/edit`}>
            <Button variant="secondary">{t("common.edit")}</Button>
          </Link>
          {/* Cermin izin `invoice.delete` yang dicek route DELETE-nya (issue #6). */}
          {(await canEffective(session.user, "invoice.delete")) && (
            <DeleteDocumentButton
              endpoint={`/api/invoices/${invoice.id}`}
              label={t("invoices.deleteLabel")}
              title={t("invoices.deleteTitle", { no: invoice.invoiceNo })}
              message={t("invoices.deleteMessage")}
              confirmPhrase={invoice.invoiceNo}
              redirectTo="/invoices"
            />
          )}
          <Link href="/invoices">
            <Button variant="ghost">{t("common.back")}</Button>
          </Link>
          </>
        }
      />

      {/* Invoice Info */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader><CardTitle>{t("invoices.infoTitle")}</CardTitle></CardHeader>
        <CardContent>
          {/* `sm:grid-cols-2` diganti baris yang membungkus sendiri: satu kolom
              di 375px, dua atau lebih begitu ruangnya ada. */}
          <dl
            style={{
              margin: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: SECTION_GAP - INLINE_GAP,
            }}
          >
            {infoItem(t("invoices.invoiceNo"), invoice.invoiceNo)}
            {infoItem(t("common.status"), <StatusBadge status={invoice.status} />)}
            {/* Jatuh tempo — penggerak status "Jatuh Tempo" di /receivables,
                jadi ditampilkan juga di sini. NULL = memang belum diisi. */}
            {infoItem(
              t("common.dueDate"),
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {invoice.dueDate ? (
                  formatDateShort(invoice.dueDate)
                ) : (
                  <span style={{ color: "var(--ant-color-text-secondary)" }}>
                    {t("common.notFilledIn")}
                  </span>
                )}
              </span>
            )}
            {infoItem(
              t("invoices.customer"),
              invoice.customer?.name ?? (
                <span style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("invoices.customerNotLinked")}
                </span>
              )
            )}
            {/* Dokumen berantai (issue #15) — kontrak yang faktur ini tarik. */}
            {infoItem(
              t("invoices.sourceContract"),
              invoice.contract ? (
                <Link
                  href={`/contracts/${invoice.contract.id}`}
                  style={{ color: "var(--ant-color-link)" }}
                >
                  {invoice.contract.contractNo}
                </Link>
              ) : (
                <span style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("invoices.standalone")}
                </span>
              )
            )}
            {infoItem(
              t("common.currency"),
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {currency}
                {isForeign && (
                  <span style={{ color: "var(--ant-color-text-secondary)" }}>
                    {" "}
                    {rate != null
                      ? t("invoices.rateSuffix", { rate: formatNumber(rate) })
                      : t("invoices.rateMissingSuffix")}
                  </span>
                )}
              </span>
            )}
            {/* Dokumen ekspor / PEB (issue #17) — only when captured. */}
            {invoice.pebNumber &&
              infoItem(
                t("invoices.pebNumber"),
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {invoice.pebNumber}
                  {invoice.pebDate && (
                    <span style={{ color: "var(--ant-color-text-secondary)" }}>
                      {" "}
                      · {formatDate(invoice.pebDate)}
                    </span>
                  )}
                </span>
              )}
            {invoice.exportNote && infoItem(t("invoices.exportNote"), invoice.exportNote, true)}
          </dl>
        </CardContent>
      </Card>

      {/* Items */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader><CardTitle>{t("invoices.goodsTitle")}</CardTitle></CardHeader>
        <StaticTable
          columns={itemColumns}
          rows={itemRows}
          rowKey={(row) => row.id}
          summary={itemSummary}
          /* Kaki tabel ini BUKAN baris total tebal: ia rincian, dan barisnya
             mengatur tebalnya sendiri. Garis pemisah dari isi tetap 1px —
             yang 2px hanya baris "Total". */
          summaryStyle={{ borderTopWidth: 1 }}
        />
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: INLINE_GAP,
            }}
          >
            <CardTitle>{t("invoices.paymentsTitle")}</CardTitle>
            <div style={{ textAlign: "right", color: "var(--ant-color-text-secondary)" }}>
              <div style={{ fontVariantNumeric: "tabular-nums" }}>
                {baseAmount != null
                  ? t("common.paidOf", {
                      paid: formatCurrency(totalPaidBase, "IDR"),
                      total: formatCurrency(baseAmount, "IDR"),
                    })
                  : t("common.paidOnly", { paid: formatCurrency(totalPaidBase, "IDR") })}
              </div>
              {/* Pembayaran & kompensasi tanpa kurs TIDAK ikut ditotal, dan
                  jumlah yang dikecualikan selalu disebut. Ikon + kata, bukan
                  warna — berkas ini tak bisa membaca token warna. */}
              {unratedCount > 0 && (
                <p
                  style={{
                    margin: 0,
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "flex-end",
                    gap: TIGHT_GAP,
                  }}
                >
                  <WarningOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  <small>{t("common.paymentsUnrated", { count: unratedCount })}</small>
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <StaticTable
          columns={paymentColumns}
          rows={paymentRows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<DollarCircleOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("invoices.emptyPaymentsTitle")}
              description={t("invoices.emptyPaymentsDescription")}
            />
          }
        />
        <CardContent>
          <InvoicePaymentSection invoiceId={invoice.id} />
        </CardContent>
      </Card>

      {/* Uang muka (issue #26) — the down-payment coming off this bill. */}
      <Card style={{ marginTop: SECTION_GAP }}>
        <CardHeader>
          <CardTitle>{t("invoices.advanceTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceAdvanceSection
            invoiceId={invoice.id}
            invoiceCurrency={currency}
            outstandingBase={targetState?.remainingBase ?? null}
            advances={openAdvances.map((a) => ({
              id: a.id,
              advanceNo: a.advanceNo,
              date: a.date.toISOString(),
              currency: a.currency,
              remaining: a.remaining,
              remainingBase: a.remainingBase,
              partyName: a.partyName,
            }))}
            applied={invoice.advanceApplications.map((a) => ({
              id: a.id,
              advanceNo: a.advance.advanceNo,
              date: a.date.toISOString(),
              amount: Number(a.amount),
              currency: a.currency,
              baseAmount: a.baseAmount == null ? null : Number(a.baseAmount),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
