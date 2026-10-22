/**
 * PENJAGA penyelia `svc-worker` (`scripts/run-workers.ts`): SATU PERAN MATI =
 * CONTAINER MATI, BUKAN-NOL.
 *
 * Sejak "1 image = 1 container" (22 Okt 2026) empat peran latar Node hidup di
 * satu container. Kegagalan yang dijaga adalah yang paling senyap: container
 * "Up", tiga peran bekerja, dan peran keempat — mis. pelari `ledger`, satu-
 * satunya penulis buku di latar — sudah mati sejak kemarin. Penyelia yang
 * keluar bukan-nol membuat `restart: unless-stopped` menghidupkan keempatnya
 * utuh, dan kematiannya tercatat.
 *
 * Diuji dengan MENJALANKAN penyelianya (bun, skrip sh sungguhan), bukan dengan
 * membaca teksnya: janji ini tentang proses dan sinyal, dan teks tidak bisa
 * membuktikan bahwa `sleep` cucu ikut berhenti.
 */
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AKAR_REPO } from "./akar-sumber";

const SKRIP = join(AKAR_REPO, "scripts", "run-workers.ts");

function jalankan(args: string[]) {
  const mulai = Date.now();
  const r = spawnSync("bun", [SKRIP, ...args], {
    cwd: AKAR_REPO,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, WORKER_LEADER_ROLES: "" },
  });
  return { ...r, ms: Date.now() - mulai };
}

describe("penyelia svc-worker", () => {
  it("peran yang GAGAL menghentikan peran lain dan keluar bukan-nol", () => {
    const r = jalankan(["panjang", "echo hidup; sleep 30", "pendek", "sleep 0.2; exit 3"]);
    expect(r.status).toBe(1);
    /* `sleep 30` di peran lain ikut berhenti — bukan ditunggu sampai habis. */
    expect(r.ms).toBeLessThan(10_000);
    expect(r.stdout).toMatch(/peran `pendek` BERAKHIR \(kode 3\)/);
  });

  it("peran yang berakhir RAPI (kode 0) tetap mengakhiri container bukan-nol", () => {
    /* Pelari jalur yang keluar "rapi" — mis. karena pagar dipegang instans
       lain — tetap berarti jalurnya kosong di container ini. */
    const r = jalankan(["panjang", "sleep 30", "rapi", "exit 0"]);
    expect(r.status).toBe(1);
    expect(r.ms).toBeLessThan(10_000);
  });

  it("setiap baris log berawalan nama perannya", () => {
    const r = jalankan(["ledger", "echo satu; echo dua >&2; sleep 0.3", "scheduler", "sleep 0.1; exit 1"]);
    expect(r.stdout).toMatch(/^ledger +\| satu$/m);
    expect(r.stderr).toMatch(/^ledger +\| dua$/m);
    expect(r.stdout).toMatch(/^penyelia +\| /m);
  });

  it("SIGTERM diteruskan ke seluruh grup proses peran, lalu keluar 0", async () => {
    const anak = spawn("bun", [SKRIP, "a", "sleep 30", "b", "sleep 30"], {
      cwd: AKAR_REPO,
      env: { ...process.env, WORKER_LEADER_ROLES: "" },
    });
    let keluaran = "";
    anak.stdout.on("data", (d) => (keluaran += String(d)));
    await new Promise<void>((resolve) => {
      const cek = setInterval(() => {
        if (keluaran.includes("memulai 2 peran")) {
          clearInterval(cek);
          resolve();
        }
      }, 20);
    });
    const mulai = Date.now();
    anak.kill("SIGTERM");
    const kode = await new Promise<number | null>((resolve) => anak.on("exit", (c) => resolve(c)));
    expect(kode).toBe(0);
    expect(Date.now() - mulai).toBeLessThan(10_000);
  });

  it("menolak argumen yang salah bentuk SEBELUM satu peran pun lahir", () => {
    expect(jalankan([]).status).toBe(2);
    expect(jalankan(["satu-saja"]).status).toBe(2);
    expect(jalankan(["Bukan_Kebab", "true"]).status).toBe(2);
    const r = spawnSync("bun", [SKRIP, "a", "true"], {
      cwd: AKAR_REPO,
      encoding: "utf8",
      timeout: 20_000,
      env: { ...process.env, WORKER_LEADER_ROLES: "salah-ketik" },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/bukan peran/);
  });
});
