/**
 * ANTREAN PEKERJAAN — penerbitan, klaim, lease, penyelesaian (rancangan §4).
 *
 * Sambungan SQL untuk tabel `jobs` di basis data KENDALI. Aritmetikanya murni
 * dan ada di `@sai/core/job-backoff`; kosakata `kind`/status dibangkitkan dari
 * `contract/kinds.yaml`. Yang di sini hanya pernyataan-pernyataannya — dan
 * beberapa di antaranya harus berbentuk persis seperti ini, bukan sekadar
 * "melakukan hal yang sama".
 *
 * ══ KLAIM WAJIB SATU PERNYATAAN ════════════════════════════════════════════
 * `SELECT … FOR UPDATE SKIP LOCKED` lalu `UPDATE` terpisah adalah *race
 * condition* yang lolos setiap pengujian satu pekerja: dua pekerja memilih
 * baris yang sama di celah antara dua pernyataan, dan untuk `tenant.backup`
 * itu berarti dua dump menulis ke satu kunci objek. CTE di bawah memilih dan
 * menulis dalam satu pernyataan, jadi celah itu tidak ada.
 *
 * ══ `$queryRaw`, BUKAN API PRISMA ══════════════════════════════════════════
 * Prisma tidak bisa menyatakan `FOR UPDATE SKIP LOCKED`. Parameternya tetap
 * TERIKAT (`$1`, `$2`) — tidak ada interpolasi string di berkas ini.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import { Prisma } from "@sai/db/client/control";
import {
  JOB_KINDS,
  KINDS_BY_LANE,
  type JobKind,
  type JobLane,
  type JobStatus,
} from "@sai/core/generated/job-kinds";
import { LEASE_STALE_MS, backoffMs, isDead } from "@sai/core/job-backoff";

export interface JobRow {
  id: number;
  kind: JobKind;
  tenantId: number | null;
  companyId: number | null;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  cancelRequested: boolean;
  resultRef: string | null;
}

export interface PublishInput {
  kind: JobKind;
  payload: Record<string, unknown>;
  tenantId?: number | null;
  companyId?: number | null;
  /** Kunci idempotensi. Tanpanya pekerjaan boleh berulang — lihat model `Job`. */
  dedupeKey?: string | null;
  priority?: number;
  runAfter?: Date;
}

/**
 * Terbitkan satu pekerjaan.
 *
 * @returns baris yang lahir, atau `null` bila `dedupeKey`-nya sudah ada.
 *
 * `null` BUKAN kegagalan — ia jawaban yang benar untuk "sudah diterbitkan".
 * Itulah yang menggantikan *leader election*: denyut yang berjalan dua kali
 * menerbitkan dua kali, yang kedua menabrak constraint, dan tidak ada apa pun
 * yang perlu memutuskan siapa pemimpinnya.
 */
export async function publishJob(input: PublishInput): Promise<{ id: number } | null> {
  const spec = JOB_KINDS[input.kind];
  if (!spec) throw new Error(`kind tidak dikenal: ${input.kind}`);

  const rows = await controlDb.$queryRaw<{ id: number }[]>`
    INSERT INTO jobs (kind, tenant_id, company_id, payload, status, dedupe_key,
                      max_attempts, run_after, priority, updated_at)
    VALUES (${input.kind}, ${input.tenantId ?? null}, ${input.companyId ?? null},
            ${JSON.stringify(input.payload)}::jsonb, 'queued',
            ${input.dedupeKey ?? null}, ${spec.maxAttempts},
            ${input.runAfter ?? new Date()}, ${input.priority ?? 0}, now())
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id`;

  return rows[0] ?? null;
}

/**
 * Klaim satu pekerjaan untuk satu jalur. `null` = tidak ada yang menunggu.
 *
 * Klausa `kind = ANY(...)` itulah yang membuat jalur terpisah: proses jalur
 * `bulk` tidak pernah melihat pekerjaan `interactive`, jadi satu impor raksasa
 * tidak pernah membuat pengguna yang menunggu unduhan ikut menunggu.
 */
export async function claimJob(lane: JobLane, workerId: string): Promise<JobRow | null> {
  const kinds = KINDS_BY_LANE[lane];
  if (!kinds || kinds.length === 0) return null;

  const rows = await controlDb.$queryRaw<JobRow[]>`
    UPDATE jobs SET status = 'claimed', claimed_at = now(), claimed_by = ${workerId},
                    updated_at = now()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'queued'
        AND run_after <= now()
        AND kind IN (${Prisma.join([...kinds])})
      ORDER BY priority DESC, run_after
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, kind, tenant_id AS "tenantId", company_id AS "companyId",
              payload, status, attempts, max_attempts AS "maxAttempts",
              cancel_requested AS "cancelRequested", result_ref AS "resultRef"`;

  return rows[0] ?? null;
}

/**
 * Perpanjang *lease*. `false` = pekerjaan ini sudah bukan milik pekerja itu.
 *
 * Pekerja yang menerima `false` WAJIB berhenti: baris itu sudah dipulangkan dan
 * mungkin sudah diklaim pekerja lain. Melanjutkan berarti dua pekerja menulis
 * hasil yang sama.
 */
export async function renewLease(id: number, workerId: string): Promise<boolean> {
  const n = await controlDb.$executeRaw`
    UPDATE jobs SET claimed_at = now(), updated_at = now()
    WHERE id = ${id} AND status = 'claimed' AND claimed_by = ${workerId}`;
  return n === 1;
}

