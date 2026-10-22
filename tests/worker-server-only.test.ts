/**
 * PENJAGA: setiap skrip `tsx`/`bun` di `package.json` harus bisa DIMUAT di
 * luar Next — yaitu tidak membawa `server-only/index.js` yang melempar.
 *
 * ══ KEJADIANNYA (21 Okt 2026, gelar main@d1baa77f) ═════════════════════════
 * `svc-ledger` dan `svc-interactive` (kini peran di `svc-worker`) crash-loop sejak
 * detik pertama, dan tiga
 * langkah `job-scheduler` (`recurring:publish`, `backup:publish`,
 * `notify:invoice-due`) gagal setiap putaran:
 *
 *   error: This module cannot be imported from a Client Component module.
 *       at /app/node_modules/server-only/index.js:1:11
 *
 * `@sai/platform/job-queue` dan beberapa `src/lib/*` mengimpor `server-only`.
 * Paket itu cuma penanda: export `react-server`-nya `empty.js`, export
 * bawaannya `index.js` yang langsung MELEMPAR. Next memuat kode server di
 * bawah kondisi `react-server`; `tsx`/`bun` biasa tidak. Seluruh tes lulus
 * karena vitest tidak pernah memuat skrip lewat resolusi yang dipakai
 * container. Antrean tidak kehilangan apa pun — tapi tidak ada yang
 * diterbitkan, jadi juga tidak ada cadangan.
 *
 * Perbaikan pertama hanya menjaga `jobs:run:*`, dan karena itu luput tiga
 * penerbitnya. Maka penjaga ini menyapu SETIAP skrip: skrip yang membundel
 * `index.js` itu mati saat dimuat, siapa pun yang memanggilnya. Kondisi dibaca
 * dari perintah skrip itu sendiri — menghapus `--conditions=react-server`
 * dari skrip = tes ini merah.
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

const POLA = /^(?:\S+=\S+ )*(?:tsx|bun)((?: --\S+)*) ((?:scripts|workers)\/\S+\.ts)\b/;

const skrip = Object.entries(PKG.scripts)
  .filter(([nama]) => !nama.startsWith("_"))
  .map(([nama, perintah]) => ({ nama, m: perintah.match(POLA) }))
  .filter((s): s is { nama: string; m: RegExpMatchArray } => s.m !== null)
  .map(({ nama, m }) => ({
    nama,
    berkas: m[2],
    kondisi: [...m[1].matchAll(/--conditions[= ](\S+)/g)].map((k) => k[1]),
  }));

describe("skrip dimuat dengan resolusi yang sama dengan container", () => {
  it("pelari jalur & penerbit penjadwal ikut tersapu (daftar kosong = lulus diam-diam)", () => {
    const nama = skrip.map((s) => s.nama);
    for (const wajib of ["jobs:run:ledger", "jobs:run:interactive", "recurring:publish", "backup:publish"]) {
      expect(nama).toContain(wajib);
    }
  });

  it("tidak satu skrip pun membundel `server-only/index.js`", () => {
    const dir = mkdtempSync(join(tmpdir(), "script-bundle-"));
    const pelanggar: string[] = [];
    try {
      for (const { nama, berkas, kondisi } of skrip) {
        const keluar = join(dir, `${nama.replace(/\W/g, "_")}.js`);
        execFileSync(
          "bun",
          [
            "build",
            berkas,
            "--target",
            "node",
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
        if (readFileSync(keluar, "utf8").includes("// node_modules/server-only/index.js")) {
          pelanggar.push(`${nama} (${berkas})`);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(
      pelanggar,
      "skrip ini mati saat dimuat — tambahkan --conditions=react-server ke perintahnya, atau putus impor server-only-nya",
    ).toEqual([]);
  }, 180_000);
});
