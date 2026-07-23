import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-auth";
import { DeleteDocumentButton } from "@/components/shared/delete-document-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Banknote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, formatCurrency, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { InvoicePaymentSection } from "./payment-section";
import { InvoicePDFButtonWrapper } from "./pdf-button";
import { InvoiceAdvanceSection } from "./advance-section";
import { getAdvances, getAdvanceTargetState } from "@/lib/advances";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePagePermission("invoice.read");

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
    ? `PPN${taxRate != null ? ` (${taxRate}%)` : " Keluaran"}`
    : "PPN 0% (Ekspor)";

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
  const totalPaidBase = invoice.payments.reduce((sum, p) => {
    if (p.baseAmount != null) return sum + Number(p.baseAmount);
    return (p.currency || "IDR") === "IDR" ? sum + Number(p.amount) : sum;
  }, 0);

  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumbs={[{ label: "Tagihan Penjualan", href: "/invoices" }, { label: invoice.invoiceNo }]}
        title={<>Invoice {invoice.invoiceNo}</>}
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
            <Button variant="secondary">Edit</Button>
          </Link>
          {/* Hanya Manager yang boleh menghapus — cermin dari
              `requireAuth(["bos"])` di route DELETE-nya (issue #6). */}
          {session.user.role === "bos" && (
            <DeleteDocumentButton
              endpoint={`/api/invoices/${invoice.id}`}
              label="Hapus Tagihan"
              title={`Hapus tagihan ${invoice.invoiceNo}?`}
              message={
                `Tagihan ini beserta pembayarannya akan dihapus, dan jurnal yang terbentuk darinya ` +
                `dibalik di transaksi yang sama — termasuk piutang dan PPN keluarannya. ` +
                `Tindakan ini tidak bisa dibatalkan. Kalau tagihannya batal tetapi riwayatnya ingin ` +
                `disimpan, ubah statusnya menjadi "Dibatalkan" saja.`
              }
              confirmPhrase={invoice.invoiceNo}
              redirectTo="/invoices"
            />
          )}
          <Link href="/invoices">
            <Button variant="ghost">Back</Button>
          </Link>
          </>
        }
      />

      {/* Invoice Info */}
      <Card className="mb-6">
        <CardHeader><CardTitle>Invoice Information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Invoice Number</dt>
              <dd className="text-sm text-foreground">{invoice.invoiceNo}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Status</dt>
              <dd><StatusBadge status={invoice.status} /></dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Pelanggan</dt>
              <dd className="text-sm text-foreground">
                {invoice.customer?.name ?? (
                  <span className="text-muted-foreground">Belum ditautkan</span>
                )}
              </dd>
            </div>
            <div>
              {/* Dokumen berantai (issue #15) — kontrak yang faktur ini tarik. */}
              <dt className="text-sm font-medium text-muted-foreground">Kontrak Sumber</dt>
              <dd className="text-sm text-foreground">
                {invoice.contract ? (
                  <Link
                    href={`/contracts/${invoice.contract.id}`}
                    className="text-primary hover:underline"
                  >
                    {invoice.contract.contractNo}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Faktur lepas (tanpa kontrak)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Mata Uang</dt>
              <dd className="text-sm text-foreground tabular-nums">
                {currency}
                {isForeign && (
                  <span className="text-muted-foreground">
                    {rate != null
                      ? ` · kurs ${formatNumber(rate)} ke IDR`
                      : " · kurs belum diisi"}
                  </span>
                )}
              </dd>
            </div>
            {/* Dokumen ekspor / PEB (issue #17) — only when captured. */}
            {invoice.pebNumber && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Nomor PEB</dt>
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
                <dt className="text-sm font-medium text-muted-foreground">Keterangan Ekspor</dt>
                <dd className="text-sm text-foreground">{invoice.exportNote}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-6">
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Item</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Unit</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Quantity</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Price</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => {
                const itemTotal = Number(item.quantity) * Number(item.price);
                return (
                  <tr key={item.id} className="border-b border-border">
                    <td className="px-6 py-3 text-foreground">{item.itemName}</td>
                    <td className="px-6 py-3 text-muted-foreground">{item.unit || "-"}</td>
                    <td className="px-6 py-3 text-foreground text-right tabular-nums">
                      {formatNumber(Number(item.quantity))}
                    </td>
                    <td className="px-6 py-3 text-foreground text-right tabular-nums">
                      {formatCurrency(Number(item.price), currency)}
                    </td>
                    <td className="px-6 py-3 text-foreground text-right font-medium tabular-nums">
                      {formatCurrency(itemTotal, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={4} className="px-6 py-3 text-right text-muted-foreground">
                  DPP · Dasar Pengenaan Pajak
                </td>
                <td className="px-6 py-3 text-right text-foreground tabular-nums">
                  {formatCurrency(subtotal, currency)}
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="px-6 py-3 text-right text-muted-foreground">
                  {ppnLabel}
                </td>
                <td className="px-6 py-3 text-right text-foreground tabular-nums">
                  {formatCurrency(taxAmount, currency)}
                </td>
              </tr>
              <tr className="border-t-2 border-border">
                <td colSpan={4} className="px-6 py-3 text-right font-semibold text-foreground">
                  Total ({currency})
                </td>
                <td className="px-6 py-3 text-right font-bold text-foreground tabular-nums">
                  {formatCurrency(totalValue, currency)}
                </td>
              </tr>
              {isForeign && (
                <tr>
                  <td colSpan={4} className="px-6 py-3 text-right text-muted-foreground">
                    Nilai dasar buku besar (IDR)
                  </td>
                  <td className="px-6 py-3 text-right text-foreground tabular-nums">
                    {baseAmount != null
                      ? formatCurrency(baseAmount, "IDR")
                      : "Kurs belum diisi"}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Payments</CardTitle>
            <div className="text-right text-sm text-muted-foreground">
              <div className="tabular-nums">
                Terbayar (IDR): {formatCurrency(totalPaidBase, "IDR")}
                {baseAmount != null && <> / {formatCurrency(baseAmount, "IDR")}</>}
              </div>
              {paymentsWithoutRate > 0 && (
                <div className="text-xs text-warning-strong">
                  {paymentsWithoutRate} pembayaran valas belum berkurs — belum dihitung.
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Date</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Amount</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Note</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <EmptyState
                      icon={<Banknote className="h-12 w-12" />}
                      title="Belum ada pembayaran"
                      description="Seluruh nilai tagihan ini masih tercatat sebagai piutang. Catat pembayaran pertamanya lewat formulir di atas."
                    />
                  </td>
                </tr>
              ) : (
                invoice.payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-border">
                    <td className="px-6 py-3 text-foreground">{formatDate(payment.date)}</td>
                    <td className="px-6 py-3 text-foreground text-right font-medium">
                      {formatCurrency(Number(payment.amount), payment.currency)}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{payment.note || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 pb-4">
          <InvoicePaymentSection invoiceId={invoice.id} />
        </div>
      </Card>

      {/* Uang muka (issue #26) — the down-payment coming off this bill. */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Uang Muka</CardTitle>
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
