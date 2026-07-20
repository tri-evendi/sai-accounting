import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { SupplierTransactionForm } from "./transaction-form";
import { AllocationEditor } from "./allocation-editor";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `?alokasi=1` arrives from the "Perkiraan" badge on /payables (issue #38). */
  searchParams: Promise<{ alokasi?: string }>;
}) {
  const { id } = await params;
  const { alokasi } = await searchParams;

  const supplier = await prisma.supplier.findUnique({
    where: { id: parseInt(id) },
    include: {
      // Allocations come along so each payment row can show which purchases it
      // settles, and offer to change them (issue #38).
      transactions: { orderBy: { date: "desc" }, include: { allocationsMade: true } },
    },
  });

  if (!supplier) notFound();

  // Landing here from the "Perkiraan" badge means the user has just seen a row
  // whose split is a guess. Open the editor on the payment responsible for that
  // — the oldest payment with no allocation, since FIFO spends the oldest money
  // first — instead of making them work out which one to click.
  const autoOpenPaymentId =
    alokasi === "1"
      ? (supplier.transactions
          .filter((t) => t.type === "payment" && t.allocationsMade.length === 0)
          .sort((a, b) => a.date.getTime() - b.date.getTime())[0]?.id ?? null)
      : null;

  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "Suppliers", href: "/suppliers" }, { label: supplier.name }]} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
        <div className="flex gap-2">
          <Link href={`/suppliers/${id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <Link href="/suppliers">
            <Button variant="ghost">Back</Button>
          </Link>
        </div>
      </div>

      {/* Supplier Info */}
      <Card className="mb-6">
        <CardHeader><CardTitle>Supplier Information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Name</dt>
              <dd className="text-sm text-gray-900">{supplier.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Address</dt>
              <dd className="text-sm text-gray-900">{supplier.address || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Phone</dt>
              <dd className="text-sm text-gray-900">{supplier.phone || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="text-sm text-gray-900">{supplier.email || "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
        <div className="px-6 pb-2">
          <SupplierTransactionForm supplierId={supplier.id} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Date</th>
                <th className="px-6 py-3 font-medium text-gray-500">Type</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Amount</th>
                <th className="px-6 py-3 font-medium text-gray-500">Currency</th>
                <th className="px-6 py-3 font-medium text-gray-500">Note</th>
                <th className="px-6 py-3 font-medium text-gray-500">Alokasi</th>
              </tr>
            </thead>
            <tbody>
              {supplier.transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No transactions recorded
                  </td>
                </tr>
              ) : (
                supplier.transactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 align-top">
                    <td className="px-6 py-3 text-gray-700">{formatDate(t.date)}</td>
                    <td className="px-6 py-3 text-gray-700 capitalize">{t.type}</td>
                    <td className="px-6 py-3 text-gray-900 text-right font-medium tabular-nums">
                      {formatCurrency(Number(t.amount), t.currency)}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{t.currency}</td>
                    <td className="px-6 py-3 text-gray-500">{t.note || "-"}</td>
                    <td className="px-6 py-3">
                      {t.type !== "payment" ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        <div>
                          {t.allocationsMade.length === 0 ? (
                            <span
                              className="block"
                              title="Pembayaran ini belum ditautkan ke pembelian tertentu, jadi sisa utang per dokumen hanya diperkirakan (pembelian terlama dilunasi lebih dulu)."
                            >
                              <Badge variant="warning">Perkiraan</Badge>
                            </span>
                          ) : (
                            <ul className="space-y-0.5">
                              {t.allocationsMade.map((a) => (
                                <li key={a.id} className="text-xs text-gray-700 tabular-nums">
                                  TRX-{a.purchaseId} ·{" "}
                                  {formatCurrency(Number(a.amount), a.currency)}
                                </li>
                              ))}
                            </ul>
                          )}
                          <AllocationEditor
                            supplierId={supplier.id}
                            paymentId={t.id}
                            paymentAmount={Number(t.amount)}
                            paymentCurrency={t.currency}
                            allocatedCount={t.allocationsMade.length}
                            autoOpen={autoOpenPaymentId === t.id}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
