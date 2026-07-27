import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  countStockHealth,
  summarizeInventory,
  toClientInventory,
  toLowStockAlerts,
} from "@/lib/inventory";
import { LOW_STOCK_THRESHOLD, type CashType } from "@/lib/constants";
import { effectivePermissionsFor } from "@/lib/authz-effective";
import { quickActionsForRole } from "@/lib/quick-actions";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { visibleWorkflows } from "@/lib/workflows";
import { WorkflowGuide } from "@/components/dashboard/workflow-guide";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, Package } from "lucide-react";
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
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { cashTypeLabels } from "@/lib/i18n/labels";

export const dynamic = "force-dynamic";

/*
 * Beranda = permukaan MENGERJAKAN, bukan melihat.
 *
 * Grafik pernah tinggal di sini dan sudah pindah ke halaman yang angkanya
 * dijelaskan: kondisi stok & stok terbanyak → /inventory, uang masuk/keluar
 * per mata uang → /reports/cash-flow, status kontrak & aktivitas bulanan →
 * /contracts. Dua alasan, keduanya masih berlaku kalau nanti ada yang
 * tergoda mengembalikannya:
 *
 *  • Beranda adalah titik BERANGKAT pekerjaan — Aksi Cepat paling atas,
 *    lalu urutan alur kerja. Grafik adalah permukaan melihat, dan di
 *    halaman tujuannya ia berdiri tepat di sebelah baris yang bisa dicek.
 *  • `components/shared/dashboard-charts.tsx` adalah SATU-SATUNYA pemakai
 *    recharts. Selama ia diimpor dari sini, seluruh pustaka grafik ikut
 *    termuat di halaman pertama yang dibuka SETIAP pengguna — termasuk
 *    yang datang cuma untuk menekan satu tombol Aksi Cepat.
 *
 * Konsekuensinya beranda tidak lagi MENGHITUNG apa pun untuk grafik: kueri
 * 6 bulan (kas, kontrak, tagihan) dan hitungan status sah/dibatalkan ikut
 * hilang, bukan sekadar tidak dirender. Lihat
 * design-system/sai-accounting/pages/dashboard.md.
 */
