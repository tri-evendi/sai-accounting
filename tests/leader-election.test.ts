/**
 * LEADER ELECTION peran tunggal `svc-worker` & pagar jalur (rancangan 09 §9,
 * tahap 3).
 *
 * Tiga hal yang dijaga, sesuai urutan bahayanya:
 *
 *  1. **Satu replika = perilaku hari ini.** Compose dasar tidak memakai
 *     pembungkus sama sekali, dan pembungkusnya sendiri — bila dipasang —
 *     menjalankan perintah yang SAMA sekali dengan argumen yang sama dan
 *     meneruskan kode keluarnya.
 *  2. **Kunci tidak pernah lewat pooler transaksi.** URL kunci ditolak bila
 *     terbaca sebagai PgBouncer, URL di `docker-compose.ha.yml` lolos penolakan
 *     itu, dan advisory lock di kode TS hanya ada di tempat yang disebut.
 *  3. **Kunci yang hilang menghentikan putaran SEBELUM pemilihan ulang.**
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PooledLockUrlError, assertDirectUrl } from "@sai/db/session-lock";

import {
  LEADER_DEFAULTS,
  runAsLeader,
  type LeaderChild,
  type LeaderDeps,
  type LeaderLock,
} from "../scripts/leader-election";
import { AKAR_REPO, berkasSumber, tanpaKomentar } from "./akar-sumber";
import { composeServices, serviceBlock, workerRoles } from "./compose-worker";
import { leaderRoles, parseRoles } from "../scripts/run-workers";

const OPTS = { ...LEADER_DEFAULTS, name: "scheduler", retryMs: 1, killGraceMs: 5 };

interface Harness {
  deps: LeaderDeps;
  events: string[];
  spawned: (readonly string[])[];
  children: FakeChild[];
  stop: () => void;
}

class FakeChild implements LeaderChild {
  exit!: (code: number) => void;
  readonly exited = new Promise<number>((r) => {
    this.exit = r;
  });
  constructor(
    private readonly events: string[],
    private readonly obeysTerm: boolean
  ) {}
  terminate() {
    this.events.push("terminate");
    if (this.obeysTerm) this.exit(143);
  }
  kill() {
    this.events.push("kill");
    this.exit(137);
  }
}

function fakeLock(events: string[]): LeaderLock & { lose: (e: Error) => void } {
  let lose: (e: Error) => void = () => {};
  const lost = new Promise<Error>((r) => {
    lose = r;
  });
  return {
    lost,
    lose,
    release: async () => {
      events.push("release");
    },
  };
}

function harness(
  acquireSeq: (() => LeaderLock | null | Error)[],
  opts: { obeysTerm?: boolean } = {}
): Harness {
  const events: string[] = [];
  const spawned: (readonly string[])[] = [];
  const children: FakeChild[] = [];
  let stop: () => void = () => {};
  const stopRequested = new Promise<void>((r) => {
    stop = r;
  });
  let i = 0;
  const deps: LeaderDeps = {
    async acquire() {
      const step = acquireSeq[Math.min(i, acquireSeq.length - 1)]!;
      i += 1;
      events.push("acquire");
      const v = step();
      if (v instanceof Error) throw v;
      return v;
    },
    spawn(argv) {
      events.push("spawn");
      spawned.push(argv);
      const c = new FakeChild(events, opts.obeysTerm ?? true);
      children.push(c);
      return c;
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: () => {},
    stopRequested,
  };
  return { deps, events, spawned, children, stop };
}

const tick = () => new Promise((r) => setTimeout(r, 15));

describe("satu replika: perilakunya identik dengan putaran hari ini", () => {
  const ARGV = ["sh", "-c", "while true; do langkah a; sleep 3600; done"];

  it("kunci didapat seketika → perintah yang SAMA dijalankan sekali, kode keluarnya diteruskan", async () => {
    const h = harness([() => fakeLock([])]);
    const run = runAsLeader(ARGV, h.deps, OPTS);
    await tick();
    expect(h.spawned).toEqual([ARGV]);
    h.children[0]!.exit(7);
    expect(await run).toBe(7);
    expect(h.events.filter((e) => e === "acquire")).toHaveLength(1);
  });

  it("SIGTERM meneruskan TERM ke putaran, lalu melepas kunci", async () => {
    const events: string[] = [];
    const h = harness([() => fakeLock(events)]);
    const run = runAsLeader(ARGV, h.deps, OPTS);
    await tick();
    h.stop();
    expect(await run).toBe(143);
    expect(h.events).toContain("terminate");
    expect(events).toEqual(["release"]);
  });
});

describe("kandidat yang belum memimpin tidak menjalankan satu langkah pun", () => {
  it("menunggu selama kunci dipegang orang lain, lalu memimpin", async () => {
    const h = harness([() => null, () => null, () => fakeLock([])]);
    const run = runAsLeader(["true"], h.deps, OPTS);
    await tick();
    expect(h.events.slice(0, 4)).toEqual(["acquire", "acquire", "acquire", "spawn"]);
    h.children[0]!.exit(0);
    expect(await run).toBe(0);
  });

  it("server tak terjangkau bukan alasan memimpin", async () => {
    const h = harness([() => new Error("ECONNREFUSED"), () => fakeLock([])]);
    const run = runAsLeader(["true"], h.deps, OPTS);
    await tick();
    expect(h.events.indexOf("spawn")).toBe(2);
    h.children[0]!.exit(0);
    await run;
  });

  it("berhenti saat masih menunggu → keluar 0 tanpa pernah menjalankan perintah", async () => {
    const h = harness([() => null]);
    const run = runAsLeader(["true"], h.deps, { ...OPTS, retryMs: 50 });
    await tick();
    h.stop();
    expect(await run).toBe(0);
    expect(h.spawned).toHaveLength(0);
  });
});

describe("kunci HILANG: putaran dihentikan sebelum pemilihan ulang", () => {
  it("TERM ke putaran → lepas → baru mencoba kunci lagi", async () => {
    const first = fakeLock([]);
    const h = harness([() => first, () => null]);
    const run = runAsLeader(["true"], h.deps, OPTS);
    await tick();
    first.lose(new Error("koneksi kunci ditutup"));
    await tick();
    const iTerm = h.events.indexOf("terminate");
    const iSecondAcquire = h.events.indexOf("acquire", 1);
    expect(iTerm).toBeGreaterThan(-1);
    expect(iSecondAcquire).toBeGreaterThan(iTerm);
    h.stop();
    await run;
  });

  it("putaran yang membandel terhadap TERM dipaksa KILL sesudah jeda", async () => {
    const first = fakeLock([]);
    const h = harness([() => first, () => null], { obeysTerm: false });
    const run = runAsLeader(["true"], h.deps, OPTS);
    await tick();
    first.lose(new Error("denyut gagal"));
    await tick();
    expect(h.events).toContain("kill");
    expect(h.events.indexOf("kill")).toBeLessThan(h.events.indexOf("acquire", 1));
    h.stop();
    await run;
  });

  it("jeda KILL jauh di bawah selisih denyut lawan idle_session_timeout", async () => {
    const { SESSION_LOCK_DEFAULTS: d } = await import("@sai/db/session-lock");
    const fenceWindow = d.idleSessionTimeoutMs - (d.probeIntervalMs + d.queryTimeoutMs);
    expect(LEADER_DEFAULTS.killGraceMs).toBeLessThan(fenceWindow);
  });
});

describe("kunci TIDAK PERNAH lewat pooler transaksi", () => {
  it("URL PgBouncer & port pooler ditolak sebelum satu byte dikirim", () => {
    expect(() => assertDirectUrl("postgres://u:p@pgbouncer:5432/sai_control")).toThrow(
      PooledLockUrlError
    );
    expect(() => assertDirectUrl("postgres://u:p@db.internal:6432/sai_control")).toThrow(
      PooledLockUrlError
    );
    /* `mysql://` ditolak lebih awal oleh `@sai/db/engine`, dengan pesan #636. */
    expect(() => assertDirectUrl("mysql://u:p@db:3306/sai_control")).toThrow(/#636/);
    expect(() => assertDirectUrl("postgres://u:p@pg:5432/sai_control")).not.toThrow();
  });

  const HA = readFileSync(join(AKAR_REPO, "docker-compose.ha.yml"), "utf8");

  it("URL langsung di docker-compose.ha.yml lolos penolakan itu", () => {
    const m = /^x-control-direct: &control-direct (\S+)$/m.exec(HA);
    expect(m).not.toBeNull();
    const url = m![1]!.replace(/\$\{[^}]+\}/g, "x");
    expect(() => assertDirectUrl(url)).not.toThrow();
    expect(tanpaKomentar(serviceBlock(HA, "svc-worker"))).toContain(
      "CONTROL_DATABASE_DIRECT_URL: *control-direct"
    );
  });

  it("compose DASAR menyetel URL langsung untuk pagar `ledger` & jalur `tenant`", () => {
    /*
     * Disetujui pemilik 22 Okt 2026. Tanpanya pagar jalur `ledger` jatuh ke
     * jalan lama — kunci sesi lewat PgBouncer mode transaksi, yang tertinggal
     * di backend milik kolam (`workers/runner.ts` → `ambilPagar`) — dan jalur
     * Go `tenant` MENOLAK boot (`db.KendaliLangsung`). Nilainya wajib lolos
     * penolak pooler yang SAMA dengan yang dipakai saat berjalan.
     */
    const svc = composeServices();
    for (const nama of ["svc-worker", "svc-integrator"]) {
      const env = svc[nama]?.environment as Record<string, string> | undefined;
      const url = env?.CONTROL_DATABASE_DIRECT_URL;
      expect(url, `${nama}: CONTROL_DATABASE_DIRECT_URL`).toBeDefined();
      expect(() => assertDirectUrl(url!.replace(/\$\{[^}]+\}/g, "x"))).not.toThrow();
      expect(url).toMatch(/@pg:5432\/sai_control$/);
    }
    /* `svc-integrator` TIDAK menimpa `CONTROL_DATABASE_URL`: jalur
       `interactive` di proses yang sama memakainya lewat PgBouncer. */
    const envGo = svc["svc-integrator"]?.environment as Record<string, string>;
    /* Sejak daftar izin env (Okt 2026): disebut TANPA nilai = diteruskan dari `.env`. */
    expect(envGo.CONTROL_DATABASE_URL ?? null).toBeNull();
  });

  it("advisory lock di kode TS hanya di tempat yang disebut", () => {
    const IZIN = new Set([
      "packages/db/src/session-lock.ts",
      // Jalan lama pagar jalur — dipakai bila CONTROL_DATABASE_DIRECT_URL kosong.
      "workers/runner.ts",
    ]);
    const berkas = [
      ...berkasSumber([".ts", ".tsx"]),
      // `workers/` & `scripts/` di luar `akarSumber()`, tapi justru di sanalah
      // proses berputar yang paling mungkin menulis kunci sendiri.
      ...["workers", "scripts"].flatMap((dir) =>
        readdirSync(join(AKAR_REPO, dir))
          .filter((f) => f.endsWith(".ts"))
          .map((f) => ({ rel: `${dir}/${f}`, isi: readFileSync(join(AKAR_REPO, dir, f), "utf8") }))
      ),
    ];
    const pemakai = berkas
      .filter((b) => /pg_(try_)?advisory_lock\s*\(/.test(tanpaKomentar(b.isi)))
      .map((b) => b.rel);
    // Pemindai yang tidak menemukan apa pun LULUS dengan nol pelanggar — jadi
    // kedua pemakai yang sah wajib terlihat olehnya.
    expect(pemakai).toEqual(expect.arrayContaining([...IZIN]));
    expect(pemakai.filter((rel) => !IZIN.has(rel))).toEqual([]);
  });
});

