/**
 * PENYELIA `svc-worker` — empat peran latar Node dalam SATU container.
 *
 *   bun scripts/run-workers.ts <peran> '<skrip sh>' [<peran> '<skrip sh>' …]
 *
 * Dipasang sebagai `command` `svc-worker` di `docker-compose.yml`. Skrip tiap
 * peran (putaran penjadwal beserta anggaran `timeout`-nya, putaran kesesuaian
 * mingguan, dua pelari jalur) TETAP ditulis di compose, satu salinan — berkas
 * ini tidak tahu apa pun tentang isinya, dan memang tidak boleh tahu.
 *
 * ══ KENAPA SATU CONTAINER (keputusan pemilik 22 Okt 2026) ═════════════════
 * "1 image = 1 container": image `-migrator` dulu menjalankan EMPAT container
 * (`svc-ledger`, `svc-interactive`, `job-scheduler`, `job-conformance`). Dengan
 * keputusan itu keempatnya menjadi empat PROSES di bawah penyelia ini. Yang
 * dibayar dan yang dijaga: docs/arsitektur/09-RANCANGAN-LAYANAN.md §3.2.
 *
 * ══ TIGA JANJI, DAN KETIGANYA ADA KARENA KEBALIKANNYA DIAM ═════════════════
 *
 *  1. **Satu peran mati → SELURUH container mati, kode bukan-nol.** Container
 *     setengah-hidup adalah kegagalan paling senyap yang bisa dibuat penyelia:
 *     `docker compose ps` menulis "Up", tiga peran bekerja, dan peran keempat
 *     (mis. pelari `ledger` — satu-satunya penulis buku di latar) sudah mati
 *     sejak kemarin. Dengan keluar bukan-nol, `restart: unless-stopped`
 *     menghidupkan ulang SEMUANYA dan kematiannya tercatat di log serta di
 *     hitungan restart. Kode 0 dari peran yang seharusnya tak pernah berakhir
 *     juga kematian — pelari yang keluar "rapi" tetap berarti jalurnya kosong.
 *
 *  2. **SIGTERM diteruskan ke GRUP PROSES tiap peran**, bukan hanya ke `sh`.
 *     Tiap peran lahir `detached` (grup sendiri), sehingga TERM sampai ke
 *     `timeout`, `bun run`, dan `sleep 3600` di bawahnya — pola yang sama
 *     dengan `scripts/run-as-leader.ts`. Pelari jalur menyelesaikan pekerjaan
 *     yang sedang jalan lalu keluar; `stop_grace_period` compose yang memaksa
 *     sisanya.
 *
 *  3. **Setiap baris log berawalan nama perannya.** Empat aliran yang bercampur
 *     di satu `docker compose logs svc-worker` tanpa awalan tidak bisa dibaca
 *     siapa pun pada hari insiden.
 *
 * ══ LEADER ELECTION (profil HA saja) ═══════════════════════════════════════
 * `WORKER_LEADER_ROLES=scheduler,ledger,conformance` membungkus peran yang
 * disebut dengan `scripts/run-as-leader.ts --name <peran>`: replika di host lain
 * menunggu sebagai kandidat dan tidak menjalankan peran itu sampai kuncinya
 * bebas. Peran yang tidak disebut (mis. `interactive`, yang jamak) berjalan di
 * setiap replika. Compose dasar TIDAK menyetelnya — satu-VM berjalan tanpa
 * pembungkus, dijaga `tests/leader-election.test.ts`.
 *
 * Penyelia ini wajib berada di belakang `init: true` (tini): ia tidak memanen
 * proses yatim, dan tini-lah yang membuat kematian penyelia menghentikan
 * container beserta seluruh pohonnya — tidak ada putaran penjadwal yang terus
 * berjalan sesudah pembungkus pemimpinnya mati.
 *
 * Tanpa dependensi dan tanpa `.env`: lingkungan datang dari `env_file:` compose
 * dan diwariskan apa adanya ke setiap peran.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:os";
import type { Readable, Writable } from "node:stream";

/** Jeda TERM → KILL saat SATU peran mati dan sisanya harus dihentikan. Di
 *  bawah `stop_grace_period: 60s` compose, supaya penyelia sendiri yang
 *  memutuskan, bukan Docker. */
const KILL_GRACE_MS = 45_000;

interface Role {
  name: string;
  script: string;
}

interface Running {
  role: Role;
  child: ChildProcess;
  exited: Promise<number>;
}

export function parseRoles(args: readonly string[]): Role[] {
  if (args.length === 0 || args.length % 2 !== 0) {
    throw new Error("pakai: run-workers.ts <peran> '<skrip sh>' [<peran> '<skrip sh>' …]");
  }
  const roles: Role[] = [];
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!;
    const script = args[i + 1]!;
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`nama peran tidak sah: ${JSON.stringify(name)}`);
    if (roles.some((r) => r.name === name)) throw new Error(`peran \`${name}\` disebut dua kali`);
    if (!script.trim()) throw new Error(`skrip peran \`${name}\` kosong`);
    roles.push({ name, script });
  }
  return roles;
}

