import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { SupplierTransactionForm } from "./transaction-form";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({
    where: { id: parseInt(id) },
    include: {
      transactions: { orderBy: { date: "desc" } },
    },
  });

  if (!supplier) notFound();

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
              </tr>
            </thead>
            <tbody>
              {supplier.transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No transactions recorded
                  </td>
                </tr>
              ) : (
                supplier.transactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="px-6 py-3 text-gray-700">{formatDate(t.date)}</td>
                    <td className="px-6 py-3 text-gray-700 capitalize">{t.type}</td>
                    <td className="px-6 py-3 text-gray-900 text-right font-medium tabular-nums">
                      {formatCurrency(Number(t.amount), t.currency)}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{t.currency}</td>
                    <td className="px-6 py-3 text-gray-500">{t.note || "-"}</td>
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
