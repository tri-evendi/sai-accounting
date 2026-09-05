/**
 * Rincian Kontrak — dikonversi ke token Ant Design pada issue #195 (fase C3).
 *
 * **Tetap server component**, dan itu yang menentukan bentuk berkas ini: `antd`
 * tidak boleh diimpor di sini (`tests/rsc-boundary.test.ts`), jadi tidak ada
 * `theme.useToken()`. Warna datang dari primitif yang mewarnai dirinya sendiri
 * (`Badge`, `Money`, `StatusBadge`, `Card`) dan dari variabel `--ant-…` yang
 * HANYA dipakai di dalam pohon sebuah komponen AntD — di app ini praktisnya
 * "di dalam `<Card>`". Di luar pohon itu variabelnya tidak teratasi dan warnanya
 * jatuh diam-diam ke warisan (lihat catatan panjang di `shared/aging.tsx`).
 *
 * Dua catatan supaya konversi ini tidak "diperbaiki" ke arah yang salah nanti:
 *
 *  • **Catatan peringatan tidak berwarna.** Baris "sebagian pengiriman tidak
 *    cocok dengan baris kontrak" dan "pembayaran tanpa kurs" dulu memakai
 *    `text-warning-strong`. Penandanya kini IKON + KATA, bukan warna — bentuk
 *    yang sama dipilih `aging.tsx`, dan aturan MASTER.md memang melarang warna
 *    menjadi penanda tunggal. Ia tetap terbaca kalau kelak dipindah ke luar
 *    kartu.
 *  • **Kuantitas bukan uang.** Kolom kg dan kolom bags/kg-per-bag memakai
 *    `tabular-nums` + `formatNumber` (id-ID), TANPA topeng rupiah: 12,5 kg
 *    tidak boleh dibaca sebagai Rp 13. Hanya kolom nilai yang lewat `Money`.
 */

