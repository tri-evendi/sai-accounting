import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoiceSchema, invoiceSubtotal } from "@/lib/validations/invoice";
import { resolveInvoiceTax } from "@/lib/tax";
import { fxAmounts } from "@/lib/validations/fx";
import { toDateOrNull } from "@/lib/validations/common";
import { requireApiPermission } from "@/lib/auth-guard";
import { repostForSource, unpostForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import {
  approvalNotice,
  reevaluateApprovalRequest,
  revocationNotice,
  type ReevaluateResult,
} from "@/lib/approval-requests";
import {
  assertWithinContract,
  contractOutstandingForInvoice,
  OverInvoiceError,
} from "@/lib/document-chain";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("invoice.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id: parseInt(id) },
    include: { items: true, payments: true },
  });

  if (!invoice) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invoiceNotFound") }, { status: 404 });
  }

  return NextResponse.json(invoice);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("invoice.write");
  if (!result.authorized) return result.response;

  const { id } = await params;

  /*
   * DOKUMEN PEMBUKA TIDAK BISA DISUNTING/DIHAPUS (issue #381 tahap 3).
   *
   * Nilainya tercatat di JURNAL PEMBUKA, bukan di jurnalnya sendiri (mesin
   * posting menolak dokumen pembuka). Mengubah nilainya di sini karena itu
   * tidak akan menggerakkan buku besar sama sekali — yang terjadi hanyalah
   * dokumen dan akun kontrolnya berhenti sama, diam-diam, tanpa satu pun
   * permukaan yang menyebutkannya.
   *
   * Yang benar bukan "izinkan lalu sesuaikan jurnalnya": jurnal pembuka
   * SEKALI-JALAN dan menyeimbangkan dirinya lewat Modal. Menyuntingnya dari
   * sini berarti menulis ulang titik nol pembukuan dari layar faktur.
   */
  const opening = await prisma.invoice.findUnique({
    where: { id: parseInt(id) },
    select: { isOpening: true },
  });
  if (opening?.isOpening) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.openingDocumentLocked") }, { status: 409 });
  }

  const body = await request.json();
  const parsed = invoiceSchema.safeParse(body);

  if (!parsed.success) {
    // ── Pola baku jawaban 400 (fase A; disalin ke seluruh route di fase B) ──
    // Skema membawa KUNCI kamus, bukan kalimat (pesan zod dipanggang saat modul
    // dimuat dan tidak bisa ikut berganti bahasa — lihat lib/i18n/validation.ts).
    // Route handler boleh membaca cookie bahasa persis seperti server component,
    // jadi DI SINILAH kunci itu kembali menjadi kalimat, dalam bahasa pengguna.
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
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
    costCenterId,
    ...invoiceData
  } = parsed.data;
  const invoiceId = parseInt(id);
  // Recomputed on every edit: changing an item, the taxable flag, the rate or the
  // PPN rate has to move DPP/PPN/base_amount with it, or the stored values drift
  // from the reposted journal.
  const tax = resolveInvoiceTax(invoiceSubtotal(items), { taxable, taxRate, taxAmount });
  const { rate: fxRate, baseAmount } = fxAmounts(currency, tax.total, rate);

  // Friendly check for the source document (an FK violation would otherwise be an
  // opaque 500). Nullable — an edit may also detach the faktur from its contract.
  if (contractId != null && !(await prisma.contract.findUnique({ where: { id: contractId } }))) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.sourceContractNotFound") }, { status: 400 });
  }

  try {
    const { invoice, reapproval } = await prisma.$transaction(async (tx) => {
      // Outstanding guard (issue #15), inside the transaction — an edit can
      // overdraw a contract just as a new faktur can. THIS invoice's own lines are
      // excluded from "already invoiced", or every save would collide with itself.
      if (contractId != null) {
        const { lines } = await contractOutstandingForInvoice(tx, contractId, invoiceId);
        assertWithinContract(lines, items);
      }

      await tx.invoiceItem.deleteMany({ where: { invoiceId } });

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          ...invoiceData,
          contractId: contractId ?? null,
          // Eksplisit, BUKAN lewat `...invoiceData`: pada `update`, `undefined`
          // berarti "jangan sentuh kolomnya", jadi pengguna yang MENGOSONGKAN
          // pemilih pusat biaya tak akan pernah bisa melepas tag lamanya
          // (issue #98). `?? null` membuat "dikosongkan" berarti dikosongkan.
          costCenterId: costCenterId ?? null,
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

      // Penilaian ulang persetujuan (issue #45) — SEBELUM repost, karena gerbang
      // jurnal membaca status pengajuan lewat transaksi yang sama. Faktur kecil
      // yang diedit menjadi besar kini masuk antrean, dan faktur yang sudah
      // disetujui lalu dinaikkan melampaui restunya kehilangan persetujuan itu.
      const reapproval: ReevaluateResult = await reevaluateApprovalRequest({
        client: tx,
        sourceType: "invoice",
        documentId: invoiceId,
        documentNo: updated.invoiceNo,
        amount: tax.total,
        currency,
        rate: fxRate,
        baseAmount,
        requestedById: parseInt(result.session.user.id, 10),
      });

      // Reverse the old journal and post a fresh one, so the ledger matches the
      // edited document without ever mutating a posted line.
      await repostForSource({ sourceType: "invoice", sourceId: invoiceId, tx });
      return { invoice: updated, reapproval };
    });

    if (reapproval.action === "revoke" || reapproval.action === "create") {
      await writeAuditLog({
        userId: result.session.user.id,
        username: result.session.user.email,
        action: reapproval.action === "revoke" ? "approval.revoke" : "approval.request",
        entity: "approval_request",
        entityId: reapproval.request?.id ?? invoiceId,
        details: {
          sourceType: "invoice",
          documentId: invoiceId,
          documentNo: invoice.invoiceNo,
          baseAmount: Number(baseAmount ?? 0),
          previouslyApprovedBase: reapproval.previouslyApprovedBase,
          reason: "dokumen diedit",
        },
        request,
      });
    }

    return NextResponse.json({
      ...invoice,
      approval:
        reapproval.action === "revoke"
          ? { revoked: true, message: revocationNotice("Faktur") }
          : reapproval.action === "create"
            ? approvalNotice(reapproval.request, "Faktur")
            : null,
    });
  } catch (e) {
    if (e instanceof OverInvoiceError) {
      return NextResponse.json({ error: e.message, saved: false }, { status: 400 });
    }
    return handlePostingError(e);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("invoice.delete");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const invoiceId = parseInt(id);

  const openingDoc = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { isOpening: true },
  });
  if (openingDoc?.isOpening) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.openingDocumentLocked") }, { status: 409 });
  }

  // Dokumen berantai: faktur yang sudah ditarik oleh surat jalan, retur
  // penjualan, atau kompensasi uang muka di-RESTRICT oleh FK masing-masing
  // (`delivery_orders.invoice_id` / `sales_returns.invoice_id` /
  // `advance_applications.invoice_id`). Katakan itu dengan jelas alih-alih
  // membiarkan driver melempar 500 buram — cermin penjaga di route kontrak.
  const [deliveryOrderCount, salesReturnCount, advanceApplications] = await Promise.all([
    prisma.deliveryOrder.count({ where: { invoiceId } }),
    prisma.salesReturn.count({ where: { invoiceId } }),
    prisma.advanceApplication.findMany({
      where: { invoiceId },
      select: { advance: { select: { advanceNo: true } } },
    }),
  ]);
  if (deliveryOrderCount > 0 || salesReturnCount > 0) {
    const { t } = await getRequestI18n();
    // Frasa pencacahan dipinjam dari penjaga kontrak (kamus belum punya varian
    // khusus faktur); dua jenis disambung "·" — tanda baca yang netral bahasa,
    // bukan kata sambung yang berbeda antarbahasa.
    const parts: string[] = [];
    if (deliveryOrderCount > 0) {
      parts.push(t("errors.contractUsedDeliveryOrders", { count: deliveryOrderCount }));
    }
    if (salesReturnCount > 0) {
      parts.push(t("returns.tabSales", { count: salesReturnCount }));
    }
    return NextResponse.json(
      { error: t("errors.invoiceInUse", { used: parts.join(" · ") }) },
      { status: 409 }
    );
  }
  if (advanceApplications.length > 0) {
    const { t } = await getRequestI18n();
    // Faktur ini adalah SATU dokumen target kompensasi uang muka tersebut —
    // batalkan kompensasinya dulu (lewat panel uang muka di halaman faktur).
    return NextResponse.json(
      {
        error: t("errors.advanceAlreadyApplied", {
          advanceNo: advanceApplications[0].advance.advanceNo,
          count: 1,
        }),
      },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Payments cascade-delete with the invoice, so their journals have to be
      // reversed here too — otherwise the ledger keeps entries whose source row
      // no longer exists.
      const payments = await tx.invoicePayment.findMany({
        where: { invoiceId },
        select: { id: true },
      });
      for (const payment of payments) {
        await unpostForSource({ sourceType: "invoice_payment", sourceId: payment.id, tx });
      }
      await unpostForSource({ sourceType: "invoice", sourceId: invoiceId, tx });

      await tx.invoice.delete({ where: { id: invoiceId } });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handlePostingError(e);
  }
}
