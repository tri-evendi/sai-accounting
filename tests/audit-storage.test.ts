/**
 * PENJAGA #370 — jejak audit PERUSAHAAN tidak ditulis ke berkas lagi.
 *
 * Sapuan sumber, idiom yang sama dengan `tests/no-public-uploads.test.ts` (#367)
 * dan karena sebab yang sama: keadaan per-perusahaan yang hidup di luar basis
 * data PT-nya tidak ikut ekspor mandiri, tidak ikut penghancuran buku, dan
 * membuat dua proses saling menimpa baris. Ketiganya tidak terlihat saat
 * kodenya ditulis — mereka terlihat berbulan-bulan kemudian, di data orang lain.
 *
 * ⚠ DUA jejak lain SENGAJA dikecualikan, dan keduanya bukan kelalaian:
 *
 *   • `lib/tenant-audit.ts` — jejak TENANT. Ia mencatat peristiwa yang terjadi
 *     SEBELUM PT pertama ada (pendaftaran, verifikasi surel), dan harus SELAMAT
 *     dari penghancuran buku — ia yang mencatat penghancuran itu. Rumahnya
 *     karena itu basis data KENDALI, bukan basis data PT.
 *   • `lib/operator/audit.ts` — jejak BIDANG OPERATOR. Ia hidup di luar
 *     ketenantan pelanggan sama sekali (host sendiri, sesi sendiri, #154), dan
 *     doktrin #137 melarang kode penagihan/operator diseret ke penjaga
 *     pelanggan. Ia tidak punya basis data PT untuk ditinggali.
 *
 * Keduanya pantas pindah ke basis data kendali di issue tersendiri. Sampai itu,
 * pengecualiannya ditulis DI SINI — sebuah pengecualian yang harus disebut
 * namanya tidak bisa diam-diam terlupakan.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

/** Berkas yang BOLEH menyentuh `data/audit` — beserta alasannya. */
const ALLOWED = new Set([
  // Jejak TENANT — rumahnya basis data kendali, bukan basis data PT.
  path.join(SRC, "lib", "tenant-audit.ts"),
  // Jejak BIDANG OPERATOR — di luar ketenantan pelanggan (#154/#137).
  path.join(SRC, "lib", "operator", "audit.ts"),
]);

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      found.push(...(await sourceFiles(full)));
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** Menyusun jalur ke dalam `data/audit`, dalam bentuk apa pun yang dipakai repo. */
const AUDIT_PATH = /["'`]audit["'`]\s*\)|data\/audit|audit\.jsonl/;

describe("jejak audit perusahaan tidak lagi berupa berkas (#370)", () => {
  it("tidak ada berkas di src/ yang menyentuh data/audit selain jejak tenant", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC)) {
      if (ALLOWED.has(file)) continue;
      const source = (await readFile(file, "utf8"))
        // Komentar dilucuti: berkas yang MENJELASKAN perpindahan ini bukan
        // berkas yang menulis ke sana.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (AUDIT_PATH.test(source)) offenders.push(path.relative(process.cwd(), file));
    }

    expect(
      offenders,
      "Jejak audit perusahaan hidup di tabel `audit_logs` di basis data PT-nya. " +
        "Berkas di `data/audit/` tidak ikut ekspor mandiri, tidak ikut penghancuran " +
        "buku, dan rusak begitu ada dua instance — lihat kepala src/lib/audit.ts."
    ).toEqual([]);
  });

  it("skrip pemindahan membaca baris demi baris, bukan seluruh berkas", async () => {
    const script = await readFile(
      path.join(process.cwd(), "scripts", "migrate-audit.ts"),
      "utf8"
    );
    // Berkas terbesar yang pernah ada, di mesin yang sedang menjalankan
    // produksi — persis keadaan yang tidak boleh ditelan sekaligus.
    expect(script).toContain("createReadStream");
    expect(script).toContain("createInterface");
    expect(script).not.toMatch(/\breadFile\(/);
    // Idempotensi lewat constraint, bukan periksa-lalu-tulis.
    expect(script).toContain("skipDuplicates: true");
    // Berkasnya diganti nama, tidak dihapus.
    expect(script).toContain("rename(");
    expect(script).not.toMatch(/\brm\(|\bunlink\(/);
  });
});
