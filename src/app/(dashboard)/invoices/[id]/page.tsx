import { notFound } from "next/navigation";
import { Link } from "@/components/ui/app-link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-auth";
import { canEffective } from "@/lib/authz-effective";
import { DeleteDocumentButton } from "@/components/shared/delete-document-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Banknote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { formatDate, formatDateShort, formatCurrency, formatNumber } from "@/lib/utils";
import { toBase } from "@/lib/receivables";
import { PageHeader } from "@/components/ui/page-header";
import { InvoicePaymentSection } from "./payment-section";
import { InvoicePDFButtonWrapper } from "./pdf-button";
import { InvoiceAdvanceSection } from "./advance-section";
import { getAdvances, getAdvanceTargetState } from "@/lib/advances";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePagePermission("invoice.read");
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

  return (
    <div className="w-full">
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
      <Card className="mb-6">
        <CardHeader><CardTitle>{t("invoices.infoTitle")}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("invoices.invoiceNo")}</dt>
              <dd className="text-sm text-foreground">{invoice.invoiceNo}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.status")}</dt>
              <dd><StatusBadge status={invoice.status} /></dd>
            </div>
            <div>
              {/* Jatuh tempo — penggerak status "Jatuh Tempo" di /receivables,
                  jadi ditampilkan juga di sini. NULL = memang belum diisi. */}
              <dt className="text-sm font-medium text-muted-foreground">{t("common.dueDate")}</dt>
              <dd className="text-sm text-foreground tabular-nums">
                {invoice.dueDate ? (
                  formatDateShort(invoice.dueDate)
                ) : (
                  <span className="text-muted-foreground">{t("common.notFilledIn")}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("invoices.customer")}</dt>
              <dd className="text-sm text-foreground">
                {invoice.customer?.name ?? (
                  <span className="text-muted-foreground">{t("invoices.customerNotLinked")}</span>
                )}
              </dd>
            </div>
            <div>
              {/* Dokumen berantai (issue #15) — kontrak yang faktur ini tarik. */}
              <dt className="text-sm font-medium text-muted-foreground">{t("invoices.sourceContract")}</dt>
              <dd className="text-sm text-foreground">
                {invoice.contract ? (
                  <Link
                    href={`/contracts/${invoice.contract.id}`}
                    className="text-primary hover:underline"
                  >
                    {invoice.contract.contractNo}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{t("invoices.standalone")}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.currency")}</dt>
              <dd className="text-sm text-foreground tabular-nums">
                {currency}
                {isForeign && (
                  <span className="text-muted-foreground">
                    {" "}
                    {rate != null
                      ? t("invoices.rateSuffix", { rate: formatNumber(rate) })
                      : t("invoices.rateMissingSuffix")}
                  </span>
                )}
              </dd>
            </div>
            {/* Dokumen ekspor / PEB (issue #17) — only when captured. */}
            {invoice.pebNumber && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t("invoices.pebNumber")}</dt>
                <dd className="text-sm text-foreground tabular-nums">
                  {invoice.pebNumber}
                  {invoice.pebDate && (
                    <span className="text-muted-foreground"> · {formatDate(invoice.pebDate)}</span>
                  )}
                </dd>
              </div>
            )}
            {invoice.exportNote && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-muted-foreground">{t("invoices.exportNote")}</dt>
                <dd className="text-sm text-foreground">{invoice.exportNote}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-6">
        <CardHeader><CardTitle>{t("invoices.goodsTitle")}</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.item")}</TableHead>
              <TableHead>{t("common.unit")}</TableHead>
              <TableHead className="text-right">{t("common.quantity")}</TableHead>
              <TableHead className="text-right">{t("common.price")}</TableHead>
              <TableHead className="text-right">{t("common.total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.items.map((item) => {
              const itemTotal = Number(item.quantity) * Number(item.price);
              return (
                <TableRow key={item.id}>
                  <TableCell className="text-foreground">{item.itemName}</TableCell>
                  <TableCell className="text-muted-foreground">{item.unit || "-"}</TableCell>
                  <TableCell className="text-foreground text-right tabular-nums">
                    {formatNumber(Number(item.quantity))}
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={Number(item.price)} currency={currency} />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="font-medium" value={itemTotal} currency={currency} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter className="bg-transparent font-normal">
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell colSpan={4} className="text-right text-muted-foreground">
                {t("invoices.dpp")}
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell value={subtotal} currency={currency} />
              </TableCell>
            </TableRow>
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell colSpan={4} className="text-right text-muted-foreground">
                {ppnLabel}
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell value={taxAmount} currency={currency} />
              </TableCell>
            </TableRow>
            <TableRow className="border-0 border-t-2 border-border hover:bg-transparent">
              <TableCell colSpan={4} className="text-right font-semibold text-foreground">
                {t("invoices.totalCurrency", { currency })}
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell className="font-bold" value={totalValue} currency={currency} />
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("invoices.paymentsTitle")}</CardTitle>
            <div className="text-right text-sm text-muted-foreground">
              <div className="tabular-nums">
                {baseAmount != null
                  ? t("common.paidOf", {
                      paid: formatCurrency(totalPaidBase, "IDR"),
                      total: formatCurrency(baseAmount, "IDR"),
                    })
                  : t("common.paidOnly", { paid: formatCurrency(totalPaidBase, "IDR") })}
              </div>
              {unratedCount > 0 && (
                <div className="text-xs text-warning-strong">
                  {t("common.paymentsUnrated", { count: unratedCount })}
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
            {invoice.payments.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="p-0">
                  <EmptyState
                    icon={<Banknote className="h-12 w-12" />}
                    title={t("invoices.emptyPaymentsTitle")}
                    description={t("invoices.emptyPaymentsDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              invoice.payments.map((payment) => (
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
        <div className="px-6 pb-4">
          <InvoicePaymentSection invoiceId={invoice.id} />
        </div>
      </Card>

      {/* Uang muka (issue #26) — the down-payment coming off this bill. */}
      <Card className="mt-6">
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
