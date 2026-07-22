/**
 * Anggaran Akun (issue #29) — set a budget per P&L account per month.
 *
 * Only Laba/Rugi accounts (revenue/expense category) are budgetable: a budget is
 * compared against the income statement, so a balance-sheet account could never
 * show a realisation. The picker is filtered here; the API re-checks.
 */
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { accountCategoryFor } from "@/lib/accounting";
import { listBudgets } from "@/lib/budget-report";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PeriodPicker } from "@/components/shared/period-picker";
import { BudgetAccountsClient } from "./budget-accounts-client";

export const dynamic = "force-dynamic";

export default async function BudgetAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requirePageSession(["bos"]);
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const monthRaw = sp.month === undefined ? now.getMonth() + 1 : Number(sp.month);
  const month = monthRaw === 0 ? undefined : monthRaw;

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
    <div className="max-w-5xl">
      <Breadcrumb items={[{ label: "Anggaran & Target", href: "/budget" }, { label: "Anggaran Akun" }]} />
      <h1 className="text-2xl font-bold text-foreground">Anggaran Akun</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Nilai anggaran per akun pendapatan/beban untuk tiap bulan, dalam IDR. Satu anggaran per akun
        per bulan — menyimpan ulang akan menimpa nilai sebelumnya.
      </p>

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
