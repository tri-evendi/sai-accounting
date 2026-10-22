/**
 * ANTREAN PEKERJAAN — penerbitan, klaim, lease, penyelesaian.
 *
 * Bentuk tabel & daur hidup statusnya: docs/arsitektur/04-ALIRAN-DATA.md §8.9.
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
  JOB_LANES,
  KINDS_BY_LANE,
  type JobKind,
  type JobLane,
  type JobStatus,
} from "@sai/core/generated/job-kinds";
import {
  DONE_RETENTION_DAYS,
  LEASE_STALE_MS,
  backoffMs,
  isDead,
} from "@sai/core/job-backoff";
import { laneQueueHealth, type LaneQueueHealth } from "@sai/core/queue-health";

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
 * Lepaskan `dedupeKey` dari baris yang sudah BERAKHIR (`done`/`dead`).
 *
 * Kunci dedupe unik untuk SELURUH baris, termasuk yang sudah selesai — itu
 * benar untuk denyut penjadwal (satu jam, satu pekerjaan, selamanya), tapi
 * salah untuk pekerjaan yang dedupe-nya berarti "satu yang AKTIF": penyediaan
 * PT yang gagal harus bisa dicoba lagi tanpa menunggu retensi 14 hari. Baris
 * lamanya tetap ada (jejak kegagalannya berharga); hanya kuncinya yang
 * dilepas. Dipanggil SEBELUM `publishJob` dengan kunci yang sama.
 *
 * @returns jumlah baris yang kuncinya dilepas.
 */
export async function releaseFinishedDedupeKey(dedupeKey: string): Promise<number> {
  return controlDb.$executeRaw`
    UPDATE jobs SET dedupe_key = NULL, updated_at = now()
    WHERE dedupe_key = ${dedupeKey} AND status IN ('done', 'dead')`;
}

/** Status satu pekerjaan — untuk rute yang MENUNGGU-nya (tanpa hasil berkas). */
export interface JobStatusRow {
  id: number;
  kind: JobKind;
  status: JobStatus;
  tenantId: number | null;
  companyId: number | null;
  /** ⚠ Dibaca gerbang/penerjemah status, TIDAK PERNAH dipulangkan ke HTTP. */
  payload: unknown;
  progress: number;
  attempts: number;
  maxAttempts: number;
  /** ⚠ Teks log — TIDAK PERNAH ke layar. Lihat `decodeProvisionFailure`. */
  lastError: string | null;
  createdAt: Date;
}

/** Baca satu pekerjaan menurut id, atau menurut `dedupeKey`-nya. */
export async function jobStatus(by: { id: number } | { dedupeKey: string }): Promise<JobStatusRow | null> {
  const where =
    "id" in by ? Prisma.sql`id = ${by.id}` : Prisma.sql`dedupe_key = ${by.dedupeKey}`;
  const rows = await controlDb.$queryRaw<JobStatusRow[]>`
    SELECT id, kind, status, tenant_id AS "tenantId", company_id AS "companyId", payload,
           progress, attempts, max_attempts AS "maxAttempts", last_error AS "lastError",
           created_at AS "createdAt"
      FROM jobs WHERE ${where}`;
  return rows[0] ?? null;
}

/**
 * Klaim satu pekerjaan dari daftar `kind` yang DIKLAIM pekerja ini.
 *
 * Klausa `kind IN (...)` itulah yang membuat jalur terpisah: proses jalur
 * `bulk` tidak pernah melihat pekerjaan `interactive`, jadi satu impor raksasa
 * tidak pernah membuat pengguna yang menunggu unduhan ikut menunggu.
 *
 * ══ `kinds` DISERAHKAN PEMANGGIL, BUKAN DITURUNKAN DARI JALUR ══════════════
 * Versi pertama menurunkannya dari `KINDS_BY_LANE[lane]`, dan itu benar untuk
 * keadaan akhir: satu jalur, satu proses. Tapi keadaan akhir itu datang lewat
 * tahap 1b–1d, dan selama transisi sebuah jalur bisa dilayani DUA bahasa untuk
 * `kind` yang berbeda — jalur `tenant` di tahap 1b adalah contoh pertamanya.
 *
 * Pelari yang mengklaim seluruh `kind` jalurnya akan mengklaim yang tidak bisa
 * ia kerjakan, lalu menggagalkannya sampai `max_attempts` habis. Yang menjaga
 * supaya ini tidak menjadi lubang: `kind` yang DITERBITKAN tanpa satu pengklaim
 * pun ditolak `tests/kind-punya-pengklaim.test.ts`.
 *
 * `kinds` yang kosong memulangkan `null` — bukan melempar: pelari tanpa handler
 * memang tidak punya apa pun untuk diklaim, dan itu bukan galat basis data.
 */
