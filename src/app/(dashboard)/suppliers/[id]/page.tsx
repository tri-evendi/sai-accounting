import { notFound } from "next/navigation";
import { Link } from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
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
import { toBase } from "@/lib/receivables";
import { getT } from "@/lib/i18n/server";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const EPSILON = 0.005;

export const dynamic = "force-dynamic";

/** Label tampilan untuk `SupplierTransaction.type` — nilai DB tidak berubah. */
const transactionTypeLabels = (t: Awaited<ReturnType<typeof getT>>): Record<string, string> => ({
  purchase: t("suppliers.typePurchase"),
  payment: t("suppliers.typePayment"),
});

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `?alokasi=1` arrives from the "Perkiraan" badge on /payables (issue #38). */
  searchParams: Promise<{ alokasi?: string }>;
}) {
  // Sejajar dengan halaman daftarnya — tanpa ini, ptg bisa membaca detail
  // pemasok + uang mukanya lewat URL langsung (temuan audit RBAC fase 0).
  await requirePagePermission("supplier.read");
  const t = await getT();
  const typeLabels = transactionTypeLabels(t);
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
  // whose split is at least partly a FIFO guess. That guess is fed by every
  // payment whose RECORDED allocations do not exhaust its own IDR value — not
  // just the fully unallocated ones: a partially allocated payment spills its
  // remainder into the same pool (see `getPayables`). So open the editor on the
  // oldest payment that still has such a remainder (FIFO spends the oldest
  // money first), valuing both sides the way the ledger does (`toBase`), and
  // fall back to the oldest zero-allocation payment — an unrated foreign
  // payment has no IDR value to compare, yet is still the row worth fixing.
  // No candidate at all means the badge should not have been shown; then
  // nothing auto-opens and the page simply shows the payment list.
  const paymentsOldestFirst =
    alokasi === "1"
      ? supplier.transactions
          .filter((t) => t.type === "payment")
          .sort((a, b) => a.date.getTime() - b.date.getTime())
      : [];
  const autoOpenPaymentId =
    paymentsOldestFirst.find((p) => {
      const base = toBase(p);
      if (base == null) return false;
      const allocatedBase = p.allocationsMade.reduce((s, a) => s + (toBase(a) ?? 0), 0);
      return base - allocatedBase > EPSILON;
    })?.id ??
    paymentsOldestFirst.find((p) => p.allocationsMade.length === 0)?.id ??
    null;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("suppliers.breadcrumb"), href: "/suppliers" },
          { label: supplier.name },
        ]}
        title={supplier.name}
        actions={
          <>
            <Link href={`/suppliers/${id}/edit`}>
              <Button variant="secondary">{t("common.edit")}</Button>
            </Link>
            <Link href="/suppliers">
              <Button variant="ghost">{t("common.back")}</Button>
            </Link>
          </>
        }
      />

      {/* Supplier Info */}
      <Card className="mb-6">
        <CardHeader><CardTitle>{t("suppliers.infoTitle")}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.name")}</dt>
              <dd className="text-sm text-foreground">{supplier.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.address")}</dt>
              <dd className="text-sm text-foreground">{supplier.address || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.phone")}</dt>
              <dd className="text-sm text-foreground">{supplier.phone || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.email")}</dt>
              <dd className="text-sm text-foreground">{supplier.email || "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Uang muka pembelian (issue #41) — money paid to this supplier before
          their goods/invoice arrived, and the flow that takes it off a purchase. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("suppliers.advanceTitle")}</CardTitle>
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
        <CardHeader><CardTitle>{t("suppliers.historyTitle")}</CardTitle></CardHeader>
        <div className="px-6 pb-2">
          <SupplierTransactionForm supplierId={supplier.id} />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("suppliers.colType")}</TableHead>
              <TableHead className="text-right">{t("common.amount")}</TableHead>
              <TableHead>{t("common.currency")}</TableHead>
              <TableHead>{t("common.notes")}</TableHead>
              <TableHead>{t("suppliers.colAllocation")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supplier.transactions.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    icon={<Receipt className="h-12 w-12" />}
                    title={t("suppliers.emptyTxTitle")}
                    description={t("suppliers.emptyTxDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              supplier.transactions.map((tx) => (
                // Baris pembayaran bisa membawa daftar alokasi bertingkat, jadi
                // seluruh selnya rata atas — `TableCell` bawaan rata tengah.
                <TableRow key={tx.id} className="[&>td]:align-top">
                  <TableCell className="text-foreground">{formatDate(tx.date)}</TableCell>
                  <TableCell className="text-foreground">{typeLabels[tx.type] ?? tx.type}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="font-medium text-foreground"
                      value={Number(tx.amount)}
                      currency={tx.currency}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{tx.currency}</TableCell>
                  <TableCell className="text-muted-foreground">{tx.note || "-"}</TableCell>
                  <TableCell>
                    {tx.type !== "payment" ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div>
                        {tx.allocationsMade.length === 0 ? (
                          <span
                            className="block"
                            title={t("suppliers.estimateTitle")}
                          >
                            <Badge variant="warning">{t("suppliers.estimateBadge")}</Badge>
                          </span>
                        ) : (
                          <ul className="space-y-0.5">
                            {tx.allocationsMade.map((a) => (
                              <li key={a.id} className="text-xs text-foreground tabular-nums">
                                TRX-{a.purchaseId} ·{" "}
                                <Money value={Number(a.amount)} currency={a.currency} />
                              </li>
                            ))}
                          </ul>
                        )}
                        <AllocationEditor
                          supplierId={supplier.id}
                          paymentId={tx.id}
                          paymentAmount={Number(tx.amount)}
                          paymentCurrency={tx.currency}
                          allocatedCount={tx.allocationsMade.length}
                          autoOpen={autoOpenPaymentId === tx.id}
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
