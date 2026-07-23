/**
 * Target penjualan — upsert one sales target (issue #29).
 *
 * A target is a PLAN, not a ledger entry: no journal is posted. One target per
 * (period, customer, item) combination — because MySQL treats NULLs as distinct
 * in a unique index, a plain `upsert` cannot key on the nullable customer/item,
 * so this find-or-updates by the exact combination (nulls included) to give the
 * same "one row, edited in place" behaviour a full key would. bos-only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { salesTargetSchema } from "@/lib/validations/budget";

export async function POST(request: Request) {
  const result = await requireApiPermission("budget.manage");
  if (!result.authorized) return result.response;

  const parsed = salesTargetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { year, month, amount, note } = parsed.data;
  const customerId = parsed.data.customerId ?? null;
  const itemId = parsed.data.itemId ?? null;

  // Referenced master rows must exist (the FK enforces it too, but a clear 400
  // beats a raw constraint error).
  if (customerId !== null) {
    const c = await prisma.customer.count({ where: { id: customerId } });
    if (c === 0) return NextResponse.json({ error: "Pelanggan tidak ditemukan." }, { status: 400 });
  }
  if (itemId !== null) {
    const i = await prisma.item.count({ where: { id: itemId } });
    if (i === 0) return NextResponse.json({ error: "Komoditas tidak ditemukan." }, { status: 400 });
  }

  const existing = await prisma.salesTarget.findFirst({
    where: { year, month, customerId, itemId },
  });

  const target = existing
    ? await prisma.salesTarget.update({
        where: { id: existing.id },
        data: { amount, note: note ?? null },
      })
    : await prisma.salesTarget.create({
        data: { year, month, customerId, itemId, amount, note: note ?? null },
      });

  return NextResponse.json(target, { status: existing ? 200 : 201 });
}
