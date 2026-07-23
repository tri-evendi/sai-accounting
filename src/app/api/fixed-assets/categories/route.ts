/**
 * Kategori aset tetap — list & create (issue #28).
 *
 * A category carries the default method + useful life and the three account ids a
 * new asset copies. Creating one writes no journal (it is master data).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { fixedAssetCategorySchema } from "@/lib/validations/fixed-asset";
import { getCategories } from "@/lib/fixed-assets";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  const result = await requireApiPermission("fixed_asset.read");
  if (!result.authorized) return result.response;

  const activeOnly = new URL(request.url).searchParams.get("activeOnly") === "1";
  return NextResponse.json({ rows: await getCategories(activeOnly) });
}

export async function POST(request: Request) {
  const result = await requireApiPermission("fixed_asset.write");
  if (!result.authorized) return result.response;

  const parsed = fixedAssetCategorySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // The three referenced accounts must exist (the FK enforces it too, but a clear
  // 400 beats a raw constraint error).
  const ids = [parsed.data.assetAccountId, parsed.data.accumulatedAccountId, parsed.data.expenseAccountId];
  const found = await prisma.account.count({ where: { id: { in: [...new Set(ids)] } } });
  if (found !== new Set(ids).size) {
    return NextResponse.json({ error: "Akun yang dipetakan tidak ditemukan." }, { status: 400 });
  }

  const existing = await prisma.fixedAssetCategory.findUnique({
    where: { name: parsed.data.name },
  });
  if (existing) {
    return NextResponse.json({ error: "Nama kategori sudah dipakai." }, { status: 409 });
  }

  const category = await prisma.fixedAssetCategory.create({ data: parsed.data });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "fixed_asset.category.create",
    entity: "fixed_asset_category",
    entityId: category.id,
    details: { name: category.name, defaultUsefulLifeMonths: category.defaultUsefulLifeMonths },
    request,
  });

  return NextResponse.json(category, { status: 201 });
}