describe("compose dasar TIDAK berubah — election hanya lewat override", () => {
  const BASE = readFileSync(join(AKAR_REPO, "docker-compose.yml"), "utf8");
  const HA = readFileSync(join(AKAR_REPO, "docker-compose.ha.yml"), "utf8");

  const blok = (teks: string, nama: string) => {
    const b = serviceBlock(teks, nama);
    expect(b, nama).not.toBe("");
    return b;
  };

  it("svc-worker dasar: tanpa entrypoint, tanpa pembungkus pemimpin, di belakang tini", () => {
    const b = tanpaKomentar(blok(BASE, "svc-worker"));
    expect(b).not.toMatch(/entrypoint:/);
    expect(b).not.toContain("run-as-leader");
    expect(b).not.toContain("WORKER_LEADER_ROLES");
    expect(b).toMatch(/init: true/);
    expect(b).toMatch(/command:\s*\n\s*- bun\s*\n\s*- scripts\/run-workers\.ts/);
    expect(workerRoles().get("scheduler")).toMatch(/while true/);
  });

  it("override HA menambah variabel SAJA — skrip peran tetap satu salinan", () => {
    const b = tanpaKomentar(blok(HA, "svc-worker"));
    expect(b).not.toMatch(/^\s+command:/m);
    expect(b).not.toMatch(/^\s+entrypoint:/m);
    expect(b).toMatch(/WORKER_LEADER_ROLES: scheduler,ledger,conformance/);
  });

  it("peran pemimpin HA = peran tunggal; `interactive` (jamak) tidak pernah dibungkus", () => {
    /* Peran yang salah ketik di override = election yang tidak terpasang;
       penyelia MENOLAK boot, dan penjaga ini menolaknya lebih awal. */
    const m = /WORKER_LEADER_ROLES: (\S+)/.exec(HA);
    expect(m).not.toBeNull();
    const roles = [...workerRoles()].map(([name, script]) => ({ name, script }));
    const pemimpin = leaderRoles(m![1], roles);
    expect([...pemimpin].sort()).toEqual(["conformance", "ledger", "scheduler"]);
    expect(pemimpin.has("interactive")).toBe(false);
    expect(() => leaderRoles("scheduler,penjadwal", roles)).toThrow(/bukan peran/);
    expect(() => parseRoles(["ledger", "exec true", "ledger", "exec true"])).toThrow(/dua kali/);
  });

  it("anggota kluster & witness di belakang profil — tidak pernah start tanpa diminta", () => {
    expect(tanpaKomentar(blok(HA, "db-patroni"))).toMatch(/profiles: \["ha-db"\]/);
    expect(tanpaKomentar(blok(HA, "svc-etcd"))).toMatch(/profiles: \["ha-db", "ha-witness"\]/);
  });
});
