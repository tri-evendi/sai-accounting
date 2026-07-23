import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  countStockHealth,
  summarizeInventory,
  toClientInventory,
  toLowStockAlerts,
} from "@/lib/inventory";
import { CASH_TYPE_LABELS, LOW_STOCK_THRESHOLD, type CashType } from "@/lib/constants";
import { can } from "@/lib/authz";
import { quickActionsForRole } from "@/lib/quick-actions";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, Package } from "lucide-react";
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
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  InventoryExportAction,
  FinanceExportAction,
} from "@/components/dashboard/dashboard-export-actions";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";
import { getIncomeStatement } from "@/lib/reports";
import { getReceivables, getPayables } from "@/lib/receivables";
import { monthRange, summarizeByCurrency, toISODate } from "@/lib/dashboard-summary";

export const dynamic = "force-dynamic";

function buildMonthlyBuckets(monthsBack: number) {
  const map = new Map<string, { key: string; label: string }>();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("id-ID", { month: "short" });
    map.set(key, { key, label });
  }
  return map;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  // issue #2 — Aksi Cepat disaring PER PERAN di server: tombol yang tidak boleh
  // dipakai peran ini tidak ikut dirender sama sekali (bukan disembunyikan CSS).
  const quickActions = quickActionsForRole(role);
  // audit RBAC fase 4 — keputusan tampilan per-seksi membaca matriks izin,
  // bukan membandingkan string peran.
  const canViewFinance = can({ role }, "cash.read");
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

  /*
   * Plain-language summary layer (issue #3).
   *
   * Nothing is aggregated here: the three month figures come straight from
   * `getIncomeStatement`, and the two outstanding figures from `getReceivables` /
   * `getPayables`, so each card shows the very number its "Lihat detail" link
   * opens. `period` supplies both the query bounds and the link's `?from=&to=`,
   * which is what makes the income-statement cards reproducible by clicking.
   *
   * The AR/AP as-of instant mirrors `/receivables`'s own default (end of today),
   * for the same reason.
   *
   * Role split: `/reports/*` is bos-only while `/receivables` and `/payables`
   * admit core too, so staff get the two cards whose source they can actually
   * open. Showing staff a profit figure they cannot verify would break the
   * "every number is traceable" criterion rather than serve it.
   */
  const period = monthRange(new Date());
  const arAsOf = new Date(`${toISODate(new Date())}T23:59:59.999`);
  const canViewReports = can({ role }, "report.read");

  const [incomeStatement, receivables, payables] = await Promise.all([
    canViewReports ? getIncomeStatement(period.from, period.to) : Promise.resolve(null),
    canViewFinance ? getReceivables({ asOf: arAsOf }) : Promise.resolve(null),
    canViewFinance ? getPayables({ asOf: arAsOf }) : Promise.resolve(null),
  ]);

  const incomeStatementHref = `/reports/income-statement?from=${period.fromISO}&to=${period.toISO}`;

  const inventorySummary = summarizeInventory(itemsWithStock);
  const stockHealth = countStockHealth(inventorySummary);
  const lowStockItems = toLowStockAlerts(inventorySummary);

  const stockStatusData = [
    { name: "Aman", value: stockHealth.healthy },
    { name: "Menipis", value: stockHealth.lowStock },
    { name: "Habis", value: stockHealth.empty },
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
      return { month: d.toLocaleDateString("id-ID", { month: "short" }), ...val };
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
    { name: "Sah", value: signedContracts },
    { name: "Menunggu", value: pendingContracts },
    { name: "Dibatalkan", value: canceledContracts },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <PageHeader
        className="mb-0"
        title="Beranda"
        description={<>Ringkasan stok, kas, dan penjualan untuk {session.user.name}</>}
      />

      {/* ─── Aksi Cepat (issue #2) ───
          Paling atas karena beranda lebih sering dipakai untuk MENGERJAKAN
          sesuatu daripada untuk membaca angka. */}
      <QuickActions actions={quickActions} />

      <StockAlertBanner items={lowStockItems} />

      {/* ─── Ringkasan bahasa awam (issue #3) ───
          Sits above the standard reports on purpose: an owner should get the
          five answers first and only descend into the ledger if they want to.
          Every card links to the report that owns its number. */}
      {(incomeStatement || receivables || payables) && (
        // Pembungkus ini hanya penanda sasaran tur panduan (issue #21).
        <div data-tour="ringkasan">
        <DashboardSection
          title="Ringkasan Bahasa Sehari-hari"
          description="Angka utama tanpa istilah akuntansi. Semua nilai dalam IDR (nilai dasar buku besar) dan bisa dicek di laporan sumbernya."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {incomeStatement && (
              <>
                <SummaryCard
                  title="Uang Masuk"
                  amount={incomeStatement.totalRevenue}
                  direction="in"
                  period={period.label}
                  explanation="Seluruh pemasukan yang sudah dibukukan bulan ini, misalnya penjualan ke pelanggan."
                  href={incomeStatementHref}
                  hrefLabel="Lihat detail di Laba/Rugi"
                />
                <SummaryCard
                  title="Uang Keluar"
                  amount={incomeStatement.totalExpense}
                  direction="out"
                  period={period.label}
                  explanation="Seluruh biaya dan pengeluaran yang sudah dibukukan bulan ini."
                  href={incomeStatementHref}
                  hrefLabel="Lihat detail di Laba/Rugi"
                />
                <SummaryCard
                  title="Selisih (Untung / Rugi)"
                  amount={Math.abs(incomeStatement.netIncome)}
                  direction={incomeStatement.netIncome >= 0 ? "profit" : "loss"}
                  period={period.label}
                  explanation="Uang masuk dikurangi uang keluar bulan ini — angka bertanda plus berarti untung, minus berarti rugi."
                  href={incomeStatementHref}
                  hrefLabel="Lihat detail di Laba/Rugi"
                />
              </>
            )}

            {receivables && (
              <SummaryCard
                title="Pelanggan Belum Bayar"
                amount={receivables.aging.total}
                direction="receivable"
                period={`per ${formatDateShort(arAsOf)}`}
                explanation="Sisa tagihan dari faktur dan kontrak yang belum dilunasi pelanggan."
                href="/receivables"
                hrefLabel="Lihat daftar piutang"
                note={
                  receivables.overdueCount > 0
                    ? `${receivables.overdueCount} dokumen sudah lewat jatuh tempo.`
                    : undefined
                }
                unresolved={receivables.aging.unresolved}
                breakdown={summarizeByCurrency(receivables.rows)}
              />
            )}

            {payables && (
              <SummaryCard
                title="Tagihan yang Harus Dibayar"
                amount={payables.aging.total}
                direction="payable"
                period={`per ${formatDateShort(arAsOf)}`}
                explanation="Sisa pembelian dari pemasok yang belum Anda lunasi."
                href="/payables"
                hrefLabel="Lihat daftar utang"
                note={
                  payables.overdueCount > 0
                    ? `${payables.overdueCount} tagihan sudah lewat jatuh tempo.`
                    : undefined
                }
                unresolved={payables.aging.unresolved}
                breakdown={summarizeByCurrency(payables.rows)}
              />
            )}
          </div>
        </DashboardSection>
        </div>
      )}

      {/* ─── Stok ─── */}
      <DashboardSection
        title="Stok Barang"
        description={`Stok menipis = sisa ≤ ${LOW_STOCK_THRESHOLD} satuan`}
        href="/inventory"
        hrefLabel="Buka stok barang"
        actions={<InventoryExportAction items={toClientInventory(inventorySummary)} />}
      >
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard title="Jumlah Barang" value={stockHealth.totalItems} href="/inventory" />
          <StatCard
            title="Stok Aman"
            value={stockHealth.healthy}
            href="/inventory"
            valueClassName="text-success"
          />
          <StatCard
            title="Stok Menipis"
            value={stockHealth.lowStock}
            href="/inventory/opname"
            valueClassName="text-warning"
          />
          <StatCard
            title="Stok Habis"
            value={stockHealth.empty}
            href="/inventory/opname"
            valueClassName="text-destructive"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            title="Kondisi stok"
            description="Sebaran barang menurut sisa stoknya"
          >
            <StockStatusChart data={stockStatusData} />
          </ChartCard>
          <ChartCard
            title="Stok terbanyak"
            description="Sisa stok terbesar saat ini (maksimal 8 barang)"
            chartMinHeight={stockChartHeight}
          >
            <StockLevelChart data={stockLevelData} />
          </ChartCard>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pergerakan stok terakhir</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left bg-muted/80">
                  <th className="px-6 py-3 font-medium text-muted-foreground">Barang</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Jenis</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground text-right">Jumlah</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {recentMovements.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        icon={<Package className="h-12 w-12" />}
                        title="Belum ada pergerakan stok"
                        description="Setiap barang masuk dan keluar akan muncul di sini. Catat yang pertama."
                        actionLabel="Tambah / Kurangi Stok"
                        actionHref="/inventory/update"
                      />
                    </td>
                  </tr>
                ) : (
                  recentMovements.map((m, i) => (
                    <tr key={i} className="border-b border-border hover:bg-muted/80">
                      <td className="px-6 py-3 font-medium text-foreground">{m.itemName}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            m.type === "in"
                              ? "bg-success-soft text-success-strong"
                              : "bg-destructive-soft text-destructive-strong"
                          }`}
                        >
                          {m.type === "in" ? "Barang Masuk" : "Barang Keluar"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold tabular-nums">
                        {m.quantity}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
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
          title="Kas & Bank"
          description="Saldo dan pergerakan uang 6 bulan terakhir per mata uang"
          href="/finance"
          hrefLabel="Buka kas & bank"
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
                    <CardTitle className="text-sm text-muted-foreground">Saldo bersih · {cur}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold tabular-nums ${
                        balance >= 0 ? "text-success" : "text-destructive"
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
              <CardContent className="py-10 text-center text-muted-foreground">
                Belum ada catatan kas —{" "}
                <Link href="/finance/new" className="text-primary hover:underline">
                  catat transaksi pertama
                </Link>
              </CardContent>
            </Card>
          )}

          {financeBalances.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Saldo per akun</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left bg-muted/80">
                      <th className="px-6 py-3 font-medium text-muted-foreground">Akun</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground">Mata Uang</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground text-right">Uang Masuk</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground text-right">Uang Keluar</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeBalances.map((b) => (
                      <tr key={`${b.type}_${b.currency}`} className="border-b border-border">
                        <td className="px-6 py-3 text-foreground">
                          {CASH_TYPE_LABELS[b.type as CashType] || b.type}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">{b.currency}</td>
                        <td className="px-6 py-3 text-right text-success tabular-nums">
                          {formatCurrency(b.debit, b.currency)}
                        </td>
                        <td className="px-6 py-3 text-right text-destructive tabular-nums">
                          {formatCurrency(b.credit, b.currency)}
                        </td>
                        <td
                          className={`px-6 py-3 text-right font-semibold tabular-nums ${
                            b.balance >= 0 ? "text-success" : "text-destructive"
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
                  title={`Uang masuk & keluar · ${cur}`}
                  description="Perbandingan per bulan (6 bulan terakhir)"
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
          title="Penjualan & Kontrak"
          description="Aktivitas penjualan dan kesepakatan yang sedang berjalan"
          href="/contracts"
          hrefLabel="Buka kontrak"
        >
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard title="Kontrak" value={contractCount} href="/contracts" />
            <StatCard
              title="Kontrak Menunggu"
              value={pendingContracts}
              href="/contracts?status=pending"
              valueClassName="text-warning"
            />
            <StatCard title="Tagihan Penjualan" value={invoiceCount} href="/invoices" />
            <StatCard
              title="Tagihan Menunggu"
              value={pendingInvoices}
              href="/invoices?status=pending"
              valueClassName="text-warning"
            />
            <StatCard title="Pemasok" value={supplierCount} href="/suppliers" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Status kontrak" description="Sebaran kontrak menurut statusnya">
              <ContractStatusChart data={contractStatusData} />
            </ChartCard>
            <ChartCard
              title="Aktivitas bulanan"
              description="Kontrak dan tagihan baru (6 bulan terakhir)"
            >
              <MonthlyActivityChart data={monthlyData} />
            </ChartCard>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Kontrak terbaru</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left bg-muted/80">
                    <th className="px-6 py-3 font-medium text-muted-foreground">
                      <TermTooltip term="kontrak">No. Kontrak</TermTooltip>
                    </th>
                    <th className="px-6 py-3 font-medium text-muted-foreground">Pembeli</th>
                    <th className="px-6 py-3 font-medium text-muted-foreground">Tanggal</th>
                    <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latestContracts.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState
                          icon={<FileText className="h-12 w-12" />}
                          title="Belum ada kontrak"
                          description="Kontrak adalah awal rantai dokumen: dari sini lahir surat jalan, tagihan, dan pembayarannya."
                          actionLabel="+ Buat Kontrak"
                          actionHref="/contracts/new"
                        />
                      </td>
                    </tr>
                  ) : (
                    latestContracts.map((c) => (
                      <tr key={c.id} className="border-b border-border hover:bg-muted/80">
                        <td className="px-6 py-3">
                          <Link
                            href={`/contracts/${c.id}`}
                            className="text-primary hover:underline font-medium"
                          >
                            {c.contractNo}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-foreground">{c.buyer}</td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {new Date(c.date).toLocaleDateString("id-ID")}
                        </td>
                        <td className="px-6 py-3">
                          <StatusBadge status={c.status} />
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
