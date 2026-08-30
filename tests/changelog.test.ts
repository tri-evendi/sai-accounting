/**
 * Penjaga riwayat perubahan (`CHANGELOG.md`).
 *
 * ══ Apa yang sebenarnya dijaga ═════════════════════════════════════════════
 * BUKAN "changelog-nya bagus" — itu tidak bisa diperiksa mesin. Yang dijaga
 * adalah satu hal yang bisa: **nomor versi yang tampil di layar harus punya
 * catatan.**
 *
 * Kaki menu samping menampilkan `v{APP_VERSION}`, dan komentar di
 * `lib/constants.ts` menyatakan alasannya — nomor itu yang disebut orang saat
 * melaporkan masalah. Selama 125 rilis nomor itu adalah `0.1.0` yang tidak
 * pernah bergerak, jadi ia menjawab "versi berapa?" dengan jawaban yang sama
 * untuk setiap rilis yang pernah ada. Bukan salah render: tidak ada yang
 * pernah menaikkannya, sebab tidak ada apa pun yang menuntutnya.
 *
 * Tes ini yang menuntutnya. Menaikkan `package.json` tanpa menulis catatan
 * membuatnya merah; menulis catatan tanpa menaikkan versi juga merah. Keduanya
 * hanya bisa lolos bersama-sama — dan itulah satu-satunya bentuk yang membuat
 * berkas semacam ini tidak berhenti diperbarui di rilis ketiga.
 *
 * ⚠ Sudah dilihat MERAH sebelum dianggap selesai: `package.json` sempat
 * dinaikkan ke 0.3.0 tanpa judul yang cocok, dijalankan, lalu dikembalikan.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RILIS } from "@/lib/changelog";
import { bangunChangelog } from "../scripts/build-changelog";

const ROOT = join(__dirname, "..");

const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  version: string;
};

describe("riwayat perubahan — sumber tunggal", () => {
  it("CHANGELOG.md sama persis dengan keluaran generatornya", () => {
    // Berkas markdown adalah TURUNAN, bukan sumber. Menyuntingnya langsung
    // melahirkan sumber kedua — dan sumber kedua adalah cara halaman "Apa yang
    // Baru" di dalam aplikasi mulai berbeda dari yang dibaca orang di GitHub.
    expect(
      changelog,
      "CHANGELOG.md tidak sinkron — ubah src/lib/changelog.ts lalu jalankan: bun run changelog:build"
    ).toBe(bangunChangelog());
  });

  it("versi di package.json adalah rilis teratas di sumber bertipe", () => {
    expect(RILIS[0]?.versi).toBe(version);
  });

  it("rilis di sumber tersusun dari yang terbaru ke yang terlama", () => {
    const tanggal = RILIS.map((r) => r.tanggal);
    expect(tanggal).toEqual([...tanggal].sort().reverse());
  });

  it("setiap rilis punya ringkasan dan setidaknya satu butir", () => {
    for (const r of RILIS) {
      expect(r.ringkas.trim().length, `rilis ${r.versi} tanpa ringkasan`).toBeGreaterThan(20);
      expect(r.butir.length, `rilis ${r.versi} tanpa butir`).toBeGreaterThan(0);
      for (const b of r.butir) {
        expect(b.teks.trim().length, `butir kosong di ${r.versi}`).toBeGreaterThan(20);
      }
    }
  });

  it("sha, bila ada, berbentuk commit yang sah", () => {
    for (const r of RILIS) {
      if (r.sha === undefined) continue;
      expect(r.sha, `sha ${r.versi} bukan commit`).toMatch(/^[0-9a-f]{7,40}$/);
    }
  });

  it("hanya rilis TERATAS yang boleh belum punya sha", () => {
    // Yang di bawahnya sudah digelar menurut definisi — ia dilewati rilis
    // berikutnya. Entri lama tanpa sha berarti seseorang lupa mengisinya, dan
    // riwayat yang tak bisa ditelusuri berhenti menjadi riwayat.
    const tanpaSha = RILIS.map((r, i) => ({ i, versi: r.versi, sha: r.sha }))
      .filter((r) => r.sha === undefined && r.i > 0)
      .map((r) => r.versi);
    expect(tanpaSha, "rilis lama tanpa sha").toEqual([]);
  });

  it("nomor versi tidak diulang", () => {
    const versi = RILIS.map((r) => r.versi);
    expect(versi).toEqual([...new Set(versi)]);
  });
});

describe("riwayat perubahan — markdown turunan", () => {
  it("menyatakan dirinya bangkitan, supaya tak ada yang menyuntingnya", () => {
    // Satu-satunya pemeriksaan yang tersisa atas markdown, dan sengaja BUKAN
    // pengurai format. Versi sebelumnya mengurai judul rilis dengan regex
    // sendiri — pengurai KEDUA untuk format yang sama, yang langsung merah
    // begitu format itu berubah secara sah (rilis tanpa sha). Kesamaan isinya
    // sudah dijamin tes sinkron di atas; yang belum, cuma peringatannya.
    expect(changelog).toContain("DIBANGKITKAN dari src/lib/changelog.ts");
    expect(changelog).toContain("bun run changelog:build");
  });
});
