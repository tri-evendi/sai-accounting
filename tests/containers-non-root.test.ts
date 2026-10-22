/**
 * PENJAGA: tidak satu container aplikasi pun berjalan sebagai root.
 *
 * Sampai Okt 2026 `svc-worker` (image `-migrator`), `svc-integrator`, `migrate`,
 * dan `job-backup` berjalan sebagai root: RCE di peran mana pun = root di
 * container, dengan volume `hasil`/`cadangan` bisa-tulis, sambungan langsung ke
 * `pg`, dan (untuk integrator) kunci cadangan. Kini setiap tahap runtime
 * Dockerfile berakhir dengan `USER` non-root, dan uid-nya 1000 — pemilik semua
 * data bersama (`contract/kinds.yaml` → `results`).
 *
 * `pg` (postgres:17-alpine) TIDAK diubah, dan itu diperiksa, bukan diasumsikan:
 * hanya `docker-entrypoint.sh` yang mulai sebagai root, untuk `chown` direktori
 * data, lalu `exec gosu postgres "$BASH_SOURCE" "$@"` sebelum server jalan —
 * proses `postgres` sendiri berjalan sebagai pengguna `postgres` (uid 70).
 * Penjaga di bawah memastikan compose tidak mengganti `command`-nya ke bentuk
 * yang melewati penurunan hak itu (`gosu` hanya terjadi untuk `postgres …`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AKAR_REPO } from "./akar-sumber";
import { COMPOSE_FILES, loadCompose } from "./compose-yaml";

const DF = readFileSync(join(AKAR_REPO, "Dockerfile"), "utf8");

function tahap(nama: string): string {
  const mulai = DF.search(new RegExp(`^FROM .* AS ${nama}$`, "m"));
  expect(mulai, `tahap ${nama}`).toBeGreaterThan(-1);
  const sisa = DF.slice(mulai + 1);
  const habis = sisa.search(/^FROM /m);
  return habis > 0 ? sisa.slice(0, habis) : sisa;
}

/** `USER` TERAKHIR sebuah tahap — yang dipakai container. */
function userAkhir(nama: string): string | null {
  const semua = [...tahap(nama).matchAll(/^USER (\S+)$/gm)].map((m) => m[1]!);
  return semua.at(-1) ?? null;
}

/** Tahap yang menjadi image yang digelar (target di compose). */
const TAHAP_RUNTIME = ["runner", "runner-operator", "migrator", "backup", "integrator"];

describe("container non-root", () => {
  it("setiap tahap runtime berakhir dengan USER non-root", () => {
    for (const t of TAHAP_RUNTIME) {
      const u = userAkhir(t);
      expect(u, `tahap ${t} tanpa USER — berjalan sebagai root`).not.toBeNull();
      expect(u, t).not.toMatch(/^(root|0)(:|$)/);
    }
  });

  it("uid-nya 1000 — pemilik bersama volume `hasil`, `documents`, `audit`, `cadangan`", () => {
    expect(userAkhir("migrator")).toBe("node");
    expect(userAkhir("backup")).toBe("node");
    expect(userAkhir("runner")).toBe("node");
    expect(userAkhir("integrator")).toBe("1000:1000");
    expect(tahap("integrator")).toMatch(/useradd --uid 1000 --gid 1000/);
  });

  it("`backup` kembali ke root HANYA untuk apt, lalu turun lagi", () => {
    /* `FROM migrator` mewarisi `USER node`; tanpa `USER root` apt-get gagal saat
       build — dan tanpa `USER node` di ujung, image cadangan diam-diam root. */
    const t = tahap("backup");
    const root = t.indexOf("USER root");
    const apt = t.indexOf("apt-get install");
    const turun = t.lastIndexOf("USER node");
    expect(root).toBeGreaterThan(-1);
    expect(root).toBeLessThan(apt);
    expect(turun).toBeGreaterThan(apt);
  });

  it("direktori yang ditulis non-root dibuat di image dengan pemilik 1000", () => {
    /* Volume bernama BARU mewarisi pemilik direktori image pada pemasangan
       pertamanya — itu yang membuat pemasangan baru (on-premise) benar sejak
       hari pertama. Volume lama butuh `chown` sekali (PRODUCTION.md §Env allowlist). */
    const mig = tahap("migrator");
    for (const d of ["/app/data/hasil", "/app/data/cadangan", "/app/data/mail-outbox"]) expect(mig).toContain(d);
    expect(mig).toMatch(/chown -R node:node \/app\/data/);
    const integ = tahap("integrator");
    expect(integ).toMatch(/install -d -m 700 -o 1000 -g 1000 \/tmp\/backup/);
    expect(integ).toMatch(/-o 1000 -g 1000 \/app\/data \/app\/data\/cadangan \/app\/data\/hasil/);
    /* `/app` sendiri bukan milik pelari: kode tidak boleh bisa mengubah dirinya. */
    expect(mig).not.toMatch(/chown -R node:node \/app\s*$/m);
  });

  it("compose tidak mengembalikan root lewat `user:`", () => {
    expect(COMPOSE_FILES.length).toBeGreaterThanOrEqual(4);
    for (const f of COMPOSE_FILES) {
      for (const [n, s] of Object.entries(loadCompose(f).services ?? {})) {
        expect(String(s?.user ?? ""), `${f} → ${n}`).not.toMatch(/^(root|0)(:|$)/);
      }
    }
  });

  it("`pg` menjalankan perintah `postgres` bawaan — jalur yang diturunkan `gosu` ke pengguna postgres", () => {
    const pg = loadCompose("docker-compose.yml").services!.pg!;
    expect(pg.image).toMatch(/^postgres:17-alpine$/);
    expect(pg.entrypoint).toBeUndefined();
    /* Tanpa `command` = `postgres`. Override replika memakai `postgres -c …` — juga lewat gosu. */
    if (pg.command !== undefined) expect((pg.command as string[])[0]).toBe("postgres");
  });
});
