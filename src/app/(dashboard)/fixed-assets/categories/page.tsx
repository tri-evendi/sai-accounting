/**
 * Kategori aset tetap (issue #28) — daftar + buat. Master data; tanpa jurnal.
 */
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/lib/fixed-assets";
import { Card } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { DEPRECIATION_METHOD_LABELS, type DepreciationMethod } from "@/lib/depreciation";
import { Tags } from "lucide-react";
import { CategoryForm } from "./category-form";

export const dynamic = "force-dynamic";

const codeToId = (accounts: { id: number; code: string }[], code: string) =>
  accounts.find((a) => a.code === code)?.id;

export default async function CategoriesPage() {
  await requirePageSession(["bos", "core"]);

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
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "Aset Tetap", href: "/fixed-assets" }, { label: "Kategori" }]} />
      <h1 className="text-2xl font-bold text-gray-900">Kategori Aset</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Kategori menentukan metode, umur manfaat, dan akun aset/akumulasi/beban yang dipakai
        aset di dalamnya. Aset baru menyalin nilai-nilai ini dan boleh menimpanya.
      </p>

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
          title="Belum ada kategori"
          description="Buat kategori pertama di atas — misalnya Kendaraan, Peralatan, atau Bangunan."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Nama</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Metode</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Umur (bulan)</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Akun Aset</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Akumulasi</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Beban</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {DEPRECIATION_METHOD_LABELS[c.defaultMethod as DepreciationMethod] ??
                        c.defaultMethod}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {c.defaultUsefulLifeMonths}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{byId.get(c.assetAccountId)?.code ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {byId.get(c.accumulatedAccountId)?.code ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {byId.get(c.expenseAccountId)?.code ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