export async function claimJob(
  lane: JobLane,
  workerId: string,
  kinds: readonly JobKind[] = KINDS_BY_LANE[lane] ?? []
): Promise<JobRow | null> {
  if (kinds.length === 0) return null;
  for (const kind of kinds) {
    /* Isolasi jalur TETAP jalur: pekerja jalur `ledger` yang mengklaim
       `report.export` membuat satu posting menahan unduhan yang ditunggu orang
       di layar — tepat yang §3.1 ada untuk mencegah. */
    if (!KINDS_BY_LANE[lane]?.includes(kind)) {
      throw new Error(`kind \`${kind}\` bukan milik jalur \`${lane}\` — isolasi jalur dilanggar`);
    }
  }

  /*
   * `started_at` disetel BERSAMA `claimed_at` di sini, dan itu satu-satunya
   * tempat ia ditulis — `renewLease` di bawah sengaja tidak menyentuhnya.
   *
   * Keduanya tampak mubazir sampai seseorang mencoba menghitung durasi:
   * `claimed_at` DIPERPANJANG selama pekerjaan berjalan, jadi
   * `finished_at - claimed_at` adalah jarak dari perpanjangan terakhir —
   * sekitar satu interval untuk SETIAP pekerjaan, berapa pun lamanya ia
   * berjalan. Histogram §11 yang dibangun darinya terlihat rapi, sempit, dan
   * seluruhnya salah.
   *
   * Pada klaim berikutnya ia disetel ULANG: yang diukur durasi PERCOBAAN, bukan
   * rentang sejak penerbitan — rentang itu sudah terbaca dari `created_at`.
   */
  const rows = await controlDb.$queryRaw<JobRow[]>`
    UPDATE jobs SET status = 'claimed', claimed_at = now(), claimed_by = ${workerId},
                    started_at = now(), updated_at = now()
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
 * Jalur untuk `kind` yang TIDAK dikenal image ini.
 *
 * Bisa terjadi saat *rolling deploy*: image yang lebih baru menerbitkan `kind`
 * yang kontraknya belum ada di image lama. Baris semacam itu TIDAK boleh
 * dilewatkan diam-diam — pekerjaan yang macet dan tak terlihat oleh satu pun
 * pembaca adalah tepat kelas kegagalan yang §11 dibangun untuk menolaknya. Ia
 * dikumpulkan di bawah nama yang jelas bukan nama jalur dari kontrak.
 */
const JALUR_TAK_DIKENAL = "(tak dikenal)";

/**
 * Potret antrean per jalur — sinyal utama §11, dalam SATU kueri.
 *
 * Satu kueri, bukan satu per jalur, dan sebabnya ada di §4: `control` juga
 * melayani autentikasi, jadi tujuh perjalanan bolak-balik tiap kali ada yang
 * membuka halaman kesehatan adalah ongkos yang dibayar tabel yang paling tidak
 * boleh melambat. `GROUP BY kind` sudah dilayani indeks berpredikat
 * `jobs_ambil_idx`.
 *
 * Yang dihitung hanya `queued` yang `run_after`-nya SUDAH lewat. Pekerjaan yang
 * sengaja dijadwalkan ke depan atau sedang menunggu *backoff* bukan tunggakan,
 * dan memasukkannya membuat setiap percobaan ulang terbaca sebagai antrean
 * macet.
 *
 * SETIAP jalur dipulangkan, termasuk yang kosong: jalur yang hilang dari tabel
 * tidak bisa dibedakan dari jalur yang memang tak punya kerja.
 */
export async function queueSnapshot(now: Date = new Date()): Promise<LaneQueueHealth[]> {
  const rows = await controlDb.$queryRaw<{ kind: string; waiting: bigint; oldest: Date | null }[]>`
    SELECT kind, COUNT(*)::bigint AS waiting, MIN(run_after) AS oldest
      FROM jobs
     WHERE status = 'queued' AND run_after <= now()
     GROUP BY kind`;

  const per = new Map<string, { waiting: number; oldest: Date | null }>();
  for (const lane of Object.keys(JOB_LANES)) per.set(lane, { waiting: 0, oldest: null });

  for (const r of rows) {
    const lane = JOB_KINDS[r.kind as JobKind]?.lane ?? JALUR_TAK_DIKENAL;
    const ember = per.get(lane) ?? { waiting: 0, oldest: null };
    ember.waiting += Number(r.waiting);
    if (r.oldest !== null && (ember.oldest === null || r.oldest < ember.oldest)) {
      ember.oldest = r.oldest;
    }
    per.set(lane, ember);
  }

  return [...per].map(([lane, v]) => laneQueueHealth(lane, v.waiting, v.oldest, now));
}

/** Hitungan per status — untuk dasbor, bukan untuk gerbang. */
export async function jobCounts(): Promise<Record<string, number>> {
  const rows = await controlDb.$queryRaw<{ status: string; n: bigint }[]>`
    SELECT status, COUNT(*)::bigint AS n FROM jobs GROUP BY status`;
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

/**
 * Buang baris `done` yang sudah melewati jendela retensi (04 §8.9).
 *
 * `DELETE`, bukan pindah ke tabel arsip: tabel arsip yang tak pernah dibaca
 * siapa pun adalah *bloat* yang sama dalam berkas yang berbeda, dan apa yang
 * dikerjakan sebuah pekerjaan yang BERHASIL sudah tercatat di domain yang ia
 * tulis. Yang hilang hanyalah barisnya.
 *
 * ⚠ `status = 'done'` SAJA. `dead` dan `failed` tidak pernah tersentuh — lihat
 * `DONE_RETENTION_DAYS`. Predikat yang melebar ke "sudah selesai" akan membuang
 * justru baris yang paling dicari orang.
 *
 * Idempoten, jadi ia tidak butuh *leader election* maupun kunci: pelari kedua
 * yang menjalankannya pada saat yang sama menghapus nol baris. Itu pola yang
 * sama dengan `reclaimStaleJobs`.
 *
 * @returns jumlah baris yang dibuang.
 */
export async function archiveDoneJobs(retentionDays: number = DONE_RETENTION_DAYS): Promise<number> {
  const ambang = new Date(Date.now() - retentionDays * 86_400_000);
  return controlDb.$executeRaw`
    DELETE FROM jobs WHERE status = 'done' AND finished_at < ${ambang}`;
}

/**
 * Baris pekerjaan untuk RUTE UNDUHAN — dan hanya sebanyak yang ia butuhkan.
 *
 * Kolomnya sempit dengan sengaja, dan `payload` yang IKUT punya satu pembaca
 * yang disebut: gerbang kedua (`bolehAmbilHasil`). Yang TIDAK diambil —
 * `last_error`, `claimed_by`, `attempts` — adalah kolom yang tidak bisa bocor
 * ke jawaban HTTP karena seseorang menambahkan `...job` di masa depan.
 *
 * ⚠ `payload` TIDAK PERNAH dipulangkan ke pemanggil HTTP. Ia dibaca gerbang,
 * lalu dibuang; dijaga `tests/job-result-authorization.test.ts`.
 */
export interface JobForDownload {
  id: number;
  kind: JobKind;
  status: JobStatus;
  companyId: number | null;
  resultRef: string | null;
  /**
   * Muatan pekerjaan — PARAMETER saja, tidak pernah angka.
   *
   * Dibutuhkan gerbang KEDUA di rute unduhan (`bolehAmbilHasil`): izin jenis
   * menjawab "boleh mengunduh hasil jenis ini", bukan "boleh mengunduh laporan
   * INI". Aman dibaca di sini karena `jobs` hidup di basis data kendali, dan
   * kendali tidak memuat satu angka akuntansi pun — muatan membawa id laporan
   * dan periodenya, lalu pekerjanya yang menghitung dari buku PT.
   */
  payload: unknown;
}

/**
 * Baca satu pekerjaan untuk keperluan unduhan.
 *
 * ⚠ TIDAK menyaring `companyId` di dalam kueri ini, dan itu disengaja:
 * penyaringannya milik pemanggil, yang tahu konteks perusahaan AKTIF — dan
 * menaruhnya di sini akan membuat pemanggil berikutnya mengira id saja sudah
 * cukup aman. Yang dijamin fungsi ini hanya satu: ia memulangkan `companyId`
 * barisnya, sehingga pemanggil TIDAK BISA memutuskan tanpa melihatnya.
 */
export async function jobForDownload(id: number): Promise<JobForDownload | null> {
  const rows = await controlDb.$queryRaw<JobForDownload[]>`
    SELECT id, kind, status, company_id AS "companyId", result_ref AS "resultRef",
           payload
      FROM jobs WHERE id = ${id}`;
  return rows[0] ?? null;
}

/**
 * Id SELURUH pekerjaan yang barisnya masih ada — untuk pembersih hasil yatim.
 *
 * ══ KENAPA SELURUHNYA, DAN BUKAN HANYA YANG PUNYA `result_ref` ═════════════
 * Versi pertama fungsi ini menyaring `result_ref IS NOT NULL`, dengan alasan
 * yang terdengar benar: pekerjaan tanpa hasil tidak punya direktori, jadi
 * memasukkannya hanya memperbesar himpunan. Itu CACAT, dan bentuknya *race*:
 *
 *   `writeJobResult` menulis berkasnya LEBIH DULU, dan `completeJob` yang
 *   menulis `result_ref` SESUDAHNYA. Di antara keduanya — selama pekerjaan
 *   masih berjalan — direktorinya ada sementara `result_ref` masih NULL.
 *
 * Saringan itu karena itu akan membuat pembersih menghapus hasil pekerjaan yang
 * MASIH BERJALAN, dan pekerjaannya kemudian melaporkan `done` dengan
 * `result_ref` yang menunjuk ke berkas yang sudah tidak ada. Gejalanya 404 di
 * tombol unduh, dan sebabnya tidak ada di satu pun log.
 *
 * Himpunan yang lebih besar adalah harga yang benar: beberapa ribu bilangan
 * bulat melawan satu kelas kerusakan yang hanya muncul di bawah beban.
 */
export async function jobIdsPresent(): Promise<Set<number>> {
  const rows = await controlDb.$queryRaw<{ id: number }[]>`SELECT id FROM jobs`;
  return new Set(rows.map((r) => r.id));
}
