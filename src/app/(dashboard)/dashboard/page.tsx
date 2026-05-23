import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import {
  countStockHealth,
  summarizeInventory,
  toClientInventory,
  toLowStockAlerts,
} from "@/lib/inventory";
import { CASH_TYPE_LABELS, LOW_STOCK_THRESHOLD, type CashType } from "@/lib/constants";
import {
  ContractStatusChart,
  MonthlyActivityChart,
  CashFlowChart,
  StockStatusChart,
  StockLevelChart,
} from "@/components/shared/dashboard-charts";
import { ChartCard } from "@/components/dashboard/chart-card";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { StockAlertBanner } from "@/components/dashboard/stock-alert-banner";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  InventoryExportAction,
  FinanceExportAction,
} from "@/components/dashboard/dashboard-export-actions";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";

export const dynamic = "force-dynamic";

function buildMonthlyBuckets(monthsBack: number) {
  const map = new Map<string, { key: string; label: string }>();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short" });
    map.set(key, { key, label });
  }
  return map;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  const canViewFinance = role === "bos" || role === "core";
  const canViewContracts = canViewFinance;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [
    contractCount,
    invoiceCount,
    supplierCount,
    itemsWithStock,
    pendingContracts,
    signedContracts,
    canceledContracts,
    pendingInvoices,
    cashAccounts,
    recentCash,
    recentContracts,
    recentInvoices,
    latestContracts,
  ] = await Promise.all([
    canViewContracts ? prisma.contract.count() : Promise.resolve(0),
    canViewContracts ? prisma.invoice.count() : Promise.resolve(0),
    canViewContracts ? prisma.supplier.count() : Promise.resolve(0),
    prisma.item.findMany({ include: { stock: true }, orderBy: { name: "asc" } }),
    canViewContracts ? prisma.contract.count({ where: { status: "pending" } }) : Promise.resolve(0),
    canViewContracts ? prisma.contract.count({ where: { status: "signed" } }) : Promise.resolve(0),
    canViewContracts ? prisma.contract.count({ where: { status: "canceled" } }) : Promise.resolve(0),
    canViewContracts ? prisma.invoice.count({ where: { status: "pending" } }) : Promise.resolve(0),
    canViewFinance ? prisma.cashAccount.findMany({ orderBy: { date: "desc" } }) : Promise.resolve([]),
    canViewFinance
      ? prisma.cashAccount.findMany({
          where: { date: { gte: sixMonthsAgo } },
          select: { date: true, debit: true, credit: true, currency: true },
        })
      : Promise.resolve([]),
    canViewContracts
      ? prisma.contract.findMany({
          where: { createdAt: { gte: sixMonthsAgo } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
    canViewContracts
      ? prisma.invoice.findMany({
          where: { createdAt: { gte: sixMonthsAgo } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
    canViewContracts
      ? prisma.contract.findMany({ orderBy: { createdAt: "desc" }, take: 5 })
      : Promise.resolve([]),
  ]);

  const inventorySummary = summarizeInventory(itemsWithStock);
  const stockHealth = countStockHealth(inventorySummary);
  const lowStockItems = toLowStockAlerts(inventorySummary);

  const stockStatusData = [
    { name: "In Stock", value: stockHealth.healthy },
    { name: "Low Stock", value: stockHealth.lowStock },
    { name: "Empty", value: stockHealth.empty },
  ];

  const stockLevelData = inventorySummary.map((i) => ({
    name: i.name.length > 22 ? `${i.name.slice(0, 20)}…` : i.name,
    stock: i.currentStock,
    unit: i.unit,
  }));

  const stockChartHeight = Math.max(300, Math.min(8, stockLevelData.filter((d) => d.stock > 0).length) * 36 + 80);

  const recentMovements = itemsWithStock
    .flatMap((item) =>
      item.stock.map((s) => ({
        itemName: item.name,
        type: s.type,
        quantity: Number(s.quantity),
        date: s.date,
      }))
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  const balanceByAccount = new Map<string, FinanceBalanceRow>();
  for (const t of cashAccounts) {
    const key = `${t.type}_${t.currency}`;
    const existing = balanceByAccount.get(key) || {
      type: t.type,
      currency: t.currency,
      debit: 0,
      credit: 0,
      balance: 0,
    };
    existing.debit += Number(t.debit);
    existing.credit += Number(t.credit);
    existing.balance = existing.debit - existing.credit;
    balanceByAccount.set(key, existing);
  }

  const balanceByCurrency = new Map<string, number>();
  for (const t of cashAccounts) {
    const net = Number(t.debit) - Number(t.credit);
    balanceByCurrency.set(t.currency, (balanceByCurrency.get(t.currency) || 0) + net);
  }

  const financeBalances = Array.from(balanceByAccount.values());
  const financeTransactions: FinanceReportRow[] = cashAccounts.map((t) => ({
    date: t.date.toISOString(),
    type: t.type,
    description: t.description,
    currency: t.currency,
    debit: Number(t.debit),
    credit: Number(t.credit),
  }));

  const cashByCurrency = new Map<string, Map<string, { debit: number; credit: number }>>();
  const currenciesInCashFlow = [...new Set(recentCash.map((c) => c.currency))];

  for (const cur of currenciesInCashFlow) {
    const monthMap = new Map<string, { debit: number; credit: number }>();
    for (const [, meta] of buildMonthlyBuckets(6)) {
      monthMap.set(meta.key, { debit: 0, credit: 0 });
    }
    cashByCurrency.set(cur, monthMap);
  }

  for (const c of recentCash) {
    const key = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`;
    const monthMap = cashByCurrency.get(c.currency);
    const entry = monthMap?.get(key);
    if (entry) {
      entry.debit += Number(c.debit);
      entry.credit += Number(c.credit);
    }
  }

  const cashFlowByCurrency: Record<string, { month: string; debit: number; credit: number }[]> = {};
  for (const [cur, monthMap] of cashByCurrency) {
    cashFlowByCurrency[cur] = Array.from(monthMap.entries()).map(([key, val]) => {
      const [y, m] = key.split("-");
      const d = new Date(Number(y), Number(m) - 1);
      return { month: d.toLocaleDateString("en-US", { month: "short" }), ...val };
    });
  }

  const monthlyMap = new Map<string, { contracts: number; invoices: number; label: string }>();
  for (const [, meta] of buildMonthlyBuckets(6)) {
    monthlyMap.set(meta.key, { contracts: 0, invoices: 0, label: meta.label });
  }

  for (const c of recentContracts) {
    const key = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(key);
    if (entry) entry.contracts++;
  }
  for (const inv of recentInvoices) {
    const key = `${inv.createdAt.getFullYear()}-${String(inv.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(key);
    if (entry) entry.invoices++;
  }

  const monthlyData = Array.from(monthlyMap.values()).map(({ label, contracts, invoices }) => ({
    month: label,
    contracts,
    invoices,
  }));

  const contractStatusData = [
    { name: "Signed", value: signedContracts },
    { name: "Pending", value: pendingContracts },
    { name: "Canceled", value: canceledContracts },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Stock, finance, and operations overview for {session.user.name}
        </p>
      </header>

      <StockAlertBanner items={lowStockItems} />

      {/* ─── Inventory & Stock ─── */}
      <DashboardSection
        title="Inventory & Stock"
        description={`Low stock = on hand ≤ ${LOW_STOCK_THRESHOLD} units`}
        href="/inventory"
        hrefLabel="Open inventory"
        actions={<InventoryExportAction items={toClientInventory(inventorySummary)} />}
      >
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Items" value={stockHealth.totalItems} href="/inventory" />
          <StatCard
            title="Healthy Stock"
            value={stockHealth.healthy}
            href="/inventory"
            valueClassName="text-green-600"
          />
          <StatCard
            title="Low Stock"
            value={stockHealth.lowStock}
            href="/inventory/opname"
            valueClassName="text-amber-600"
          />
          <StatCard
            title="Out of Stock"
            value={stockHealth.empty}
            href="/inventory/opname"
            valueClassName="text-red-600"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            title="Stock availability"
            description="Share of items by stock level"
          >
            <StockStatusChart data={stockStatusData} />
          </ChartCard>
          <ChartCard
            title="Top quantities on hand"
            description="Highest current stock (up to 8 items)"
            chartMinHeight={stockChartHeight}
          >
            <StockLevelChart data={stockLevelData} />
          </ChartCard>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent stock movements</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left bg-gray-50/80">
                  <th className="px-6 py-3 font-medium text-gray-500">Item</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Type</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Qty</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentMovements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                      No stock movements yet
                    </td>
                  </tr>
                ) : (
                  recentMovements.map((m, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-6 py-3 font-medium text-gray-900">{m.itemName}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            m.type === "in"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {m.type === "in" ? "Stock In" : "Stock Out"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold tabular-nums">
                        {m.quantity}
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {new Date(m.date).toLocaleDateString("id-ID")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </DashboardSection>

      {/* ─── Finance ─── */}
      {canViewFinance && (
        <DashboardSection
          title="Finance & Cash"
          description="Balances and 6-month cash flow by currency"
          href="/finance"
          hrefLabel="Open finance"
          actions={
            <FinanceExportAction
              balances={financeBalances}
              transactions={financeTransactions}
            />
          }
        >
          {balanceByCurrency.size > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(balanceByCurrency.entries()).map(([cur, balance]) => (
                <Card key={cur} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm text-gray-500">Net balance · {cur}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold tabular-nums ${
                        balance >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(balance, cur)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-gray-500">
                No financial records yet —{" "}
                <Link href="/finance/new" className="text-blue-600 hover:underline">
                  add a transaction
                </Link>
              </CardContent>
            </Card>
          )}

          {financeBalances.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Balance by account</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left bg-gray-50/80">
                      <th className="px-6 py-3 font-medium text-gray-500">Account</th>
                      <th className="px-6 py-3 font-medium text-gray-500">Currency</th>
                      <th className="px-6 py-3 font-medium text-gray-500 text-right">Income</th>
                      <th className="px-6 py-3 font-medium text-gray-500 text-right">Expense</th>
                      <th className="px-6 py-3 font-medium text-gray-500 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeBalances.map((b) => (
                      <tr key={`${b.type}_${b.currency}`} className="border-b border-gray-100">
                        <td className="px-6 py-3 text-gray-900">
                          {CASH_TYPE_LABELS[b.type as CashType] || b.type}
                        </td>
                        <td className="px-6 py-3 text-gray-500">{b.currency}</td>
                        <td className="px-6 py-3 text-right text-green-600 tabular-nums">
                          {formatCurrency(b.debit, b.currency)}
                        </td>
                        <td className="px-6 py-3 text-right text-red-600 tabular-nums">
                          {formatCurrency(b.credit, b.currency)}
                        </td>
                        <td
                          className={`px-6 py-3 text-right font-semibold tabular-nums ${
                            b.balance >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(b.balance, b.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {currenciesInCashFlow.length > 0 && (
            <div
              className={`grid gap-6 ${
                currenciesInCashFlow.length === 1
                  ? "grid-cols-1"
                  : "lg:grid-cols-2"
              }`}
            >
              {currenciesInCashFlow.map((cur) => (
                <ChartCard
                  key={cur}
                  title={`Cash flow · ${cur}`}
                  description="Monthly income vs expense (last 6 months)"
                >
                  <CashFlowChart data={cashFlowByCurrency[cur] || []} currency={cur} />
                </ChartCard>
              ))}
            </div>
          )}
        </DashboardSection>
      )}

      {/* ─── Contracts ─── */}
      {canViewContracts && (
        <DashboardSection
          title="Contracts & Invoices"
          description="Commercial activity and pipeline"
          href="/contracts"
          hrefLabel="Open contracts"
        >
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard title="Contracts" value={contractCount} href="/contracts" />
            <StatCard
              title="Pending"
              value={pendingContracts}
              href="/contracts?status=pending"
              valueClassName="text-amber-600"
            />
            <StatCard title="Invoices" value={invoiceCount} href="/invoices" />
            <StatCard
              title="Pending invoices"
              value={pendingInvoices}
              href="/invoices?status=pending"
              valueClassName="text-amber-600"
            />
            <StatCard title="Suppliers" value={supplierCount} href="/suppliers" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Contract status" description="Current pipeline breakdown">
              <ContractStatusChart data={contractStatusData} />
            </ChartCard>
            <ChartCard
              title="Monthly activity"
              description="New contracts and invoices (6 months)"
            >
              <MonthlyActivityChart data={monthlyData} />
            </ChartCard>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent contracts</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left bg-gray-50/80">
                    <th className="px-6 py-3 font-medium text-gray-500">Contract No</th>
                    <th className="px-6 py-3 font-medium text-gray-500">Buyer</th>
                    <th className="px-6 py-3 font-medium text-gray-500">Date</th>
                    <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latestContracts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                        No contracts yet
                      </td>
                    </tr>
                  ) : (
                    latestContracts.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="px-6 py-3">
                          <Link
                            href={`/contracts/${c.id}`}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {c.contractNo}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-gray-700">{c.buyer}</td>
                        <td className="px-6 py-3 text-gray-500">
                          {new Date(c.date).toLocaleDateString("id-ID")}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              c.status === "signed"
                                ? "bg-green-100 text-green-800"
                                : c.status === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </DashboardSection>
      )}
    </div>
  );
}
