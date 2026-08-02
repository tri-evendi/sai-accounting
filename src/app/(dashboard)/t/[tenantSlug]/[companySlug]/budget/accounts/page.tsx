/**
 * Anggaran Akun (issue #29) — set a budget per P&L account per month.
 *
 * Only Laba/Rugi accounts (revenue/expense category) are budgetable: a budget is
 * compared against the income statement, so a balance-sheet account could never
 * show a realisation. The picker is filtered here; the API re-checks.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { accountCategoryFor } from "@/lib/accounting";
import { listBudgets } from "@/lib/budget-report";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodPicker } from "@/components/shared/period-picker";
import { BudgetAccountsClient } from "./budget-accounts-client";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BudgetAccountsPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requirePagePermission("budget.manage", params);
  const t = await getT();
  const sp = await searchParams;
  const now = new Date();
  // URL bisa diedit tangan: `Number("abc")` = NaN yang lolos ke periodBounds/
  // Prisma dan berujung 500. Rentang mengikuti validations/period.ts
  // (tahun 2000–2100, bulan 1–12); nilai tak sah jatuh ke bawaan halaman
  // (tahun ini / bulan ini), bulan 0 tetap berarti setahun penuh.
  const yearRaw = Number(sp.year);
  const year =
    Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : now.getFullYear();
  const monthRaw = sp.month === undefined ? now.getMonth() + 1 : Number(sp.month);
  const month =
    monthRaw === 0
      ? undefined
      : Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
        ? monthRaw
        : now.getMonth() + 1;

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });
  const budgetable = accounts
    .map((a) => ({ ...a, category: accountCategoryFor(a.type) }))
    .filter((a) => a.category === "revenue" || a.category === "expense")
    .map((a) => ({ id: a.id, code: a.code, name: a.name }));

  const budgets = await listBudgets(year, month);

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("budget.breadcrumb"), href: "/budget" },
          { label: t("budget.surfaceAccountsTitle") },
        ]}
        title={t("budget.surfaceAccountsTitle")}
        description={t("budget.accountsDescription")}
      />

      <div className="mb-6">
        <PeriodPicker year={year} month={month} />
      </div>

      <BudgetAccountsClient
        accounts={budgetable}
        budgets={budgets}
        defaultYear={year}
        defaultMonth={month ?? now.getMonth() + 1}
      />
    </div>
  );
}
