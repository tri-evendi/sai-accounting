/**
 * RETENSI PENAWARAN MASUK (`lead_requests`, migration platform 0016) — langkah
 * penjadwal "4c", sesuai `docs/TATA-KELOLA.md` §6 (UU PDP).
 *
 *   • `selesai` / `spam` → dianonimkan 12 bulan sesudah `handled_at`;
 *   • `baru` / `dihubungi` yang terbengkalai → dianonimkan 24 bulan sesudah
 *     `created_at`, dan statusnya ditutup (`selesai`, ditangani
 *     `system:retensi-lead`) — baris "baru" tanpa nama dan nomor bukan lagi
 *     pekerjaan siapa pun, dan tidak boleh terus menyalakan lencana konsol.
 *
 * DIANONIMKAN, bukan dihapus: yang tersisa hanya statistik corong (jenis,
 * bentuk usaha, jumlah perusahaan, sumber, status, tanggal) — tanpa nama,
 * perusahaan, nomor, surel, pesan, catatan, maupun sidik IP. Nomor rujukan
 * tetap (ia bukan data pribadi, dan mungkin tertulis di percakapan lama).
 *
 * Tanpa `server-only`: dipanggil skrip penjadwal (`tsx`, di luar Next). Klien
 * disuntikkan supaya teruji tanpa basis data (`tests/lead-retention.test.ts`).
 */

import { LEAD_ANONYMIZED_MARK, leadRetentionCutoffs } from "@sai/core/lead-request";

/** Aktor yang tercatat di `handled_by` saat retensi menutup lead terbuka. */
export const LEAD_RETENTION_ACTOR = "system:retensi-lead";

export interface LeadRetentionClient {
  leadRequest: {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

function dataKosong(now: Date): Record<string, unknown> {
  return {
    name: LEAD_ANONYMIZED_MARK,
    company: LEAD_ANONYMIZED_MARK,
    phone: "",
    email: null,
    message: null,
    notes: null,
    ipHash: null,
    anonymizedAt: now,
  };
}

/** Jalankan retensi; memulangkan jumlah baris yang dianonimkan per kelompok. */
export async function applyLeadRetention(
  client: LeadRetentionClient,
  now: Date = new Date()
): Promise<{ closed: number; abandoned: number }> {
  const { closedBefore, openBefore } = leadRetentionCutoffs(now);
  const closed = await client.leadRequest.updateMany({
    where: {
      anonymizedAt: null,
      status: { in: ["selesai", "spam"] },
      handledAt: { lt: closedBefore },
    },
    data: dataKosong(now),
  });
  const abandoned = await client.leadRequest.updateMany({
    where: {
      anonymizedAt: null,
      status: { in: ["baru", "dihubungi"] },
      createdAt: { lt: openBefore },
    },
    data: { ...dataKosong(now), status: "selesai", handledBy: LEAD_RETENTION_ACTOR, handledAt: now },
  });
  return { closed: closed.count, abandoned: abandoned.count };
}
