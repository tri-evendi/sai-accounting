/**
 * LEADER ELECTION untuk proses berputar — logika murninya (rancangan 09 §9,
 * tahap 3).
 *
 * Berkas ini TANPA efek samping dan tanpa basis data: kunci, proses anak, jam,
 * dan sinyal semuanya disuntikkan. Itu yang memungkinkan
 * `tests/leader-election.test.ts` membuktikan janji terpentingnya — **dengan
 * satu replika, perilakunya identik dengan hari ini**: kunci didapat seketika,
 * perintah yang SAMA dijalankan sekali dengan argumen yang sama, dan kode
 * keluarnya diteruskan apa adanya. Pemakai sungguhannya `scripts/run-as-leader.ts`.
 *
 * Tiga keadaan, dan transisinya satu arah kecuali satu:
 *
 *   menunggu ──(kunci didapat)──▶ memimpin ──(anak keluar)──▶ selesai
 *      ▲                             │
 *      └────(kunci HILANG: anak dihentikan dulu)──┘
 *
 * Kunci yang hilang adalah satu-satunya jalan kembali ke "menunggu", dan anak
 * prosesnya DIHENTIKAN SEBELUM itu: pemimpin yang kehilangan kunci tapi tetap
 * menjalankan putarannya adalah dua pemimpin — persis yang dicegah berkas ini.
 */

export interface LeaderLock {
  /** Selesai saat kunci hilang (koneksi putus, denyut gagal, pooler ketahuan). */
  readonly lost: Promise<Error>;
  release(): Promise<void>;
}

export interface LeaderChild {
  /** Kode keluar anak (sinyal dipetakan ke 128 + nomor oleh pemanggil). */
  readonly exited: Promise<number>;
  /** SIGTERM ke seluruh grup proses anak. */
  terminate(): void;
  /** SIGKILL ke seluruh grup proses anak. */
  kill(): void;
}

export interface LeaderDeps {
  /** `null` = dipegang proses lain. Melempar = server tak terjangkau. */
  acquire(): Promise<LeaderLock | null>;
  spawn(argv: readonly string[]): LeaderChild;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
  /** Selesai saat proses diminta berhenti (SIGTERM/SIGINT). */
  readonly stopRequested: Promise<void>;
}

export interface LeaderOptions {
  /** Nama untuk log. */
  name: string;
  /** Jeda antar percobaan kandidat yang belum memimpin. */
  retryMs: number;
  /** Jeda antara SIGTERM dan SIGKILL saat menghentikan anak. */
  killGraceMs: number;
  /** Kandidat mencatat "masih menunggu" tiap kelipatan percobaan ini. */
  waitingLogEvery: number;
}

export const LEADER_DEFAULTS: Omit<LeaderOptions, "name"> = {
  retryMs: 30_000,
  /* 20 s: jauh di bawah selisih denyut lawan `idle_session_timeout`
     (`@sai/db/session-lock`, 65 s). Anak yang belum mati sesudah SIGTERM
     dipaksa sebelum kandidat lain bisa mengambil kunci. */
  killGraceMs: 20_000,
  waitingLogEvery: 20,
};

type Race<T> = { kind: "child"; code: number } | { kind: "lost"; error: Error } | { kind: "stop" } | T;

/** Hentikan anak: TERM, tunggu `graceMs`, lalu KILL. Mengembalikan kode keluarnya. */
async function stopChild(child: LeaderChild, deps: LeaderDeps, graceMs: number): Promise<number> {
  child.terminate();
  const first = await Promise.race([
    child.exited.then((code) => ({ done: true as const, code })),
    deps.sleep(graceMs).then(() => ({ done: false as const, code: -1 })),
  ]);
  if (first.done) return first.code;
  child.kill();
  return child.exited;
}

/**
 * Jalankan `argv` HANYA selama memegang kunci. Mengembalikan kode keluar yang
 * seharusnya dipakai proses pembungkus.
 */
export async function runAsLeader(
  argv: readonly string[],
  deps: LeaderDeps,
  options: LeaderOptions
): Promise<number> {
  if (argv.length === 0) throw new Error("runAsLeader: perintah kosong");
  let stopping = false;
  void deps.stopRequested.then(() => {
    stopping = true;
  });
  const stop = deps.stopRequested.then(() => ({ kind: "stop" as const }));

  let attempts = 0;
  while (!stopping) {
    let lock: LeaderLock | null;
    try {
      lock = await deps.acquire();
    } catch (e) {
      deps.log(`[pemimpin ${options.name}] gagal mencoba kunci: ${String(e)} — mencoba lagi.`);
      await Promise.race([deps.sleep(options.retryMs), stop]);
      continue;
    }

    if (!lock) {
      if (attempts % options.waitingLogEvery === 0) {
        deps.log(
          `[pemimpin ${options.name}] instans lain sedang memimpin — menunggu ` +
            `(coba lagi tiap ${Math.round(options.retryMs / 1000)}s). Ini bukan galat.`
        );
      }
      attempts += 1;
      await Promise.race([deps.sleep(options.retryMs), stop]);
      continue;
    }

    if (stopping) {
      await lock.release();
      break;
    }

    attempts = 0;
    deps.log(`[pemimpin ${options.name}] memegang kunci — menjalankan: ${argv.join(" ").slice(0, 120)}`);
    const child = deps.spawn(argv);

    const outcome: Race<never> = await Promise.race([
      child.exited.then((code) => ({ kind: "child" as const, code })),
      lock.lost.then((error) => ({ kind: "lost" as const, error })),
      stop,
    ]);

    if (outcome.kind === "child") {
      /* Sama seperti hari ini: perintahnya keluar, pembungkus ikut keluar
         dengan kode yang sama, dan `restart: unless-stopped` yang memutuskan. */
      await lock.release();
      return outcome.code;
    }

    if (outcome.kind === "stop") {
      const code = await stopChild(child, deps, options.killGraceMs);
      await lock.release();
      return code;
    }

    deps.log(
      `[pemimpin ${options.name}] ⚠ KUNCI HILANG (${outcome.error.message}) — ` +
        `menghentikan putaran SEBELUM kandidat lain bisa memimpin.`
    );
    await stopChild(child, deps, options.killGraceMs);
    await lock.release();
  }
  return 0;
}
