/**
 * Siklus permintaan penghapusan akun (issue #142) — LOGIKA MURNI; tanpa
 * React/Prisma/next, diuji di `tests/tenant-deletion.test.ts`.
 *
 * ══ KENAPA "HAPUS AKUN" BUKAN SATU TOMBOL ═══════════════════════════════════
 * UU KUP menuntut buku, catatan, dan dokumen dasar pembukuan disimpan 10 TAHUN
 * — termasuk yang elektronik. Pola SaaS biasa ("hapus akun = hapus data")
 * justru pola yang SALAH di produk akuntansi Indonesia. Jalur yang benar
 * (docs/COMPLIANCE.md, §10 rencana):
 *
 *   permintaan eksplisit → masa tenggang 30 hari (bisa dibatalkan; pemilik
 *   diberi tahu konsekuensinya) → EKSEKUSI oleh operator lewat skrip
 *   bergerbang bukti: tenant dinonaktifkan + data PRIBADI dianonimkan (UU
 *   PDP), buku besar TETAP tersimpan → penghancuran buku hanya SETELAH
 *   `retention_until` lewat, lewat gerbang terpisah yang menolak sebelum itu.
 *
 * Tidak ada satu pun jalur kode yang menghapus buku besar tanpa melewati
 * kedua gerbang ini — dan keduanya diputuskan fungsi murni di berkas ini,
 * bukan if yang tersebar.
 */

/** Masa tenggang sebelum permintaan boleh dieksekusi: 30 hari — cukup untuk
 *  berubah pikiran, cukup pendek untuk tidak terasa diabaikan. */
export const DELETION_GRACE_DAYS = 30;

/** Retensi UU KUP: 10 tahun sejak tutup buku terakhir. Dihitung dari tanggal
 *  jurnal termuda saat eksekusi — bukan dari tanggal permintaan. */
export const RETENTION_YEARS = 10;

export const DELETION_REQUEST_STATUSES = ["pending", "cancelled", "executed"] as const;
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number];

export function graceEndsAtFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Batas retensi: 10 tahun sejak entri pembukuan TERMUDA atau sejak eksekusi —
 * mana yang LEBIH LAMBAT. Konservatif dengan sengaja: pada penghancuran data,
 * salah ke arah "menyimpan lebih lama" bisa diperbaiki; arah sebaliknya tidak.
 * Buku kosong / tak terbaca jatuh ke "sekarang + 10 tahun".
 */
export function retentionUntilFrom(latestEntryDate: Date | null, now: Date = new Date()): Date {
  const anchor = latestEntryDate && latestEntryDate.getTime() > now.getTime()
    ? latestEntryDate
    : now;
  const result = new Date(anchor);
  result.setFullYear(result.getFullYear() + RETENTION_YEARS);
  return result;
}

export type ExecutionVerdict =
  | "executable"
  | "not_pending"
  | "grace_active";

/** Bolehkah operator MENGEKSEKUSI (nonaktif + anonimisasi)? */
export function executionVerdict(
  request: { status: string; graceEndsAt: Date },
  now: Date = new Date()
): ExecutionVerdict {
  if (request.status !== "pending") return "not_pending";
  if (request.graceEndsAt.getTime() > now.getTime()) return "grace_active";
  return "executable";
}

export type LedgerDropVerdict =
  | "droppable"
  | "not_executed"
  | "retention_active";

/**
 * Bolehkah buku besar DIHANCURKAN (--drop-ledgers)? Gerbang kedua, terpisah
 * dari eksekusi: penghancuran menuntut eksekusi yang sudah terjadi DAN masa
 * retensi yang sudah lewat. Dalam praktik gerbang ini baru terbuka bertahun-
 * tahun kemudian — dan memang begitu maksudnya.
 */
export function ledgerDropVerdict(
  request: { status: string; executedAt: Date | null; retentionUntil: Date | null },
  now: Date = new Date()
): LedgerDropVerdict {
  if (request.status !== "executed" || !request.executedAt || !request.retentionUntil) {
    return "not_executed";
  }
  if (request.retentionUntil.getTime() > now.getTime()) return "retention_active";
  return "droppable";
}

/** Bentuk anonimisasi data pribadi (UU PDP) — deterministik & bisa diuji:
 *  identitas hilang, baris (dan id yang dirujuk jejak audit) tetap ada. */
export function anonymizedUserFields(userId: number): {
  email: string;
  username: string;
  name: null;
} {
  return {
    email: `dihapus-${userId}@anonim.invalid`,
    username: `dihapus-${userId}`,
    name: null,
  };
}
