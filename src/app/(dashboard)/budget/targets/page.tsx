/**
 * Target Penjualan (issue #29) — set a sales target per period, optionally per
 * customer and/or commodity. Realisation is compared at the period total against
 * actual net sales (see @/lib/budget-report); the customer/item tags are a
 * planning breakdown the ledger does not itself split revenue by.
 */
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { listSalesTargets } from "@/lib/budget-report";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PeriodPicker } from "@/components/shared/period-picker";
import { SalesTargetClient } from "./sales-target-client";

export const dynamic = "force-dynamic";

export default async function SalesTargetsPage({
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

  const [customers, items, targets] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.item.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listSalesTargets(year, month),
  ]);

  return (
    <div className="max-w-5xl">
      <Breadcrumb items={[{ label: "Anggaran & Target", href: "/budget" }, { label: "Target Penjualan" }]} />
      <h1 className="text-2xl font-bold text-gray-900">Target Penjualan</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Target penjualan per bulan, dalam IDR. Pelanggan dan komoditas bersifat opsional — kosongkan
        untuk target umum periode itu.
      </p>

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
