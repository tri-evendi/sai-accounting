import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort, parsePageParam } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";
import { NativeSelect } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CashType } from "@/lib/constants";
import { FinancePageActions } from "./finance-actions";
import { bankReconciliationStatus } from "@/lib/bank-statements";
import { CheckCircle2, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { cashTypeLabels, monthNames } from "@/lib/i18n/labels";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ type?: string; currency?: string; month?: string; year?: string; page?: string }>;
}) {
  await requirePagePermission("cash.read", params);
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const cashLabels = cashTypeLabels(dictionary);
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 10;

  // Build filters
  const where: Record<string, unknown> = {};
  if (filters.type) where.type = filters.type;
  if (filters.currency) where.currency = filters.currency;

  // Sanitized: hand-edited URLs must not put NaN into the query. A month
  // chosen with year "Semua tahun" cannot mean "Maret every year" in one
  // range — it defaults to the current year, and the Year select below shows
  // that, so the filter applied is always the filter displayed.
  const yearNum = filters.year ? Number.parseInt(filters.year, 10) : NaN;
  const monthNum = filters.month ? Number.parseInt(filters.month, 10) : NaN;
  const monthValid = Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12;
  const effectiveYear = Number.isFinite(yearNum)
    ? yearNum
    : monthValid
      ? new Date().getFullYear()
      : null;
  if (effectiveYear != null) {
    const startDate = monthValid
      ? new Date(effectiveYear, monthNum - 1, 1)
      : new Date(effectiveYear, 0, 1);
    const endDate = monthValid
      ? new Date(effectiveYear, monthNum, 1)
      : new Date(effectiveYear + 1, 0, 1);
    where.date = { gte: startDate, lt: endDate };
  }

  // All transactions for balance calculation, paginated for table
  const [allTransactions, transactions, totalCount] = await Promise.all([
    prisma.cashMovement.findMany({
      where,
      orderBy: { date: "desc" },
    }),
    prisma.cashMovement.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.cashMovement.count({ where }),
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
  const months = monthNames(dictionary);

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="kas_bank">{t("finance.title")}</TermTooltip>}
        actions={
          <>
            <FinancePageActions balances={financeBalances} transactions={financeTransactions} />
            <Link href="/finance/new">
              <Button>{t("finance.addNew")}</Button>
            </Link>
          </>
        }
      />
      <LearnMore term="kas_bank" className="mt-1 mb-6" label={t("finance.learnMore")} />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <form method="get" className="flex flex-wrap gap-3 items-end">
            {/* Account Type */}
            <div>
              <label htmlFor="filter-type" className="block text-xs font-medium text-muted-foreground mb-1">{t("finance.filterType")}</label>
              <NativeSelect
                id="filter-type"
                name="type"
                defaultValue={filters.type || ""}
                options={[
                  { value: "", label: t("finance.allTypes") },
                  { value: "bank", label: cashLabels.bank },
                  { value: "kas_besar", label: cashLabels.kas_besar },
                  { value: "kas_kecil", label: cashLabels.kas_kecil },
                ]}
              />
            </div>

            {/* Currency */}
            <div>
              <label htmlFor="filter-currency" className="block text-xs font-medium text-muted-foreground mb-1">{t("common.currency")}</label>
              <NativeSelect
                id="filter-currency"
                name="currency"
                defaultValue={filters.currency || ""}
                options={[
                  { value: "", label: t("common.all") },
                  { value: "IDR", label: "IDR" },
                  { value: "USD", label: "USD" },
                  { value: "CNY", label: "CNY" },
                ]}
              />
            </div>

            {/* Year */}
            <div>
              <label htmlFor="filter-year" className="block text-xs font-medium text-muted-foreground mb-1">{t("finance.yearField")}</label>
              <NativeSelect
                id="filter-year"
                name="year"
                defaultValue={effectiveYear != null ? String(effectiveYear) : ""}
                options={[
                  { value: "", label: t("finance.allYears") },
                  ...years.map((y) => ({ value: String(y), label: String(y) })),
                ]}
              />
            </div>

            {/* Month */}
            <div>
              <label htmlFor="filter-month" className="block text-xs font-medium text-muted-foreground mb-1">{t("finance.monthField")}</label>
              <NativeSelect
                id="filter-month"
                name="month"
                defaultValue={monthValid ? String(monthNum) : ""}
                options={[
                  { value: "", label: t("finance.allMonths") },
                  ...months.map((m, i) => ({ value: String(i + 1), label: m })),
                ]}
              />
            </div>

            <Button type="submit" size="sm" className="cursor-pointer">
              {t("finance.filterSubmit")}
            </Button>
            <Link href="/finance">
              <Button type="button" variant="ghost" size="sm" className="cursor-pointer">
                {t("finance.filterClear")}
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {balances.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {effectiveYear != null ? t("finance.noCashRecordsPeriod") : t("finance.noCashRecords")}
            </CardContent>
          </Card>
        ) : (
          balances.map((b) => {
            const balance = b.debit - b.credit;
            return (
              <Card key={`${b.type}_${b.currency}`}>
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">
                    {cashLabels[b.type as CashType] || b.type} ({b.currency})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold tabular-nums ${balance >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(balance, b.currency)}
                  </p>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {t("finance.inLabel", { amount: formatCurrency(b.debit, b.currency) })}
                    </span>
                    <span className="tabular-nums">
                      {t("finance.outLabel", { amount: formatCurrency(b.credit, b.currency) })}
                    </span>
                  </div>
                  {b.type === "bank" && reconByCurrency.get(b.currency) && (
                    <div className="mt-2 flex items-center gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                      <span>
                        {t("finance.reconLabel", {
                          matched: reconByCurrency.get(b.currency)!.reconciledCount,
                          total: reconByCurrency.get(b.currency)!.totalCount,
                        })}
                      </span>
                      {reconByCurrency.get(b.currency)!.latestStatus === "locked" && (
                        <Badge variant="success">{t("finance.locked")}</Badge>
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
          <CardTitle>{t("finance.txListTitle", { count: totalCount })}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("finance.filterType")}</TableHead>
              <TableHead>{t("common.description")}</TableHead>
              <TableHead>{t("common.currency")}</TableHead>
              <TableHead className="text-right">
                <TermTooltip term="debit">{t("finance.colMoneyIn")}</TermTooltip>
              </TableHead>
              <TableHead className="text-right">
                <TermTooltip term="kredit">{t("finance.colMoneyOut")}</TermTooltip>
              </TableHead>
              <TableHead>{t("finance.colReconciliation")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={<Wallet className="h-12 w-12" />}
                    title={t("finance.emptyTitle")}
                    description={t("finance.emptyDescription")}
                    actionLabel={t("finance.addNew")}
                    actionHref="/finance/new"
                  />
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{formatDateShort(tx.date)}</TableCell>
                  <TableCell className="text-foreground">
                    {cashLabels[tx.type as CashType] || tx.type}
                  </TableCell>
                  <TableCell className="text-foreground">{tx.description}</TableCell>
                  <TableCell className="text-muted-foreground">{tx.currency}</TableCell>
                  {/* Uang masuk hijau / uang keluar merah (semantik warna uang
                      MASTER.md); label kolomnya sendiri sudah membedakan
                      keduanya, jadi warna bukan satu-satunya penanda. */}
                  <TableCell className="text-right">
                    {Number(tx.debit) > 0 ? (
                      <Money value={Number(tx.debit)} currency={tx.currency} tone="positive" />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(tx.credit) > 0 ? (
                      <Money value={Number(tx.credit)} currency={tx.currency} tone="negative" />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {tx.type === "bank" ? (
                      tx.reconciled ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success-strong">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("finance.reconMatched")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("finance.reconNot")}</span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground/60">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/finance" searchParams={filters} />
      </Card>
    </div>
  );
}
