import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoicePaymentSchema } from "@/lib/validations/invoice";
import { fxAmounts } from "@/lib/validations/fx";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { approvalNotice, ensureApprovalRequest } from "@/lib/approval-requests";
import { checkPaymentFits, type PaymentProblem } from "@/lib/document-payments";
/* Dibagi pakai dengan jalur pembayaran KONTRAK sejak #483 — dua salinan
   kalimat penolakan bisa menyimpang tanpa ada yang melihatnya. */
import { PaymentRefused, paymentProblemMessage } from "@/lib/payment-refusal";
import { formatCurrency } from "@/lib/utils";
import { toBase } from "@/lib/receivables";
import { invoiceTotal } from "@/lib/validations/invoice";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("invoice.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const invoiceId = parseInt(id);

  /* `items` ikut ditarik karena NILAI faktur di aplikasi ini dihitung dari
     barisnya, bukan dari sebuah kolom nilai (lihat kepala `receivables.ts`) —
     dan penjaga #424 di bawah mengukur sisa tagihan terhadap nilai itu. */
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true },
  });
  if (!invoice) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invoiceNotFound") }, { status: 404 });
  }

  const body = await request.json();
  const parsed = invoicePaymentSchema.safeParse({ ...body, invoiceId });

  if (!parsed.success) {
    // ── Pola baku jawaban 400 (fase A; fase B menyalin ini ke seluruh route) ──
    // Skema membawa KUNCI kamus, bukan kalimat (pesan zod dipanggang saat modul
    // dimuat dan tidak bisa ikut berganti bahasa — lihat lib/i18n/validation.ts).
    // Route handler boleh membaca cookie bahasa persis seperti server component
    // (preseden: lib/period-close.ts), jadi DI SINILAH kunci itu kembali menjadi
    // kalimat, dalam bahasa pengguna. Pesan yang BUKAN kunci diteruskan apa adanya.
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const { date, invoiceId: iId, rate: rateInput, ...paymentData } = parsed.data;
  // Store the FX triple the ledger needs: amount + currency + rate + IDR base.
  const { rate, baseAmount } = fxAmounts(paymentData.currency, paymentData.amount, rateInput);

  let payment;
  let approval;
  /*
   * Penjaga #424 dilaporkan lewat variabel, bukan dilempar sebagai galat:
   * `handlePostingError` di bawah MELEMPAR ULANG apa pun yang bukan galat
   * posting, jadi galat penjaga akan keluar sebagai 500 — kelas jawaban yang
   * salah untuk permintaan yang bentuknya benar tapi memang tidak boleh.
   */
  let problem: PaymentProblem | null = null;
  try {
    ({ payment, approval } = await prisma.$transaction(async (tx) => {
      /*
       * ── SISA TAGIHAN DIUKUR DI DALAM TRANSAKSI (issue #424) ──────────────
       *
       * Bukan sebelumnya. Dua pembayaran yang datang bersamaan akan sama-sama
       * membaca "sisa masih cukup" bila pemeriksaannya berdiri di luar, lalu
       * sama-sama tersimpan — dan hasil akhirnya persis kelebihan bayar yang
       * penjaga ini ada untuk mencegahnya.
       */
      const existing = await tx.invoicePayment.findMany({
        where: { invoiceId: iId },
        select: { amount: true, currency: true, rate: true, baseAmount: true },
      });
      /*
       * Nilai IDR-nya lewat `toBase`, BUKAN kolom `base_amount` mentah.
       *
       * Alasannya data sungguhan: faktur rupiah yang lahir dari penyemai contoh
       * maupun dari impor lama menyimpan `base_amount` NULL — nilainya memang
       * tidak perlu disimpan, sebab untuk IDR ia sama dengan nominalnya.
       * Membaca kolomnya mentah-mentah akan menganggap faktur-faktur itu "tak
       * bernilai" dan MENOLAK setiap pelunasannya: penjaga yang mengubah
       * kelebihan bayar menjadi kelumpuhan. `toBase` menurunkannya persis
       * seperti seluruh laporan menurunkannya.
       */
      const total = invoiceTotal(
        invoice.items.map((i) => ({ quantity: Number(i.quantity), price: Number(i.price) })),
        Number(invoice.taxAmount ?? 0)
      );
      problem = checkPaymentFits({
        documentCurrency: invoice.currency,
        documentBase: toBase({
          amount: total,
          currency: invoice.currency,
          rate: invoice.rate,
          baseAmount: invoice.baseAmount,
        }),
        paidBases: existing.map((p) =>
          toBase({ amount: p.amount, currency: p.currency, rate: p.rate, baseAmount: p.baseAmount })
        ),
        paymentCurrency: paymentData.currency,
        paymentBase: baseAmount,
      });
      if (problem) {
        /* Membatalkan transaksi TANPA menulis apa pun. Nilai kembaliannya tak
           pernah dipakai — `problem` yang dibaca sesudahnya. */
        throw new PaymentRefused();
      }

      const created = await tx.invoicePayment.create({
        data: {
          ...paymentData,
          invoiceId: iId,
          date: new Date(date),
          rate,
          baseAmount,
        },
      });

      // Approval (issue #25). A payment has no number of its own, so the parent
      // invoice's number is what identifies it in the queue.
      const request = await ensureApprovalRequest({
        client: tx,
        sourceType: "invoice_payment",
        documentId: created.id,
        documentNo: invoice.invoiceNo,
        amount: paymentData.amount,
        currency: paymentData.currency,
        rate,
        baseAmount,
        requestedById: parseInt(result.session.user.id, 10),
      });

      await postForSource({ sourceType: "invoice_payment", sourceId: created.id, tx });
      return { payment: created, approval: request };
    }));
  } catch (e) {
    if (e instanceof PaymentRefused && problem) {
      return NextResponse.json({ error: await paymentProblemMessage(problem) }, { status: 422 });
    }
    return handlePostingError(e);
  }

  if (approval) {
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "approval.request",
      entity: "approval_request",
      entityId: approval.id,
      details: {
        sourceType: "invoice_payment",
        documentId: payment.id,
        documentNo: invoice.invoiceNo,
        baseAmount: Number(approval.baseAmount),
        thresholdAmount: Number(approval.thresholdAmount),
        approverRole: approval.approverRole,
      },
      request,
    });
  }

  return NextResponse.json(
    { ...payment, approval: approvalNotice(approval, "Pembayaran") },
    { status: 201 }
  );
}
