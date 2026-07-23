import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { Receipt } from "lucide-react";
import { SupplierTransactionForm } from "./transaction-form";
import { AllocationEditor } from "./allocation-editor";
import { SupplierAdvancePanel } from "./advance-panel";
import {
  getAdvances,
  getSupplierPurchaseTargets,
  isCompensationTarget,
} from "@/lib/advances";
import type { AppliedAdvance } from "@/components/shared/advance-compensation";

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

  // Uang muka pembelian (issue #41). Three reads, one round trip: the advances
  // paid to this supplier with their balances, every purchase valued as a
  // compensation target, and the compensations already recorded against those
  // purchases (so each can be undone from where it is shown).
  const [purchaseAdvances, purchaseTargets, applications, contracts] = await Promise.all([
    getAdvances({ type: "purchase", supplierId: supplier.id }),
    getSupplierPurchaseTargets(supplier.id),
    prisma.advanceApplication.findMany({
      where: { purchase: { supplierId: supplier.id } },
      include: { advance: true },
      orderBy: { date: "asc" },
    }),
    prisma.contract.findMany({
      where: { status: { not: "canceled" } },
      orderBy: { date: "desc" },
      select: { id: true, contractNo: true, buyer: true },
      take: 200,
    }),
  ]);

  const appliedByPurchase: Record<number, AppliedAdvance[]> = {};
  for (const a of applications) {
    if (a.purchaseId == null) continue;
    (appliedByPurchase[a.purchaseId] ??= []).push({
      id: a.id,
      advanceNo: a.advance.advanceNo,
      date: a.date.toISOString(),
      amount: Number(a.amount),
      currency: a.currency,
      baseAmount: a.baseAmount == null ? null : Number(a.baseAmount),
    });
  }

  // IDR base only, and only from advances that HAVE an IDR value. An unrated
  // foreign advance is counted out loud instead of being folded in at 1:1
  // (issues #35/#36) — the panel shows the count next to the total.
  const openAdvances = purchaseAdvances.filter((a) => !a.isFullyApplied);
  const advanceOutstandingBase = Math.round(
    openAdvances.reduce((s, a) => s + (a.remainingBase ?? 0), 0) * 100
  ) / 100;
  const unratedAdvanceCount = openAdvances.filter((a) => a.remainingBase == null).length;

  const offerableTargets = purchaseTargets.filter((t) =>
    isCompensationTarget(t, (appliedByPurchase[t.id]?.length ?? 0) > 0)
  );
  const unratedPurchaseCount = purchaseTargets.filter((t) => t.remainingBase == null).length;

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
        <h1 className="text-2xl font-bold text-foreground">{supplier.name}</h1>
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
              <dt className="text-sm font-medium text-muted-foreground">Name</dt>
              <dd className="text-sm text-foreground">{supplier.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Address</dt>
              <dd className="text-sm text-foreground">{supplier.address || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Phone</dt>
              <dd className="text-sm text-foreground">{supplier.phone || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Email</dt>
              <dd className="text-sm text-foreground">{supplier.email || "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Uang muka pembelian (issue #41) — money paid to this supplier before
          their goods/invoice arrived, and the flow that takes it off a purchase. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Uang Muka Pembelian</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierAdvancePanel
            supplier={{ id: supplier.id, name: supplier.name }}
            contracts={contracts}
            advances={purchaseAdvances.map((a) => ({
              id: a.id,
              advanceNo: a.advanceNo,
              date: a.date.toISOString(),
              currency: a.currency,
              amount: a.amount,
              applied: a.applied,
              remaining: a.remaining,
              remainingBase: a.remainingBase,
              unratedApplications: a.unratedApplications,
              isFullyApplied: a.isFullyApplied,
              contractNo: a.contractNo,
            }))}
            outstandingBase={advanceOutstandingBase}
            unratedAdvanceCount={unratedAdvanceCount}
            purchases={offerableTargets.map((t) => ({
              id: t.id,
              label: t.label,
              date: t.date.toISOString(),
              currency: t.currency,
              amount: t.amount,
              // `isCompensationTarget` has already excluded the null case.
              remainingBase: t.remainingBase!,
            }))}
            unratedPurchaseCount={unratedPurchaseCount}
            appliedByPurchase={appliedByPurchase}
          />
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
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Date</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Type</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Amount</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Currency</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Note</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Alokasi</th>
              </tr>
            </thead>
            <tbody>
              {supplier.transactions.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<Receipt className="h-12 w-12" />}
                      title="Belum ada transaksi dengan pemasok ini"
                      description="Catat pembelian atau pembayaran pertamanya lewat formulir di atas; utang dan jurnalnya terbentuk otomatis."
                    />
                  </td>
                </tr>
              ) : (
                supplier.transactions.map((t) => (
                  <tr key={t.id} className="border-b border-border align-top">
                    <td className="px-6 py-3 text-foreground">{formatDate(t.date)}</td>
                    <td className="px-6 py-3 text-foreground capitalize">{t.type}</td>
                    <td className="px-6 py-3 text-foreground text-right font-medium tabular-nums">
                      {formatCurrency(Number(t.amount), t.currency)}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{t.currency}</td>
                    <td className="px-6 py-3 text-muted-foreground">{t.note || "-"}</td>
                    <td className="px-6 py-3">
                      {t.type !== "payment" ? (
                        <span className="text-muted-foreground">-</span>
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
                                <li key={a.id} className="text-xs text-foreground tabular-nums">
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
