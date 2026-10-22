/**
 * KUNCI SESI DI KONEKSI LANGSUNG — dasar *leader election* & pagar jalur
 * (rancangan 09 §9, tahap 3).
 *
 * ══ KENAPA KONEKSI SENDIRI, BUKAN KLIEN PRISMA ══════════════════════════════
 * `pg_try_advisory_lock` terikat SESI. Klien Prisma memegang KOLAM koneksi, dan
 * kolam boleh memakai koneksi mana pun untuk query berikutnya — jadi "masih
 * memegang kunci?" tidak bisa ditanyakan ke kolam. Berkas ini membuka SATU
 * `pg.Client` yang hidup selama kuncinya dipegang, persis pola Go
 * (`TryLaneLock` memegang `*pgxpool.Conn`, bukan kolamnya).
 *
 * ══ KENAPA WAJIB LANGSUNG KE `pg`, TIDAK PERNAH LEWAT PgBouncer ════════════
 * PgBouncer di compose ini `POOL_MODE: transaction`: tiap transaksi boleh
 * mendarat di backend server yang BERBEDA. Kunci sesi yang diambil lewat sana
 * tertinggal di backend milik kolam PgBouncer — bukan milik proses kita — dan
 * dua akibatnya sama-sama diam:
 *
 *   • proses yang mati TIDAK melepas kuncinya (backend-nya tetap hidup di
 *     kolam), sehingga pengganti yang sehat ditolak sampai PgBouncer kebetulan
 *     menutup backend itu;
 *   • proses LAIN yang kebetulan mendarat di backend yang sama MENDAPAT kunci
 *     yang sama (advisory lock reentrant per sesi) — dua "pemimpin".
 *
 * Itu yang dialami `migrate` 15 Okt 2026 (P1002, `docker-compose.yml`), dan itu
 * sebabnya `assertDirectUrl` MENOLAK URL yang terbaca sebagai pooler sebelum
 * satu byte pun dikirim. Penolakan itu heuristik nama/port; pembuktian yang
 * sesungguhnya ada di `probe`: tiap denyut memeriksa bahwa backend yang
 * menjawab MASIH backend yang mengambil kunci, dan bahwa kuncinya masih ada di
 * `pg_locks` untuk backend itu. Pooler transaksi cepat atau lambat menjawab
 * dari backend lain, dan pada saat itu kunci dinyatakan HILANG — gagal
 * tertutup, bukan gagal terbuka.
 *
 * ══ WAKTU: KENAPA PEMIMPIN LAMA BERHENTI SEBELUM YANG BARU MULAI ═══════════
 * Sesi diberi `idle_session_timeout` (PostgreSQL ≥ 14). Denyut berjalan tiap
 * `probeIntervalMs`, jadi selama pemimpin sehat sesinya tidak pernah diam.
 * Kalau pemimpin terputus dari jaringan, server membunuh sesinya sesudah
 * `idleSessionTimeoutMs` — dan baru saat itu kuncinya bebas untuk kandidat
 * lain. Sementara itu pemimpin lama sudah tahu lebih dulu: denyutnya gagal
 * paling lambat `probeIntervalMs + queryTimeoutMs`. Selisih keduanya adalah
 * jendela pemimpin lama untuk menghentikan anak prosesnya; angka bawaannya
 * (15 s + 10 s, lawan 90 s) memberi 65 detik.
 *
 * Kunci ini TIDAK memikul kebenaran, sama seperti pagar jalur: setiap langkah
 * penjadwal idempoten (`dedupe_key`, kunci unik). Yang dicegahnya pekerjaan
 * ganda dan surel ganda ke pelanggan, bukan buku yang rusak.
 */
import { Client } from "pg";

import { uraikanUrl } from "./engine";

/** Nama host & port yang terbaca sebagai pooler — bukan daftar lengkap. */
const POOLER_HOST = /bouncer|pooler|pgcat|odyssey|supavisor/i;
const POOLER_PORTS = new Set([6432]);

export class PooledLockUrlError extends Error {
  constructor(detail: string) {
    super(
      `Kunci sesi menolak URL ini: ${detail}. Advisory lock terikat SESI, ` +
        "sedangkan pooler mode transaksi memberi backend berbeda tiap transaksi — " +
        "kunci yang diambil lewat sana tertinggal di kolam pooler. Arahkan " +
        "CONTROL_DATABASE_DIRECT_URL langsung ke server PostgreSQL (host `pg`)."
    );
    this.name = "PooledLockUrlError";
  }
}

/**
 * Tolak URL yang bukan PostgreSQL atau yang terbaca sebagai pooler.
 *
 * Diekspor supaya penjaga (`tests/leader-election.test.ts`) memakai fungsi yang
 * SAMA dengan yang dipakai saat berjalan, bukan salinannya.
 */
