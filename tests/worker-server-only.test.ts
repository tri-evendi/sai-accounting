/**
 * PENJAGA: pelari jalur di `workers/` harus bisa DIMUAT di luar Next.
 *
 * ══ KEJADIANNYA (21 Okt 2026, gelar main@d1baa77f) ═════════════════════════
 * `svc-ledger` dan `svc-interactive` crash-loop sejak detik pertama:
 *
 *   error: This module cannot be imported from a Client Component module.
 *       at /app/node_modules/server-only/index.js:1:11
 *
 * `@sai/platform/job-queue` dan beberapa `src/lib/company-*` mengimpor
 * `server-only`. Paket itu cuma penanda: export `react-server`-nya `empty.js`,
 * export bawaannya `index.js` yang langsung MELEMPAR. Next memuat kode server
 * di bawah kondisi `react-server`; `bun workers/x.ts` tidak, jadi ia memilih
 * `index.js`. Seluruh tes lulus karena vitest tidak pernah memuat worker-nya
 * lewat resolusi yang dipakai container.
 *
 * Maka skrip `jobs:run:*` menjalankan bun dengan `--conditions=react-server`,
 * dan penjaga ini MEMBUNDEL setiap worker dengan kondisi dari skrip itu sendiri
 * (bukan dari daftar salinan di sini), lalu menolak bila `index.js` yang
 * melempar ikut masuk. Menghapus flag dari skrip = tes ini merah.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";

const PKG = JSON.parse(readFileSync(join(AKAR_REPO, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

const pelari = Object.entries(PKG.scripts).filter(
  ([nama, perintah]) => nama.startsWith("jobs:run:") && /\bworkers\/\S+\.ts\b/.test(perintah),
);

describe("pelari jalur dimuat dengan resolusi yang sama dengan container", () => {
  it("ada pelari yang diperiksa (daftar kosong = penjaga yang lulus diam-diam)", () => {
    expect(pelari.length).toBeGreaterThanOrEqual(2);
  });

  it.each(pelari)("%s tidak membawa `server-only/index.js`", (_nama, perintah) => {
    const berkas = perintah.match(/\bworkers\/\S+\.ts\b/)![0];
    const kondisi = [...perintah.matchAll(/--conditions[= ](\S+)/g)].map((m) => m[1]);
    const dir = mkdtempSync(join(tmpdir(), "worker-bundle-"));
    try {
      const keluar = join(dir, "out.js");
      execFileSync(
        "bun",
        [
          "build",
          berkas,
          "--target",
          "bun",
          ...kondisi.flatMap((k) => ["--conditions", k]),
          // Klien Prisma & driver tidak relevan dengan resolusi penanda ini,
          // dan sebagian modulnya tidak terbundel tanpa berkas bangkitan.
          "--external",
          "@prisma/*",
          "--external",
          "pg",
          "--external",
          "@opentelemetry/*",
          "--outfile",
          keluar,
        ],
        { cwd: AKAR_REPO, stdio: "pipe" },
      );
      const isi = readFileSync(keluar, "utf8");
      expect(
        isi.includes("// node_modules/server-only/index.js"),
        `${berkas} memuat server-only/index.js — tambahkan --conditions=react-server ke skripnya`,
      ).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
