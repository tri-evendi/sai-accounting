/**
 * KIRIMAN e-FAKTUR — sisi `app-customer` (docs/EFAKTUR.md).
 *
 * `app-customer` tidak pernah bicara dengan PJAP. Ia hanya:
 *   1. MEMBEKUKAN XML Coretax satu faktur ke baris `efaktur_submissions`
 *      (`queued`) dan MENERBITKAN `integration.efaktur_submit`;
 *   2. menandai pembatalan (`cancel_requested`) dan menerbitkan
 *      `integration.efaktur_cancel`;
 *   3. MEMBACA status terakhir per faktur untuk layar.
 * Yang mengirim adalah jalur `integration` Go di `svc-integrator`; hasilnya
 * kembali lewat `efaktur.record` (`src/lib/efaktur-record.ts`).
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { publishJob } from "@sai/platform/job-queue";
import { coretaxToXml } from "@sai/core/coretax-xml";
import {
  canCancel,
  canSubmitAfter,
  efakturIdempotencyKey,
  type EfakturProvider,
  type EfakturSubmissionStatus,
} from "@sai/core/efaktur-submission";
import { getCoretaxExport } from "@/lib/coretax-data";
import { efakturConnectionView } from "@/lib/efaktur-connection";

export interface LatestSubmission {
  id: number;
  invoiceId: number;
  revision: number;
  provider: string;
  status: EfakturSubmissionStatus;
  taxInvoiceNumber: string | null;
  statusMessage: string | null;
  updatedAt: Date;
}

/** Upaya TERAKHIR per faktur (revisi tertinggi). */
export async function latestSubmissions(invoiceIds: number[]): Promise<Map<number, LatestSubmission>> {
  if (invoiceIds.length === 0) return new Map();
  const rows = await prisma.efakturSubmission.findMany({
    where: { invoiceId: { in: invoiceIds } },
    orderBy: [{ invoiceId: "asc" }, { revision: "desc" }],
    select: {
      id: true,
      invoiceId: true,
      revision: true,
      provider: true,
      status: true,
      taxInvoiceNumber: true,
      statusMessage: true,
      updatedAt: true,
    },
  });
  const out = new Map<number, LatestSubmission>();
  for (const r of rows) {
    if (!out.has(r.invoiceId)) out.set(r.invoiceId, { ...r, status: r.status as EfakturSubmissionStatus });
  }
  return out;
}

export async function getEfakturConnection() {
  const s = await prisma.companySetting.findFirst({
    orderBy: { id: "asc" },
    select: {
      efakturProvider: true,
      efakturClientId: true,
      efakturSecretCiphertext: true,
      efakturSecretIv: true,
      efakturSecretTag: true,
      efakturIsProduction: true,
    },
  });
  return efakturConnectionView(s);
}

/** Alasan sebuah faktur TIDAK diantrekan — kunci kamus `tax.coretax.skip.<alasan>`. */
export type SkipReason = "not_found" | "not_ready" | "export" | "in_progress" | "already_approved";

export interface QueueResult {
  queued: { invoiceNo: string; submissionId: number }[];
  skipped: { invoiceNo: string | null; invoiceId: number; reason: SkipReason }[];
}

/**
 * Antrekan kiriman untuk faktur-faktur ini. Faktur yang belum siap (masalah
 * validasi), ekspor (PEB), masih dalam proses, atau sudah disetujui DILEWATI
 * dengan alasan — tidak pernah dikirim setengah.
 */
export async function queueEfakturSubmissions(input: {
  companyId: number;
  invoiceIds: number[];
  requestedByUserId: number;
  provider: EfakturProvider;
}): Promise<QueueResult> {
  const ids = [...new Set(input.invoiceIds)];
  const [exp, latest] = await Promise.all([getCoretaxExport({ invoiceIds: ids }), latestSubmissions(ids)]);
  const byNo = new Map(exp.result.invoices.map((i) => [i.invoiceNo, i]));
  const exportNos = new Set(exp.result.exports.map((e) => e.invoiceNo));
  const noById = new Map([...exp.invoiceIds].map(([no, id]) => [id, no]));

  const result: QueueResult = { queued: [], skipped: [] };
  for (const invoiceId of ids) {
    const invoiceNo = noById.get(invoiceId) ?? null;
    if (!invoiceNo) {
      result.skipped.push({ invoiceNo, invoiceId, reason: "not_found" });
      continue;
    }
    if (exportNos.has(invoiceNo)) {
      result.skipped.push({ invoiceNo, invoiceId, reason: "export" });
      continue;
    }
    const ready = byNo.get(invoiceNo);
    if (!ready || !exp.result.sellerTin) {
      result.skipped.push({ invoiceNo, invoiceId, reason: "not_ready" });
      continue;
    }
    const last = latest.get(invoiceId);
    if (!canSubmitAfter(last?.status ?? null)) {
      result.skipped.push({
        invoiceNo,
        invoiceId,
        reason: last?.status === "approved" ? "already_approved" : "in_progress",
      });
      continue;
    }
    const revision = (last?.revision ?? 0) + 1;
    /* Unik (invoice_id, revision) + (idempotency_key): dua klik bersamaan
       menabrak constraint, bukan melahirkan dua kiriman. */
    const row = await prisma.efakturSubmission
      .create({
        data: {
          invoiceId,
          revision,
          idempotencyKey: efakturIdempotencyKey(input.companyId, invoiceId, revision),
          provider: input.provider,
          status: "queued",
          xml: coretaxToXml(exp.result.sellerTin, [ready]),
          requestedByUserId: input.requestedByUserId,
        },
        select: { id: true },
      })
      .catch((error: unknown) => {
        if (typeof error === "object" && error && "code" in error && error.code === "P2002") return null;
        throw error;
      });
    if (!row) {
      result.skipped.push({ invoiceNo, invoiceId, reason: "in_progress" });
      continue;
    }
    await publishJob({
      kind: "integration.efaktur_submit",
      companyId: input.companyId,
      payload: { submissionId: row.id },
      dedupeKey: `integration.efaktur_submit:${input.companyId}:${row.id}`,
    });
    result.queued.push({ invoiceNo, submissionId: row.id });
  }
  return result;
}

/** Minta pembatalan faktur pajak yang sudah disetujui. `false` = status tidak mengizinkan. */
export async function requestEfakturCancel(companyId: number, submissionId: number): Promise<boolean> {
  const row = await prisma.efakturSubmission.findUnique({
    where: { id: submissionId },
    select: { status: true },
  });
  if (!row || !canCancel(row.status as EfakturSubmissionStatus)) return false;
  /* Bersyarat pada status yang dibaca: dua klik bersamaan → satu yang menang. */
  const updated = await prisma.efakturSubmission.updateMany({
    where: { id: submissionId, status: "approved" },
    data: { status: "cancel_requested", statusMessage: null },
  });
  if (updated.count === 0) return false;
  await publishJob({
    kind: "integration.efaktur_cancel",
    companyId,
    payload: { submissionId },
    /* TANPA dedupeKey: pembatalan yang ditolak PJAP mengembalikan status ke
       `approved`, dan permintaan berikutnya harus bisa terbit lagi. Ganda
       dicegah `updateMany` bersyarat di atas, bukan oleh kunci. */
  });
  return true;
}
