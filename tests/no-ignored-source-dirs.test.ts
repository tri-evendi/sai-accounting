/**
 * TIDAK ADA DIREKTORI SUMBER YANG NAMANYA DIABAIKAN `.gitignore`/`.dockerignore`.
 *
 * `.gitignore:backups/` menangkap direktori `backups` DI MANA PUN, dan
 * `.dockerignore:**\/backups/` juga — keduanya ada untuk menjauhkan dump
 * produksi dari git dan dari image (lihat kepala `.dockerignore`). Rute
 * `/operator/backups` pernah ditulis: `git add` menolaknya (ketahuan), dan
 * kalaupun dipaksa, konteks build Docker akan membuangnya — halamannya lenyap
 * dari image produksi tanpa satu pun galat, sementara `verify` dan
 * `bun run build` lokal hijau. Nama rutenya kini `/operator/backup`.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DILARANG = new Set(["backups"]);

function direktori(dir: string): string[] {
  const keluar: string[] = [];
  for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "node_modules" || e.name === "generated") continue;
    const anak = `${dir}/${e.name}`;
    keluar.push(anak, ...direktori(anak));
  }
  return keluar;
}

describe("nama direktori sumber tidak bertabrakan dengan pola abaian", () => {
  it("tidak ada `backups/` di src/, packages/, atau scripts/", () => {
    const semua = ["src", "packages", "scripts"].flatMap(direktori);
    expect(semua).toContain("src/app");
    expect(semua.filter((d) => DILARANG.has(d.split("/").at(-1) ?? ""))).toEqual([]);
  });
});
