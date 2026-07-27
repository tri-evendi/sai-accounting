/**
 * Mengajukan ulang dokumen yang ditolak (issue #44).
 *
 * Mesin status sudah lama mengizinkan `rejected → pending_approval`; yang belum
 * ada hanyalah pintunya. Tanpa pintu itu dokumen yang ditolak menjadi buntu:
 * pemohon memperbaiki isinya, tetapi tak ada cara membawanya kembali ke
 * penyetuju — dan selama belum `approved`, jurnalnya ditahan gerbang di
 * `postForSource`.
 *
 * ── MENGAPA HARUS DITEKAN, BUKAN OTOMATIS SAAT DOKUMEN DIEDIT ───────────────
 * Mengedit dokumen yang ditolak TIDAK otomatis mengembalikannya ke antrean
 * (lihat `reapprovalAction`: status `rejected` hanya disegarkan nilainya).
 * Sebuah suntingan belum tentu sebuah perbaikan — orang menyimpan setengah jalan,
 * membetulkan salah ketik, mengubah catatan — dan antrean penyetuju tidak boleh
 * terisi oleh ketukan papan ketik. Mengajukan ulang adalah pernyataan sadar
 * "menurut saya ini sudah benar", jadi ia satu tindakan tersendiri yang tercatat.
 *
 * ── TIDAK ADA JURNAL DI SINI ────────────────────────────────────────────────
 * Rute ini hanya memindahkan status ke `pending_approval`. Justru karena itu
 * jurnalnya tetap ditahan: yang menerbitkan jurnal hanyalah keputusan setuju,
 * lewat `postForSource` di rute keputusan.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { approvalResubmitSchema } from "@/lib/validations/approval";
import { ApprovalTransitionError, assertTransition, canResubmit } from "@/lib/approvals";
import { isFullAccessRole } from "@/lib/constants";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("approval.view");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const requestId = parseInt(id, 10);
  if (!Number.isInteger(requestId)) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.approvalNotFound") }, { status: 404 });
  }

  const parsed = approvalResubmitSchema.safeParse(await request.json().catch(() => ({})));
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
  const note = parsed.data.note ?? null;

  const existing = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!existing) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.approvalNotFound") }, { status: 404 });
  }

  // Yang boleh mengajukan ulang: pemohonnya sendiri, atau peran berakses penuh
  // (Direktur Utama / Administrator). Bukan penyetuju mana pun — mengajukan dan
  // memutuskan adalah dua peran yang sengaja dipisah — dan peran berakses penuh
  // disertakan agar dokumen tidak ikut buntu saat pemohonnya sudah tak ada
  // (resign, akun nonaktif).
  const userId = parseInt(result.session.user.id, 10);
  const isRequester = existing.requestedById === userId;
  if (!isRequester && !isFullAccessRole(result.session.user.role)) {
    return NextResponse.json(
      {
        error:
          "Hanya pemohon, Direktur Utama, atau Administrator yang bisa mengajukan " +
          "ulang pengajuan ini.",
      },
      { status: 403 }
    );
  }

  if (!canResubmit(existing.status)) {
    return NextResponse.json(
      {
        error:
          existing.status === "pending_approval"
            ? "Pengajuan ini sudah menunggu keputusan — tak perlu diajukan ulang."
            : "Hanya pengajuan yang DITOLAK yang bisa diajukan ulang.",
      },
      { status: 409 }
    );
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Dibaca ulang di dalam transaksi: statusnya bisa berubah di sela
      // pemeriksaan di atas dan sini (mis. dokumennya diedit, atau orang lain
      // mengajukan ulang lebih dulu).
      const current = await tx.approvalRequest.findUnique({ where: { id: requestId } });
      if (!current) throw new ApprovalTransitionError("hilang", "pending_approval");
      assertTransition(current.status, "pending_approval");

      return tx.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: "pending_approval",
          // `decidedById` / `decidedAt` / `decisionNote` SENGAJA dipertahankan:
          // itulah alasan penolakan yang lalu, dan penyetuju perlu membacanya saat
          // menimbang pengajuan yang baru. Kombinasi "menunggu + pernah diputus"
          // adalah cara `wasResubmitted` mengenali pengajuan ulang tanpa kolom baru.
          requestNote: note ?? current.requestNote,
          // Pemohon jelas sudah membaca penolakannya — ia sedang menindaklanjutinya.
          readAt: new Date(),
        },
      });
    });
  } catch (e) {
    if (e instanceof ApprovalTransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "approval.resubmit",
    entity: "approval_request",
    entityId: updated.id,
    details: {
      sourceType: updated.sourceType,
      documentId: updated.documentId,
      documentNo: updated.documentNo,
      baseAmount: Number(updated.baseAmount),
      approverRole: updated.approverRole,
      previousDecisionNote: existing.decisionNote,
      note,
      byRequester: isRequester,
    },
    request,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    message: `Pengajuan dikirim ulang ke peran "${updated.approverRole}" untuk diputuskan.`,
  });
}
