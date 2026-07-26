/**
 * Kategori aset tetap (issue #28) — daftar + buat. Master data; tanpa jurnal.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/lib/fixed-assets";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Tags } from "lucide-react";
import { CategoryForm } from "./category-form";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const codeToId = (accounts: { id: number; code: string }[], code: string) =>
  accounts.find((a) => a.code === code)?.id;

export default async function CategoriesPage() {
  await requirePagePermission("fixed_asset.read");
  const t = await getT();

  const [categories, accounts] = await Promise.all([
    getCategories(),
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const assetAccounts = accounts.filter((a) => a.type === "fixed_asset");
  const accumulatedAccounts = accounts.filter((a) => a.type === "accumulated_depreciation");
  const expenseAccounts = accounts.filter((a) => a.type === "expense" || a.type === "other_expense");

  // Prefill the form with the template's fixed-asset accounts (mapping defaults).
  const defaults = {
    assetAccountId: codeToId(accounts, "120101"),
    accumulatedAccountId: codeToId(accounts, "120102"),
    expenseAccountId: codeToId(accounts, "610103"),
  };

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.fixedAssets"), href: "/fixed-assets" },
          { label: t("fixedAssets.categories") },
        ]}
        title={t("fixedAssets.categoriesTitle")}
        description={t("fixedAssets.categoriesDescription")}
      />

      <div className="mb-6">
        <CategoryForm
          assetAccounts={assetAccounts}
          accumulatedAccounts={accumulatedAccounts}
          expenseAccounts={expenseAccounts}
          defaults={defaults}
        />
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-12 w-12" />}
          title={t("fixedAssets.emptyCategoryTitle")}
          description={t("fixedAssets.emptyCategoryDescription")}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("fixedAssets.colName")}</TableHead>
                <TableHead>{t("fixedAssets.colMethod")}</TableHead>
                <TableHead className="text-right">{t("fixedAssets.colLifeMonths")}</TableHead>
                <TableHead>{t("fixedAssets.colAssetAccount")}</TableHead>
                <TableHead>{t("fixedAssets.colAccumulatedAccount")}</TableHead>
                <TableHead>{t("fixedAssets.colExpenseAccount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                  <TableCell className="text-foreground">
                    {c.defaultMethod === "straight_line"
                      ? t("depreciationMethod.straight_line")
                      : c.defaultMethod}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {c.defaultUsefulLifeMonths}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{byId.get(c.assetAccountId)?.code ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {byId.get(c.accumulatedAccountId)?.code ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {byId.get(c.expenseAccountId)?.code ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
