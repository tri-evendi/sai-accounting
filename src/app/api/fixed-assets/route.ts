/**
 * Aset Tetap — list & register (issue #28).
 *
 * Registering an asset writes NO journal: the asset cost typically reached the
 * books already through its purchase/cash transaction, so capitalising it again
 * here would double-count it. The journaled events are depreciation (periodic)
 * and disposal — see the depreciation and dispose routes. The register just
 * records what to depreciate and how.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth-guard";
import { fixedAssetSchema } from "@/lib/validations/fixed-asset";
import {
  getFixedAssets,
  summarizeFixedAssets,
  nextAssetNo,
  type FixedAssetStatus,
} from "@/lib/fixed-assets";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const categoryId = sp.get("categoryId");

  const rows = await getFixedAssets({
    status: status === "active" || status === "disposed" ? (status as FixedAssetStatus) : undefined,
    categoryId: categoryId ? Number(categoryId) : undefined,
  });
  return NextResponse.json({ rows, summary: summarizeFixedAssets(rows) });
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const parsed = fixedAssetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { acquisitionDate, location, ...rest } = parsed.data;

  const category = await prisma.fixedAssetCategory.findUnique({
    where: { id: rest.categoryId },
  });
  if (!category || !category.isActive) {
    return NextResponse.json(
      { error: "Kategori aset tidak ditemukan atau nonaktif." },
      { status: 400 }
    );
  }

  const acqDate = new Date(acquisitionDate);

  const asset = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    return tx.fixedAsset.create({
      data: {
        ...rest,
        assetNo: await nextAssetNo(tx, acqDate),
        acquisitionDate: acqDate,
        location: location ?? null,
      },
    });
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "fixed_asset.create",
    entity: "fixed_asset",
    entityId: asset.id,
    details: {
      assetNo: asset.assetNo,
      name: asset.name,
      acquisitionCost: Number(asset.acquisitionCost),
      usefulLifeMonths: asset.usefulLifeMonths,
    },
    request,
  });

  return NextResponse.json(asset, { status: 201 });
}