import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { Link } from "@/components/ui/app-link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-auth";
import { canEffective } from "@/lib/authz-effective";
import { DeleteDocumentButton } from "@/components/shared/delete-document-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeductStockNotice } from "./deduct-stock-notice";
import { DocumentChainTimeline } from "@/components/shared/document-chain-timeline";
import { formatDate, formatDateShort, formatCurrency, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import {
  buildContractChain,
  loadContractChain,
  type ContractLineOutstanding,
} from "@/lib/document-chain";
import { EmptyState } from "@/components/ui/empty-state";
import { getT } from "@/lib/i18n/server";
import { ContainerOutlined, DollarCircleOutlined, FileDoneOutlined, TruckOutlined, WarningOutlined } from "@ant-design/icons";
import { ContractPaymentSection } from "./payment-section";
import { ContractPDFButtons } from "./pdf-buttons";

export const dynamic = "force-dynamic";

/**
 * Jarak yang tidak bisa dibaca dari token di berkas tanpa hook. Nilainya SAMA
 * dengan tokennya, disebut supaya #203 bisa menukarnya tanpa menebak:
 * `marginLG` 24, `marginSM` 12, `marginXS` 8, `marginXXS` 4.
 */
const SECTION_GAP = 24;
const CARD_GAP = 12;
const INLINE_GAP = 8;
const TIGHT_GAP = 4;
/** Lebar dasar satu kartu di baris "surat jalan & faktur". */
const PAIR_BASIS = 320;
/** Lebar dasar satu pasang istilah–nilai pada daftar info kontrak. */
const INFO_BASIS = 240;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** Padding baris daftar dokumen berantai. */
const LIST_ROW_PADDING = 8;

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  const { id } = await params;
  const session = await requirePagePermission("contract.read", params);
  const t = await getT();

  const contract = await prisma.contract.findUnique({
    where: { id: parseInt(id) },
    include: { items: true, payments: true, documents: true, consigneeRef: true },
  });

  if (!contract) notFound();

  // Master name wins when linked (issue #22); legacy free text is the fallback.
  const consigneeName = contract.consigneeRef?.name ?? contract.consignee ?? null;

  const totalValue = contract.items.reduce((sum, item) => {
    return sum + Number(item.bags) * Number(item.kgPerBag) * Number(item.pricePerKg);
  }, 0);

  const rate = contract.rate != null ? Number(contract.rate) : null;
  const isForeign = (contract.currency || "IDR") !== "IDR";
  const baseAmount =
    contract.baseAmount != null
      ? Number(contract.baseAmount)
      : rate != null
        ? totalValue * rate
        : isForeign
          ? null
          : totalValue;

  // Payments can be in a different currency from the contract, so they only add
  // up in IDR base. A payment with no rate has no IDR value to add — count it
  // separately rather than folding a foreign amount in at face value.
  const paymentsWithoutRate = contract.payments.filter(
    (p) => p.baseAmount == null && (p.currency || "IDR") !== "IDR"
  ).length;
  const totalPaidBase = contract.payments.reduce((sum, p) => {
    if (p.baseAmount != null) return sum + Number(p.baseAmount);
    return (p.currency || "IDR") === "IDR" ? sum + Number(p.amount) : sum;
  }, 0);

  // ── Dokumen berantai (issue #15) ──────────────────────────────────────────
  // Surat jalan and faktur that name this contract, plus the per-line outstanding
  // derived from them. Read-only; nothing here posts or values anything.
  const chain = await loadContractChain(prisma, contract.id);
  const { lines: outstandingLines, totals } = chain.outstanding;
  const stages = buildContractChain({
    contractStatus: contract.status,
    totals,
    deliveryOrderCount: chain.deliveryOrders.length,
    invoiceCount: chain.invoices.length,
    // Cash received FOR this contract: its own down payments plus payments made
    // against the faktur drawn from it. Both only add up in IDR base.
    paymentCount: contract.payments.length + chain.invoicePaymentCount,
    paidBase: totalPaidBase + chain.invoicePaidBase,
    contractBase: baseAmount,
  });

  /** Kolom KUANTITAS — id-ID, tabular-nums, rata kanan, TANPA mata uang. */
  const qty = (value: number, strong = false) => (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: strong ? "var(--ant-font-weight-strong)" : undefined,
      }}
    >
      {formatNumber(value)}
    </span>
  );

  const itemRows = contract.items.map((item) => ({
    id: item.id,
    itemName: item.itemName,
    bags: Number(item.bags),
    kgPerBag: Number(item.kgPerBag),
    pricePerKg: Number(item.pricePerKg),
    total: Number(item.bags) * Number(item.kgPerBag) * Number(item.pricePerKg),
  }));

  const itemColumns: SaiColumns<(typeof itemRows)[number]> = [
    { key: "itemName", dataIndex: "itemName", title: t("common.item"), align: "left" },
    // Bags & kg/bag adalah KUANTITAS (`Decimal(15,3)`) — id-ID dengan
    // desimalnya utuh, tanpa "Rp".
    {
      key: "bags",
      dataIndex: "bags",
      title: t("common.bags"),
      align: "right",
      render: (_v, row) => qty(row.bags),
    },
    {
      key: "kgPerBag",
      dataIndex: "kgPerBag",
      title: t("common.kgPerBag"),
      align: "right",
      render: (_v, row) => qty(row.kgPerBag),
    },
    {
      key: "pricePerKg",
      dataIndex: "pricePerKg",
      title: t("contracts.pricePerKg"),
      align: "right",
      render: (_v, row) => qty(row.pricePerKg),
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
          currency={contract.currency}
        />
      ),
    },
  ];

  /**
   * Kaki tabel barang: DUA baris — nilai kontrak, lalu nilai dasar buku besar
   * (IDR) untuk dokumen valas. `StaticTable.summary` menerima LARIK baris sejak
   * issue #229; sebelumnya ia satu baris per tabel, dan itulah satu-satunya
   * alasan tabel ini bertahan sebagai primitif JSX.
   */
  const itemSummary = [
    {
      cells: {
        itemName: {
          content: t("contracts.totalValue"),
          colSpan: 4,
          align: "right" as const,
        },
        total: (
          <Money
            style={{ fontWeight: "var(--ant-font-weight-strong)" }}
            value={totalValue}
            currency={contract.currency}
          />
        ),
      },
    },
    ...(isForeign
      ? [
          {
            style: { fontWeight: "normal" as const },
            cells: {
              itemName: {
                content: (
                  <span style={{ color: "var(--ant-color-text-secondary)" }}>
                    {t("common.ledgerBaseIdr")}
                  </span>
                ),
                colSpan: 4,
                align: "right" as const,
              },
              // Tanpa kurs, nilainya BELUM DIKETAHUI — dan itu ditulis dengan
              // kata, bukan Rp 0.
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

  const outstandingColumns: SaiColumns<ContractLineOutstanding> = [
    { key: "itemName", dataIndex: "itemName", title: t("common.item"), align: "left" },
    {
      key: "contractedKg",
      dataIndex: "contractedKg",
      title: t("contracts.colContractedKg"),
      align: "right",
      render: (_v, row) => qty(row.contractedKg),
    },
    {
      key: "deliveredKg",
      dataIndex: "deliveredKg",
      title: t("contracts.colDeliveredKg"),
      align: "right",
      render: (_v, row) => qty(row.deliveredKg),
    },
    {
      key: "invoicedKg",
      dataIndex: "invoicedKg",
      title: t("contracts.colInvoicedKg"),
      align: "right",
      render: (_v, row) => qty(row.invoicedKg),
    },
    {
      key: "remainingKg",
      dataIndex: "remainingKg",
      title: t("contracts.colRemainingKg"),
      align: "right",
      render: (_v, row) => qty(row.remainingKg, true),
    },
    {
      key: "remainingValue",
      dataIndex: "remainingValue",
      title: t("contracts.colRemainingValue"),
      align: "right",
      render: (_v, row) => (
        <Money value={row.remainingValue} currency={contract.currency} />
      ),
    },
    {
      key: "invoiceStatus",
      dataIndex: "invoiceStatus",
      title: t("contracts.colInvoiceStatus"),
      align: "left",
      render: (_v, row) => (
        <Badge
          variant={
            row.invoiceStatus === "selesai"
              ? "success"
              : row.invoiceStatus === "sebagian"
                ? "warning"
                : "default"
          }
        >
          {row.invoiceStatus === "selesai"
            ? t("contracts.invoicedFull")
            : row.invoiceStatus === "sebagian"
              ? t("contracts.invoicedPartial")
              : t("contracts.invoicedNone")}
        </Badge>
      ),
    },
  ];

  const paymentRows = contract.payments.map((p) => ({
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

  /** Satu pasang istilah–nilai pada kartu "Informasi Kontrak". */
  const infoItem = (label: React.ReactNode, value: React.ReactNode) => (
    <div style={{ flex: `1 1 ${INFO_BASIS}px`, minWidth: 0 }}>
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
      {/* Tombol aksi memakai `<ButtonLink>` (#289): SATU `<a class="ant-btn">`,
          bukan `<Link>` membungkus `<Button>` — dan tetap navigasi sisi-klien
          + prefetch, yang `<Button href>` justru membuang. */}
      <PageHeader
        breadcrumbs={[
          { label: t("contracts.breadcrumb"), href: "/contracts" },
          { label: contract.contractNo },
        ]}
        title={t("contracts.detailTitle", { no: contract.contractNo })}
        description={formatDate(contract.date)}
        actions={
          <>
          <ContractPDFButtons
            contract={{
              contractNo: contract.contractNo,
              date: contract.date.toISOString(),
              buyer: contract.buyer,
              consignee: consigneeName,
              packaging: contract.packaging,
              shipment: contract.shipment,
              top1: contract.top1,
              top2: contract.top2,
              currency: contract.currency,
              status: contract.status,
              items: contract.items.map((i) => ({
                itemName: i.itemName,
                bags: Number(i.bags),
                kgPerBag: Number(i.kgPerBag),
                pricePerKg: Number(i.pricePerKg),
              })),
              payments: contract.payments.map((p) => ({
                date: p.date.toISOString(),
                amount: Number(p.amount),
                currency: p.currency,
                note: p.note,
              })),
            }}
          />
          {/* Pola "Ambil" (issue #15): buka form faktur dengan kontrak ini terpilih,
              barisnya sudah terisi sisa yang belum difakturkan. */}
          {/* ── Utang potongan 2 (#267), dibayar di potongan 3 ──────────────
           *
           * Tombol ini dulu primer implisit dan BERTABRAKAN dengan submit
           * `shared/payment-form.tsx` yang dirender di halaman yang sama
           * lewat `payment-section.tsx`: begitu formulir pembayaran dibuka,
           * layar ini memikul dua blok biru dari dua berkas berbeda —
           * bentuk yang tidak satu pun penjaga bisa lihat (§Aksi utama per
           * layar: "primer yang datang dari komponen BERBEDA tetap satu
           * layar"). Potongan 2 mencatatnya alih-alih merapikannya diam-diam.
           *
           * Yang turun tombol INI, bukan submit pembayaran, karena "Buat
           * Faktur" adalah NAVIGASI ke formulir lain — dan navigasi tidak
           * memenuhi syarat aksi utama kecuali ia satu-satunya jalan maju.
           * Di sini ia bukan: mencatat pembayaran, menyunting, dan mencetak
           * PDF sama-sama tersedia. Submit pembayaran sebaliknya MENGIKAT.
           *
           * Hasilnya sama dengan `/invoices/[id]` di potongan 2: layar detail
           * ini NOL primer dalam keadaan bawaan (ia memang layar baca — rantai
           * dokumen, baris barang, riwayat pembayaran) dan TEPAT SATU saat
           * formulir pembayaran dibuka. */}
          <ButtonLink href={`/invoices/new?contractId=${contract.id}`} variant="secondary">
            {/* Jarak ikon–teks dari `iconGap` `.ant-btn`; ukurannya dari
                primitif `Button` (`ICON_SIZE`). */}
            <FileDoneOutlined aria-hidden="true" /> {t("contracts.createInvoice")}
          </ButtonLink>
          <ButtonLink href={`/contracts/${contract.id}/edit`} variant="secondary">
            {t("common.edit")}
          </ButtonLink>
          {/* Cermin izin `contract.delete` yang dicek route DELETE-nya (issue #6). */}
          {(await canEffective(session.user, "contract.delete")) && (
            <DeleteDocumentButton
              endpoint={`/api/contracts/${contract.id}`}
              label={t("contracts.deleteLabel")}
              title={t("contracts.deleteTitle", { no: contract.contractNo })}
              message={t("contracts.deleteMessage")}
              confirmPhrase={contract.contractNo}
              redirectTo="/contracts"
            />
          )}
          <ButtonLink href="/contracts" variant="ghost">
            {t("common.back")}
          </ButtonLink>
          </>
        }
      />

      {/*
        Stok belum dipotong (issue #491). Muncul HANYA saat kontraknya sudah
        difakturkan penuh tetapi masih ada kilo yang belum bersurat jalan —
        keadaan yang dikeluhkan pengguna: kontrak selesai, stok masih utuh, dan
        tak ada satu pun tanda yang mengatakan kenapa.

        Yang ditawarkan BUKAN pemotongan otomatis: stok tetap dipotong surat
        jalan, sebab kontrak yang ikut memotong akan membuat satu pengiriman
        terpotong dua kali. Keputusannya diserahkan ke pengguna, lewat jalur
        yang sudah teruji.
      */}
      {totals.remainingKg === 0 && totals.undeliveredKg > 0 && (
        <DeductStockNotice contractId={contract.id} undeliveredKg={totals.undeliveredKg} />
      )}

      {/* Rantai Dokumen — Kontrak → Surat Jalan → Faktur → Pembayaran (issue #15) */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader>
          <CardTitle level={2}>{t("contracts.chainTitle")}</CardTitle>
          <p
            style={{
              margin: 0,
              marginTop: "var(--ant-margin-xxs)",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            {t("contracts.chainDescription")}
          </p>
        </CardHeader>
        <CardContent>
          <DocumentChainTimeline stages={stages} />
        </CardContent>
      </Card>

      {/* Sisa per baris kontrak — dikirim & difakturkan vs sisa (issue #15) */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader>
          <CardTitle level={2}>{t("contracts.outstandingTitle")}</CardTitle>
          <p
            style={{
              margin: 0,
              marginTop: "var(--ant-margin-xxs)",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            {t("contracts.outstandingDescription")}
          </p>
        </CardHeader>
        <StaticTable
          columns={outstandingColumns}
          rows={outstandingLines}
          rowKey={(row) => row.key}
          empty={
            <EmptyState
              icon={<ContainerOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("contracts.emptyLinesTitle")}
              description={t("contracts.emptyLinesDescription")}
              actionLabel={t("contracts.emptyLinesAction")}
              actionHref={`/contracts/${contract.id}/edit`}
            />
          }
          summary={{
            itemName: t("common.total"),
            contractedKg: qty(totals.contractedKg),
            deliveredKg: qty(totals.deliveredKg),
            invoicedKg: qty(totals.invoicedKg),
            remainingKg: qty(totals.remainingKg),
            remainingValue: (
              <Money value={totals.remainingValue} currency={contract.currency} />
            ),
          }}
        />
        {(totals.unmatchedDeliveredKg > 0 || totals.unmatchedInvoicedKg > 0) && (
          <CardContent>
            {/* Penandanya IKON + KATA, bukan warna (MASTER.md §Anti-Patterns). */}
            <p
              style={{
                margin: 0,
                display: "flex",
                alignItems: "flex-start",
                gap: TIGHT_GAP,
              }}
            >
              <WarningOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <small>
                {totals.unmatchedDeliveredKg > 0 && totals.unmatchedInvoicedKg > 0
                  ? t("contracts.unmatchedBoth", {
                      delivered: formatNumber(totals.unmatchedDeliveredKg),
                      invoiced: formatNumber(totals.unmatchedInvoicedKg),
                    })
                  : totals.unmatchedDeliveredKg > 0
                    ? t("contracts.unmatchedDelivery", {
                        delivered: formatNumber(totals.unmatchedDeliveredKg),
                      })
                    : t("contracts.unmatchedInvoice", {
                        invoiced: formatNumber(totals.unmatchedInvoicedKg),
                      })}
              </small>
            </p>
          </CardContent>
        )}
      </Card>

      {/* Surat jalan & faktur yang menyebut kontrak ini (issue #15).
          Kedua kartu tumbuh membagi baris dan turun sendiri saat tak muat —
          menggantikan `lg:grid-cols-2`, yang patah pada satu lebar tetap. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: SECTION_GAP,
          marginBottom: SECTION_GAP,
        }}
      >
        <Card style={{ flex: `1 1 ${PAIR_BASIS}px`, minWidth: 0 }}>
          <CardHeader>
            <CardTitle level={2}
              style={{ display: "flex", alignItems: "center", gap: INLINE_GAP }}
            >
              <TruckOutlined aria-hidden style={{ color: "var(--ant-color-icon)" }} />
              {t("contracts.deliveryOrdersTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chain.deliveryOrders.length === 0 ? (
              <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
                {t("contracts.noDeliveryOrders")}{" "}
                <Link href="/delivery-orders/new" style={{ color: "var(--ant-color-link)" }}>
                  {t("contracts.createDeliveryOrderLink")}
                </Link>
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {chain.deliveryOrders.map((d, index) => (
                  <li
                    key={d.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: CARD_GAP,
                      paddingBlock: LIST_ROW_PADDING,
                      borderTop:
                        index === 0
                          ? undefined
                          : "var(--ant-line-width) solid var(--ant-color-border-secondary)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`/delivery-orders/${d.id}`}
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "var(--ant-color-link)",
                          fontWeight: "var(--ant-font-weight-strong)",
                        }}
                      >
                        {d.no}
                      </Link>
                      <small style={{ color: "var(--ant-color-text-secondary)" }}>
                        {formatDate(d.date)}
                      </small>
                    </div>
                    {/* Kilogram — kuantitas, jadi `formatNumber`, bukan `Money`. */}
                    <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {formatNumber(d.totalKg)} kg
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card style={{ flex: `1 1 ${PAIR_BASIS}px`, minWidth: 0 }}>
          <CardHeader>
            <CardTitle level={2}
              style={{ display: "flex", alignItems: "center", gap: INLINE_GAP }}
            >
              <FileDoneOutlined aria-hidden style={{ color: "var(--ant-color-icon)" }} />
              {t("contracts.invoicesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chain.invoices.length === 0 ? (
              <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
                {t("contracts.noInvoices")}{" "}
                <Link
                  href={`/invoices/new?contractId=${contract.id}`}
                  style={{ color: "var(--ant-color-link)" }}
                >
                  {t("contracts.createInvoiceLink")}
                </Link>
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {chain.invoices.map((inv, index) => (
                  <li
                    key={inv.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: CARD_GAP,
                      paddingBlock: LIST_ROW_PADDING,
                      borderTop:
                        index === 0
                          ? undefined
                          : "var(--ant-line-width) solid var(--ant-color-border-secondary)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`/invoices/${inv.id}`}
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "var(--ant-color-link)",
                          fontWeight: "var(--ant-font-weight-strong)",
                        }}
                      >
                        {inv.invoiceNo}
                      </Link>
                      <small style={{ color: "var(--ant-color-text-secondary)" }}>
                        {formatDate(inv.date)} ·{" "}
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {t("common.paidOnly", { paid: formatCurrency(inv.paidBase, "IDR") })}
                        </span>
                      </small>
                    </div>
                    <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {formatCurrency(inv.total, inv.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contract Info */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader>
          <CardTitle level={2}>{t("contracts.infoTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* `sm:grid-cols-2` diganti baris yang membungkus sendiri: satu kolom
              di 375px, dua atau lebih begitu ruangnya ada — tanpa titik patah
              yang harus ditebak. */}
          <dl
            style={{
              margin: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: SECTION_GAP - INLINE_GAP,
            }}
          >
            {infoItem(t("contracts.colBuyer"), contract.buyer)}
            {infoItem(
              t("contracts.colConsignee"),
              contract.consigneeRef ? (
                <Link
                  href={`/consignees/${contract.consigneeRef.id}`}
                  style={{ color: "var(--ant-color-link)" }}
                >
                  {contract.consigneeRef.name}
                </Link>
              ) : (
                consigneeName || "-"
              )
            )}
            {infoItem(t("common.status"), <StatusBadge status={contract.status} />)}
            {/* Jatuh tempo — penggerak status "Jatuh Tempo" di /receivables,
                jadi ditampilkan juga di sini. NULL = memang belum diisi. */}
            {infoItem(
              t("common.dueDate"),
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {contract.dueDate ? (
                  formatDateShort(contract.dueDate)
                ) : (
                  <span style={{ color: "var(--ant-color-text-secondary)" }}>
                    {t("common.notFilledIn")}
                  </span>
                )}
              </span>
            )}
            {infoItem(t("common.currency"), contract.currency)}
            {/* PPN kontrak (migrasi 0062). Tiga keadaan yang ditulis apa adanya
                — "belum dinyatakan" TIDAK dibulatkan menjadi "Non-PPN": kontrak
                warisan tidak pernah menyatakan apa pun, dan menampilkannya
                seolah-olah pernah adalah mengarang isi dokumen. */}
            {infoItem(
              t("contracts.taxableLabel"),
              contract.taxable == null ? (
                <span style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("contracts.taxableUnset")}
                </span>
              ) : (
                t(contract.taxable ? "contracts.taxableYes" : "contracts.taxableNo")
              )
            )}
            {infoItem(t("contracts.packaging"), contract.packaging || "-")}
            {infoItem(t("contracts.shipment"), contract.shipment || "-")}
            {infoItem(t("contracts.top1"), contract.top1 || "-")}
            {infoItem(t("contracts.top2"), contract.top2 || "-")}
          </dl>
        </CardContent>
      </Card>

      {/* Items. Pindah ke `StaticTable` di issue #229: kakinya punya DUA baris
          (nilai kontrak, lalu nilai dasar buku besar IDR untuk dokumen valas),
          dan `summary` kini menerima larik baris. Perataan & warna lewat
          `style`, jadi berkas ini tetap nol `className`. */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader>
          <CardTitle level={2}>{t("contracts.goodsTitle")}</CardTitle>
        </CardHeader>
        <StaticTable
          columns={itemColumns}
          rows={itemRows}
          rowKey={(row) => row.id}
          summary={itemSummary}
        />
      </Card>

      {/* Payments */}
      <Card style={{ marginBottom: SECTION_GAP }}>
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
            <CardTitle level={2}>{t("contracts.paymentsTitle")}</CardTitle>
            <div
              style={{ textAlign: "right", color: "var(--ant-color-text-secondary)" }}
            >
              <div style={{ fontVariantNumeric: "tabular-nums" }}>
                {baseAmount == null
                  ? t("common.paidOnly", { paid: formatCurrency(totalPaidBase, "IDR") })
                  : baseAmount > 0
                    ? t("contracts.paidWithPercent", {
                        percent: Math.round((totalPaidBase / baseAmount) * 100),
                        paid: formatCurrency(totalPaidBase, "IDR"),
                        total: formatCurrency(baseAmount, "IDR"),
                      })
                    : t("common.paidOf", {
                        paid: formatCurrency(totalPaidBase, "IDR"),
                        total: formatCurrency(baseAmount, "IDR"),
                      })}
              </div>
              {/* Pembayaran tanpa kurs TIDAK ikut ditotal, dan jumlah yang
                  dikecualikan selalu disebut. Ikon + kata, bukan warna. */}
              {paymentsWithoutRate > 0 && (
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
                  <small>{t("common.paymentsUnrated", { count: paymentsWithoutRate })}</small>
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
              title={t("contracts.emptyPaymentsTitle")}
              description={t("contracts.emptyPaymentsDescription")}
            />
          }
        />
        {/* Add Payment Form */}
        <CardContent>
          <ContractPaymentSection
            contractId={contract.id}
            documentCurrency={contract.currency || "IDR"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
