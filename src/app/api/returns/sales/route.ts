/**
 * Retur penjualan — list, returnable-lookup, and record (issue #27).
 *
 * A sales return reverses part of an invoice: D: Penjualan (+ D: Hutang PPN
 * Keluaran), K: Piutang Usaha, and moves the goods back into stock. It posts
 * inside the same `$transaction` as the row, so a posting failure (missing
 * mapping, closed period #13, unrated foreign origin) rolls the return back.
 *
 * The server is authoritative on money: currency, rate, unit price and the
 * proportional PPN are all derived from the origin invoice, never from the
 * payload. The over-return cap is enforced here, per source line, before anything
 * is written (acceptance: "tidak bisa meretur melebihi kuantitas dokumen asal").
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { salesReturnSchema } from "@/lib/validations/return";
import { fxAmounts, BASE_CURRENCY } from "@/lib/validations/fx";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource, round2, averageUnitCostForItem } from "@/lib/posting";
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
  priorReturnedByInvoiceItem,
  nextSalesReturnNo,
} from "@/lib/returns-data";

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export async function GET(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const invoiceIdParam = searchParams.get("invoiceId");

  // `?invoiceId=N` feeds the return form: the invoice's lines with how much of
  // each is still returnable (line quantity minus prior returns).
  if (invoiceIdParam) {
    const invoiceId = parseInt(invoiceIdParam);
    if (!Number.isInteger(invoiceId)) {
      return NextResponse.json({ error: "invoiceId tidak valid" }, { status: 400 });
    }
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, customer: { select: { id: true, name: true } } },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Faktur tidak ditemukan" }, { status: 404 });
    }
    const prior = await priorReturnedByInvoiceItem(invoiceId);
    return NextResponse.json({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      date: invoice.date,
      currency: invoice.currency,
      rate: invoice.rate == null ? null : Number(invoice.rate),
      taxable: invoice.taxable,
      taxRate: invoice.taxRate == null ? null : Number(invoice.taxRate),
      customer: invoice.customer,
      items: invoice.items.map((it) => {
        const returned = num(prior.get(it.id));
        return {
          invoiceItemId: it.id,
          itemName: it.itemName,
          unit: it.unit,
          price: Number(it.price),
          quantity: Number(it.quantity),
          returned,
          returnable: returnableRemaining(Number(it.quantity), returned),
        };
      }),
    });
  }

  const returns = await prisma.salesReturn.findMany({
    orderBy: { date: "desc" },
    include: { items: true, invoice: { select: { invoiceNo: true } } },
  });
  return NextResponse.json(returns);
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = salesReturnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { invoiceId, date, reason, items } = parsed.data;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Faktur tidak ditemukan" }, { status: 404 });
  }
  if (invoice.status === "canceled") {
    return NextResponse.json(
      { error: "Faktur sudah dibatalkan; tidak dapat diretur." },
      { status: 400 }
    );
  }

  const currency = invoice.currency || "IDR";
  const invoiceRate = invoice.rate == null ? null : Number(invoice.rate);
  // A return inherits the origin invoice's rate and is valued at it. An unrated
  // foreign invoice has no honest IDR value, so its return cannot be valued
  // either — refused out loud rather than booked 1:1 (issue #35 posture).
  if (currency !== BASE_CURRENCY && !invoiceRate) {
    return NextResponse.json(
      {
        error: `Faktur ini bermata uang ${currency} tanpa kurs, sehingga retur tidak dapat dinilai dalam rupiah. Isi kurs pada faktur lalu ulangi.`,
      },
      { status: 400 }
    );
  }

  const byId = new Map(invoice.items.map((it) => [it.id, it]));
  const prior = await priorReturnedByInvoiceItem(invoiceId);

  // Build the return lines from the INVOICE's prices (server-authoritative), and
  // cap each against the source line net of prior returns, before any write.
  const lines: {
    invoiceItemId: number;
    itemName: string;
    quantity: number;
    price: number;
    itemId: number | null;
  }[] = [];
  try {
    for (const req of items) {
      const src = byId.get(req.invoiceItemId);
      if (!src) {
        return NextResponse.json(
          { error: `Baris faktur #${req.invoiceItemId} bukan milik faktur ini.` },
          { status: 400 }
        );
      }
      assertWithinReturnable({
        label: src.itemName,
        unit: src.unit ?? undefined,
        origin: Number(src.quantity),
        alreadyReturned: num(prior.get(src.id)),
        requested: req.quantity,
        decimals: 3,
      });
      lines.push({
        invoiceItemId: src.id,
        itemName: src.itemName,
        quantity: req.quantity,
        price: Number(src.price),
        itemId: req.itemId ?? null,
      });
    }
  } catch (e) {
    if (e instanceof OverReturnError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.price, 0));
  const invoiceSubtotal = round2(
    invoice.items.reduce((s, it) => s + Number(it.quantity) * Number(it.price), 0)
  );
  // PPN reversed in proportion to the returned value — never a hardcoded 11%.
  // A 0%/export invoice has tax_amount 0, so this is 0 and no VAT leg is posted.
  const tax = proportionalTax(subtotal, invoiceSubtotal, Number(invoice.taxAmount));
  const { rate, baseAmount } = fxAmounts(currency, subtotal + tax, invoiceRate ?? undefined);
  const returnDate = new Date(date);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const returnNo = await nextSalesReturnNo(tx, returnDate);
      const ret = await tx.salesReturn.create({
        data: {
          returnNo,
          invoiceId,
          customerId: invoice.customerId,
          date: returnDate,
          currency,
          rate,
          subtotal,
          taxAmount: tax,
          taxRate: invoice.taxRate,
          baseAmount,
          reason: reason || null,
          items: {
            create: lines.map((l) => ({
              invoiceItemId: l.invoiceItemId,
              itemName: l.itemName,
              quantity: l.quantity,
              price: l.price,
              itemId: l.itemId,
            })),
          },
        },
        include: { items: true },
      });

      // Reversed journal: D: Penjualan (+ D: PPN Keluaran), K: Piutang Usaha.
      await postForSource({ sourceType: "sales_return", sourceId: ret.id, tx });

      // Goods come back IN through the existing Stock mechanism — quantity only,
      // no journal (the return's own entry already handles inventory value on the
      // sales side). Re-enter at the weighted-average cost so the running average
      // stays neutral; uncosted items re-enter with NULL cost, as the average
      // itself does.
      for (const l of lines) {
        if (l.itemId == null) continue;
        const unitCost = await averageUnitCostForItem(l.itemId, returnDate, tx);
        await tx.stock.create({
          data: {
            itemId: l.itemId,
            quantity: l.quantity,
            type: stockDirectionForReturn("sales"),
            date: returnDate,
            unitCost: unitCost > 0 ? unitCost : null,
            note: `Retur penjualan ${returnNo}`,
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
    action: "sales_return.create",
    entity: "sales_return",
    entityId: created.id,
    details: {
      returnNo: created.returnNo,
      invoiceId,
      invoiceNo: invoice.invoiceNo,
      subtotal,
      taxAmount: tax,
      currency,
      baseAmount: baseAmount == null ? null : Number(baseAmount),
    },
    request,
  });

  return NextResponse.json(created, { status: 201 });
}
