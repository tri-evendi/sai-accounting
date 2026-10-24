/**
 * AKSI TULIS konsol operator untuk PENAWARAN MASUK (`lead_requests`, migration
 * platform 0016): ubah status, tambah catatan.
 *
 * Aturan yang sama dengan `writes.ts` / `trial-writes.ts` (#155): tanpa
 * `server-only`, klien DISUNTIKKAN (teruji tanpa basis data —
 * `tests/operator-leads.test.ts`), dan setiap aksi yang BERHASIL menulis tepat
 * satu jejak operator. Penulis jejaknya ikut disuntikkan: bawaannya
 * `writeOperatorAuditLog` (gagal menulis jejak tidak menggagalkan aksinya).
 *
 * Lead BUKAN tenant — belum ada tenant untuk dicatatkan jejaknya — jadi
 * jejaknya jejak OPERATOR (`operator_audit_logs`), bukan jejak tenant.
 */

import {
  appendLeadNote,
  isLeadStatus,
  leadTransitionAllowed,
  type LeadStatus,
} from "@sai/core/lead-request";

import type { OperatorAuditAction } from "@op/lib/operator/audit";

export interface LeadRow {
  id: number;
  reference: string;
  status: string;
  notes: string | null;
  anonymizedAt: Date | null;
}

export interface LeadWriteDeps {
  platform: {
    leadRequest: {
      findUnique(args: {
        where: { id: number };
        select: { id: true; reference: true; status: true; notes: true; anonymizedAt: true };
      }): Promise<LeadRow | null>;
      updateMany(args: {
        where: { id: number; status?: string; notes?: string | null };
        data: Record<string, unknown>;
      }): Promise<{ count: number }>;
    };
  };
  audit: (entry: { operator: string; action: OperatorAuditAction; details: Record<string, unknown> }) => Promise<void>;
}

const SELECT = { id: true, reference: true, status: true, notes: true, anonymizedAt: true } as const;

export type ChangeLeadStatusResult =
  | { outcome: "changed"; from: LeadStatus; to: LeadStatus; reference: string }
  | { outcome: "not_found" }
  | { outcome: "invalid_transition"; from: string }
  /** Status berubah di antara baca dan tulis (operator lain lebih dulu). */
  | { outcome: "conflict" };

/**
 * Pindahkan status satu lead. Peralihan yang tidak sah (mis. `selesai` →
 * `baru`) DITOLAK — lihat `LEAD_TRANSITIONS`. Tulisannya bersyarat pada
 * status yang dibaca: dua operator yang menekan bersamaan tidak menghasilkan
 * dua jejak yang saling menimpa.
 *
 * `handled_by`/`handled_at` = operator & waktu peralihan TERAKHIR — jangkar
 * retensi (12 bulan sesudah `selesai`/`spam`).
 */
export async function changeLeadStatus(
  deps: LeadWriteDeps,
  input: { leadId: number; to: LeadStatus; operator: string },
  now: Date = new Date()
): Promise<ChangeLeadStatusResult> {
  const row = await deps.platform.leadRequest.findUnique({ where: { id: input.leadId }, select: SELECT });
  if (!row) return { outcome: "not_found" };
  if (!isLeadStatus(row.status) || !leadTransitionAllowed(row.status, input.to)) {
    return { outcome: "invalid_transition", from: row.status };
  }
  const from = row.status;
  const updated = await deps.platform.leadRequest.updateMany({
    where: { id: row.id, status: from },
    data: { status: input.to, handledBy: input.operator.slice(0, 100), handledAt: now },
  });
  if (updated.count === 0) return { outcome: "conflict" };

  await deps.audit({
    operator: input.operator,
    action: "operator.lead.status",
    details: { leadId: row.id, reference: row.reference, from, to: input.to },
  });
  return { outcome: "changed", from, to: input.to, reference: row.reference };
}

export type AddLeadNoteResult =
  | { outcome: "added"; reference: string }
  | { outcome: "not_found" }
  /** Data pribadinya sudah dikosongkan retensi — tidak ada yang dicatati. */
  | { outcome: "anonymized" }
  | { outcome: "conflict" };

/** Tambahkan satu catatan (terbaru di atas, berstempel tanggal & operator). */
export async function addLeadNote(
  deps: LeadWriteDeps,
  input: { leadId: number; text: string; operator: string },
  now: Date = new Date()
): Promise<AddLeadNoteResult> {
  const row = await deps.platform.leadRequest.findUnique({ where: { id: input.leadId }, select: SELECT });
  if (!row) return { outcome: "not_found" };
  if (row.anonymizedAt) return { outcome: "anonymized" };

  const notes = appendLeadNote(row.notes, { operator: input.operator, text: input.text, at: now });
  /* Bersyarat pada catatan yang dibaca: dua catatan serentak tidak saling
     menghapus — yang kalah diminta mencoba lagi. */
  const updated = await deps.platform.leadRequest.updateMany({
    where: { id: row.id, notes: row.notes },
    data: { notes },
  });
  if (updated.count === 0) return { outcome: "conflict" };

  await deps.audit({
    operator: input.operator,
    action: "operator.lead.note",
    details: { leadId: row.id, reference: row.reference, length: input.text.trim().length },
  });
  return { outcome: "added", reference: row.reference };
}
