/**
 * DIBANGKITKAN DARI `contract/db-instances.yaml` — JANGAN DISUNTING TANGAN.
 *
 * Jalankan `bun run contract:gen` setelah mengubah kontraknya, dan commit
 * hasilnya bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila
 * berkas ini basi, dan penjaga `tests/contract-db-instances.test.ts` memanggilnya.
 *
 * Kontrak instans basis data versi 1.
 *
 * Dibaca `company-url.ts` (penyelesai URL buku PT) dan
 * `scripts/prove-backup-restore.ts`; cermin Go-nya dibaca jalur `tenant`.
 */

/** Label instans bawaan di log, laporan fan-out, argumen CLI, dan cadangan. */
export const DEFAULT_DB_INSTANCE_LABEL = "default";

/** Bentuk `db_instances.key` — sama dengan CHECK migration kendali 0009. */
export const DB_INSTANCE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

/** Bentuk `db_instances.url_env_var` — sama dengan CHECK migration kendali 0009. */
export const DB_INSTANCE_URL_ENV_PATTERN = /^COMPANY_[A-Z0-9_]+_DATABASE_URL_TEMPLATE$/;

/** Nama env var yang disarankan = PREFIX + KUNCI (huruf besar) + SUFFIX. */
export const DB_INSTANCE_URL_ENV_PREFIX = "COMPANY_";
export const DB_INSTANCE_URL_ENV_SUFFIX = "_DATABASE_URL_TEMPLATE";

/** Direktori objek instans tambahan di dalam putaran cadangan. */
export const BACKUP_INSTANCE_OBJECT_PREFIX = "instans/";
