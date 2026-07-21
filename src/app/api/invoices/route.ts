/**
 * Faktur — list & create.
 *
 * Dokumen berantai (issue #15): a faktur may name the `contractId` it was drawn
 * from with the "Ambil" pull. That link is what the OUTSTANDING GUARD measures
 * against — `assertWithinContract` runs INSIDE the `$transaction`, so a faktur
 * that would invoice more of a contract line than was contracted never leaves a
 * posted document (or a revenue journal) behind. The check is server-side on
 * purpose: the form's remainder hints are a convenience, not the rule.
 *
 * NO NEW ACCOUNTING: a pulled faktur posts through the existing invoice rule,
 * unchanged (D: Piutang Usaha, K: Pendapatan + PPN Keluaran).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoiceSchema, invoiceSubtotal } from "@/lib/validations/invoice";
import { resolveInvoiceTax } from "@/lib/tax";
import { fxAmounts } from "@/lib/validations/fx";
import { toDateOrNull } from "@/lib/validations/common";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import {
  assertWithinContract,
  contractOutstandingForInvoice,
  OverInvoiceError,
} from "@/lib/document-chain";
import { approvalNotice, ensureApprovalRequest } from "@/lib/approval-requests";

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

  const {
    items,
    date,
    dueDate,
    pebDate,
    rate,
    currency,
    taxable,
    taxRate,
    taxAmount,
    contractId,
    ...invoiceData
  } = parsed.data;
  // Server is authoritative on tax: PPN is recomputed from the rate when taxable,
  // so a stale client amount never reaches the ledger. A 0% / non-taxable invoice
  // yields PPN 0 → the posting engine emits no VAT line (issue #16).
  const tax = resolveInvoiceTax(invoiceSubtotal(items), { taxable, taxRate, taxAmount });
  // Gross document value in its own currency, then its IDR equivalent. Zod has
  // already rejected a non-IDR invoice with no rate, so fxAmounts can't guess.
  const { rate: fxRate, baseAmount } = fxAmounts(currency, tax.total, rate);

  // Friendly check for the source document (an FK violation would otherwise be an
  // opaque 500). Nullable — a faktur need not come from a contract.
  if (contractId != null && !(await prisma.contract.findUnique({ where: { id: contractId } }))) {
    return NextResponse.json({ error: "Kontrak sumber tidak ditemukan." }, { status: 400 });
  }

  let invoice;
  let approval;
  try {
    // Invoice and journal commit together: if posting can't produce a correct
    // journal, the invoice is rolled back rather than left unaccounted for.
    ({ invoice, approval } = await prisma.$transaction(async (tx) => {
      // Outstanding guard (issue #15), inside the transaction so it reads what is
      // actually committed and rolls the faktur back with everything else if it fires.
      if (contractId != null) {
        const { lines } = await contractOutstandingForInvoice(tx, contractId);
        assertWithinContract(lines, items);
      }

      const created = await tx.invoice.create({
        data: {
          ...invoiceData,
          contractId: contractId ?? null,
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

      // Approval (issue #25) — created before posting and in the same
      // transaction, so the gate withholds the journal until it is decided.
      // The gross value (subtotal + PPN) is what is put in front of the
      // approver: that is the money the document actually commits.
      const request = await ensureApprovalRequest({
        client: tx,
        sourceType: "invoice",
        documentId: created.id,
        documentNo: created.invoiceNo,
        amount: tax.total,
        currency,
        rate: fxRate,
        baseAmount,
        requestedById: parseInt(result.session.user.id, 10),
      });

      await postForSource({ sourceType: "invoice", sourceId: created.id, tx });
      return { invoice: created, approval: request };
    }));
  } catch (e) {
    if (e instanceof OverInvoiceError) {
      return NextResponse.json({ error: e.message, saved: false }, { status: 400 });
    }
    return handlePostingError(e);
  }

  // Only a chained faktur is audited here: drawing on a contract consumes part of
  // an outstanding promise, which is exactly the kind of act the log exists for.
  if (contractId != null) {
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "invoice.pull_from_contract",
      entity: "invoice",
      entityId: invoice.id,
      details: {
        invoiceNo: invoice.invoiceNo,
        contractId,
        itemCount: invoice.items.length,
        totalQuantity: invoice.items.reduce((s, i) => s + Number(i.quantity), 0),
      },
      request,
    });
  }

  if (approval) {
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "approval.request",
      entity: "approval_request",
      entityId: approval.id,
      details: {
        sourceType: "invoice",
        documentId: invoice.id,
        documentNo: invoice.invoiceNo,
        baseAmount: Number(approval.baseAmount),
        thresholdAmount: Number(approval.thresholdAmount),
        approverRole: approval.approverRole,
      },
      request,
    });
  }

  return NextResponse.json(
    { ...invoice, approval: approvalNotice(approval, "Faktur") },
    { status: 201 }
  );
}
