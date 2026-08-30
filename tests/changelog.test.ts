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

const ROOT = join(__dirname, "..");

const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  version: string;
};

/** Judul rilis: `## <versi> — <tanggal> (<sha>)`. */
const JUDUL_RILIS = /^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2}) \(([0-9a-f]{7,40})\)$/gm;

const rilis = [...changelog.matchAll(JUDUL_RILIS)].map(([, versi, tanggal, sha]) => ({
  versi,
  tanggal,
  sha,
}));

describe("riwayat perubahan", () => {
  it("punya setidaknya satu rilis tercatat", () => {
    expect(rilis.length).toBeGreaterThan(0);
  });

  it("versi di package.json adalah rilis teratas — nomor di layar punya catatannya", () => {
    expect(rilis[0]?.versi).toBe(version);
  });

  it("tidak mencatat versi yang sama dua kali", () => {
    const versi = rilis.map((r) => r.versi);
    expect(versi).toEqual([...new Set(versi)]);
  });

  it("rilis tersusun dari yang terbaru ke yang terlama", () => {
    const tanggal = rilis.map((r) => r.tanggal);
    expect(tanggal).toEqual([...tanggal].sort().reverse());
  });

  it("setiap rilis punya isi, bukan judul kosong", () => {
    // Sebuah rilis yang judulnya ada tetapi badannya kosong adalah rilis yang
    // "dicatat" tanpa mengatakan apa pun — bentuk kegagalan yang paling mungkin
    // begitu menaikkan versi terasa seperti formalitas.
    const bagian = changelog.split(/^## /m).slice(1);
    for (const b of bagian) {
      const [judul, ...badan] = b.split("\n");
      if (!/^\d+\.\d+\.\d+ /.test(judul)) continue;
      expect(badan.join("\n").trim().length, `rilis ${judul} tidak punya isi`).toBeGreaterThan(40);
    }
  });
});
