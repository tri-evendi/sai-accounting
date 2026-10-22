/**
 * PELARI JALUR — satu proses menguras satu jalur antrean.
 *
 * Jalur sebagai unit isolasi: rancangan §3.2. Layanannya: 02 §5.
 *
 *   bun workers/ledger.ts        # jalur `ledger`
 *
 * Satu berkas ini dipakai setiap jalur Node. Jalur Go punya pelarinya sendiri
 * (`services/integrator/internal/jobs/runner.go`), dan keduanya membaca
 * kontrak yang SAMA — kosakata maupun angkanya — itulah yang membuat "jalur"
 * punya arti yang sama di dua bahasa.
 *
 * ⚠ Satu jalur bisa dilayani KEDUA bahasa selama transisi (01 §10): jalur
 * `tenant` adalah contoh pertamanya. Karena itu pelari mengklaim `kind` yang
 * punya handler padanya, bukan seluruh `kind` jalurnya — dan lubang yang
 * dibuka keputusan itu ditutup `tests/kind-punya-pengklaim.test.ts`.
 *
 * ══ EMPAT HAL YANG MEMBUATNYA AMAN, DAN SEMUANYA MUDAH TERLEWAT ════════════
 *
 *  1. **Lease diperpanjang selama bekerja.** Pekerjaan 30 menit melewati ambang
 *     mana pun yang masuk akal untuk mendeteksi pekerja mati. Tanpa perpanjangan,
 *     pekerja kedua mengklaimnya SEMENTARA yang pertama masih berjalan.
 *
 *  2. **Lease yang hilang MENGHENTIKAN pekerjaan.** Kalau perpanjangan menjawab
 *     "ini bukan milikmu lagi", pekerjaan dibatalkan di tempat. Melanjutkan
 *     berarti dua pekerja menulis hasil untuk satu pekerjaan.
 *
 *  3. **SIGTERM menyelesaikan yang sedang jalan, lalu berhenti mengklaim.**
 *     Mematikan proses di tengah tulisan menghasilkan keadaan separuh;
 *     `docker compose down` dan rilis mengirim SIGTERM setiap kali.
 *
 *  4. **Jalur tunggal-instans dipagari *advisory lock*.** Ia TIDAK memikul
 *     kebenaran — `dedupeKey` yang unik sudah melakukannya — tapi ia mencegah
 *     dua penerbit berjalan bersamaan karena salah konfigurasi, dan kesalahan
 *     itu jauh lebih mudah dilakukan daripada dibayangkan.
 */
import "dotenv/config";

import { controlDb } from "@sai/core/control-db";
import {
  JOB_LANES,
  type JobKind,
  type JobLane,
} from "@sai/core/generated/job-kinds";
import { LEASE_RENEW_MS } from "@sai/core/job-backoff";
import { IDLE_MS, UPKEEP_MS as UPKEEP_MS_KONTRAK } from "@sai/core/generated/job-numbers";
import {
  archiveDoneJobs,
  claimJob,
  completeJob,
  failJob,
  jobIdsPresent,
  reclaimStaleJobs,
  renewLease,
  reportProgress,
  type JobRow,
} from "@sai/platform/job-queue";
import { pruneOrphanResults } from "@sai/platform/job-result-store";
import { tryAcquireSessionLock, type SessionLock } from "@sai/db/session-lock";
import {
  pruneRuntimeSamples,
  recordJobRun,
  startLoopSampler,
  trackJobMemory,
} from "@sai/platform/runtime-samples";

