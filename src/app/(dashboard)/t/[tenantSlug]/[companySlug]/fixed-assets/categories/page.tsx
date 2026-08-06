/**
 * Kategori aset tetap (issue #28) — daftar + buat. Master data; tanpa jurnal.
 *
 * Dikonversi ke token Ant Design pada issue #197; **tetap server component**.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/lib/fixed-assets";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StaticTable } from "@/components/ui/static-table";
import { qtyColumn, textColumn, type SaiColumns } from "@/components/ui/table-columns";

import { Tags } from "lucide-react";
import { CategoryForm } from "./category-form";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const SECTION_GAP = 24;
const EMPTY_ICON_SIZE = 48;

const codeToId = (accounts: { id: number; code: string }[], code: string) =>
  accounts.find((a) => a.code === code)?.id;

/** Satu baris daftar, diratakan supaya kolomnya bertipe penuh. */
interface CategoryRow {
  id: number;
  name: string;
  method: string;
  lifeMonths: number;
  assetCode: string;
  accumulatedCode: string;
  expenseCode: string;
}

export default async function CategoriesPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("fixed_asset.read", params);
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

  const rows: CategoryRow[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    method:
      c.defaultMethod === "straight_line"
        ? t("depreciationMethod.straight_line")
        : c.defaultMethod,
    lifeMonths: c.defaultUsefulLifeMonths,
    // Akun yang tak lagi aktif tidak punya kode untuk ditampilkan — "—",
    // bukan string kosong yang terbaca seperti kolom yang lupa diisi.
    assetCode: byId.get(c.assetAccountId)?.code ?? "—",
    accumulatedCode: byId.get(c.accumulatedAccountId)?.code ?? "—",
    expenseCode: byId.get(c.expenseAccountId)?.code ?? "—",
  }));

  const accountCode = (value: unknown) => (
    <span style={{ color: "var(--ant-color-text-secondary)" }}>{String(value)}</span>
  );

  const columns: SaiColumns<CategoryRow> = [
    textColumn<CategoryRow>({ dataIndex: "name", title: t("fixedAssets.colName") }),
    textColumn<CategoryRow>({ dataIndex: "method", title: t("fixedAssets.colMethod") }),
    qtyColumn<CategoryRow>({
      dataIndex: "lifeMonths",
      title: t("fixedAssets.colLifeMonths"),
      sorter: false,
    }),
    {
      key: "assetCode",
      dataIndex: "assetCode",
      title: t("fixedAssets.colAssetAccount"),
      align: "left",
      render: accountCode,
    },
    {
      key: "accumulatedCode",
      dataIndex: "accumulatedCode",
      title: t("fixedAssets.colAccumulatedAccount"),
      align: "left",
      render: accountCode,
    },
    {
      key: "expenseCode",
      dataIndex: "expenseCode",
      title: t("fixedAssets.colExpenseAccount"),
      align: "left",
      render: accountCode,
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.fixedAssets"), href: "/fixed-assets" },
          { label: t("fixedAssets.categories") },
        ]}
        title={t("fixedAssets.categoriesTitle")}
        description={t("fixedAssets.categoriesDescription")}
      />

      <div style={{ marginBottom: SECTION_GAP }}>
        <CategoryForm
          assetAccounts={assetAccounts}
          accumulatedAccounts={accumulatedAccounts}
          expenseAccounts={expenseAccounts}
          defaults={defaults}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Tags size={EMPTY_ICON_SIZE} />}
          title={t("fixedAssets.emptyCategoryTitle")}
          description={t("fixedAssets.emptyCategoryDescription")}
        />
      ) : (
        <Card>
          <StaticTable<CategoryRow> columns={columns} rows={rows} rowKey={(c) => c.id} />
        </Card>
      )}
    </div>
  );
}
