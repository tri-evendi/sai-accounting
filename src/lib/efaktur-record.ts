/**
 * `efaktur.record` — hasil PJAP (dilaporkan jalur `integration` Go) ditulis ke
 * `efaktur_submissions` di buku PT. Dipanggil pelari `interactive` Node
 * (`workers/interactive.ts`) di DALAM konteks perusahaan pekerjaannya.
 *
 * Ini SATU-SATUNYA penulis status kiriman selain rute yang membuat barisnya:
 * pohon Go tidak menulis buku PT (daftar-izin `jobs` + `backup_runs`,
 * `tests/services-go.test.ts`). Transisinya diputuskan `applyEfakturEvent` —
 * kejadian yang terlambat atau tidak sah DIABAIKAN, tidak menimpa.
 */
import { prisma } from "@/lib/prisma";
import {
  applyEfakturEvent,
  parseEfakturEvent,
  type EfakturSubmissionStatus,
} from "@sai/core/efaktur-submission";

export type EfakturRecordOutcome = "applied" | "ignored";

/** Terapkan satu muatan `efaktur.record`. Muatan rusak MELEMPAR (pekerjaan gagal, terlihat). */
export async function applyEfakturRecord(payload: unknown): Promise<EfakturRecordOutcome> {
  const ev = parseEfakturEvent(payload);
  if (!ev) {
    throw new Error("muatan efaktur.record tidak sah — dibandingkan dengan parseEfakturEvent");
  }
  const row = await prisma.efakturSubmission.findUnique({
    where: { id: ev.submissionId },
    select: { status: true, statusObservedAt: true, submittedAt: true },
  });
  if (!row) {
    // Buku ini tidak punya kiriman itu: muatan yang salah perusahaan adalah
    // tepat jenis kesalahan yang harus berisik (#104).
    throw new Error(`kiriman e-Faktur #${ev.submissionId} tidak ada di buku perusahaan pekerjaan ini`);
  }
  const patch = applyEfakturEvent(
    { status: row.status as EfakturSubmissionStatus, statusObservedAt: row.statusObservedAt, submittedAt: row.submittedAt },
    ev
  );
  if (!patch) return "ignored";
  await prisma.efakturSubmission.update({ where: { id: ev.submissionId }, data: patch });
  return "applied";
}
