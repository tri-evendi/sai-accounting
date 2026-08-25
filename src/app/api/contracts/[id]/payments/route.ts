import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractPaymentSchema } from "@/lib/validations/contract";
import { fxAmounts } from "@/lib/validations/fx";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { approvalNotice, ensureApprovalRequest } from "@/lib/approval-requests";
import { checkPaymentFits, type PaymentProblem } from "@/lib/document-payments";
import { PaymentRefused, paymentProblemMessage } from "@/lib/payment-refusal";
import { toBase } from "@/lib/receivables";
import { contractSubtotal } from "@/lib/validations/contract";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("contract.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const payments = await prisma.contractPayment.findMany({
    where: { contractId: parseInt(id) },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(payments);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("contract.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const contractId = parseInt(id);

  // Verify contract exists
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { items: true },
  });
  if (!contract) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.contractNotFound") }, { status: 404 });
  }

  const body = await request.json();
  const parsed = contractPaymentSchema.safeParse({ ...body, contractId });

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

  const { date, contractId: cId, rate: rateInput, ...paymentData } = parsed.data;
  const { rate, baseAmount } = fxAmounts(paymentData.currency, paymentData.amount, rateInput);

  /*
   * ── PEMBAYARAN KONTRAK TIDAK BOLEH MELEBIHI NILAI KONTRAKNYA (issue #483) ──
   *
   * Penjaga ini pernah DITUNDA, dan alasannya ditulis di sini: "sisa kontrak"
   * belum punya satu definisi, jadi pagar yang memakai satu definisi akan
   * berselisih dengan laporan yang memakai definisi lain — dua angka bernama
   * sama yang tidak pernah cocok.
   *
   * Penghalang itu hilang di #491 → #502 → #503: `buildContractOutstanding`
   * sekarang SATU definisi yang dipakai bersama laporan dan pagar fakturnya.
   *
   * ══ YANG DIUKUR DI SINI: NILAI KONTRAK, BUKAN YANG SUDAH DIFAKTURKAN ══════
   * Dan itu BUKAN angka yang sama dengan "sisa" di layar kontrak — keduanya
   * menjawab pertanyaan yang berbeda, jadi keduanya memang boleh berbeda:
   *
   *   • Layar kontrak: sisa yang belum DIFAKTURKAN (kontrak − faktur).
   *   • Pagar ini:     sisa yang belum DIBAYAR    (kontrak − pembayaran).
   *
   * Memakai nilai yang sudah difakturkan sebagai pagar akan menolak UANG MUKA —
   * pembayaran yang sah dan memang datang SEBELUM ada faktur, dan yang aplikasi
   * ini dukung lewat `advance_sales`. Pagar yang menolak alur yang didukungnya
   * sendiri lebih buruk daripada tidak ada pagar.
   *
   * Aturannya `checkPaymentFits` — fungsi yang SAMA dengan pagar pembayaran
   * faktur (#424), bukan salinan kedua. Mata uang diperiksa lebih dulu di
   * dalamnya, jadi pemeriksaan mata uang yang dulu berdiri sendiri di sini
   * ikut lebur ke situ.
   *
   * Dijalankan DI DALAM transaksi, seperti sisi faktur: membaca pembayaran yang
   * sudah ada di luar transaksi berarti dua permintaan bersamaan bisa sama-sama
   * lolos dan bersama-sama melewati batas.
   */
  let problem: PaymentProblem | null = null;

  let payment;
  let approval;
  try {
    ({ payment, approval } = await prisma.$transaction(async (tx) => {
      const existing = await tx.contractPayment.findMany({
        where: { contractId },
        select: { amount: true, currency: true, rate: true, baseAmount: true },
      });

      /*
       * Nilai kontrak DITURUNKAN dari barisnya, bukan dibaca dari
       * `contract.baseAmount` mentah-mentah — alasan yang sama dengan sisi
       * faktur: kontrak rupiah dari penyemai contoh maupun impor lama menyimpan
       * `base_amount` NULL, sebab untuk IDR ia sama dengan nominalnya. Membaca
       * kolomnya apa adanya akan menganggap kontrak-kontrak itu "tak bernilai"
       * dan MENOLAK setiap pembayarannya — penjaga yang berubah jadi kelumpuhan.
       */
      const total = contractSubtotal(
        contract.items.map((i) => ({
          bags: Number(i.bags),
          kgPerBag: Number(i.kgPerBag),
          pricePerKg: Number(i.pricePerKg),
        }))
      );

      problem = checkPaymentFits({
        documentCurrency: contract.currency,
        documentBase: toBase({
          amount: total,
          currency: contract.currency,
          rate: contract.rate,
          baseAmount: contract.baseAmount,
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

      const created = await tx.contractPayment.create({
        data: {
          ...paymentData,
          contractId: cId,
          date: new Date(date),
          rate,
          baseAmount,
        },
      });

      // Approval (issue #25) — see the invoice-payment route for why the parent
      // document's number identifies a payment in the queue.
      const request = await ensureApprovalRequest({
        client: tx,
        sourceType: "contract_payment",
        documentId: created.id,
        documentNo: contract.contractNo,
        amount: paymentData.amount,
        currency: paymentData.currency,
        rate,
        baseAmount,
        requestedById: parseInt(result.session.user.id, 10),
      });

      await postForSource({ sourceType: "contract_payment", sourceId: created.id, tx });
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
        sourceType: "contract_payment",
        documentId: payment.id,
        documentNo: contract.contractNo,
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
