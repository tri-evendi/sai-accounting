/**
 * KESEHATAN OUTBOX — satu putusan dari jejak relay per buku (09 §4).
 *
 * Murni, nol IO: pembacanya tiga (`/api/health`, `watch:health`, konsol
 * `/scheduler`) dan ketiganya harus menjawab SAMA tentang mesin yang sama —
 * pelajaran `scheduler-heartbeat.ts` (#373).
 *
 * ══ DUA SINYAL, KARENA SATU SAJA BERBOHONG ═══════════════════════════════
 *   • UMUR baris tertua yang belum terbit, lintas buku — peristiwa yang
 *     tertahan (kendali menolak, kind dicabut) membuat angka ini tumbuh.
 *   • KESEGARAN jejak (`last_pass_at`) — relay yang MATI tidak menulis apa
 *     pun, jadi umur terakhir yang tercatat (sering nol) akan terbaca sehat
 *     selamanya. Jejak yang lebih tua dari `OUTBOX_RELAY_STALE_SECONDS` =
 *     `late`, apa pun umurnya.
 *
 * Status publik SATU KATA (rambu #317): jumlah baris dan jumlah buku adalah
 * volume pemakaian; angkanya di konsol.
 */
import {
  OUTBOX_LAG_LATE_SECONDS,
  OUTBOX_LAG_WARN_SECONDS,
  OUTBOX_RELAY_STALE_SECONDS,
} from "./generated/job-numbers";

export { OUTBOX_LAG_LATE_SECONDS, OUTBOX_LAG_WARN_SECONDS, OUTBOX_RELAY_STALE_SECONDS };

/**
 * `ok` · `lagging` (umur tertua ≥ ambang peringatan) · `late` (≥ ambang
 * terlambat, ATAU jejak basi) · `unknown` (belum ada jejak sama sekali —
 * relay belum pernah berjalan, atau migration kendali 0012 belum diterapkan;
 * BUKAN `ok`).
 */
export type OutboxHealthStatus = "ok" | "lagging" | "late" | "unknown";

/** Satu baris `outbox_relay_books` sebagaimana dibaca pembacanya. */
export interface OutboxRelayBookRow {
  companyId: number;
  lastPassAt: Date;
  oldestUnpublishedAt: Date | null;
  unpublishedCount: number;
  lastError: string | null;
}

export interface OutboxHealth {
  status: OutboxHealthStatus;
  /** Umur baris tertua yang belum terbit, detik; `null` = tidak ada. */
  oldestAgeSeconds: number | null;
  /** Buku yang jejaknya basi (relay mati / buku tak terjangkau). */
  staleBooks: number[];
  /** Buku yang putaran terakhirnya galat. */
  erroredBooks: number[];
  unpublishedTotal: number;
}

/**
 * Putusan atas jejak buku yang MASIH terdaftar.
 *
 * @param rows jejak relay — pemanggil menyaring ke perusahaan yang masih ada
 *   di registry: buku yang dihapus meninggalkan jejak yang basi selamanya, dan
 *   jejak itu bukan relay yang mati.
 */
export function outboxHealth(rows: readonly OutboxRelayBookRow[], now: Date = new Date()): OutboxHealth {
  if (rows.length === 0) {
    return { status: "unknown", oldestAgeSeconds: null, staleBooks: [], erroredBooks: [], unpublishedTotal: 0 };
  }
  const t = now.getTime();
  let oldest: number | null = null;
  const staleBooks: number[] = [];
  const erroredBooks: number[] = [];
  let unpublishedTotal = 0;
  for (const r of rows) {
    if ((t - r.lastPassAt.getTime()) / 1000 >= OUTBOX_RELAY_STALE_SECONDS) staleBooks.push(r.companyId);
    if (r.lastError) erroredBooks.push(r.companyId);
    unpublishedTotal += r.unpublishedCount;
    if (r.oldestUnpublishedAt) {
      const umur = Math.max(0, Math.floor((t - r.oldestUnpublishedAt.getTime()) / 1000));
      oldest = oldest === null ? umur : Math.max(oldest, umur);
    }
  }
  let status: OutboxHealthStatus = "ok";
  if (staleBooks.length > 0 || (oldest !== null && oldest >= OUTBOX_LAG_LATE_SECONDS)) status = "late";
  else if (oldest !== null && oldest >= OUTBOX_LAG_WARN_SECONDS) status = "lagging";
  return { status, oldestAgeSeconds: oldest, staleBooks, erroredBooks, unpublishedTotal };
}