/**
 * Jeda antar putaran UPKEEP — memulangkan lease kedaluwarsa & membuang baris
 * `done` yang lewat retensi.
 *
 * WAJIB lebih rapat daripada `LEASE_STALE_MS` (dijaga `tests/job-upkeep.test.ts`):
 * putaran yang lebih jarang daripada ambang basi berarti pekerjaan dari pekerja
 * yang mati menunggu satu putaran penuh LAGI sesudah lease-nya kedaluwarsa, dan
 * waktu tunggu itu tidak muncul di satu pun angka. Diekspor supaya penjaganya
 * membandingkan angka yang SUNGGUH dipakai, bukan salinannya.
 *
 * Angkanya — beserta `IDLE_MS` — datang dari `contract/kinds.yaml`, sebab
 * pelari Go membacanya juga. Jeda yang berbeda antara dua pelari membuat satu
 * jalur dipulangkan lebih lambat daripada jalur lain tanpa ada yang
 * memutuskannya, dan generator kontraknya MENOLAK pasangan yang tidak
 * konsisten — jadi kombinasi yang salah tidak bisa lahir ke bahasa mana pun.
 */
export const UPKEEP_MS = UPKEEP_MS_KONTRAK;

export interface JobContext {
  job: JobRow;
  /** Laporkan kemajuan; sekaligus memperpanjang lease. */
  progress: (persen: number) => Promise<void>;
  /** `true` bila pembatalan diminta — periksa DI ANTARA langkah. */
  cancelled: () => boolean;
}

/** Handler mengembalikan `resultRef` (kunci objek) atau `null`. */
export type JobHandler = (ctx: JobContext) => Promise<string | null>;

export class LeaseLostError extends Error {
  constructor() {
    super("lease hilang — pekerjaan ini sudah bukan milik pekerja ini");
    this.name = "LeaseLostError";
  }
}

/** Nama pekerja: cukup untuk menunjuk container yang memegang lease. */
function workerId(lane: JobLane): string {
  return `${lane}@${process.env.HOSTNAME ?? "lokal"}:${process.pid}`;
}

/**
 * Pagar jalur tunggal-instans.
 *
 * `pg_try_advisory_lock` dipegang selama koneksi hidup dan dilepas sendiri saat
 * proses mati — termasuk mati mendadak, yang justru kasus yang penting. Kunci
 * yang disimpan sebagai baris akan tertinggal setelah OOM dan memblokir
 * pengganti yang sehat.
 *
 * ══ DUA JALAN, DAN YANG LAMA PUNYA CACAT YANG DISEBUT (tahap 3, 22 Okt 2026)
 *
 * Jalan lama (`controlDb`) mengambil kunci SESI lewat klien Prisma — dan di
 * produksi `CONTROL_DATABASE_URL` menunjuk PgBouncer mode TRANSAKSI. Kuncinya
 * tertinggal di backend milik kolam PgBouncer, bukan milik pelari ini: pelari
 * yang mati tidak melepasnya, dan pelari lain yang mendarat di backend yang
 * sama ikut "mendapatkannya". Di satu VM dengan satu replika cacat itu jinak —
 * PgBouncer memakai ulang backend yang sama (LIFO), dan `dedupe_key` yang
 * memikul kebenaran — tapi pagar itu tidak memagari apa pun begitu ada host
 * kedua. Go tidak punya cacat ini: jalur `tenant` di `svc-integrator` menyambung langsung ke `pg`
 * dan memegang satu koneksi (`TryLaneLock`).
 *
 * Jalan baru dipakai HANYA bila `CONTROL_DATABASE_DIRECT_URL` disetel
 * (`docker-compose.ha.yml`): satu koneksi langsung yang dipegang selama
 * pelari hidup, dibuktikan ulang tiap denyut (`@sai/db/session-lock`). Tanpa
 * variabel itu perilakunya PERSIS seperti sebelum tahap 3 — produksi satu-VM
 * tidak berubah sampai seseorang memutuskannya.
 *
 * Nama kuncinya SAMA di kedua jalan dan di Go (`sai.lane.<jalur>`), sebab pagar
 * yang tidak saling melihat bukan pagar.
 */
