/**
 * Jalankan satu perintah HANYA selama proses ini pemimpin (rancangan 09 §9,
 * tahap 3).
 *
 *   bun scripts/run-as-leader.ts --name job-scheduler -- sh -c '<putaran>'
 *
 * Dipasang sebagai `entrypoint` `job-scheduler` oleh `docker-compose.ha.yml`
 * SAJA. Compose dasar tidak memakainya, jadi pemasangan satu-VM hari ini
 * berjalan persis seperti sebelum berkas ini ada — itu yang dijaga
 * `tests/leader-election.test.ts`.
 *
 * Karena `entrypoint` di-override sementara `command` dibiarkan, putaran
 * delapan langkah berikut seluruh komentar anggaran `timeout`-nya tetap SATU
 * salinan di `docker-compose.yml`. Override yang menyalin putarannya akan
 * menyimpang pada langkah kesembilan.
 *
 * ⚠ URL kuncinya `CONTROL_DATABASE_DIRECT_URL`, bukan `CONTROL_DATABASE_URL`:
 * yang kedua di produksi menunjuk PgBouncer mode transaksi, dan kunci sesi
 * lewat sana bukan kunci (`@sai/db/session-lock`). Tanpa variabel itu
 * pembungkus MENOLAK berjalan — election lewat pooler lebih buruk daripada
 * tanpa election, sebab ia terlihat seperti perlindungan.
 *
 * ⚠ Pembungkus ini wajib menjadi akar pohon proses container (di belakang
 * `init: true`). Kalau ia mati mendadak (OOM), container ikut berhenti dan
 * putarannya ikut mati — tidak ada anak yatim yang terus menjalankan putaran
 * setelah kuncinya lepas.
 */
import "dotenv/config";

import { spawn } from "node:child_process";
import { constants } from "node:os";

import { assertDirectUrl, tryAcquireSessionLock } from "@sai/db/session-lock";

import { LEADER_DEFAULTS, runAsLeader, type LeaderChild } from "./leader-election";

function parseArgs(raw: string[]): { name: string; argv: string[] } {
  const sep = raw.indexOf("--");
  const own = sep === -1 ? raw : raw.slice(0, sep);
  const argv = sep === -1 ? [] : raw.slice(sep + 1);
  const i = own.indexOf("--name");
  const name = i !== -1 ? own[i + 1] : undefined;
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error("pakai: run-as-leader.ts --name <nama-kebab> -- <perintah...>");
  }
  if (argv.length === 0) throw new Error("perintah setelah `--` kosong");
  return { name, argv };
}

function spawnGroup(argv: readonly string[]): LeaderChild {
  /* `detached` = grup proses sendiri, supaya TERM sampai ke `timeout` dan
     `bun run` di bawah `sh`, bukan hanya ke `sh`-nya. */
  const child = spawn(argv[0]!, argv.slice(1), { stdio: "inherit", detached: true });
  const exited = new Promise<number>((resolve) => {
    child.on("exit", (code, signal) => {
      resolve(code ?? 128 + (signal ? (constants.signals[signal] ?? 0) : 0));
    });
    child.on("error", () => resolve(127));
  });
  const signalGroup = (sig: NodeJS.Signals) => {
    if (child.pid === undefined) return;
    try {
      process.kill(-child.pid, sig);
    } catch {
      /* Grup sudah habis — tidak ada yang perlu dihentikan. */
    }
  };
  return {
    exited,
    terminate: () => signalGroup("SIGTERM"),
    kill: () => signalGroup("SIGKILL"),
  };
}

async function main(): Promise<number> {
  const { name, argv } = parseArgs(process.argv.slice(2));
  const url = process.env.CONTROL_DATABASE_DIRECT_URL;
  if (!url) {
    console.error(
      `[pemimpin ${name}] CONTROL_DATABASE_DIRECT_URL kosong — MENOLAK berjalan.\n` +
        "  Kunci sesi wajib di koneksi langsung ke PostgreSQL, bukan lewat PgBouncer.\n" +
        "  Pembungkus ini hanya dipasang `docker-compose.ha.yml`, yang menyetelnya."
    );
    return 2;
  }
  /* Salah konfigurasi, bukan gangguan sesaat: ditolak SEKALI di sini, bukan
     dicoba ulang tiap 30 detik selamanya oleh lingkaran kandidat. */
  try {
    assertDirectUrl(url);
  } catch (e) {
    console.error(`[pemimpin ${name}] ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }

  let requestStop: () => void = () => {};
  const stopRequested = new Promise<void>((resolve) => {
    requestStop = resolve;
  });
  process.on("SIGTERM", () => requestStop());
  process.on("SIGINT", () => requestStop());

  return runAsLeader(
    argv,
    {
      acquire: () => tryAcquireSessionLock(url, `sai.leader.${name}`),
      spawn: spawnGroup,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: (m) => console.log(m),
      stopRequested,
    },
    { ...LEADER_DEFAULTS, name }
  );
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("[pemimpin] galat:", e);
    process.exit(1);
  }
);
