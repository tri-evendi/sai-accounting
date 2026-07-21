import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
          <Link href={`/contracts/${contract.id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <Link href="/contracts">
            <Button variant="ghost">Back</Button>
          </Link>
        </div>
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
