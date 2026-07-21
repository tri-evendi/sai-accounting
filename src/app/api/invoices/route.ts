import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoiceSchema, invoiceSubtotal } from "@/lib/validations/invoice";
import { resolveInvoiceTax } from "@/lib/tax";
import { fxAmounts } from "@/lib/validations/fx";
import { toDateOrNull } from "@/lib/validations/common";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";

export async function GET() {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const invoices = await prisma.invoice.findMany({
    orderBy: { date: "desc" },
    include: { items: true, payments: true },
  });

  return NextResponse.json(invoices);
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = invoiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { items, date, dueDate, pebDate, rate, currency, taxable, taxRate, taxAmount, ...invoiceData } =
    parsed.data;
  // Server is authoritative on tax: PPN is recomputed from the rate when taxable,
  // so a stale client amount never reaches the ledger. A 0% / non-taxable invoice
  // yields PPN 0 → the posting engine emits no VAT line (issue #16).
  const tax = resolveInvoiceTax(invoiceSubtotal(items), { taxable, taxRate, taxAmount });
  // Gross document value in its own currency, then its IDR equivalent. Zod has
  // already rejected a non-IDR invoice with no rate, so fxAmounts can't guess.
  const { rate: fxRate, baseAmount } = fxAmounts(currency, tax.total, rate);

  try {
    // Invoice and journal commit together: if posting can't produce a correct
    // journal, the invoice is rolled back rather than left unaccounted for.
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          ...invoiceData,
          currency,
          taxable: tax.taxable,
          taxRate: tax.taxRate,
          dpp: tax.dpp,
          taxAmount: tax.taxAmount,
          rate: fxRate,
          baseAmount,
          date: new Date(date),
          dueDate: toDateOrNull(dueDate),
          // pebNumber / exportNote flow through invoiceData; pebDate needs coercion.
          pebDate: toDateOrNull(pebDate),
          items: { create: items },
        },
        include: { items: true },
      });

      await postForSource({ sourceType: "invoice", sourceId: created.id, tx });
      return created;
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e) {
    return handlePostingError(e);
  }
}