export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  /*
   * Beranda menjaga dirinya sendiri dengan `auth()` (terdaftar di
   * tests/authz-coverage.test.ts), jadi ia juga harus memeriksa PERUSAHAAN
   * sendiri — penjaga izin yang biasanya melakukannya tidak lewat sini.
   * Tanpa perusahaan aktif setiap query di bawah akan melempar; pengguna
   * dikirim memilih perusahaannya dulu (issue #104).
   */
  if (session.user.companyId == null) redirect("/select-company");

  const t = await getT();
  const dictionary = await getDictionary(await getLocale());

  const role = session.user.role;
  // issue #73/#75 — semua keputusan tampilan beranda membaca set izin FINAL
  // si pengguna (bawaan + override peran + izin khusus pengguna), sekali muat
  // per render.
  const allowed = new Set(await effectivePermissionsFor(session.user));
  // issue #2 — Aksi Cepat disaring PER PERAN di server: tombol yang tidak boleh
  // dipakai peran ini tidak ikut dirender sama sekali (bukan disembunyikan CSS).
  const quickActions = quickActionsForRole(role, allowed);
  // issue: panduan urutan "mulai dari mana" — alur bernomor per pekerjaan,
  // disaring izin efektif seperti Aksi Cepat.
  const workflows = visibleWorkflows(role, allowed);
  // audit RBAC fase 4 — keputusan tampilan per-seksi membaca matriks izin,
  // bukan membandingkan string peran.
  const canViewFinance = allowed.has("cash.read");
  const canViewContracts = canViewFinance;
  /*
   * issue #103 — permukaan STOK milik modul `inventory`, dan modul itu mati di
   * preset "Jasa" maupun "Distribusi tanpa gudang". Sampai sekarang seksinya
   * tetap dirender tanpa syarat: perusahaan jasa melihat kartu stok berisi nol,
   * empty state yang mengajak "Tambah/Kurangi Stok", dan spanduk stok menipis —
   * yang semuanya bermuara ke /inventory dan memantul ke "fitur belum aktif".
   *
   * `allowed` sudah disaring modul (`effectivePermissionsFor`), jadi satu cek
   * izin menutup keduanya: modul mati ATAU peran memang tak boleh melihat stok.
   */
  const canViewInventory = allowed.has("inventory.read");
  const canUpdateInventory = allowed.has("inventory.write");
  // Ajakan "buat kontrak" di empty state kontrak: seksinya masih dibuka izin
  // KAS (lihat `canViewContracts` di atas — warisan, bukan keputusan baru),
  // jadi tombolnya perlu izinnya sendiri agar tidak mengajak ke modul `trading`
  // yang mungkin mati.
  const canCreateContract = allowed.has("contract.write");

  const [
    contractCount,
    invoiceCount,
    supplierCount,
    itemsWithStock,
    pendingContracts,
    pendingInvoices,
    cashMovements,
    latestContracts,
  ] = await Promise.all([
    canViewContracts ? prisma.contract.count() : Promise.resolve(0),
    canViewContracts ? prisma.invoice.count() : Promise.resolve(0),
    canViewContracts ? prisma.supplier.count() : Promise.resolve(0),
    prisma.item.findMany({ include: { stockMovements: true }, orderBy: { name: "asc" } }),
    canViewContracts ? prisma.contract.count({ where: { status: "pending" } }) : Promise.resolve(0),
    canViewContracts ? prisma.invoice.count({ where: { status: "pending" } }) : Promise.resolve(0),
    canViewFinance ? prisma.cashMovement.findMany({ orderBy: { date: "desc" } }) : Promise.resolve([]),
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
  const canViewReports = allowed.has("report.read");

  const [incomeStatement, receivables, payables] = await Promise.all([
    canViewReports ? getIncomeStatement(period.from, period.to) : Promise.resolve(null),
    canViewFinance ? getReceivables({ asOf: arAsOf }) : Promise.resolve(null),
    canViewFinance ? getPayables({ asOf: arAsOf }) : Promise.resolve(null),
  ]);

  const incomeStatementHref = `/reports/income-statement?from=${period.fromISO}&to=${period.toISO}`;

  const inventorySummary = summarizeInventory(itemsWithStock);
  const stockHealth = countStockHealth(inventorySummary);
  const lowStockItems = toLowStockAlerts(inventorySummary);

  const recentMovements = itemsWithStock
    .flatMap((item) =>
      item.stockMovements.map((s) => ({
        itemName: item.name,
        type: s.type,
        quantity: Number(s.quantity),
        date: s.date,
      }))
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  const balanceByAccount = new Map<string, FinanceBalanceRow>();
  for (const t of cashMovements) {
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
  for (const t of cashMovements) {
    const net = Number(t.debit) - Number(t.credit);
    balanceByCurrency.set(t.currency, (balanceByCurrency.get(t.currency) || 0) + net);
  }

  const financeBalances = Array.from(balanceByAccount.values());
  const financeTransactions: FinanceReportRow[] = cashMovements.map((t) => ({
    date: t.date.toISOString(),
    type: t.type,
    description: t.description,
    currency: t.currency,
    debit: Number(t.debit),
    credit: Number(t.credit),
  }));

  return (
    <div className="w-full space-y-10">
      <PageHeader
        title={t("nav.items.dashboard")}
        description={t("dashboard.description", { name: session.user.name })}
      />

      {/* ─── Aksi Cepat (issue #2) ───
          Paling atas karena beranda lebih sering dipakai untuk MENGERJAKAN
          sesuatu daripada untuk membaca angka. */}
      <QuickActions actions={quickActions} />

      {/* ─── Alur Kerja (panduan urutan) ───
          Tepat di bawah Aksi Cepat: setelah tombol "kerjakan sekarang", tunjukkan
          URUTAN kerjanya bagi yang belum tahu mulai dari mana. */}
      <WorkflowGuide workflows={workflows} t={t} />

      {canViewInventory && <StockAlertBanner items={lowStockItems} />}

      {/* ─── Ringkasan bahasa awam (issue #3) ───
          Sits above the standard reports on purpose: an owner should get the
          five answers first and only descend into the ledger if they want to.
          Every card links to the report that owns its number. */}
      {(incomeStatement || receivables || payables) && (
        // Pembungkus ini hanya penanda sasaran tur panduan (issue #21).
        <div data-tour="ringkasan">
        <DashboardSection
          title={t("dashboard.plainTitle")}
          description={t("dashboard.plainDescription")}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {incomeStatement && (
              <>
                <SummaryCard
                  title={t("finance.colMoneyIn")}
                  amount={incomeStatement.totalRevenue}
                  direction="in"
                  period={period.label}
                  explanation={t("dashboard.moneyInExplanation")}
                  href={incomeStatementHref}
                  hrefLabel={t("dashboard.incomeStatementLink")}
                />
                <SummaryCard
                  title={t("finance.colMoneyOut")}
                  amount={incomeStatement.totalExpense}
                  direction="out"
                  period={period.label}
                  explanation={t("dashboard.moneyOutExplanation")}
                  href={incomeStatementHref}
                  hrefLabel={t("dashboard.incomeStatementLink")}
                />
                <SummaryCard
                  title={t("dashboard.profitLoss")}
                  amount={Math.abs(incomeStatement.netIncome)}
                  direction={incomeStatement.netIncome >= 0 ? "profit" : "loss"}
                  period={period.label}
                  explanation={t("dashboard.profitLossExplanation")}
                  href={incomeStatementHref}
                  hrefLabel={t("dashboard.incomeStatementLink")}
                />
              </>
            )}

            {receivables && (
              <SummaryCard
                title={t("receivables.title")}
                amount={receivables.aging.total}
                direction="receivable"
                period={t("dashboard.asOf", { date: formatDateShort(arAsOf) })}
                explanation={t("dashboard.receivablesExplanation")}
                href="/receivables"
                hrefLabel={t("dashboard.receivablesLink")}
                note={
                  receivables.overdueCount > 0
                    ? t("common.overdueDocs", { count: receivables.overdueCount })
                    : undefined
                }
                unresolved={receivables.aging.unresolved}
                breakdown={summarizeByCurrency(receivables.rows)}
              />
            )}

            {payables && (
              <SummaryCard
                title={t("payables.title")}
                amount={payables.aging.total}
                direction="payable"
                period={t("dashboard.asOf", { date: formatDateShort(arAsOf) })}
                explanation={t("dashboard.payablesExplanation")}
                href="/payables"
                hrefLabel={t("dashboard.payablesLink")}
                note={
                  payables.overdueCount > 0
                    ? t("dashboard.overdueBills", { count: payables.overdueCount })
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
      {canViewInventory && (
      <DashboardSection
        title={t("nav.items.inventory")}
        description={t("dashboard.stockDescription", { threshold: LOW_STOCK_THRESHOLD })}
        href="/inventory"
        hrefLabel={t("dashboard.stockHrefLabel")}
        actions={<InventoryExportAction items={toClientInventory(inventorySummary)} />}
      >
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard title={t("dashboard.statItems")} value={stockHealth.totalItems} href="/inventory" />
          <StatCard
            title={t("dashboard.statHealthy")}
            value={stockHealth.healthy}
            href="/inventory"
            valueClassName="text-success"
          />
          <StatCard
            title={t("dashboard.statLow")}
            value={stockHealth.lowStock}
            href="/inventory/opname"
            valueClassName="text-warning"
          />
          <StatCard
            title={t("dashboard.statEmpty")}
            value={stockHealth.empty}
            href="/inventory/opname"
            valueClassName="text-destructive"
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("dashboard.recentMovementsTitle")}</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/80 hover:bg-muted/80">
                <TableHead>{t("common.item")}</TableHead>
                <TableHead>{t("suppliers.colType")}</TableHead>
                <TableHead className="text-right">{t("common.quantity")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentMovements.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="p-0">
                    <EmptyState
                      icon={<Package className="h-12 w-12" />}
                      title={t("dashboard.emptyMovementsTitle")}
                      description={t("dashboard.emptyMovementsDescription")}
                      actionLabel={canUpdateInventory ? t("common.addRemoveStock") : undefined}
                      actionHref={canUpdateInventory ? "/inventory/update" : undefined}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                recentMovements.map((m, i) => (
                  <TableRow key={i} className="hover:bg-muted/80">
                    <TableCell className="font-medium text-foreground">{m.itemName}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.type === "in"
                            ? "bg-success-soft text-success-strong"
                            : "bg-destructive-soft text-destructive-strong"
                        }`}
                      >
                        {m.type === "in" ? t("dashboard.stockIn") : t("dashboard.stockOut")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {m.quantity}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(m.date).toLocaleDateString("id-ID")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </DashboardSection>
      )}

      {/* ─── Finance ─── */}
      {canViewFinance && (
        <DashboardSection
          title={t("nav.groups.cash")}
          description={t("dashboard.financeDescription")}
          href="/finance"
          hrefLabel={t("dashboard.financeHrefLabel")}
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
                    <CardTitle className="text-sm text-muted-foreground">
                      {t("dashboard.netBalance", { currency: cur })}
                    </CardTitle>
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
                {t("dashboard.noCashBefore")}{" "}
                <Link href="/finance/new" className="text-primary hover:underline">
                  {t("dashboard.noCashLink")}
                </Link>
              </CardContent>
            </Card>
          )}

          {financeBalances.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("dashboard.balancePerAccount")}</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80 hover:bg-muted/80">
                    <TableHead>{t("common.account")}</TableHead>
                    <TableHead>{t("common.currency")}</TableHead>
                    <TableHead className="text-right">{t("finance.colMoneyIn")}</TableHead>
                    <TableHead className="text-right">{t("finance.colMoneyOut")}</TableHead>
                    <TableHead className="text-right">{t("common.balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financeBalances.map((b) => (
                    <TableRow key={`${b.type}_${b.currency}`}>
                      <TableCell className="text-foreground">
                        {cashTypeLabels(dictionary)[b.type as CashType] || b.type}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{b.currency}</TableCell>
                      {/* Warna kolom = semantik uang masuk/keluar (hijau/merah per
                          kolom, bukan per tanda) — tidak 1:1 dengan MoneyCell,
                          jadi format lama dipertahankan. */}
                      <TableCell className="text-right text-success tabular-nums">
                        {formatCurrency(b.debit, b.currency)}
                      </TableCell>
                      <TableCell className="text-right text-destructive tabular-nums">
                        {formatCurrency(b.credit, b.currency)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold tabular-nums ${
                          b.balance >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {formatCurrency(b.balance, b.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

        </DashboardSection>
      )}

      {/* ─── Contracts ─── */}
      {canViewContracts && (
        <DashboardSection
          title={t("dashboard.contractsTitle")}
          description={t("dashboard.contractsDescription")}
          href="/contracts"
          hrefLabel={t("dashboard.contractsHrefLabel")}
        >
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard title={t("nav.items.contracts")} value={contractCount} href="/contracts" />
            <StatCard
              title={t("dashboard.statPendingContracts")}
              value={pendingContracts}
              href="/contracts?status=pending"
              valueClassName="text-warning"
            />
            <StatCard title={t("nav.items.invoices")} value={invoiceCount} href="/invoices" />
            <StatCard
              title={t("dashboard.statPendingInvoices")}
              value={pendingInvoices}
              href="/invoices?status=pending"
              valueClassName="text-warning"
            />
            <StatCard title={t("nav.items.suppliers")} value={supplierCount} href="/suppliers" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("dashboard.latestContracts")}</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/80 hover:bg-muted/80">
                  <TableHead>
                    <TermTooltip term="kontrak">{t("contracts.colNo")}</TermTooltip>
                  </TableHead>
                  <TableHead>{t("contracts.colBuyer")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestContracts.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="p-0">
                      <EmptyState
                        icon={<FileText className="h-12 w-12" />}
                        title={t("contracts.emptyTitle")}
                        description={t("dashboard.emptyContractsDescription")}
                        actionLabel={canCreateContract ? t("contracts.addNew") : undefined}
                        actionHref={canCreateContract ? "/contracts/new" : undefined}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  latestContracts.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/80">
                      <TableCell>
                        <Link
                          href={`/contracts/${c.id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {c.contractNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-foreground">{c.buyer}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(c.date).toLocaleDateString("id-ID")}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </DashboardSection>
      )}
    </div>
  );
}
