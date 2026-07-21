import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { CASH_TYPE_LABELS, type CashType } from "@/lib/constants";
import { FinancePageActions } from "./finance-actions";
import { bankReconciliationStatus } from "@/lib/bank-statements";
import { CheckCircle2 } from "lucide-react";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; currency?: string; month?: string; year?: string; page?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;

  // Build filters
  const where: Record<string, unknown> = {};
  if (params.type) where.type = params.type;
  if (params.currency) where.currency = params.currency;

  if (params.year) {
    const year = parseInt(params.year);
    const month = params.month ? parseInt(params.month) - 1 : 0;
    const startDate = params.month
      ? new Date(year, month, 1)
      : new Date(year, 0, 1);
    const endDate = params.month
      ? new Date(year, month + 1, 1)
      : new Date(year + 1, 0, 1);
    where.date = { gte: startDate, lt: endDate };
  }

  // All transactions for balance calculation, paginated for table
  const [allTransactions, transactions, totalCount] = await Promise.all([
    prisma.cashAccount.findMany({
      where,
      orderBy: { date: "desc" },
    }),
    prisma.cashAccount.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.cashAccount.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  // Reconciliation status per bank currency, for the Kas & Bank report (issue #24).
  const reconStatus = await bankReconciliationStatus();
  const reconByCurrency = new Map(reconStatus.map((r) => [r.currency, r]));

  // Calculate balances per type & currency (from ALL filtered transactions)
  const balanceMap = new Map<string, { type: string; currency: string; debit: number; credit: number }>();

  for (const t of allTransactions) {
    const key = `${t.type}_${t.currency}`;
    const existing = balanceMap.get(key) || { type: t.type, currency: t.currency, debit: 0, credit: 0 };
    existing.debit += Number(t.debit);
    existing.credit += Number(t.credit);
    balanceMap.set(key, existing);
  }

  const balances = Array.from(balanceMap.values());
  const financeBalances: FinanceBalanceRow[] = balances.map((b) => ({
    ...b,
    balance: b.debit - b.credit,
  }));
  const financeTransactions: FinanceReportRow[] = allTransactions.map((t) => ({
    date: t.date.toISOString(),
    type: t.type,
    description: t.description,
    currency: t.currency,
    debit: Number(t.debit),
    credit: Number(t.credit),
  }));

  // Generate filter options
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <div className="flex flex-wrap gap-2">
          <FinancePageActions balances={financeBalances} transactions={financeTransactions} />
          <Link href="/finance/new"><Button>+ New Transaction</Button></Link>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <form method="get" className="flex flex-wrap gap-3 items-end">
            {/* Account Type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Account</label>
              <select name="type" defaultValue={params.type || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">All Accounts</option>
                <option value="bank">Bank</option>
                <option value="kas_besar">Kas Besar</option>
                <option value="kas_kecil">Kas Kecil</option>
              </select>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
              <select name="currency" defaultValue={params.currency || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">All</option>
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
              </select>
            </div>

            {/* Year */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
              <select name="year" defaultValue={params.year || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">All Years</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
              <select name="month" defaultValue={params.month || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">All Months</option>
                {months.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            <Button type="submit" size="sm">Filter</Button>
            <Link href="/finance">
              <Button type="button" variant="ghost" size="sm">Clear</Button>
            </Link>
          </form>
        </CardContent>
      </Card>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {balances.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No financial records {params.year ? "for this period" : "yet"}
            </CardContent>
          </Card>
        ) : (
          balances.map((b) => {
            const balance = b.debit - b.credit;
            return (
              <Card key={`${b.type}_${b.currency}`}>
                <CardHeader>
                  <CardTitle className="text-sm text-gray-500">
                    {CASH_TYPE_LABELS[b.type as CashType] || b.type} ({b.currency})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(balance, b.currency)}
                  </p>
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>In: {formatCurrency(b.debit, b.currency)}</span>
                    <span>Out: {formatCurrency(b.credit, b.currency)}</span>
                  </div>
                  {b.type === "bank" && reconByCurrency.get(b.currency) && (
                    <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
                      <span>
                        Rekonsiliasi: {reconByCurrency.get(b.currency)!.reconciledCount}/
                        {reconByCurrency.get(b.currency)!.totalCount} cocok
                      </span>
                      {reconByCurrency.get(b.currency)!.latestStatus === "locked" && (
                        <Badge variant="success">Terkunci</Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions ({totalCount})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Date</th>
                <th className="px-6 py-3 font-medium text-gray-500">Type</th>
                <th className="px-6 py-3 font-medium text-gray-500">Description</th>
                <th className="px-6 py-3 font-medium text-gray-500">Currency</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Debit</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Credit</th>
                <th className="px-6 py-3 font-medium text-gray-500">Rekonsiliasi</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500">{formatDateShort(t.date)}</td>
                    <td className="px-6 py-3 text-gray-700">
                      {CASH_TYPE_LABELS[t.type as CashType] || t.type}
                    </td>
                    <td className="px-6 py-3 text-gray-900">{t.description}</td>
                    <td className="px-6 py-3 text-gray-500">{t.currency}</td>
                    <td className="px-6 py-3 text-right text-green-600">
                      {Number(t.debit) > 0 ? formatCurrency(Number(t.debit), t.currency) : "-"}
                    </td>
                    <td className="px-6 py-3 text-right text-red-600">
                      {Number(t.credit) > 0 ? formatCurrency(Number(t.credit), t.currency) : "-"}
                    </td>
                    <td className="px-6 py-3">
                      {t.type === "bank" ? (
                        t.reconciled ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Cocok
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Belum</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/finance" searchParams={params} />
      </Card>
    </div>
  );
}
