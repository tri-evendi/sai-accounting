/**
 * Outstanding satu kontrak (issue #15) — what the "Ambil" picker reads.
 *
 * Read-only: per contract line, how much has been delivered (surat jalan) and
 * invoiced (faktur) against it, and what is left. The faktur form calls this when
 * the user picks a contract, so the pulled lines are pre-filled with the actual
 * remainder instead of the contract's original quantity.
 *
 * These numbers are a CONVENIENCE, not the rule: the same arithmetic is re-run
 * server-side inside POST/PUT /api/invoices' transaction, so a stale page can
 * never over-invoice. No journal is touched here.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import {
  buildContractChain,
  loadContractChain,
  pullInvoiceLines,
} from "@/lib/document-chain";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const contractId = parseInt(id);
  if (Number.isNaN(contractId)) {
    return NextResponse.json({ error: "Kontrak tidak ditemukan." }, { status: 404 });
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { payments: true },
  });
  if (!contract) {
    return NextResponse.json({ error: "Kontrak tidak ditemukan." }, { status: 404 });
  }

  const chain = await loadContractChain(prisma, contractId);

  // A payment only adds up in IDR base; a foreign one with no rate has no IDR
  // value and is left out rather than folded in at face value.
  const contractPaidBase = contract.payments.reduce((s, p) => {
    if (p.baseAmount != null) return s + Number(p.baseAmount);
    return (p.currency || "IDR") === "IDR" ? s + Number(p.amount) : s;
  }, 0);

  return NextResponse.json({
    contract: {
      id: contract.id,
      contractNo: contract.contractNo,
      buyer: contract.buyer,
      currency: contract.currency || "IDR",
      status: contract.status,
    },
    lines: chain.outstanding.lines,
    totals: chain.outstanding.totals,
    // Ready-made faktur lines for both pull modes, so the form never re-derives
    // them (and never disagrees with the server about what is left).
    pull: {
      contract: pullInvoiceLines(chain.outstanding.lines, "contract"),
      delivery: pullInvoiceLines(chain.outstanding.lines, "delivery"),
    },
    chain: buildContractChain({
      contractStatus: contract.status,
      totals: chain.outstanding.totals,
      deliveryOrderCount: chain.deliveryOrders.length,
      invoiceCount: chain.invoices.length,
      paymentCount: contract.payments.length + chain.invoicePaymentCount,
      paidBase: contractPaidBase + chain.invoicePaidBase,
      contractBase: contract.baseAmount != null ? Number(contract.baseAmount) : null,
    }),
  });
}
