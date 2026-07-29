import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-auth";
import { canEffective } from "@/lib/authz-effective";
import { DeleteDocumentButton } from "@/components/shared/delete-document-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { DocumentChainTimeline } from "@/components/shared/document-chain-timeline";
import { formatDate, formatDateShort, formatCurrency, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { buildContractChain, loadContractChain } from "@/lib/document-chain";
import { EmptyState } from "@/components/ui/empty-state";
import { getT } from "@/lib/i18n/server";
import { Banknote, Package, Receipt, Truck } from "lucide-react";
import { ContractPaymentSection } from "./payment-section";
import { ContractPDFButtons } from "./pdf-buttons";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePagePermission("contract.read");
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

  return (
    <div className="w-full">
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
          <Link href={`/invoices/new?contractId=${contract.id}`}>
            <Button>
              <Receipt className="mr-1 h-4 w-4" aria-hidden /> {t("contracts.createInvoice")}
            </Button>
          </Link>
          <Link href={`/contracts/${contract.id}/edit`}>
            <Button variant="secondary">{t("common.edit")}</Button>
          </Link>
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
          <Link href="/contracts">
            <Button variant="ghost">{t("common.back")}</Button>
          </Link>
          </>
        }
      />

      {/* Rantai Dokumen — Kontrak → Surat Jalan → Faktur → Pembayaran (issue #15) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("contracts.chainTitle")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("contracts.chainDescription")}</p>
        </CardHeader>
        <CardContent>
          <DocumentChainTimeline stages={stages} />
        </CardContent>
      </Card>

      {/* Sisa per baris kontrak — dikirim & difakturkan vs sisa (issue #15) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("contracts.outstandingTitle")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("contracts.outstandingDescription")}
          </p>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.item")}</TableHead>
              <TableHead className="text-right">{t("contracts.colContractedKg")}</TableHead>
              <TableHead className="text-right">{t("contracts.colDeliveredKg")}</TableHead>
              <TableHead className="text-right">{t("contracts.colInvoicedKg")}</TableHead>
              <TableHead className="text-right">{t("contracts.colRemainingKg")}</TableHead>
              <TableHead className="text-right">{t("contracts.colRemainingValue")}</TableHead>
              <TableHead>{t("contracts.colInvoiceStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outstandingLines.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={<Package className="h-12 w-12" />}
                    title={t("contracts.emptyLinesTitle")}
                    description={t("contracts.emptyLinesDescription")}
                    actionLabel={t("contracts.emptyLinesAction")}
                    actionHref={`/contracts/${contract.id}/edit`}
                  />
                </TableCell>
              </TableRow>
            ) : (
              outstandingLines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell className="text-foreground">{line.itemName}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatNumber(line.contractedKg)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatNumber(line.deliveredKg)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatNumber(line.invoicedKg)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-foreground">
                    {formatNumber(line.remainingKg)}
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={line.remainingValue} currency={contract.currency} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        line.invoiceStatus === "selesai"
                          ? "success"
                          : line.invoiceStatus === "sebagian"
                            ? "warning"
                            : "default"
                      }
                    >
                      {line.invoiceStatus === "selesai"
                        ? t("contracts.invoicedFull")
                        : line.invoiceStatus === "sebagian"
                          ? t("contracts.invoicedPartial")
                          : t("contracts.invoicedNone")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {outstandingLines.length > 0 && (
            <TableFooter className="border-t-2 bg-transparent">
              <TableRow className="font-semibold text-foreground hover:bg-transparent">
                <TableCell>{t("common.total")}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.contractedKg)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.deliveredKg)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.invoicedKg)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totals.remainingKg)}
                </TableCell>
                <TableCell className="p-0">
                  <MoneyCell value={totals.remainingValue} currency={contract.currency} />
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
        {(totals.unmatchedDeliveredKg > 0 || totals.unmatchedInvoicedKg > 0) && (
          <CardContent className="pt-0">
            <p className="text-xs text-warning-strong">
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
            </p>
          </CardContent>
        )}
      </Card>

      {/* Surat jalan & faktur yang menyebut kontrak ini (issue #15) */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" aria-hidden />{" "}
              {t("contracts.deliveryOrdersTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chain.deliveryOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("contracts.noDeliveryOrders")}{" "}
                <Link href="/delivery-orders/new" className="text-primary hover:underline">
                  {t("contracts.createDeliveryOrderLink")}
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {chain.deliveryOrders.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/delivery-orders/${d.id}`}
                        className="truncate font-medium text-primary hover:underline"
                      >
                        {d.no}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDate(d.date)}</p>
                    </div>
                    <span className="shrink-0 tabular-nums text-foreground">
                      {formatNumber(d.totalKg)} kg
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden />{" "}
              {t("contracts.invoicesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chain.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("contracts.noInvoices")}{" "}
                <Link
                  href={`/invoices/new?contractId=${contract.id}`}
                  className="text-primary hover:underline"
                >
                  {t("contracts.createInvoiceLink")}
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {chain.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="truncate font-medium text-primary hover:underline"
                      >
                        {inv.invoiceNo}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(inv.date)} ·{" "}
                        <span className="tabular-nums">
                          {t("common.paidOnly", { paid: formatCurrency(inv.paidBase, "IDR") })}
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-foreground">
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
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("contracts.infoTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("contracts.colBuyer")}</dt>
              <dd className="text-sm text-foreground">{contract.buyer}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t("contracts.colConsignee")}
              </dt>
              <dd className="text-sm text-foreground">
                {contract.consigneeRef ? (
                  <Link
                    href={`/consignees/${contract.consigneeRef.id}`}
                    className="text-primary hover:underline"
                  >
                    {contract.consigneeRef.name}
                  </Link>
                ) : (
                  consigneeName || "-"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.status")}</dt>
              <dd><StatusBadge status={contract.status} /></dd>
            </div>
            <div>
              {/* Jatuh tempo — penggerak status "Jatuh Tempo" di /receivables,
                  jadi ditampilkan juga di sini. NULL = memang belum diisi. */}
              <dt className="text-sm font-medium text-muted-foreground">{t("common.dueDate")}</dt>
              <dd className="text-sm text-foreground tabular-nums">
                {contract.dueDate ? (
                  formatDateShort(contract.dueDate)
                ) : (
                  <span className="text-muted-foreground">{t("common.notFilledIn")}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.currency")}</dt>
              <dd className="text-sm text-foreground">{contract.currency}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("contracts.packaging")}</dt>
              <dd className="text-sm text-foreground">{contract.packaging || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("contracts.shipment")}</dt>
              <dd className="text-sm text-foreground">{contract.shipment || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("contracts.top1")}</dt>
              <dd className="text-sm text-foreground">{contract.top1 || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("contracts.top2")}</dt>
              <dd className="text-sm text-foreground">{contract.top2 || "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("contracts.goodsTitle")}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.item")}</TableHead>
              <TableHead className="text-right">{t("common.bags")}</TableHead>
              <TableHead className="text-right">{t("common.kgPerBag")}</TableHead>
              <TableHead className="text-right">{t("contracts.pricePerKg")}</TableHead>
              <TableHead className="text-right">{t("common.total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contract.items.map((item) => {
              const itemTotal = Number(item.bags) * Number(item.kgPerBag) * Number(item.pricePerKg);
              return (
                <TableRow key={item.id}>
                  <TableCell className="text-foreground">{item.itemName}</TableCell>
                  <TableCell className="text-foreground text-right">{Number(item.bags)}</TableCell>
                  <TableCell className="text-foreground text-right">{Number(item.kgPerBag)}</TableCell>
                  <TableCell className="text-foreground text-right">{Number(item.pricePerKg)}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="font-medium" value={itemTotal} currency={contract.currency} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent font-normal">
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell colSpan={4} className="text-right font-semibold text-foreground">
                {t("contracts.totalValue")}
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell className="font-bold" value={totalValue} currency={contract.currency} />
              </TableCell>
            </TableRow>
            {isForeign && (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={4} className="text-right text-muted-foreground">
                  {t("common.ledgerBaseIdr")}
                </TableCell>
                <TableCell className="text-right text-foreground tabular-nums">
                  {baseAmount != null ? (
                    <Money value={baseAmount} currency="IDR" />
                  ) : (
                    t("common.rateMissing")
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableFooter>
        </Table>
      </Card>

      {/* Payments */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("contracts.paymentsTitle")}</CardTitle>
            <div className="text-right text-sm text-muted-foreground">
              <div className="tabular-nums">
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
              {paymentsWithoutRate > 0 && (
                <div className="text-xs text-warning-strong">
                  {t("common.paymentsUnrated", { count: paymentsWithoutRate })}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.date")}</TableHead>
              <TableHead className="text-right">{t("common.amount")}</TableHead>
              <TableHead>{t("common.notes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contract.payments.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="p-0">
                  <EmptyState
                    icon={<Banknote className="h-12 w-12" />}
                    title={t("contracts.emptyPaymentsTitle")}
                    description={t("contracts.emptyPaymentsDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              contract.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-foreground">{formatDate(payment.date)}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="font-medium"
                      value={Number(payment.amount)}
                      currency={payment.currency}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{payment.note || "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {/* Add Payment Form */}
        <div className="px-6 pb-4">
          <ContractPaymentSection contractId={contract.id} />
        </div>
      </Card>
    </div>
  );
}