async function ambilPagar(lane: JobLane): Promise<SessionLock | "pooled" | null> {
  const direct = process.env.CONTROL_DATABASE_DIRECT_URL;
  if (direct) {
    return tryAcquireSessionLock(direct, `sai.lane.${lane}`);
  }
  /* Id kunci diturunkan dari nama jalur secara stabil — dua jalur berbeda tidak
     boleh berebut kunci yang sama. `hashtext` deterministik di satu versi
     server, dan itu cukup: yang dibandingkan hanya dua proses jalur yang sama
     di server yang sama. */
  const rows = await controlDb.$queryRaw<{ ok: boolean }[]>`
    SELECT pg_try_advisory_lock(hashtext(${`sai.lane.${lane}`})) AS ok`;
  return rows[0]?.ok === true ? "pooled" : null;
}

/**
 * Satu putaran pemeliharaan tabel `jobs`.
 *
 * Dijalankan SETIAP pelari, bukan hanya jalur tunggal-instans: penyebaran yang
 * kebetulan hanya memuat jalur jamak akan berjalan tanpa pernah memulangkan
 * satu lease pun, dan kegagalan itu tidak punya gejala selain pekerjaan yang
 * hilang.
 *
 * Tanpa kunci dan tanpa *leader election*, karena keduanya idempoten: pelari
 * kedua yang menjalankannya pada saat yang sama memulangkan dan membuang nol
 * baris. Ini pola §4 — kunci hanya mengurangi pekerjaan terbuang, bukan
 * memikul kebenaran, dan di sini yang terbuang pun tidak berarti.
 *
 * Galatnya DITELAN (dicatat, tidak dilempar): pemeliharaan yang gagal tidak
 * boleh menjatuhkan pelari yang sedang sehat mengerjakan pekerjaan orang.
 */
async function upkeep(lane: JobLane): Promise<void> {
  try {
    const dipulangkan = await reclaimStaleJobs();
    if (dipulangkan > 0) {
      console.log(`[${lane}] upkeep: ${dipulangkan} pekerjaan dipulangkan dari pekerja yang mati`);
    }
  } catch (e) {
    console.error(`[${lane}] upkeep: gagal memulangkan lease kedaluwarsa:`, e);
  }
  try {
    const dibuang = await archiveDoneJobs();
    if (dibuang > 0) console.log(`[${lane}] upkeep: ${dibuang} baris \`done\` lewat retensi dibuang`);
  } catch (e) {
    console.error(`[${lane}] upkeep: gagal membuang baris \`done\`:`, e);
  }
  try {
    await pruneRuntimeSamples();
  } catch (e) {
    console.error(`[${lane}] upkeep: gagal memangkas \`runtime_samples\`:`, e);
  }

  /*
   * ══ HASIL YATIM — pembayaran atas peringatan yang ditulis sebelum ada hasil
   *
   * `DONE_RETENTION_DAYS` membuang baris `done` sesudah 14 hari, dan baris itu
   * satu-satunya yang tahu di mana hasilnya berada. `@sai/core/job-backoff`
   * sudah memperingatkannya sejak tahap 1a, sebelum ada satu `result_ref` pun:
   * objek yang hidup lebih lama daripada barisnya adalah berkas yang tak bisa
   * dijangkau siapa pun lagi sementara cakramnya tetap terpakai.
   *
   * ⚠ Himpunan id dibaca LEBIH DULU, dan putaran ini DILEWATI bila bacaannya
   * gagal. Himpunan kosong karena basis data sedang tak terjangkau akan
   * terbaca sebagai "tidak ada yang punya baris" — dan jawabannya menghapus
   * SEMUANYA. Itu sebabnya dua `try` terpisah, bukan satu yang membungkus
   * keduanya.
   *
   * Di container yang tidak memasang volume `hasil` ia tidak melakukan apa pun:
   * direktorinya tidak ada, dan ketiadaannya bukan kegagalan.
   */
  let idAda: ReadonlySet<number>;
  try {
    idAda = await jobIdsPresent();
  } catch (e) {
    console.error(`[${lane}] upkeep: gagal membaca id pekerjaan — pembersih hasil DILEWATI:`, e);
    return;
  }
  try {
    const yatim = await pruneOrphanResults(idAda);
    if (yatim.length > 0) {
      console.log(`[${lane}] upkeep: ${yatim.length} direktori hasil yatim dibuang`);
    }
  } catch (e) {
    console.error(`[${lane}] upkeep: gagal membuang hasil yatim:`, e);
  }
}

