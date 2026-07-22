/**
 * Memutuskan satu pengajuan persetujuan (issue #25).
 *
 * POST  = setujui / tolak (dengan catatan).
 * PATCH = pemohon menandai hasil keputusan sudah dibaca (notifikasi in-app).
 *
 * ── MENYETUJUI ADALAH SAAT JURNAL TERBIT ────────────────────────────────────
 * Persetujuan dan jurnalnya commit BERSAMA, di satu `$transaction`: status
 * diubah lebih dulu, lalu `postForSource` dipanggil di transaksi yang sama —
 * gerbang di posting engine membaca baris yang baru saja jadi `approved`, jadi
 * jurnalnya terbit tepat pada saat itu, lewat jalur posting yang SUDAH ADA.
 * Kalau jurnalnya gagal terbit (periode sudah ditutup #13, mapping akun kurang,
 * kurs penyelesaian tak ada #43), seluruh transaksi dibatalkan: persetujuannya
 * ikut batal dan dokumen tetap di antrean, bukan "disetujui tapi tak berjurnal".
 *
 * ── SIAPA YANG BOLEH MEMUTUSKAN ─────────────────────────────────────────────
 * Hanya peran yang disebut aturan (`approval_requests.approver_role`) — bukan
 * "bos boleh apa saja". Bila kebijakannya memang bos, aturannya yang menyebut
 * bos. Satu sumber kebenaran, bukan dua.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { postForSource, type PostingSourceType } from "@/lib/posting";
import { approvalDecisionSchema } from "@/lib/validations/approval";
import {
  APPROVAL_SOURCE_TYPES,
  ApprovalTransitionError,
  assertTransition,
  statusForDecision,
  type ApprovalSourceType,
} from "@/lib/approvals";

function isApprovalSource(value: string): value is ApprovalSourceType {
  return (APPROVAL_SOURCE_TYPES as readonly string[]).includes(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth();
  if (!result.authorized) return result.response;

  const { id } = await params;
  const requestId = parseInt(id, 10);
  if (!Number.isInteger(requestId)) {
    return NextResponse.json({ error: "Pengajuan tidak ditemukan." }, { status: 404 });
  }

  const parsed = approvalDecisionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { decision, note } = parsed.data;

  const existing = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!existing) {
    return NextResponse.json({ error: "Pengajuan tidak ditemukan." }, { status: 404 });
  }

  if (result.session.user.role !== existing.approverRole) {
    return NextResponse.json(
      {
        error: `Pengajuan ini hanya bisa diputuskan oleh peran "${existing.approverRole}".`,
      },
      { status: 403 }
    );
  }

  const nextStatus = statusForDecision(decision);
  try {
    assertTransition(existing.status, nextStatus);
  } catch (e) {
    if (e instanceof ApprovalTransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  const decidedById = parseInt(result.session.user.id, 10);

  let updated;
  let journalId: number | null = null;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Dibaca ULANG di dalam transaksi: nilai yang dicatat sebagai "disetujui"
      // harus nilai yang benar-benar berlaku saat keputusan diambil. Dokumen
      // bisa saja diedit antara pembacaan di atas dan transaksi ini (#45).
      const current = await tx.approvalRequest.findUnique({ where: { id: requestId } });
      if (!current) throw new ApprovalTransitionError("hilang", nextStatus);
      assertTransition(current.status, nextStatus);

      const row = await tx.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          decidedById,
          decidedAt: new Date(),
          decisionNote: note ?? null,
          // Catat nilai yang BENAR-BENAR disetujui (issue #45). `baseAmount` ikut
          // berubah setiap dokumennya diedit; kolom ini tidak, sehingga edit yang
          // melampaui restu penyetuju bisa dikenali dan menggugurkan persetujuan
          // alih-alih menumpang padanya.
          approvedBaseAmount: nextStatus === "approved" ? current.baseAmount : null,
          // A fresh decision is an unread notification for the requester.
          readAt: null,
        },
      });

      if (nextStatus === "approved" && isApprovalSource(row.sourceType)) {
        const journal = await postForSource({
          sourceType: row.sourceType as PostingSourceType,
          sourceId: row.documentId,
          tx,
        });
        journalId = journal?.id ?? null;
      }

      return row;
    });
  } catch (e) {
    // Status bisa berubah di sela pemeriksaan di atas dan transaksi ini — mis.
    // dokumennya diedit melampaui nilai yang disetujui sehingga persetujuannya
    // digugurkan (#45), atau penyetuju lain memutus lebih dulu.
    if (e instanceof ApprovalTransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: decision === "approve" ? "approval.approve" : "approval.reject",
    entity: "approval_request",
    entityId: updated.id,
    details: {
      sourceType: updated.sourceType,
      documentId: updated.documentId,
      documentType: updated.documentType,
      documentNo: updated.documentNo,
      baseAmount: Number(updated.baseAmount),
      thresholdAmount: Number(updated.thresholdAmount),
      currency: updated.currency,
      requestedById: updated.requestedById,
      note: note ?? null,
      // Whether the decision actually released a journal — null on a rejection,
      // and also null when the document has nothing to post (cancelled, zero).
      journalId,
    },
    request,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    decidedAt: updated.decidedAt,
    decisionNote: updated.decisionNote,
    journalId,
  });
}

/** Pemohon menandai hasil keputusan sudah dibaca — mematikan badge notifikasi. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth();
  if (!result.authorized) return result.response;

  const { id } = await params;
  const requestId = parseInt(id, 10);
  if (!Number.isInteger(requestId)) {
    return NextResponse.json({ error: "Pengajuan tidak ditemukan." }, { status: 404 });
  }

  const existing = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!existing) {
    return NextResponse.json({ error: "Pengajuan tidak ditemukan." }, { status: 404 });
  }

  // Only its author can mark it read: it is their notification, not a shared one.
  if (existing.requestedById !== parseInt(result.session.user.id, 10)) {
    return NextResponse.json({ error: "Bukan pengajuan Anda." }, { status: 403 });
  }

  const updated = await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { readAt: existing.readAt ?? new Date() },
  });

  return NextResponse.json({ id: updated.id, readAt: updated.readAt });
}
