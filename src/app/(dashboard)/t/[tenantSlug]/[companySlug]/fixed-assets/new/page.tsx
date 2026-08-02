import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/lib/fixed-assets";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Tags } from "lucide-react";
import { AssetForm } from "./asset-form";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewFixedAssetPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("fixed_asset.write", params);
  const t = await getT();

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
      <div className="w-full">
        <PageHeader
          breadcrumbs={[
            { label: t("nav.items.fixedAssets"), href: "/fixed-assets" },
            { label: t("fixedAssets.addNew") },
          ]}
          title={t("fixedAssets.newTitle")}
        />
        <EmptyState
          icon={<Tags className="h-12 w-12" />}
          title={t("fixedAssets.noCategoryTitle")}
          description={t("fixedAssets.noCategoryFormDescription")}
          actionLabel={t("fixedAssets.createCategory")}
          actionHref="/fixed-assets/categories"
        />
      </div>
    );
  }

  const assetAccounts = accounts.filter((a) => a.type === "fixed_asset");
  const accumulatedAccounts = accounts.filter((a) => a.type === "accumulated_depreciation");
  const expenseAccounts = accounts.filter((a) => a.type === "expense" || a.type === "other_expense");

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.fixedAssets"), href: "/fixed-assets" },
          { label: t("fixedAssets.addNew") },
        ]}
        title={t("fixedAssets.newTitle")}
        description={
          <>
            {t("fixedAssets.newDescriptionBefore")}{" "}
            <Link href="/fixed-assets/categories" className="text-primary hover:underline">
              {t("fixedAssets.manageCategories")}
            </Link>
            {t("common.fullStop")}
          </>
        }
      />
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