export interface RunnerOptions {
  lane: JobLane;
  handlers: Partial<Record<JobKind, JobHandler>>;
}

export async function runLane({ lane, handlers }: RunnerOptions): Promise<void> {
  const me = workerId(lane);
  const spec = JOB_LANES[lane];

  let pagar: SessionLock | "pooled" | null = null;
  if (spec.singleInstance) {
    pagar = await ambilPagar(lane);
    if (!pagar) {
      console.log(
        `[${lane}] instans lain sudah memegang jalur ini — keluar tanpa bekerja.\n` +
          `  Jalur ini tunggal-instans di contract/kinds.yaml. Ini bukan galat; ` +
          `ia mencegah dua penerbit berjalan bersamaan.`
      );
      await controlDb.$disconnect().catch(() => {});
      return;
    }
  }

  let berhenti = false;
  const minta = (sig: string) => {
    if (berhenti) return;
    berhenti = true;
    console.log(`[${lane}] ${sig} — menyelesaikan pekerjaan yang sedang jalan, lalu berhenti.`);
  };
  process.on("SIGTERM", () => minta("SIGTERM"));
  process.on("SIGINT", () => minta("SIGINT"));

  /* Pagar yang HILANG (koneksi langsung putus, primary berganti) menghentikan
     klaim berikutnya: pelari yang terus mengklaim tanpa pagar adalah instans
     kedua yang sedang menunggu terjadi. Pekerjaan yang sedang jalan tetap
     diselesaikan — lease-nya yang menjaga, bukan pagar ini. Proses lalu keluar
     biasa, dan `restart: unless-stopped` (yang memulai ulang apa pun kode
     keluarnya) membuatnya mencoba pagar lagi — kali ini sebagai kandidat. */
  if (pagar && pagar !== "pooled") {
    void pagar.lost.then((e) => {
      if (berhenti) return;
      console.error(`[${lane}] ⚠ pagar jalur HILANG (${e.message}).`);
      minta("pagar hilang");
    });
  }

  /* Hanya `kind` yang punya handler yang diklaim — lihat `claimJob`. Diurutkan
     supaya log dan kueri bisa diulang. */
  const kinds = (Object.keys(handlers) as JobKind[]).filter((k) => handlers[k]).sort();
  if (kinds.length === 0) {
    console.error(`[${lane}] tidak punya satu handler pun — keluar tanpa mengklaim apa pun.`);
    if (pagar && pagar !== "pooled") await pagar.release();
    await controlDb.$disconnect().catch(() => {});
    return;
  }

  console.log(`[${lane}] mulai sebagai ${me} — mengklaim ${kinds.join(", ")}`);

  /* Potret event loop jalur ini (pemicu 1d, `@sai/core/runtime-trigger`).
     Dimulai SESUDAH pagar & daftar handler: pelari yang keluar tanpa bekerja
     tidak boleh meninggalkan baris yang terbaca sebagai jalur yang sehat. */
  const hentikanPotret = startLoopSampler(lane);

  /* Putaran pertama SEGERA, bukan sesudah jeda: pelari yang baru hidup sesudah
     sebuah crash harus memulangkan pekerjaan yang tertinggal sekarang, bukan
     satu menit dari sekarang. */
  await upkeep(lane);
  const pemeliharaan = setInterval(() => void upkeep(lane), UPKEEP_MS);

  while (!berhenti) {
    let job: JobRow | null;
    try {
      job = await claimJob(lane, me, kinds);
    } catch (e) {
      console.error(`[${lane}] gagal mengklaim:`, e);
      await tidur(IDLE_MS);
      continue;
    }

    if (!job) {
      await tidur(IDLE_MS);
      continue;
    }

    const handler = handlers[job.kind];
    if (!handler) {
      /* Pekerjaan yang jalurnya ini tapi tanpa handler adalah kegagalan
         KONTRAK, bukan kegagalan data: ia dicatat sebagai galat supaya baris
         itu akhirnya mati alih-alih diklaim-dan-dilepas selamanya oleh setiap
         pekerja yang lewat. */
      await failJob(
        job.id,
        me,
        `tidak ada handler untuk kind \`${job.kind}\` di jalur \`${lane}\` — ` +
          "kontrak dan pelari tidak sepakat"
      );
      continue;
    }

    await kerjakan(lane, me, job, handler);
  }

  clearInterval(pemeliharaan);
  hentikanPotret();
  if (pagar && pagar !== "pooled") await pagar.release();
  await controlDb.$disconnect().catch(() => {});
  console.log(`[${lane}] berhenti.`);
}

