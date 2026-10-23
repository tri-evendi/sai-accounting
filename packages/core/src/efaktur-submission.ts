/**
 * KIRIMAN e-FAKTUR LEWAT PJAP — aturan MURNI yang dibagi rute, pekerja Node,
 * dan layar (docs/EFAKTUR.md).
 *
 * ══ ALIRANNYA ══════════════════════════════════════════════════════════════
 *   1. Pengguna menekan "Kirim ke DJP" → rute Node membekukan XML Coretax satu
 *      faktur ke baris `efaktur_submissions` (`queued`) dan menerbitkan
 *      `integration.efaktur_submit`.
 *   2. Jalur `integration` Go mengirimnya ke PJAP dengan `idempotency_key` baris
 *      itu, lalu MELAPORKAN hasilnya sebagai pekerjaan `efaktur.record` — Go
 *      tidak menulis buku PT (daftar-izin tulisan Go tidak memuatnya).
 *   3. Selama DJP belum memutuskan, Go menerbitkan `integration.efaktur_poll`
 *      berjeda; setiap jawaban menjadi `efaktur.record` lagi.
 *   4. Pelari `interactive` Node menerapkan `efaktur.record` lewat
 *      `applyEfakturEvent` di bawah — SATU tempat yang memutuskan transisi.
 *
 * Kosakata status/hasil/penyedia DIBANGKITKAN dari `contract/kinds.yaml`
 * (dibaca Go juga) — berkas ini hanya menambahkan aturannya.
 */
import {
  EFAKTUR_OUTCOMES,
  EFAKTUR_PROVIDERS,
  EFAKTUR_SUBMISSION_STATUSES,
  type EfakturProvider,
  type EfakturSubmissionStatus,
} from "./generated/job-numbers";

export {
  EFAKTUR_OUTCOMES,
  EFAKTUR_PROVIDERS,
  EFAKTUR_SUBMISSION_STATUSES,
  type EfakturProvider,
  type EfakturSubmissionStatus,
};

export type EfakturOutcome = (typeof EFAKTUR_OUTCOMES)[number];

/** Upaya yang MASIH berjalan — faktur dengan upaya seperti ini tidak dikirim lagi. */
export const EFAKTUR_ACTIVE_STATUSES: readonly EfakturSubmissionStatus[] = [
  "queued",
  "submitted",
  "cancel_requested",
];

/** Boleh dikirim (lagi)? Tidak ada upaya, atau upaya terakhir berakhir tanpa faktur pajak. */
export function canSubmitAfter(latest: EfakturSubmissionStatus | null): boolean {
  return latest === null || latest === "rejected" || latest === "failed" || latest === "canceled";
}

/** Hanya faktur pajak yang SUDAH disetujui yang bisa dibatalkan di DJP. */
export function canCancel(status: EfakturSubmissionStatus): boolean {
  return status === "approved";
}

/**
 * Kunci idempotensi satu upaya — dikirim ke PJAP. Per PERUSAHAAN + faktur +
 * revisi: dua PT dengan id faktur yang sama tidak pernah berbagi kunci di
 * sisi penyedia, dan kiriman ulang sesudah penolakan memakai kunci baru.
 */
export function efakturIdempotencyKey(companyId: number, invoiceId: number, revision: number): string {
  return `sai-${companyId}-inv${invoiceId}-r${revision}`;
}

export const isEfakturProvider = (v: unknown): v is EfakturProvider =>
  typeof v === "string" && (EFAKTUR_PROVIDERS as readonly string[]).includes(v);

const isOutcome = (v: unknown): v is EfakturOutcome =>
  typeof v === "string" && (EFAKTUR_OUTCOMES as readonly string[]).includes(v);

/**
 * Muatan `efaktur.record` — bentuk `recordPayload` di
 * `services/integrator/internal/integrationlane/runner.go`. Tidak ada angka
 * akuntansi di dalamnya (basis data kendali tidak memuat satu pun).
 */
export interface EfakturEvent {
  submissionId: number;
  outcome: EfakturOutcome;
  providerRef: string | null;
  taxInvoiceNumber: string | null;
  message: string | null;
  /** Instan jawaban PJAP, ISO-8601. */
  observedAt: Date;
}

/** Urai muatan; `null` bila tidak sah (pekerjaannya gagal, berisik). */
export function parseEfakturEvent(payload: unknown): EfakturEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const id = p.submissionId;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;
  if (!isOutcome(p.outcome)) return null;
  const at = typeof p.observedAt === "string" ? new Date(p.observedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  const str = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null;
  return {
    submissionId: id,
    outcome: p.outcome,
    providerRef: str(p.providerRef, 100),
    taxInvoiceNumber: str(p.taxInvoiceNumber, 30),
    message: str(p.message, 2000),
    observedAt: at,
  };
}

export interface EfakturSubmissionState {
  status: EfakturSubmissionStatus;
  statusObservedAt: Date | null;
  submittedAt: Date | null;
}

export interface EfakturSubmissionPatch {
  status: EfakturSubmissionStatus;
  statusObservedAt: Date;
  statusMessage: string | null;
  providerRef?: string;
  taxInvoiceNumber?: string;
  submittedAt?: Date;
  approvedAt?: Date;
  canceledAt?: Date;
}

/** Hasil yang boleh mengikuti tiap status. Yang tidak disebut = diabaikan. */
const NEXT: Readonly<Record<EfakturSubmissionStatus, readonly EfakturOutcome[]>> = {
  queued: ["submitted", "approved", "rejected", "failed"],
  submitted: ["submitted", "approved", "rejected", "failed"],
  // Disetujui: hanya pembatalan yang mengubahnya. Jawaban "submitted" yang
  // terlambat tiba tidak boleh menurunkannya.
  approved: ["canceled"],
  // Pembatalan diminta: berhasil (canceled), atau PJAP menolak pembatalannya
  // dan faktur pajaknya tetap berlaku (approved).
  cancel_requested: ["canceled", "approved"],
  // Akhir. Kiriman ulang adalah baris BARU (revisi + 1).
  rejected: [],
  failed: [],
  canceled: [],
};

/**
 * Terapkan satu hasil PJAP. `null` = abaikan: kejadian yang lebih TUA dari
 * yang sudah diterapkan (pekerjaan tiba tidak berurutan), atau transisi yang
 * tidak sah dari status sekarang.
 */
export function applyEfakturEvent(
  current: EfakturSubmissionState,
  ev: EfakturEvent
): EfakturSubmissionPatch | null {
  if (current.statusObservedAt && ev.observedAt.getTime() < current.statusObservedAt.getTime()) {
    return null;
  }
  if (!NEXT[current.status].includes(ev.outcome)) return null;

  const patch: EfakturSubmissionPatch = {
    status: ev.outcome,
    statusObservedAt: ev.observedAt,
    statusMessage: ev.message,
  };
  if (ev.providerRef) patch.providerRef = ev.providerRef;
  if (ev.taxInvoiceNumber) patch.taxInvoiceNumber = ev.taxInvoiceNumber;
  if ((ev.outcome === "submitted" || ev.outcome === "approved") && !current.submittedAt) {
    patch.submittedAt = ev.observedAt;
  }
  if (ev.outcome === "approved" && current.status !== "cancel_requested") patch.approvedAt = ev.observedAt;
  if (ev.outcome === "canceled") patch.canceledAt = ev.observedAt;
  return patch;
}