export function leaderRoles(raw: string | undefined, roles: readonly Role[]): Set<string> {
  const names = new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  for (const n of names) {
    /* Peran yang salah ketik di override HA berarti election yang diam-diam
       tidak terpasang — dua pemimpin. Ditolak saat boot, bukan diabaikan. */
    if (!roles.some((r) => r.name === n)) {
      throw new Error(`WORKER_LEADER_ROLES menyebut \`${n}\`, yang bukan peran penyelia ini`);
    }
  }
  return names;
}

/** Salin aliran per BARIS dengan awalan; sisa tanpa `\n` dikeluarkan di akhir. */
function prefixLines(src: Readable | null, dst: Writable, prefix: string): void {
  if (!src) return;
  let sisa = "";
  src.setEncoding("utf8");
  src.on("data", (chunk: string) => {
    const teks = sisa + chunk;
    const baris = teks.split("\n");
    sisa = baris.pop() ?? "";
    for (const b of baris) dst.write(`${prefix}${b}\n`);
  });
  src.on("end", () => {
    if (sisa) dst.write(`${prefix}${sisa}\n`);
    sisa = "";
  });
}

function start(role: Role, leader: boolean, width: number): Running {
  const argv = leader
    ? ["bun", "scripts/run-as-leader.ts", "--name", role.name, "--", "sh", "-c", role.script]
    : ["sh", "-c", role.script];
  const child = spawn(argv[0]!, argv.slice(1), {
    /* Grup proses sendiri: TERM ke `-pid` sampai ke seluruh pohon peran. */
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  const prefix = `${role.name.padEnd(width)} | `;
  prefixLines(child.stdout, process.stdout, prefix);
  prefixLines(child.stderr, process.stderr, prefix);
  const exited = new Promise<number>((resolve) => {
    child.on("exit", (code, signal) => {
      resolve(code ?? 128 + (signal ? (constants.signals[signal] ?? 0) : 0));
    });
    child.on("error", (e) => {
      process.stderr.write(`${prefix}gagal dijalankan: ${e.message}\n`);
      resolve(127);
    });
  });
  return { role, child, exited };
}

function signalGroup(r: Running, sig: NodeJS.Signals): void {
  if (r.child.pid === undefined) return;
  try {
    process.kill(-r.child.pid, sig);
  } catch {
    /* Grup sudah habis — tidak ada yang perlu dihentikan. */
  }
}

async function main(): Promise<number> {
  const roles = parseRoles(process.argv.slice(2));
  const leaders = leaderRoles(process.env.WORKER_LEADER_ROLES, roles);
  const width = Math.max(...roles.map((r) => r.name.length), "penyelia".length);
  const log = (m: string) => process.stdout.write(`${"penyelia".padEnd(width)} | ${m}\n`);

  /*
   * Penangan sinyal DIPASANG SEBELUM peran pertama lahir. Urutan sebaliknya
   * meninggalkan celah: SIGTERM yang tiba di antaranya memakai tindakan bawaan
   * (penyelia mati seketika), dan peran yang sudah lahir di grup prosesnya
   * sendiri (`detached`) tertinggal tanpa induk. Tes SIGTERM di
   * `tests/worker-role-exit-stops-container.test.ts` pernah jatuh di celah itu.
   */
  const running: Running[] = [];
  let requested = false;
  const stopAll = (sig: NodeJS.Signals) => {
    for (const r of running) signalGroup(r, sig);
  };
  const onSignal = (sig: NodeJS.Signals) => {
    if (requested) return;
    requested = true;
    log(`${sig} diterima — diteruskan ke setiap peran, menunggu semuanya selesai.`);
    stopAll("SIGTERM");
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));

  log(
    `memulai ${roles.length} peran: ` +
      roles.map((r) => (leaders.has(r.name) ? `${r.name} (lewat pemimpin)` : r.name)).join(", ")
  );
  for (const r of roles) {
    /* Sinyal yang tiba di tengah peluncuran: peran sisanya tidak dilahirkan. */
    if (requested) break;
    running.push(start(r, leaders.has(r.name), width));
  }

  /* Dihentikan sebelum satu peran pun lahir: tidak ada yang ditunggu. */
  if (running.length === 0) return 0;

  /* Peran PERTAMA yang berakhir menentukan nasib container. */
  const first = await Promise.race(running.map((r) => r.exited.then((code) => ({ r, code }))));

  if (!requested) {
    log(
      `⚠ peran \`${first.r.role.name}\` BERAKHIR (kode ${first.code}) — ` +
        "menghentikan peran lain dan keluar bukan-nol supaya container dimulai ulang utuh."
    );
    stopAll("SIGTERM");
    const killer = setTimeout(() => {
      log(`peran yang membandel sesudah ${KILL_GRACE_MS / 1000}s dipaksa KILL.`);
      stopAll("SIGKILL");
    }, KILL_GRACE_MS);
    killer.unref();
  }

  const codes = await Promise.all(running.map((r) => r.exited));
  if (requested) {
    log("semua peran berhenti.");
    return 0;
  }
  log(`semua peran berhenti; kode keluar per peran: ${roles.map((r, i) => `${r.name}=${codes[i]}`).join(" ")}`);
  return 1;
}

/* `import.meta.main` milik Bun belum ada di tipe bawaan TypeScript — pola yang
   sama dengan `scripts/pg-migrate-data.ts`. Diimpor tes (vitest) tanpa
   menjalankan apa pun. */
if ((import.meta as unknown as { main?: boolean }).main) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`penyelia | galat: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(2);
    }
  );
}
