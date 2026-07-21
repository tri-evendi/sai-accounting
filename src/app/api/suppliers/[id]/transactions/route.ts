/**
 * Supplier purchases and payments — the only source type the posting engine
 * supports that previously had no API at all (rows could only arrive via the
 * legacy ETL). Both sides auto-post:
 *   purchase → D: Persediaan (+ D: PPN Masukan) / K: Hutang Usaha
 *   payment  → D: Hutang Usaha / K: Kas & Bank
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  supplierTransactionSchema,
  supplierPaymentAllocationsSchema,
} from "@/lib/validations/finance";
import { fxAmounts, BASE_CURRENCY } from "@/lib/validations/fx";
import { toDateOrNull } from "@/lib/validations/common";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource, repostForSource, unpostForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { getSupplierPurchaseAllocations } from "@/lib/receivables";
import { resolveAllocationLines } from "@/lib/supplier-allocations";
import { approvalNotice, ensureApprovalRequest } from "@/lib/approval-requests";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  // `?outstanding=1` feeds the payment form's allocation picker (issue #37):
  // which purchases still have room, and how much. A separate shape from the
  // plain transaction list because it carries derived, not stored, numbers.
  const { searchParams } = new URL(request.url);

  // `?allocations=1&paymentId=N` feeds the re-allocation editor (issue #38).
  // Distinct from `?outstanding=1` in two ways that matter: it also returns what
  // the payment currently allocates (so the form can be pre-filled with the
  // truth rather than a blank slate), and it measures each purchase's room with
  // this payment's own allocations set aside — otherwise a payment that already
  // filled a purchase would find no room to re-state that very allocation.
  if (searchParams.get("allocations") === "1") {
    const paymentId = parseInt(searchParams.get("paymentId") ?? "");
    if (!Number.isInteger(paymentId)) {
      return NextResponse.json(
        { error: 'Parameter "paymentId" wajib diisi.' },
        { status: 400 }
      );
    }

    const payment = await prisma.supplierTransaction.findFirst({
      where: { id: paymentId, supplierId, type: "payment" },
      include: { allocationsMade: true },
    });
    if (!payment) {
      return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 });
    }

    const purchases = await getSupplierPurchaseAllocations(supplierId, prisma, {
      excludePaymentId: paymentId,
    });

    return NextResponse.json({
      payment: {
        id: payment.id,
        date: payment.date,
        amount: Number(payment.amount),
        currency: payment.currency,
        rate: payment.rate == null ? null : Number(payment.rate),
        note: payment.note,
      },
      // What this payment says today, in the payment's own currency.
      current: payment.allocationsMade.map((a) => ({
        purchaseId: a.purchaseId,
        amount: Number(a.amount),
      })),
      // Every purchase of this supplier that has room, plus any this payment
      // itself currently fills — those come back with room precisely because
      // their own allocation was excluded above.
      purchases: purchases
        .filter((p) => p.remainingBase == null || p.remainingBase > 0.005)
        .map((p) => ({
          id: p.id,
          date: p.date,
          dueDate: p.dueDate,
          amount: p.amount,
          currency: p.currency,
          totalBase: p.totalBase,
          allocatedBase: p.allocatedBase,
          remainingBase: p.remainingBase,
          note: p.note,
        })),
    });
  }

  if (searchParams.get("outstanding") === "1") {
    const purchases = await getSupplierPurchaseAllocations(supplierId);
    return NextResponse.json(
      purchases
        // Nothing left to settle, or no IDR value to settle it against.
        .filter((p) => p.remainingBase == null || p.remainingBase > 0.005)
        .map((p) => ({
          id: p.id,
          date: p.date,
          dueDate: p.dueDate,
          amount: p.amount,
          currency: p.currency,
          totalBase: p.totalBase,
          allocatedBase: p.allocatedBase,
          remainingBase: p.remainingBase,
          note: p.note,
        }))
    );
  }

  const transactions = await prisma.supplierTransaction.findMany({
    where: { supplierId },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(transactions);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = supplierTransactionSchema.safeParse({ ...body, supplierId });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, dueDate, rate: rateInput, allocations, ...transactionData } = parsed.data;
  // base_amount covers the full obligation: net value plus input VAT.
  const { rate, baseAmount } = fxAmounts(
    transactionData.currency,
    transactionData.amount + transactionData.taxAmount,
    rateInput
  );

  // ── Over-allocation guard (issue #37) ──────────────────────────────────────
  // The Zod schema already capped the allocations at the payment's own amount.
  // What it cannot see is the other side: whether each target purchase belongs
  // to this supplier and still has room. Checked here, before anything is
  // written, so a rejected allocation never leaves a posted payment behind.
  // Shared with the re-allocation path (PUT, issue #38) so an edit can never be
  // laxer than a create.
  const resolved = await resolveAllocationLines({
    supplierId,
    currency: transactionData.currency,
    rate: rateInput,
    allocations: allocations ?? [],
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const allocationLines = resolved.lines;

  let transaction;
  let approval;
  try {
    ({ transaction, approval } = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierTransaction.create({
        data: {
          ...transactionData,
          date: new Date(date),
          // A payment has nothing to fall due; only a purchase carries a due date.
          dueDate: transactionData.type === "purchase" ? toDateOrNull(dueDate) : null,
          rate,
          baseAmount,
        },
      });

      // Persist the allocation set; the journal is produced ONCE by the
      // `postForSource` below, which reads these rows — the createMany never
      // posts on its own, so the money is never doubled. For a pure-IDR payment
      // the allocation is reporting-only (rate 1, no selisih kurs). For a
      // foreign payment it is ledger-affecting (issue #42): it names which
      // purchase — and therefore at which document rate — each slice of hutang
      // is relieved, which is what makes the realised FX difference correct.
      if (allocationLines.length > 0) {
        await tx.supplierPaymentAllocation.createMany({
          data: allocationLines.map((line) => ({
            paymentId: created.id,
            purchaseId: line.purchaseId,
            amount: line.amount,
            currency: transactionData.currency,
            rate,
            baseAmount: line.base,
          })),
        });
      }

      // ── Approval (issue #25) ────────────────────────────────────────────
      // Only a PAYMENT is gated here. Issue #25 names kontrak/faktur/pembayaran
      // as the documents under management control; a purchase is the supplier's
      // invoice arriving, i.e. a liability being recorded rather than money
      // leaving, and withholding its journal would leave hutang understated on
      // every report until somebody signed. A payment is money going out, which
      // is exactly what an ambang is for.
      const request =
        created.type === "payment"
          ? await ensureApprovalRequest({
              client: tx,
              sourceType: "supplier_transaction",
              documentId: created.id,
              // A supplier payment carries no number; the supplier's name is
              // what identifies it to an approver (capped at VARCHAR(50)).
              documentNo: supplier.name.slice(0, 50),
              amount: Number(created.amount),
              currency: created.currency,
              rate,
              baseAmount,
              requestedById: parseInt(result.session.user.id, 10),
            })
          : null;

      await postForSource({ sourceType: "supplier_transaction", sourceId: created.id, tx });
      return { transaction: created, approval: request };
    }));
  } catch (e) {
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action:
      transaction.type === "purchase"
        ? "supplier_transaction.purchase"
        : "supplier_transaction.payment",
    entity: "supplier_transaction",
    entityId: transaction.id,
    details: {
      supplierId,
      supplierName: supplier.name,
      type: transaction.type,
      amount: Number(transaction.amount),
      taxAmount: Number(transaction.taxAmount),
      currency: transaction.currency,
      // Which purchases this payment was said to settle — the allocation is a
      // user assertion, so it belongs in the audit trail alongside the amount.
      allocations: allocationLines.map((l) => ({
        purchaseId: l.purchaseId,
        amount: l.amount,
        baseAmount: l.base,
      })),
    },
    request,
  });

  if (approval) {
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "approval.request",
      entity: "approval_request",
      entityId: approval.id,
      details: {
        sourceType: "supplier_transaction",
        documentId: transaction.id,
        documentNo: approval.documentNo,
        baseAmount: Number(approval.baseAmount),
        thresholdAmount: Number(approval.thresholdAmount),
        approverRole: approval.approverRole,
      },
      request,
    });
  }

  return NextResponse.json(
    { ...transaction, approval: approvalNotice(approval, "Pembayaran supplier") },
    { status: 201 }
  );
}

/**
 * Re-allocate an existing supplier payment (issue #38).
 *
 * Replaces the payment's whole allocation set: editing a line, deleting one, and
 * allocating a legacy payment that never had any are all the same operation, and
 * a full replacement makes the outcome independent of what was there before. An
 * empty `allocations` array clears them and hands the payment back to the FIFO
 * estimate — a deliberate, reachable state, not an error.
 *
 * ── WHETHER THIS TOUCHES THE LEDGER DEPENDS ON THE CURRENCY (issue #42) ───────
 * For a PURE-IDR payment the allocation is reporting data: there is no rate and
 * no selisih kurs, so which purchase a payment settles moves no money and the
 * ledger has nothing to learn from it. This is the original #37/#38 promise and
 * it still holds — no journal is written and the period lock is not consulted.
 *
 * For a FOREIGN-currency payment the allocation is ledger-affecting. Since #23 a
 * foreign payment relieves each slice of hutang at the DOCUMENT rate of the
 * purchase it settles, and the gap from the payment's own rate is realised FX
 * (7101). The allocation is what names those purchases, so editing it changes the
 * correct journal. We therefore reverse-and-repost the payment from the NEW
 * allocation set with `repostForSource` — the very path a fresh post runs, never
 * a second posting rule — so the journal can never go stale. That repost DOES
 * pass through the period lock (issue #13): a repost into a closed month is
 * refused by `postJournal`/`reverseJournal`, and the whole allocation change
 * rolls back with it. A missing settlement rate is refused the same way.
 *
 * Role is `bos`/`core`, the same as creating the payment: a user allowed to
 * state an allocation on the way in is allowed to correct it afterwards.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  const body = await request.json();
  const transactionId = Number(body?.transactionId);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return NextResponse.json(
      { error: 'Parameter "transactionId" wajib diisi.' },
      { status: 400 }
    );
  }

  // Ownership check before anything else: the payment must be this supplier's,
  // and must be a payment — a purchase creates debt, it cannot settle any.
  const payment = await prisma.supplierTransaction.findFirst({
    where: { id: transactionId, supplierId },
    include: { supplier: true, allocationsMade: true },
  });
  if (!payment) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }
  if (payment.type !== "payment") {
    return NextResponse.json(
      { error: "Alokasi hanya berlaku untuk transaksi pembayaran, bukan pembelian." },
      { status: 400 }
    );
  }

  const rate = payment.rate == null ? undefined : Number(payment.rate);
  if (payment.currency !== BASE_CURRENCY && !rate) {
    // A foreign payment with no rate has no IDR value, so no allocation of it
    // can be measured against a purchase's IDR remainder. Refused out loud
    // rather than valued 1:1 (see the header of `receivables.ts`).
    return NextResponse.json(
      {
        error: `Pembayaran ini bermata uang ${payment.currency} tanpa kurs, sehingga nilai IDR-nya tidak diketahui dan alokasinya tidak bisa diperiksa.`,
      },
      { status: 400 }
    );
  }

  // The cap comes from the STORED payment amount, never from the payload — a
  // client must not be able to raise its own ceiling. Duplicate purchases and
  // the total cap are the same `checkAllocationSet` the create path runs.
  const parsed = supplierPaymentAllocationsSchema(Number(payment.amount)).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Same database-side guard as POST, with one difference: this payment's own
  // current allocations are set aside, because they are what is being replaced.
  const resolved = await resolveAllocationLines({
    supplierId,
    currency: payment.currency,
    rate,
    allocations: parsed.data.allocations,
    excludePaymentId: payment.id,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const before = payment.allocationsMade.map((a) => ({
    purchaseId: a.purchaseId,
    amount: Number(a.amount),
  }));

  // Delete-then-insert inside one transaction: the set is replaced atomically,
  // so a reader never sees a half-applied allocation. For a FOREIGN payment the
  // repost happens in the SAME transaction from the new set (issue #42) — see the
  // note above for why IDR is exempt. `repostForSource` reads the rows we just
  // wrote, so the journal is exactly what a fresh post of this payment produces.
  // If it throws — a closed period, a missing settlement rate, an unmapped FX
  // account — the transaction rolls back and no stale journal is left behind;
  // the failure is turned into an actionable response by `handlePostingError`.
  const isForeign = payment.currency !== BASE_CURRENCY;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.supplierPaymentAllocation.deleteMany({ where: { paymentId: payment.id } });
      if (resolved.lines.length > 0) {
        await tx.supplierPaymentAllocation.createMany({
          data: resolved.lines.map((line) => ({
            paymentId: payment.id,
            purchaseId: line.purchaseId,
            amount: line.amount,
            currency: payment.currency,
            rate: rate ?? 1,
            baseAmount: line.base,
          })),
        });
      }
      if (isForeign) {
        await repostForSource({
          sourceType: "supplier_transaction",
          sourceId: payment.id,
          tx,
        });
      }
    });
  } catch (e) {
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "supplier_transaction.allocate",
    entity: "supplier_transaction",
    entityId: payment.id,
    details: {
      supplierId,
      supplierName: payment.supplier.name,
      currency: payment.currency,
      // Allocation is a user assertion about which debt a payment cleared, so
      // both what it used to say and what it now says belong in the trail.
      before,
      after: resolved.lines.map((l) => ({
        purchaseId: l.purchaseId,
        amount: l.amount,
        baseAmount: l.base,
      })),
    },
    request,
  });

  return NextResponse.json({
    success: true,
    allocations: resolved.lines.map((l) => ({ purchaseId: l.purchaseId, amount: l.amount })),
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  const { searchParams } = new URL(request.url);
  const transactionId = parseInt(searchParams.get("transactionId") ?? "");
  if (!Number.isInteger(transactionId)) {
    return NextResponse.json(
      { error: "Parameter \"transactionId\" wajib diisi." },
      { status: 400 }
    );
  }

  const existing = await prisma.supplierTransaction.findFirst({
    where: { id: transactionId, supplierId },
    include: { _count: { select: { allocationsReceived: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  // A purchase a payment still claims to have settled cannot be deleted out from
  // under that payment's journal (issue #42). Its purchase-side FK is RESTRICT,
  // not CASCADE, precisely so the allocation cannot vanish and leave the paying
  // payment's journal relieving a slice of hutang — at THIS purchase's document
  // rate — for a purchase that no longer exists. We surface that as a clean 409
  // rather than a raw FK error: clear the allocation first (edit the payment,
  // which reposts it), then the purchase is free to delete. A payment is exempt —
  // its allocations are its own to make, and its FK stays CASCADE.
  if (existing.type === "purchase" && existing._count.allocationsReceived > 0) {
    return NextResponse.json(
      {
        error:
          "Pembelian ini masih dialokasikan oleh pembayaran supplier. Lepaskan alokasinya " +
          "terlebih dulu (ubah pembayaran terkait) sebelum menghapus pembelian ini.",
      },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await unpostForSource({ sourceType: "supplier_transaction", sourceId: transactionId, tx });
      await tx.supplierTransaction.delete({ where: { id: transactionId } });
    });
  } catch (e) {
    return handlePostingError(e);
  }

  return NextResponse.json({ success: true });
}
