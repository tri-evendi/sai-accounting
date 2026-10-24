-- name: InsertBackupRun :exec
INSERT INTO backup_runs (started_at, finished_at, status, error, artifact,
                         size_bytes, created_at, updated_at)
VALUES (sqlc.arg(started_at_utc)::text::timestamp, sqlc.arg(finished_at_utc)::text::timestamp,
        sqlc.arg(status), sqlc.arg(error), sqlc.arg(artifact), sqlc.arg(size_bytes),
        now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC');

-- name: InsertConformanceRun :exec
INSERT INTO conformance_runs (started_at, finished_at, status, companies_checked,
                              companies_failed, finding_count, details,
                              created_at, updated_at)
VALUES (sqlc.arg(started_at_utc)::text::timestamp, sqlc.arg(finished_at_utc)::text::timestamp,
        sqlc.arg(status), sqlc.arg(companies_checked), sqlc.arg(companies_failed),
        sqlc.arg(finding_count), sqlc.arg(details),
        now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC');

-- ════════════════════════════════════════════════════════════════════════
-- JEJAK PUTARAN YANG DITULIS GO — `backup_runs` dan `conformance_runs`.
--
-- Dua pengecualian yang DISEBUT di daftar-izin tulisan Go
-- (`tests/services-go.test.ts`); pemanggilnya hanya `internal/trail/`.
-- Dibangkitkan `sqlc` bersama `contract/jobs.sql` ke
-- `services/integrator/internal/controlsql/`.
--
-- ══ JAM: UTC, DIKIRIM SEBAGAI TEKS (PR #741) ══════════════════════════════
-- Berbeda dari `jobs`, `started_at`/`finished_at` di sini INSTAN yang dihitung
-- di luar basis data, dan pembacanya Prisma (yang membaca TIMESTAMP tanpa zona
-- sebagai UTC). Maka nilainya teks UTC (`trail.TeksUTC`) yang di-cast
-- `::text::timestamp` — `::text` lebih dulu supaya `sqlc` mengetiknya `string`,
-- bukan `time.Time` yang pengodeannya bergantung pada mode koneksi pgx.
-- Teks yang sama mendarat di masukan `timestamp` yang sama dengan bentuk
-- tangan sebelumnya (`$1::timestamp` + string). `created_at`/`updated_at` =
-- `now() AT TIME ZONE 'UTC'`, sebab Prisma mengisi keduanya dengan UTC.
