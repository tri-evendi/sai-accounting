/**
 * BERKAS HASIL WAJIB TERBACA PEMBACANYA — `node` (uid 1000) di `app-customer`.
 *
 * `app-customer` membaca volume `hasil` sebagai `node` (`USER node` di tahap
 * `runner`) dan berkas hasil ditulis 0600 di direktori 0700. Bila pemiliknya
 * bukan uid pembaca, setiap `stat` dari rute unduhan ditolak dan SETIAP hasil
 * berantre dijawab 404: pekerjaan `done`, berkas ada di cakram, tombol unduh
 * gagal — tanpa galat di log mana pun.
 *
 * Sejak Okt 2026 kedua penulis (peran `interactive` di `svc-worker`, pelari Go
 * di `svc-integrator`) berjalan sebagai uid 1000 SENDIRI — `USER node` di tahap
 * `migrator`, `USER 1000:1000` di tahap `integrator` — jadi berkasnya lahir
 * dengan pemilik yang benar. `chown` di kedua penulis TETAP ada dan berlaku bila
 * prosesnya root (image lama saat rollback), dan pemiliknya tetap dari kontrak.
 *
 * Penjaga ini teks, bukan perilaku: `chown` ke uid lain hanya bisa dijalankan
 * root, dan tes tidak berjalan sebagai root.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RESULT_OWNER_GID, RESULT_OWNER_UID } from "@sai/core/generated/job-numbers";
import { AKAR_REPO } from "./akar-sumber";

const baca = (...p: string[]) => readFileSync(join(AKAR_REPO, ...p), "utf8");

/** Isi satu tahap Dockerfile, dari `FROM … AS <nama>` sampai `FROM` berikutnya. */
function tahap(nama: string): string {
  const df = baca("Dockerfile");
  const mulai = df.search(new RegExp(`^FROM .* AS ${nama}$`, "m"));
  expect(mulai, `tahap ${nama}`).toBeGreaterThan(-1);
  const sisa = df.slice(mulai + 1);
  const habis = sisa.search(/^FROM /m);
  return habis > 0 ? sisa.slice(0, habis) : sisa;
}

describe("pemilik berkas hasil", () => {
  it("pembacanya `node` — uid/gid 1000 di image resmi `node:*`", () => {
    expect(tahap("runner")).toMatch(/^USER node$/m);
    expect(baca("Dockerfile")).toMatch(/^FROM node:\d+-bookworm-slim AS base$/m);
    expect(RESULT_OWNER_UID).toBe(1000);
    expect(RESULT_OWNER_GID).toBe(1000);
  });

  it("kedua penulis berjalan sebagai uid PEMBACA — 1000, sama dengan kontrak", () => {
    /* Bila suatu hari salah satunya kembali root atau pindah ke uid lain,
       penjaga ini merah: uid lain = setiap hasil 404 di rute unduhan. */
    expect(tahap("migrator")).toMatch(/^USER node$/m);
    expect(tahap("integrator")).toMatch(/^USER 1000:1000$/m);
    expect(tahap("integrator")).toMatch(/useradd --uid 1000 --gid 1000/);
  });

  it("penulis TS menyerahkan hasil ke pemiliknya bila ia root", () => {
    const store = baca("packages", "platform", "src", "job-result-store.ts");
    expect(store).toContain("chown(j, RESULT_OWNER_UID, RESULT_OWNER_GID)");
    expect(store).toMatch(/process\.getuid\(\) !== 0/);
    /* SEBELUM rename: nama sah tidak pernah terlihat dengan pemilik salah. */
    expect(store.indexOf("serahkanKePembaca(path.dirname")).toBeLessThan(
      store.indexOf("await rename(sementara, absolute)")
    );
  });

  it("penulis Go menyerahkan hasil ke pemilik yang SAMA (dari kontrak)", () => {
    const go = baca("services", "integrator", "internal", "document", "result.go");
    expect(go).toContain("os.Chown(p, contract.ResultOwnerUID, contract.ResultOwnerGID)");
    expect(go).toContain("os.Geteuid() == 0");
    expect(go.indexOf("os.Chown(")).toBeLessThan(go.indexOf("os.Rename("));
  });
});
