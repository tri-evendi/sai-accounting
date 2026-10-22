/**
 * DIBANGKITKAN DARI `contract/kinds.yaml` — JANGAN DISUNTING TANGAN.
 *
 * Jalankan `bun run contract:gen` setelah mengubah kontraknya, dan commit hasilnya
 * bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila berkas ini
 * basi, dan penjaga `tests/contract-jobs.test.ts` memanggilnya.
 *
 * Kontrak versi 1.
 *
 * ANGKA, bukan kosakata. SEBAB tiap angka ada di tempat ia dipakai —
 * `@sai/core/job-backoff` (backoff, lease, retensi) dan
 * `@sai/core/queue-health` (ambang umur) — dan modul-modul itu
 * MENGEKSPOR ULANG dari sini, jadi tidak ada pemanggil yang perlu tahu
 * bahwa angkanya datang dari kontrak.
 */

export const BACKOFF_BASE_MS = 30000;
export const BACKOFF_MAX_MS = 3600000;

export const LEASE_RENEW_MS = 30000;
export const LEASE_STALE_FACTOR = 4;

/** Dijamin generator LEBIH RAPAT daripada `LEASE_RENEW_MS × LEASE_STALE_FACTOR`. */
export const UPKEEP_MS = 60000;
export const IDLE_MS = 2000;

export const DONE_RETENTION_DAYS = 14;

export const QUEUE_AGE_WARN_SECONDS = 420;
export const QUEUE_AGE_LATE_SECONDS = 600;

/**
 * Denyut pagar jalur tunggal-instans — dipakai `workers/runner.ts` untuk
 * `@sai/db/session-lock` dan oleh `jobs.LaneLock` di Go. Dijamin generator:
 * `LANE_LOCK_PROBE_MS + LANE_LOCK_QUERY_TIMEOUT_MS < LANE_LOCK_IDLE_SESSION_MS`.
 */
export const LANE_LOCK_PROBE_MS = 15000;
export const LANE_LOCK_QUERY_TIMEOUT_MS = 10000;
export const LANE_LOCK_IDLE_SESSION_MS = 90000;

/**
 * Pemilik berkas hasil di volume `hasil`: pengguna `node` tahap `runner`,
 * yang MEMBACA volume itu. Penulisnya (pelari jalur, root) wajib `chown` ke
 * sini — lihat `@sai/platform/job-result-store`.
 */
export const RESULT_OWNER_UID = 1000;
export const RESULT_OWNER_GID = 1000;
