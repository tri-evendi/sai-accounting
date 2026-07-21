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
import { CheckCircle2, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MONTH_NAMES } from "@/lib/month-names";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
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
  // Nama bulan bahasa Indonesia dipakai bersama seluruh aplikasi (issue #1).
  const months = MONTH_NAMES;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <TermTooltip term="kas_bank">Kas &amp; Bank</TermTooltip>
          </h1>
          <LearnMore term="kas_bank" className="mt-1" label="Pelajari ini: kas &amp; bank" />
        </div>
        <div className="flex flex-wrap gap-2">
          <FinancePageActions balances={financeBalances} transactions={financeTransactions} />
          <Link href="/finance/new"><Button>+ Catat Transaksi</Button></Link>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <form method="get" className="flex flex-wrap gap-3 items-end">
            {/* Account Type */}
            <div>
              <label htmlFor="filter-type" className="block text-xs font-medium text-gray-500 mb-1">Jenis Kas</label>
              <select id="filter-type" name="type" defaultValue={params.type || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">Semua Jenis</option>
                <option value="bank">Bank</option>
                <option value="kas_besar">Kas Besar</option>
                <option value="kas_kecil">Kas Kecil</option>
              </select>
            </div>

            {/* Currency */}
            <div>
              <label htmlFor="filter-currency" className="block text-xs font-medium text-gray-500 mb-1">Mata Uang</label>
              <select id="filter-currency" name="currency" defaultValue={params.currency || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">Semua</option>
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
              </select>
            </div>

            {/* Year */}
            <div>
              <label htmlFor="filter-year" className="block text-xs font-medium text-gray-500 mb-1">Tahun</label>
              <select id="filter-year" name="year" defaultValue={params.year || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">Semua Tahun</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div>
              <label htmlFor="filter-month" className="block text-xs font-medium text-gray-500 mb-1">Bulan</label>
              <select id="filter-month" name="month" defaultValue={params.month || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">Semua Bulan</option>
                {months.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            <Button type="submit" size="sm" className="cursor-pointer">Saring</Button>
            <Link href="/finance">
              <Button type="button" variant="ghost" size="sm" className="cursor-pointer">
                Bersihkan
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {balances.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              Belum ada catatan kas {params.year ? "untuk periode ini" : ""}
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
                  <p className={`text-2xl font-bold tabular-nums ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(balance, b.currency)}
                  </p>
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span className="tabular-nums">
                      Masuk: {formatCurrency(b.debit, b.currency)}
                    </span>
                    <span className="tabular-nums">
                      Keluar: {formatCurrency(b.credit, b.currency)}
                    </span>
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
          <CardTitle>Daftar Transaksi ({totalCount})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Tanggal</th>
                <th className="px-6 py-3 font-medium text-gray-500">Jenis Kas</th>
                <th className="px-6 py-3 font-medium text-gray-500">Keterangan</th>
                <th className="px-6 py-3 font-medium text-gray-500">Mata Uang</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">
                  <TermTooltip term="debit">Uang Masuk</TermTooltip>
                </th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">
                  <TermTooltip term="kredit">Uang Keluar</TermTooltip>
                </th>
                <th className="px-6 py-3 font-medium text-gray-500">Rekonsiliasi</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<Wallet className="h-12 w-12" />}
                      title="Belum ada transaksi kas & bank"
                      description="Catat uang masuk atau uang keluar pertama Anda; jurnalnya dibuat otomatis."
                      actionLabel="+ Catat Transaksi"
                      actionHref="/finance/new"
                    />
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
                    <td className="px-6 py-3 text-right text-green-600 tabular-nums">
                      {Number(t.debit) > 0 ? formatCurrency(Number(t.debit), t.currency) : "-"}
                    </td>
                    <td className="px-6 py-3 text-right text-red-600 tabular-nums">
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
