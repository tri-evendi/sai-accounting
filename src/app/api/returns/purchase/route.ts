/**
 * Retur pembelian — list, returnable-lookup, and record (issue #27).
 *
 * A purchase return reverses part of a supplier `purchase`: D: Hutang Usaha,
 * K: Persediaan (+ K: PPN Masukan), and moves the goods back OUT of stock. Like
 * the sales side it posts inside the row's `$transaction`, so a posting failure
 * rolls the return back.
 *
 * ASYMMETRY WITH SALES: a purchase has no line items — it is a single net
 * `amount` plus `tax_amount`. So the over-return cap is by VALUE (returned net
 * subtotal ≤ the purchase's amount, net of prior returns), and the return's own
 * item lines are free-text, used for the nota retur and for the stock movement.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { purchaseReturnSchema, returnSubtotal } from "@/lib/validations/return";
import { fxAmounts, BASE_CURRENCY } from "@/lib/validations/fx";
import { requireApiPermission } from "@/lib/auth-guard";
import { postForSource, round2 } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import {
  assertWithinReturnable,
  proportionalTax,
  OverReturnError,
  returnableRemaining,
  stockDirectionForReturn,
} from "@/lib/returns";
import {
  priorReturnedPurchaseSubtotal,
  nextPurchaseReturnNo,
} from "@/lib/returns-data";

export async function GET(request: Request) {
  const result = await requireApiPermission("return.read");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const purchaseIdParam = searchParams.get("purchaseId");

  // `?purchaseId=N` feeds the return form: the purchase and how much net value is
  // still returnable (its amount minus prior returns).
  if (purchaseIdParam) {
    const purchaseId = parseInt(purchaseIdParam);
    if (!Number.isInteger(purchaseId)) {
      return NextResponse.json({ error: "purchaseId tidak valid" }, { status: 400 });
    }
    const purchase = await prisma.supplierTransaction.findFirst({
      where: { id: purchaseId, type: "purchase" },
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!purchase) {
      return NextResponse.json({ error: "Pembelian tidak ditemukan" }, { status: 404 });
    }
    const returned = await priorReturnedPurchaseSubtotal(purchaseId);
    const amount = Number(purchase.amount);
    return NextResponse.json({
      id: purchase.id,
      date: purchase.date,
      currency: purchase.currency,
      rate: purchase.rate == null ? null : Number(purchase.rate),
      amount,
      taxAmount: Number(purchase.taxAmount),
      supplier: purchase.supplier,
      returned,
      returnable: returnableRemaining(amount, returned),
    });
  }

  const returns = await prisma.purchaseReturn.findMany({
    orderBy: { date: "desc" },
    include: { items: true, supplier: { select: { name: true } } },
  });
  return NextResponse.json(returns);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("return.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = purchaseReturnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { purchaseId, date, reason, items } = parsed.data;

  const purchase = await prisma.supplierTransaction.findFirst({
    where: { id: purchaseId, type: "purchase" },
  });
  if (!purchase) {
    return NextResponse.json(
      { error: "Pembelian tidak ditemukan (harus transaksi bertipe pembelian)." },
      { status: 404 }
    );
  }

  const currency = purchase.currency || "IDR";
  const purchaseRate = purchase.rate == null ? null : Number(purchase.rate);
  if (currency !== BASE_CURRENCY && !purchaseRate) {
    return NextResponse.json(
      {
        error: `Pembelian ini bermata uang ${currency} tanpa kurs, sehingga retur tidak dapat dinilai dalam rupiah. Isi kurs pada pembelian lalu ulangi.`,
      },
      { status: 400 }
    );
  }

  const subtotal = returnSubtotal(items);
  const returned = await priorReturnedPurchaseSubtotal(purchaseId);
  const purchaseAmount = Number(purchase.amount);

  // Over-return cap by VALUE — a purchase has no per-line quantity to cap on.
  try {
    assertWithinReturnable({
      label: `pembelian TRX-${purchase.id}`,
      unit: currency,
      origin: purchaseAmount,
      alreadyReturned: returned,
      requested: subtotal,
      decimals: 2,
    });
  } catch (e) {
    if (e instanceof OverReturnError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const tax = proportionalTax(subtotal, purchaseAmount, Number(purchase.taxAmount));
  const { rate, baseAmount } = fxAmounts(currency, subtotal + tax, purchaseRate ?? undefined);
  const returnDate = new Date(date);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const returnNo = await nextPurchaseReturnNo(tx, returnDate);
      const ret = await tx.purchaseReturn.create({
        data: {
          returnNo,
          purchaseId,
          supplierId: purchase.supplierId,
          date: returnDate,
          currency,
          rate,
          subtotal,
          taxAmount: tax,
          taxRate: null,
          baseAmount,
          reason: reason || null,
          items: {
            create: items.map((it) => ({
              itemName: it.itemName,
              quantity: it.quantity,
              price: round2(it.price),
              itemId: it.itemId ?? null,
            })),
          },
        },
        include: { items: true },
      });

      // Reversed journal: D: Hutang Usaha, K: Persediaan (+ K: PPN Masukan).
      await postForSource({ sourceType: "purchase_return", sourceId: ret.id, tx });

      // Goods go OUT through the existing Stock mechanism — quantity only, no
      // journal (the return's own entry already credits Persediaan). `out` rows
      // carry no unit cost, exactly as the inventory route records them.
      for (const it of items) {
        if (it.itemId == null) continue;
        await tx.stock.create({
          data: {
            itemId: it.itemId,
            quantity: it.quantity,
            type: stockDirectionForReturn("purchase"),
            date: returnDate,
            unitCost: null,
            note: `Retur pembelian ${returnNo}`,
          },
        });
      }
      return ret;
    });
  } catch (e) {
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "purchase_return.create",
    entity: "purchase_return",
    entityId: created.id,
    details: {
      returnNo: created.returnNo,
      purchaseId,
      subtotal,
      taxAmount: tax,
      currency,
      baseAmount: baseAmount == null ? null : Number(baseAmount),
    },
    request,
  });

  return NextResponse.json(created, { status: 201 });
}
