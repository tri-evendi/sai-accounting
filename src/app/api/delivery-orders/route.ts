/**
 * Surat Jalan / Delivery Order — list & issue (issue #14).
 *
 * Issuing a surat jalan is the moment goods physically leave the warehouse. In
 * this app HPP is recognised ONLY on a `stock` movement of type `out` (faktur &
 * kontrak post revenue alone), so a DO reduces stock by creating `out` movements
 * and posting each through the EXISTING engine — `postForSource({ sourceType:
 * "stock_movement" })`. No new posting source, no second HPP rule: the very path
 * a manual stock-out already uses. It runs inside the row's `$transaction`, so a
 * posting failure (closed period #13, missing HPP mapping) rolls the whole surat
 * jalan back.
 *
 * The over-issue guard (`assertStockAvailable`) mirrors `/api/inventory`: the app
 * refuses to drive stock negative, and so does a surat jalan — surfaced, not silent.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deliveryOrderSchema } from "@/lib/validations/delivery-order";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import {
  assertStockAvailable,
  lineStockKg,
  nextDeliveryOrderNo,
  sumRequestedKgByItem,
  OverIssueError,
} from "@/lib/delivery-orders";

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export async function GET() {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const orders = await prisma.deliveryOrder.findMany({
    orderBy: { date: "desc" },
    include: {
      items: true,
      contract: { select: { contractNo: true } },
      invoice: { select: { invoiceNo: true } },
      consignee: { select: { name: true } },
    },
  });
  return NextResponse.json(orders);
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = deliveryOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { date, contractId, invoiceId, consigneeId, vehicleNo, containerNo, notes, items } =
    parsed.data;

  // Referenced items must exist (also gives us canonical names for messages).
  const itemIds = [...new Set(items.map((i) => i.itemId))];
  const masters = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true },
  });
  if (masters.length !== itemIds.length) {
    return NextResponse.json(
      { error: "Salah satu barang tidak ditemukan di master stok." },
      { status: 400 }
    );
  }
  const nameById = new Map(masters.map((m) => [m.id, m.name]));

  // Friendly checks for the source documents (an FK violation would otherwise be
  // an opaque 500). Nullable — a surat jalan may reference none.
  if (contractId != null && !(await prisma.contract.findUnique({ where: { id: contractId } }))) {
    return NextResponse.json({ error: "Kontrak sumber tidak ditemukan." }, { status: 400 });
  }
  if (invoiceId != null && !(await prisma.invoice.findUnique({ where: { id: invoiceId } }))) {
    return NextResponse.json({ error: "Faktur sumber tidak ditemukan." }, { status: 400 });
  }
  if (
    consigneeId != null &&
    !(await prisma.consignee.findUnique({ where: { id: consigneeId } }))
  ) {
    return NextResponse.json({ error: "Consignee tidak ditemukan." }, { status: 400 });
  }

  const doDate = new Date(date);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Over-issue guard, inside the transaction so it reads a consistent stock
      // level and rolls back with everything if it fires.
      const stockRows = await tx.stock.findMany({
        where: { itemId: { in: itemIds } },
        select: { itemId: true, quantity: true, type: true },
      });
      const availableByItem = new Map<number, number>();
      for (const s of stockRows) {
        const signed = (s.type === "in" ? 1 : -1) * num(s.quantity);
        availableByItem.set(s.itemId, num(availableByItem.get(s.itemId)) + signed);
      }
      const requestedByItem = sumRequestedKgByItem(items);
      assertStockAvailable(
        itemIds.map((id) => ({
          itemId: id,
          itemName: nameById.get(id) ?? String(id),
          kg: num(requestedByItem.get(id)),
        })),
        availableByItem
      );

      const no = await nextDeliveryOrderNo(tx, doDate);
      const order = await tx.deliveryOrder.create({
        data: {
          no,
          date: doDate,
          contractId: contractId ?? null,
          invoiceId: invoiceId ?? null,
          consigneeId: consigneeId ?? null,
          vehicleNo: vehicleNo || null,
          containerNo: containerNo || null,
          notes: notes || null,
          status: "issued",
          items: {
            create: items.map((i) => ({
              itemId: i.itemId,
              itemName: i.itemName,
              bags: i.bags,
              kgPerBag: i.kgPerBag,
              quantity: lineStockKg(i),
            })),
          },
        },
        include: { items: true },
      });

      // Reduce stock: one `out` movement per line, each posting HPP through the
      // existing engine (returns null when the item has no costed history yet —
      // exactly as a manual stock-out does; the quantity still leaves).
      for (const line of order.items) {
        const movement = await tx.stock.create({
          data: {
            itemId: line.itemId,
            quantity: line.quantity,
            type: "out",
            date: doDate,
            unitCost: null,
            note: `Surat jalan ${no} — ${line.itemName}`,
          },
        });
        await postForSource({ sourceType: "stock_movement", sourceId: movement.id, tx });
      }
      return order;
    });
  } catch (e) {
    if (e instanceof OverIssueError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "delivery_order.create",
    entity: "delivery_order",
    entityId: created.id,
    details: {
      no: created.no,
      itemCount: created.items.length,
      totalKg: created.items.reduce((s, i) => s + num(i.quantity), 0),
    },
    request,
  });

  return NextResponse.json(created, { status: 201 });
}
