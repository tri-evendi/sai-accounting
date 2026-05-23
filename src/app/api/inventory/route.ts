import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStockTotals } from "@/lib/inventory";
import { stockUpdateSchema, itemSchema } from "@/lib/validations/inventory";
import { requireAuth } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const result = await requireAuth(); // all roles can view inventory
  if (!result.authorized) return result.response;

  const items = await prisma.item.findMany({
    include: {
      stock: { orderBy: { date: "desc" } },
    },
  });

  const inventory = items.map((item) => {
    const totals = calculateStockTotals(item.stock);
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      ...totals,
      lastMovement: item.stock[0]?.date || null,
    };
  });

  return NextResponse.json(inventory);
}

export async function POST(request: Request) {
  const result = await requireAuth(); // all roles can update inventory
  if (!result.authorized) return result.response;

  const body = await request.json();

  // Create new item
  if (body.action === "create_item") {
    const parsed = itemSchema.safeParse({ name: body.name, unit: body.unit });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const item = await prisma.item.create({ data: parsed.data });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "item.create",
      entity: "item",
      entityId: item.id,
      details: { name: item.name, unit: item.unit },
      request,
    });

    return NextResponse.json(item, { status: 201 });
  }

  // Stock update
  const parsed = stockUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, ...stockData } = parsed.data;

  if (stockData.type === "out") {
    const item = await prisma.item.findUnique({
      where: { id: stockData.itemId },
      include: { stock: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    const { currentStock } = calculateStockTotals(item.stock);
    if (currentStock < stockData.quantity) {
      return NextResponse.json(
        {
          error: `Insufficient stock. Available: ${currentStock}, requested: ${stockData.quantity}`,
        },
        { status: 400 }
      );
    }
  }

  const stock = await prisma.stock.create({
    data: {
      ...stockData,
      date: new Date(date),
    },
    include: { item: { select: { name: true } } },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: stockData.type === "in" ? "stock.in" : "stock.out",
    entity: "stock",
    entityId: stock.id,
    details: {
      itemId: stock.itemId,
      itemName: stock.item.name,
      quantity: Number(stock.quantity),
      type: stock.type,
    },
    request,
  });

  return NextResponse.json(stock, { status: 201 });
}
