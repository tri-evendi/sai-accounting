import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/lib/fixed-assets";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { Tags } from "lucide-react";
import { AssetForm } from "./asset-form";

export const dynamic = "force-dynamic";

export default async function NewFixedAssetPage() {
  await requirePageSession(["bos", "core"]);

  const [categories, accounts] = await Promise.all([
    getCategories(true),
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
  ]);

  if (categories.length === 0) {
    return (
      <div className="max-w-3xl">
        <Breadcrumb items={[{ label: "Aset Tetap", href: "/fixed-assets" }, { label: "Aset Baru" }]} />
        <EmptyState
          icon={<Tags className="h-12 w-12" />}
          title="Buat kategori aset dulu"
          description="Setiap aset harus masuk sebuah kategori yang menetapkan metode, umur manfaat, dan akun-akunnya."
          actionLabel="Buat Kategori"
          actionHref="/fixed-assets/categories"
        />
      </div>
    );
  }

  const assetAccounts = accounts.filter((a) => a.type === "fixed_asset");
  const accumulatedAccounts = accounts.filter((a) => a.type === "accumulated_depreciation");
  const expenseAccounts = accounts.filter((a) => a.type === "expense" || a.type === "other_expense");

  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "Aset Tetap", href: "/fixed-assets" }, { label: "Aset Baru" }]} />
      <h1 className="text-2xl font-bold text-gray-900">Daftarkan Aset Tetap</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Kendaraan, alat, atau bangunan yang akan disusutkan otomatis.{" "}
        <Link href="/fixed-assets/categories" className="text-blue-700 hover:underline">
          Kelola kategori
        </Link>
        .
      </p>
      <AssetForm
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          defaultMethod: c.defaultMethod,
          defaultUsefulLifeMonths: c.defaultUsefulLifeMonths,
          assetAccountId: c.assetAccountId,
          accumulatedAccountId: c.accumulatedAccountId,
          expenseAccountId: c.expenseAccountId,
        }))}
        assetAccounts={assetAccounts}
        accumulatedAccounts={accumulatedAccounts}
        expenseAccounts={expenseAccounts}
      />
    </div>
  );
}