export function assertDirectUrl(url: string): void {
  /* `uraikanUrl` MELEMPAR untuk URL yang bukan PostgreSQL — termasuk
     `mysql://`, dengan pesan yang menyebut #636. */
  const { host, port } = uraikanUrl(url);
  if (POOLER_HOST.test(host)) throw new PooledLockUrlError(`host \`${host}\` adalah pooler`);
  if (POOLER_PORTS.has(port)) throw new PooledLockUrlError(`port ${port} adalah port pooler`);
}

export interface SessionLockOptions {
  /** Jeda antar denyut pembuktian. */
  probeIntervalMs?: number;
  /** Batas satu query denyut; lewat dari ini = kunci dianggap hilang. */
  queryTimeoutMs?: number;
  /** `idle_session_timeout` sesi kunci — lihat kepala berkas. */
  idleSessionTimeoutMs?: number;
}

export const SESSION_LOCK_DEFAULTS = {
  probeIntervalMs: 15_000,
  queryTimeoutMs: 10_000,
  idleSessionTimeoutMs: 90_000,
} as const;

export interface SessionLock {
  /** Nama kunci (`hashtext` dari nama inilah id kuncinya). */
  readonly name: string;
  /** Selesai (tidak pernah ditolak) saat kunci HILANG — alasannya sebagai Error. */
  readonly lost: Promise<Error>;
  /** Lepaskan kunci & tutup koneksi. Aman dipanggil berulang. */
  release(): Promise<void>;
}

/**
 * Coba ambil kunci `name`. `null` = dipegang proses lain (bukan galat).
 *
 * Melempar bila URL-nya pooler atau server tak terjangkau — pemanggil yang
 * memutuskan apakah mencoba lagi.
 */
export async function tryAcquireSessionLock(
  url: string,
  name: string,
  options: SessionLockOptions = {}
): Promise<SessionLock | null> {
  assertDirectUrl(url);
  const opt = { ...SESSION_LOCK_DEFAULTS, ...options };
  const parts = uraikanUrl(url);

  const client = new Client({
    host: parts.host,
    port: parts.port,
    user: parts.user,
    password: parts.password,
    database: parts.database,
    keepAlive: true,
    query_timeout: opt.queryTimeoutMs,
    application_name: `sai-lock:${name}`.slice(0, 63),
  });

  let reportLost: (e: Error) => void = () => {};
  const lost = new Promise<Error>((resolve) => {
    reportLost = resolve;
  });
  let done = false;
  const markLost = (e: Error) => {
    if (done) return;
    done = true;
    reportLost(e);
  };
  /* Tanpa pendengar `error`, koneksi yang diputus server MENJATUHKAN proses
     (pelajaran `releaseCompanyClient`, 12 Okt 2026). Di sini justru itulah
     sinyal yang dicari: kunci hilang. */
  client.on("error", (e) => markLost(e));
  client.on("end", () => markLost(new Error("koneksi kunci ditutup")));

  await client.connect();

  try {
    /* Gagal di server lama (< 14) bukan alasan menolak kunci — hanya jendela
       pemberhentian yang memanjang ke TCP keepalive server. Dicatat. */
    await client
      .query(`SET idle_session_timeout = ${Math.trunc(opt.idleSessionTimeoutMs)}`)
      .catch((e: unknown) => {
        console.warn(`[kunci ${name}] idle_session_timeout tidak bisa disetel:`, e);
      });

    const res = await client.query<{ ok: boolean; pid: number }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS ok, pg_backend_pid() AS pid",
      [name]
    );
    const row = res.rows[0];
    if (!row?.ok) {
      done = true;
      await client.end().catch(() => {});
      return null;
    }
    const pid = row.pid;

    const probe = async () => {
      if (done) return;
      try {
        const r = await client.query<{ pid: number; held: boolean }>(
          `SELECT pg_backend_pid() AS pid,
                  EXISTS (SELECT 1 FROM pg_locks
                           WHERE locktype = 'advisory' AND granted
                             AND pid = pg_backend_pid()) AS held`
        );
        const now = r.rows[0];
        if (!now || now.pid !== pid) {
          markLost(
            new PooledLockUrlError(
              `denyut dijawab backend ${now?.pid ?? "?"}, kunci diambil di backend ${pid}`
            )
          );
        } else if (!now.held) {
          markLost(new Error(`kunci tidak lagi tercatat di pg_locks untuk backend ${pid}`));
        }
      } catch (e) {
        markLost(e instanceof Error ? e : new Error(String(e)));
      }
    };
    const timer = setInterval(() => void probe(), opt.probeIntervalMs);
    void lost.then(() => clearInterval(timer));

    return {
      name,
      lost,
      async release() {
        if (done) {
          clearInterval(timer);
          await client.end().catch(() => {});
          return;
        }
        done = true;
        clearInterval(timer);
        /* `pg_advisory_unlock` dulu, baru tutup: penutupan saja sudah
           melepasnya, tapi pelepasan eksplisit membuat kandidat berikutnya
           tidak perlu menunggu FIN sampai di server. */
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [name]).catch(() => {});
        await client.end().catch(() => {});
        reportLost(new Error("dilepas"));
      },
    };
  } catch (e) {
    done = true;
    await client.end().catch(() => {});
    throw e;
  }
}
