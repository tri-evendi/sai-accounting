import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { DocumentChainTimeline } from "@/components/shared/document-chain-timeline";
import { formatDate, formatCurrency, formatNumber } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { buildContractChain, loadContractChain } from "@/lib/document-chain";
import { Receipt, Truck } from "lucide-react";
import { ContractPaymentSection } from "./payment-section";
import { ContractPDFButtons } from "./pdf-buttons";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "Contracts", href: "/contracts" }, { label: contract.contractNo }]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Contract {contract.contractNo}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{formatDate(contract.date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
              <Receipt className="mr-1 h-4 w-4" aria-hidden /> Buat Faktur
            </Button>
          </Link>
          <Link href={`/contracts/${contract.id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <Link href="/contracts">
            <Button variant="ghost">Back</Button>
          </Link>
        </div>
      </div>

      {/* Rantai Dokumen — Kontrak → Surat Jalan → Faktur → Pembayaran (issue #15) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Rantai Dokumen</CardTitle>
          <p className="mt-1 text-sm text-gray-500">
            Perjalanan kontrak ini: dikirim lewat surat jalan, ditagih lewat faktur,
            lalu dibayar. Angka pembayaran dijumlahkan dalam IDR (nilai dasar buku besar).
          </p>
        </CardHeader>
        <CardContent>
          <DocumentChainTimeline stages={stages} />
        </CardContent>
      </Card>

      {/* Sisa per baris kontrak — dikirim & difakturkan vs sisa (issue #15) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Sisa per Barang</CardTitle>
          <p className="mt-1 text-sm text-gray-500">
            Berapa kilogram tiap barang sudah dikirim dan sudah difakturkan, dan berapa
            sisanya. Sisa inilah yang ditarik otomatis saat membuat faktur.
          </p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Barang</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Kontrak (kg)</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Dikirim (kg)</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Difakturkan (kg)</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Sisa (kg)</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Sisa Nilai</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status Faktur</th>
              </tr>
            </thead>
            <tbody>
              {outstandingLines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    Kontrak ini belum punya baris barang.
                  </td>
                </tr>
              ) : (
                outstandingLines.map((line) => (
                  <tr key={line.key} className="border-b border-gray-100">
                    <td className="px-6 py-3 text-gray-900">{line.itemName}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                      {formatNumber(line.contractedKg)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                      {formatNumber(line.deliveredKg)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                      {formatNumber(line.invoicedKg)}
                    </td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums text-gray-900">
                      {formatNumber(line.remainingKg)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-900">
                      {formatCurrency(line.remainingValue, contract.currency)}
                    </td>
                    <td className="px-6 py-3">
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
                          ? "Lunas difakturkan"
                          : line.invoiceStatus === "sebagian"
                            ? "Sebagian"
                            : "Belum"}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {outstandingLines.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
                  <td className="px-6 py-3">Total</td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatNumber(totals.contractedKg)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatNumber(totals.deliveredKg)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatNumber(totals.invoicedKg)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatNumber(totals.remainingKg)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatCurrency(totals.remainingValue, contract.currency)}
                  </td>
                  <td className="px-6 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {(totals.unmatchedDeliveredKg > 0 || totals.unmatchedInvoicedKg > 0) && (
          <CardContent className="pt-0">
            <p className="text-xs text-amber-700">
              Ada baris dokumen dengan nama barang di luar kontrak ini
              {totals.unmatchedDeliveredKg > 0 &&
                ` — surat jalan ${formatNumber(totals.unmatchedDeliveredKg)} kg`}
              {totals.unmatchedInvoicedKg > 0 &&
                ` — faktur ${formatNumber(totals.unmatchedInvoicedKg)} kg`}
              . Baris tersebut tidak dihitung sebagai pemenuhan kontrak.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Surat jalan & faktur yang menyebut kontrak ini (issue #15) */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-gray-400" aria-hidden /> Surat Jalan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chain.deliveryOrders.length === 0 ? (
              <p className="text-sm text-gray-500">
                Belum ada surat jalan.{" "}
                <Link href="/delivery-orders/new" className="text-blue-600 hover:underline">
                  Buat surat jalan →
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {chain.deliveryOrders.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/delivery-orders/${d.id}`}
                        className="truncate font-medium text-blue-600 hover:underline"
                      >
                        {d.no}
                      </Link>
                      <p className="text-xs text-gray-500">{formatDate(d.date)}</p>
                    </div>
                    <span className="shrink-0 tabular-nums text-gray-900">
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
              <Receipt className="h-4 w-4 text-gray-400" aria-hidden /> Faktur
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chain.invoices.length === 0 ? (
              <p className="text-sm text-gray-500">
                Belum ada faktur dari kontrak ini.{" "}
                <Link
                  href={`/invoices/new?contractId=${contract.id}`}
                  className="text-blue-600 hover:underline"
                >
                  Buat faktur →
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {chain.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="truncate font-medium text-blue-600 hover:underline"
                      >
                        {inv.invoiceNo}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {formatDate(inv.date)} · Terbayar (IDR){" "}
                        <span className="tabular-nums">
                          {formatCurrency(inv.paidBase, "IDR")}
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-gray-900">
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
          <CardTitle>Contract Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Buyer</dt>
              <dd className="text-sm text-gray-900">{contract.buyer}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Consignee</dt>
              <dd className="text-sm text-gray-900">
                {contract.consigneeRef ? (
                  <Link
                    href={`/consignees/${contract.consigneeRef.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {contract.consigneeRef.name}
                  </Link>
                ) : (
                  consigneeName || "-"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd><StatusBadge status={contract.status} /></dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Currency</dt>
              <dd className="text-sm text-gray-900">{contract.currency}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Packaging</dt>
              <dd className="text-sm text-gray-900">{contract.packaging || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Shipment</dt>
              <dd className="text-sm text-gray-900">{contract.shipment || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Terms of Payment 1</dt>
              <dd className="text-sm text-gray-900">{contract.top1 || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Terms of Payment 2</dt>
              <dd className="text-sm text-gray-900">{contract.top2 || "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Item</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Bags</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Kg/Bag</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Price/Kg</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {contract.items.map((item) => {
                const itemTotal = Number(item.bags) * Number(item.kgPerBag) * Number(item.pricePerKg);
                return (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-6 py-3 text-gray-900">{item.itemName}</td>
                    <td className="px-6 py-3 text-gray-700 text-right">{Number(item.bags)}</td>
                    <td className="px-6 py-3 text-gray-700 text-right">{Number(item.kgPerBag)}</td>
                    <td className="px-6 py-3 text-gray-700 text-right">{Number(item.pricePerKg)}</td>
                    <td className="px-6 py-3 text-gray-900 text-right font-medium">
                      {formatCurrency(itemTotal, contract.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td colSpan={4} className="px-6 py-3 text-right font-semibold text-gray-700">
                  Total Value
                </td>
                <td className="px-6 py-3 text-right font-bold text-gray-900 tabular-nums">
                  {formatCurrency(totalValue, contract.currency)}
                </td>
              </tr>
              {isForeign && (
                <tr>
                  <td colSpan={4} className="px-6 py-3 text-right text-gray-500">
                    Nilai dasar buku besar (IDR)
                  </td>
                  <td className="px-6 py-3 text-right text-gray-900 tabular-nums">
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
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Payments</CardTitle>
            <div className="text-right text-sm text-gray-500">
              <div className="tabular-nums">
                {baseAmount != null && baseAmount > 0 && (
                  <>{Math.round((totalPaidBase / baseAmount) * 100)}% — </>
                )}
                Terbayar (IDR): {formatCurrency(totalPaidBase, "IDR")}
                {baseAmount != null && <> / {formatCurrency(baseAmount, "IDR")}</>}
              </div>
              {paymentsWithoutRate > 0 && (
                <div className="text-xs text-amber-700">
                  {paymentsWithoutRate} pembayaran valas belum berkurs — belum dihitung.
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Date</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Amount</th>
                <th className="px-6 py-3 font-medium text-gray-500">Note</th>
              </tr>
            </thead>
            <tbody>
              {contract.payments.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                    No payments recorded
                  </td>
                </tr>
              ) : (
                contract.payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-100">
                    <td className="px-6 py-3 text-gray-700">{formatDate(payment.date)}</td>
                    <td className="px-6 py-3 text-gray-900 text-right font-medium">
                      {formatCurrency(Number(payment.amount), payment.currency)}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{payment.note || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Add Payment Form */}
        <div className="px-6 pb-4">
          <ContractPaymentSection contractId={contract.id} />
        </div>
      </Card>
    </div>
  );
}
