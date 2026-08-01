/**
 * Target Penjualan (issue #29) — set a sales target per period, optionally per
 * customer and/or commodity. Realisation is compared at the period total against
 * actual net sales (see @/lib/budget-report); the customer/item tags are a
 * planning breakdown the ledger does not itself split revenue by.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { listSalesTargets } from "@/lib/budget-report";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodPicker } from "@/components/shared/period-picker";
import { SalesTargetClient } from "./sales-target-client";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SalesTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requirePagePermission("budget.manage");
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

  const [customers, items, targets] = await Promise.all([
    // `isActive: true` — target penjualan adalah rencana ke DEPAN, jadi master
    // yang sudah dinonaktifkan tak perlu ditawarkan lagi (issue #104). Target
    // yang terlanjur dibuat untuknya tetap tampil dan tetap dihitung.
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listSalesTargets(year, month),
  ]);

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("budget.breadcrumb"), href: "/budget" },
          { label: t("budget.surfaceTargetsTitle") },
        ]}
        title={t("budget.surfaceTargetsTitle")}
        description={t("budget.targetsDescription")}
      />

      <div className="mb-6">
        <PeriodPicker year={year} month={month} />
      </div>

      <SalesTargetClient
        customers={customers}
        items={items}
        targets={targets}
        defaultYear={year}
        defaultMonth={month ?? now.getMonth() + 1}
      />
    </div>
  );
}
