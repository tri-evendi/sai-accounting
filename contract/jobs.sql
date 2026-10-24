-- name: ClaimJob :one
-- Klausa `kind = ANY(...)` yang membuat jalur terpisah. `kinds` diserahkan
-- PEMANGGIL (pelari mengklaim kind yang punya handler padanya).
--
-- `started_at = now()` BERSAMA `claimed_at`, persis klaim Node
-- (`packages/platform/src/job-queue.ts`): `claimed_at` diperpanjang tiap
-- lease, jadi tanpa `started_at` durasi pekerjaan Go tidak terukur sama
-- sekali — histogram per jalur (09 §11) melewatkan setiap jalur Go.
UPDATE jobs SET status = 'claimed', claimed_at = now(), claimed_by = sqlc.arg(worker_id),
                started_at = now(), updated_at = now()
WHERE id = (
  SELECT id FROM jobs
  WHERE status = 'queued'
    AND run_after <= now()
    AND kind = ANY(sqlc.arg(kinds)::text[])
  ORDER BY priority DESC, run_after
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING id, kind, tenant_id, company_id, payload, status, attempts,
          max_attempts, cancel_requested, result_ref;

-- name: PublishJob :one
-- `ON CONFLICT DO NOTHING` + `RETURNING`: penerbitan ulang ber-dedupe_key yang
-- sama memulangkan NOL baris (pgx.ErrNoRows), bukan galat. Muatan dikirim
-- sebagai TEKS JSON (`::text::jsonb`): `[]byte` di mode `exec` pgx (PgBouncer)
-- terkirim sebagai `bytea`, bukan JSON.
INSERT INTO jobs (kind, company_id, payload, status, dedupe_key, max_attempts, run_after, updated_at)
VALUES (sqlc.arg(kind), sqlc.arg(company_id), sqlc.arg(payload)::text::jsonb, 'queued', sqlc.arg(dedupe_key),
        sqlc.arg(max_attempts), now() + sqlc.arg(delay_us)::bigint * interval '1 microsecond', now())
ON CONFLICT (dedupe_key) DO NOTHING
RETURNING id;

-- name: RenewLease :execrows
UPDATE jobs SET claimed_at = now(), updated_at = now()
WHERE id = sqlc.arg(id) AND status = 'claimed' AND claimed_by = sqlc.arg(worker_id);

-- name: ReportProgress :execrows
UPDATE jobs SET progress = sqlc.arg(progress), claimed_at = now(), updated_at = now()
WHERE id = sqlc.arg(id) AND status = 'claimed' AND claimed_by = sqlc.arg(worker_id);

-- name: CompleteJob :execrows
UPDATE jobs SET status = 'done', progress = 100, result_ref = sqlc.arg(result_ref),
                finished_at = now(), updated_at = now()
WHERE id = sqlc.arg(id) AND status = 'claimed' AND claimed_by = sqlc.arg(worker_id);

-- name: ClaimedAttempts :one
-- Dibaca sebelum menulis kegagalan: baris yang bukan milik pekerja ini
-- memulangkan nol baris, dan kegagalannya TIDAK ditulis.
SELECT attempts, max_attempts FROM jobs
WHERE id = sqlc.arg(id) AND status = 'claimed' AND claimed_by = sqlc.arg(worker_id);

-- name: MarkDead :exec
UPDATE jobs SET status = 'dead', attempts = sqlc.arg(attempts), last_error = sqlc.arg(last_error),
                finished_at = now(), updated_at = now()
WHERE id = sqlc.arg(id);

-- name: Requeue :exec
-- Backoff dikirim sebagai DURASI; `now()` server yang menjadikannya waktu.
UPDATE jobs SET status = 'queued', attempts = sqlc.arg(attempts), last_error = sqlc.arg(last_error),
                run_after = now() + sqlc.arg(backoff_us)::bigint * interval '1 microsecond',
                claimed_at = NULL, claimed_by = NULL,
                updated_at = now()
WHERE id = sqlc.arg(id);

-- name: CancelRequested :one
SELECT cancel_requested FROM jobs WHERE id = sqlc.arg(id);

-- name: JobOutcome :one
-- Keadaan pekerjaan LAIN — dibaca `report.package` (jalur `bulk`) yang menunggu
-- bagian PDF-nya dari `report.package_pdf` (Node). HANYA MEMBACA. `kind` dan
-- `company_id` ikut supaya pembacanya membuktikan baris itu memang anak yang
-- diharapkan untuk PT yang sama, bukan id yang kebetulan disebut muatan.
-- `last_error` lewat COALESCE: kolomnya nullable tetapi dipetakan `string` di
-- Go (`sqlc.yaml` — Go dulu hanya MENULISnya); pemindaian NULL ke `string` gagal.
SELECT kind, company_id, status, progress, result_ref,
       COALESCE(last_error, '')::text AS last_error
  FROM jobs WHERE id = sqlc.arg(id);

-- name: ReclaimStale :execrows
-- Ambang basi dihitung SERVER terhadap jam yang menulis `claimed_at`.
UPDATE jobs
   SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'dead' ELSE 'queued' END,
       attempts = attempts + 1,
       last_error = CASE WHEN last_error IS NULL THEN '' ELSE last_error || chr(10) END
                    || 'lease kedaluwarsa — pekerja diduga mati',
       finished_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE NULL END,
       claimed_at = NULL, claimed_by = NULL, updated_at = now()
 WHERE status = 'claimed'
   AND claimed_at < LOCALTIMESTAMP - sqlc.arg(stale_us)::bigint * interval '1 microsecond';

-- name: ArchiveDone :execrows
-- `status = 'done'` SAJA: kegagalan tidak pernah dipangkas.
DELETE FROM jobs
 WHERE status = 'done'
   AND finished_at < LOCALTIMESTAMP - sqlc.arg(retention_days)::int * interval '1 day';

-- ════════════════════════════════════════════════════════════════════════
-- (Catatan berkas ditaruh di AKHIR: `sqlc` menempelkan komentar yang
-- mendahului kueri pertama ke dokumentasi fungsinya.)
--
-- KUERI ANTREAN GO — sumber tunggal SQL tabel `jobs` milik pohon Go (09 §3.5).
--
-- Dibangkitkan `sqlc` menjadi `services/integrator/internal/controlsql/`
-- (bun run contract:gen). Kode Go TIDAK menulis SQL antrean sendiri lagi: ia
-- memanggil fungsi bertipe hasil bangkitan, jadi kolom yang salah eja, tipe
-- parameter yang keliru, atau kolom pulang yang tertinggal dari `Scan` adalah
-- galat `sqlc`/`go build`, bukan baris yang diam-diam salah di produksi.
-- Skemanya dirakit dari migration kendali (`prisma/postgresql/control/*`) —
-- Prisma tetap pemilik skema; `sqlc` hanya membacanya.
--
-- ══ SEMANTIKNYA = SQL TULISAN TANGAN SEBELUMNYA, KATA DEMI KATA ════════════
-- Yang berubah hanya cara parameter dinamai (`sqlc.arg`), dan karena itu
-- NOMOR `$n` di teks bangkitan bisa berbeda dari versi tangan. Predikat,
-- urutan, kunci baris, dan setiap ekspresi waktu tetap sama. Sifat-sifat yang
-- hilangnya tidak menghasilkan galat dijaga `tests/services-go.test.ts`
-- (dibaca dari berkas INI dan dari bangkitannya):
--
--   • klaim SATU pernyataan dengan `FOR UPDATE SKIP LOCKED`;
--   • setiap tulisan pekerja terkunci pada pemilik lease-nya
--     (`status = 'claimed' AND claimed_by = …`);
--   • pengarsipan menyentuh `done` SAJA;
--   • ══ JAM KOLOM `jobs` ADALAH JAM BASIS DATA ══ (PR #741): kolom waktunya
--     TIMESTAMP(3) TANPA zona berisi jam dinding `now()` sesi. Go hanya
--     mengirim DURASI (mikrodetik/hari) sebagai bilangan, dan SQL yang
--     menjadikannya waktu: `now() + $n * interval` untuk menulis,
--     `LOCALTIMESTAMP - $n * interval` untuk membandingkan. Tidak satu pun
--     parameter bertipe waktu — `sqlc` memastikannya: parameter durasi
--     bertipe `int64`/`int32`, bukan `time.Time`. Alasan lengkapnya di kepala
--     `internal/jobs/queue.go`.