/** Laporkan kemajuan (0–100). Sekaligus memperpanjang lease. */
export async function reportProgress(
  id: number,
  workerId: string,
  progress: number
): Promise<boolean> {
  const batas = Math.min(100, Math.max(0, Math.round(progress)));
  const n = await controlDb.$executeRaw`
    UPDATE jobs SET progress = ${batas}, claimed_at = now(), updated_at = now()
    WHERE id = ${id} AND status = 'claimed' AND claimed_by = ${workerId}`;
  return n === 1;
}

/** Selesai. `resultRef` adalah KUNCI objek, bukan tautan — lihat model `Job`. */
export async function completeJob(
  id: number,
  workerId: string,
  resultRef: string | null = null
): Promise<boolean> {
  const n = await controlDb.$executeRaw`
    UPDATE jobs SET status = 'done', progress = 100, result_ref = ${resultRef},
                    finished_at = now(), updated_at = now()
    WHERE id = ${id} AND status = 'claimed' AND claimed_by = ${workerId}`;
  return n === 1;
}

/**
 * Gagal: `attempts + 1`, lalu kembali ke `queued` dengan *backoff* — atau
 * `dead` bila percobaannya habis.
 *
 * `last_error` SELALU ditulis, termasuk saat masih ada percobaan berikutnya:
 * kegagalan yang ditimpa menjadi kosong oleh percobaan yang akhirnya berhasil
 * menghapus satu-satunya petunjuk kenapa ia gagal dua kali lebih dulu.
 */
export async function failJob(
  id: number,
  workerId: string,
  error: string,
  acak: () => number = Math.random
): Promise<{ status: "queued" | "dead" } | null> {
  const baris = await controlDb.$queryRaw<{ attempts: number; maxAttempts: number }[]>`
    SELECT attempts, max_attempts AS "maxAttempts" FROM jobs
    WHERE id = ${id} AND status = 'claimed' AND claimed_by = ${workerId}`;
  const kini = baris[0];
  if (!kini) return null;

  const attempts = kini.attempts + 1;
  const mati = isDead(attempts, kini.maxAttempts);
  const pesan = error.slice(0, 8_000);

  if (mati) {
    await controlDb.$executeRaw`
      UPDATE jobs SET status = 'dead', attempts = ${attempts}, last_error = ${pesan},
                      finished_at = now(), updated_at = now()
      WHERE id = ${id}`;
    return { status: "dead" };
  }

  const runAfter = new Date(Date.now() + backoffMs(attempts, acak));
  await controlDb.$executeRaw`
    UPDATE jobs SET status = 'queued', attempts = ${attempts}, last_error = ${pesan},
                    run_after = ${runAfter}, claimed_at = NULL, claimed_by = NULL,
                    updated_at = now()
    WHERE id = ${id}`;
  return { status: "queued" };
}

/**
 * Pulangkan pekerjaan dari pekerja yang lease-nya berhenti diperbarui.
 *
 * Ambangnya kelipatan interval pembaruan, BUKAN perkiraan durasi pekerjaan —
 * alasannya di `@sai/core/job-backoff`. Dipanggil berkala; idempoten.
 *
 * @returns jumlah pekerjaan yang dipulangkan.
 */
export async function reclaimStaleJobs(staleMs: number = LEASE_STALE_MS): Promise<number> {
  const ambang = new Date(Date.now() - staleMs);
  /* `attempts + 1` ikut dinaikkan: pekerja yang mati di tengah pekerjaan yang
     SELALU membunuh pekerjanya (kehabisan memori pada ekspor yang terlalu
     besar) harus akhirnya menjadi `dead`, bukan berputar selamanya memulangkan
     dan membunuh pekerja berikutnya. */
  return controlDb.$executeRaw`
    UPDATE jobs
       SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'dead' ELSE 'queued' END,
           attempts = attempts + 1,
           last_error = CASE WHEN last_error IS NULL THEN '' ELSE last_error || chr(10) END
                        || 'lease kedaluwarsa — pekerja diduga mati',
           finished_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE NULL END,
           claimed_at = NULL, claimed_by = NULL, updated_at = now()
     WHERE status = 'claimed' AND claimed_at < ${ambang}`;
}

/** Minta pembatalan. Pekerja memeriksanya DI ANTARA langkah, tidak dipaksakan. */
export async function requestCancel(id: number): Promise<boolean> {
  const n = await controlDb.$executeRaw`
    UPDATE jobs SET cancel_requested = true, updated_at = now()
    WHERE id = ${id} AND status IN ('queued', 'claimed')`;
  return n === 1;
}

/**
 * Umur pekerjaan tertua yang MENUNGGU, per jalur — sinyal utama §11.
 *
 * Yang diukur umur, bukan jumlah: seribu pekerjaan yang selesai dalam dua detik
 * adalah sistem sehat, sementara satu pekerjaan yang menunggu empat jam adalah
 * sistem rusak — dan metrik jumlah membaca keduanya terbalik.
 */
export async function oldestQueuedAt(lane?: JobLane): Promise<Date | null> {
  const kinds = lane ? KINDS_BY_LANE[lane] : null;
  const rows = kinds
    ? await controlDb.$queryRaw<{ oldest: Date | null }[]>`
        SELECT MIN(run_after) AS oldest FROM jobs
        WHERE status = 'queued' AND run_after <= now()
          AND kind IN (${Prisma.join([...kinds])})`
    : await controlDb.$queryRaw<{ oldest: Date | null }[]>`
        SELECT MIN(run_after) AS oldest FROM jobs
        WHERE status = 'queued' AND run_after <= now()`;
  return rows[0]?.oldest ?? null;
}

/** Hitungan per status — untuk dasbor, bukan untuk gerbang. */
export async function jobCounts(): Promise<Record<string, number>> {
  const rows = await controlDb.$queryRaw<{ status: string; n: bigint }[]>`
    SELECT status, COUNT(*)::bigint AS n FROM jobs GROUP BY status`;
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}
