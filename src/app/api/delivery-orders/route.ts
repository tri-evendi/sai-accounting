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
 *
 * Since issue #5 the body of the transaction lives in `@/lib/document-writes`
 * (`createDeliveryOrderInTx`) because the "Penjualan Baru" wizard issues a surat
 * jalan too, in the same transaction as its faktur. Shared verbatim rather than
 * copied, so the guard, the numbering and the HPP stock-outs cannot drift apart.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deliveryOrderSchema } from "@/lib/validations/delivery-order";
import { requireApiPermission } from "@/lib/auth-guard";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { createDeliveryOrderInTx, loadItemNames } from "@/lib/document-writes";
import { OverIssueError } from "@/lib/delivery-orders";

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export async function GET() {
  const result = await requireApiPermission("delivery_order.read");
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
  const result = await requireApiPermission("delivery_order.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = deliveryOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { contractId, invoiceId, consigneeId, items } = parsed.data;

  // Referenced items must exist (also gives us canonical names for messages).
  const nameById = await loadItemNames(
    prisma,
    items.map((i) => i.itemId)
  );
  if (!nameById) {
    return NextResponse.json(
      { error: "Salah satu barang tidak ditemukan di master stok." },
      { status: 400 }
    );
  }

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

  let created;
  try {
    // The body of the transaction is `createDeliveryOrderInTx` — the SAME
    // function the wizard endpoint calls (issue #5), so the over-issue guard,
    // the document numbering and the HPP stock-outs exist in exactly one place.
    created = await prisma.$transaction((tx) =>
      createDeliveryOrderInTx(tx, parsed.data, { nameById })
    );
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