async function kerjakan(
  lane: JobLane,
  me: string,
  job: JobRow,
  handler: JobHandler
): Promise<void> {
  let dibatalkan = job.cancelRequested;
  let leaseHidup = true;

  const perpanjang = setInterval(() => {
    void (async () => {
      try {
        const masih = await renewLease(job.id, me);
        if (!masih) {
          leaseHidup = false;
          console.error(`[${lane}] #${job.id} lease HILANG — pekerjaan dihentikan.`);
        }
      } catch (e) {
        /* Gagal memperpanjang karena basis data sedang tak terjangkau BUKAN
           bukti lease hilang. Menganggapnya hilang akan membatalkan pekerjaan
           yang sebenarnya masih sah; ambang reclaim memberi ruang untuk
           beberapa kali gagal. */
        console.error(`[${lane}] #${job.id} gagal memperpanjang lease:`, e);
      }
      /* Pembatalan dibaca di putaran yang sama: satu kueri, dua pertanyaan. */
      try {
        const r = await controlDb.$queryRaw<{ cancel: boolean }[]>`
          SELECT cancel_requested AS cancel FROM jobs WHERE id = ${job.id}`;
        if (r[0]?.cancel) dibatalkan = true;
      } catch {
        /* diam: pembatalan yang terlambat terbaca hanya berarti pekerjaan
           selesai, dan itu tidak merusak apa pun. */
      }
    })();
  }, LEASE_RENEW_MS);

  const mulai = Date.now();
  /* Puncak memori PERCOBAAN ini — pemicu (b) tahap 1d. Dicatat di `finally`,
     apa pun hasilnya: ekspor yang gagal tetap memakan memori yang sama. */
  const memori = trackJobMemory();
  try {
    const resultRef = await handler({
      job,
      progress: async (persen) => {
        if (!leaseHidup) throw new LeaseLostError();
        await reportProgress(job.id, me, persen);
      },
      cancelled: () => dibatalkan || !leaseHidup,
    });

    if (!leaseHidup) throw new LeaseLostError();

    if (dibatalkan) {
      await failJob(job.id, me, "dibatalkan atas permintaan");
      console.log(`[${lane}] #${job.id} ${job.kind} dibatalkan`);
      return;
    }

    await completeJob(job.id, me, resultRef);
    console.log(`[${lane}] #${job.id} ${job.kind} selesai (${Date.now() - mulai} ms)`);
  } catch (e) {
    if (e instanceof LeaseLostError) {
      /* TIDAK dilaporkan sebagai kegagalan pekerjaan: barisnya sudah dipulangkan
         dan mungkin sudah diklaim pekerja lain. Menulis `failJob` di sini akan
         menaikkan `attempts` milik pekerjaan orang lain. */
      console.error(`[${lane}] #${job.id} dilepas karena lease hilang`);
      return;
    }
    const pesan = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const hasil = await failJob(job.id, me, pesan);
    console.error(
      `[${lane}] #${job.id} ${job.kind} GAGAL (${hasil?.status ?? "tidak diketahui"}): ${pesan}`
    );
  } finally {
    clearInterval(perpanjang);
    await recordJobRun({
      lane,
      jobId: job.id,
      jobKind: job.kind,
      durationMs: Date.now() - mulai,
      memory: memori.finish(),
    });
  }
}

const tidur = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
