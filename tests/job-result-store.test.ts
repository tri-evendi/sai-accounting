/**
 * PENJAGA PERILAKU penyimpanan hasil — dijalankan atas berkas SUNGGUHAN.
 *
 * ══ KENAPA INI BUKAN PENJAGA TEKS ══════════════════════════════════════════
 * `tests/job-result-authorization.test.ts` menjaga SIFAT berkasnya: urutan
 * pemeriksaan, ketiadaan redirect, bentuk `result_ref`. Yang TIDAK bisa dijaga
 * dengan membaca kode adalah dua jaminan `pruneOrphanResults`, dan ia
 * satu-satunya fungsi di jalur ini yang MENGHAPUS:
 *
 *   1. hasil pekerjaan yang masih BERJALAN tidak boleh terbuang. `writeJobResult`
 *      menulis berkasnya lebih dulu dan `completeJob` menulis `result_ref`
 *      sesudahnya, jadi ada jendela nyata di mana direktorinya ada sementara
 *      kolomnya masih NULL;
 *   2. direktori yang BARU tidak boleh terbuang, apa pun kata himpunannya.
 *
 * Keduanya hanya bisa dibuktikan dengan benar-benar menulis, menua-kan, lalu
 * memanggil pembersihnya — dan karena itu akar penyimpanannya bisa disuntik.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  pruneOrphanResults,
  removeJobResults,
  resolveResultPath,
  resultDir,
  resultSize,
  writeJobResult,
} from "@sai/platform/job-result-store";

let akar: string;

beforeEach(async () => {
  akar = await mkdtemp(join(tmpdir(), "hasil-uji-"));
});

/** Menua-kan sebuah direktori supaya pagar umur bisa diuji. */
async function tuakan(nama: string, hariLalu: number): Promise<void> {
  const saat = new Date(Date.now() - hariLalu * 86_400_000);
  await utimes(join(akar, nama), saat, saat);
}

describe("menulis hasil", () => {
  it("memulangkan `result_ref` dua segmen dan menulis byte-nya", async () => {
    const ref = await writeJobResult(
      "report.export",
      12,
      "Neraca_2026-10-20.xlsx",
      new TextEncoder().encode("isi lembar sebar"),
      { akar }
    );
    expect(ref).toBe("report-export-12/Neraca_2026-10-20.xlsx");

    const isi = await readFile(join(akar, ref), "utf8");
    expect(isi).toBe("isi lembar sebar");
    expect(await resultSize(ref, { akar })).toBe("isi lembar sebar".length);
  });

  it("TIDAK meninggalkan berkas `.partial`", async () => {
    const ref = await writeJobResult("report.export", 3, "a.xlsx", new Uint8Array([1]), { akar });
    const isi = await readdir(join(akar, resultDir("report.export", 3)));
    expect(isi).toEqual([ref.split("/")[1]]);
  });

  it("menolak nama berkas yang menyusun jalur", async () => {
    /* Nama hasil sebagiannya berasal dari muatan pekerjaan — yaitu dari luar.
       Nilai yang menyusun JALUR BERKAS diperiksa apa pun asalnya. */
    for (const jahat of ["../keluar.pdf", "a/b.pdf", "", ".", "..", "x\u0000.pdf"]) {
      await expect(
        writeJobResult("report.export", 1, jahat, new Uint8Array([1]), { akar }),
        jahat
      ).rejects.toThrow();
    }
  });

  it("menolak jobId yang tidak sah", async () => {
    for (const id of [0, -1, 1.5, Number.NaN]) {
      expect(() => resultDir("report.export", id), String(id)).toThrow();
    }
  });

  it("dua pekerjaan berbeda tidak bertabrakan walau namanya sama", async () => {
    /* Dua ekspor dari dua PT di detik yang sama menghasilkan nama berkas yang
       sama; `jobId` di direktorinya yang memisahkan keduanya. */
    const a = await writeJobResult("report.export", 1, "Neraca.xlsx", new TextEncoder().encode("A"), { akar });
    const b = await writeJobResult("report.export", 2, "Neraca.xlsx", new TextEncoder().encode("B"), { akar });
    expect(a).not.toBe(b);
    expect(await readFile(join(akar, a), "utf8")).toBe("A");
    expect(await readFile(join(akar, b), "utf8")).toBe("B");
  });
});

describe("membaca hasil: jalur di luar akar tidak pernah terselesaikan", () => {
  it("`null` untuk bentuk yang tidak dikenal", () => {
    for (const jahat of ["../x/y", "/etc/passwd", "a//b", "a\\b", "a/b/c", "satu"]) {
      expect(resolveResultPath(jahat, { akar }), jahat).toBeNull();
    }
  });

  it("jalurnya benar-benar di bawah akar", () => {
    const p = resolveResultPath("report-export-9/a.xlsx", { akar });
    expect(p).toBe(join(akar, "report-export-9", "a.xlsx"));
  });

  it("`null` untuk berkas yang barisnya ada tapi berkasnya tidak", async () => {
    /* Basis data dipulihkan tanpa volumenya, atau cakramnya dibersihkan. */
    expect(await resultSize("report-export-99/hilang.xlsx", { akar })).toBeNull();
  });

  it("`null` untuk direktori, bukan berkas", async () => {
    await mkdir(join(akar, "report-export-5", "bukan-berkas.xlsx"), { recursive: true });
    expect(await resultSize("report-export-5/bukan-berkas.xlsx", { akar })).toBeNull();
  });
});

describe("pembersih yatim: dua pagar yang kesalahannya berarti MENGHAPUS", () => {
  it("membuang direktori yang barisnya sudah tidak ada", async () => {
    await writeJobResult("report.export", 7, "a.xlsx", new Uint8Array([1]), { akar });
    await tuakan("report-export-7", 3);

    const dibuang = await pruneOrphanResults(new Set([1, 2, 3]), 86_400_000, { akar });
    expect(dibuang).toEqual(["report-export-7"]);
    expect(await readdir(akar)).toEqual([]);
  });

  it("TIDAK membuang direktori yang barisnya masih ada", async () => {
    await writeJobResult("report.export", 7, "a.xlsx", new Uint8Array([1]), { akar });
    await tuakan("report-export-7", 30);

    const dibuang = await pruneOrphanResults(new Set([7]), 86_400_000, { akar });
    expect(dibuang).toEqual([]);
    expect(await readdir(akar)).toEqual(["report-export-7"]);
  });

  it("PAGAR 1 — hasil pekerjaan yang masih berjalan tetap ada", async () => {
    /*
     * Inti *race*-nya: `writeJobResult` lebih dulu, `completeJob` menulis
     * `result_ref` sesudahnya. Himpunan id karena itu WAJIB memuat seluruh id
     * yang ada di `jobs` — bukan hanya yang punya `result_ref`. Pekerjaan #8
     * di bawah sedang berjalan: barisnya ada, `result_ref`-nya belum.
     */
    await writeJobResult("report.export", 8, "sedang-jalan.xlsx", new Uint8Array([1]), { akar });
    await tuakan("report-export-8", 30);

    const dibuang = await pruneOrphanResults(new Set([8]), 86_400_000, { akar });
    expect(dibuang, "hasil pekerjaan yang masih berjalan terbuang").toEqual([]);
  });

  it("PAGAR 2 — direktori yang BARU tidak dibuang walau barisnya tidak ada", async () => {
    /* Menutup sisa *race* apa pun yang belum terpikirkan: hasil yang baru
       ditulis beberapa detik lalu hampir pasti milik pekerjaan yang sedang
       berjalan, dan pembersih tidak punya alasan untuk tergesa-gesa. */
    await writeJobResult("report.export", 9, "baru.xlsx", new Uint8Array([1]), { akar });

    const dibuang = await pruneOrphanResults(new Set(), 86_400_000, { akar });
    expect(dibuang, "direktori yang baru ditulis terbuang").toEqual([]);
    expect(await readdir(akar)).toEqual(["report-export-9"]);
  });

  it("MELEWATI nama yang bukan miliknya", async () => {
    /* Direktori yang bukan milik kita tidak boleh disentuh pembersih kita —
       aturan yang sama dengan pemangkas cadangan di jalur `tenant`. */
    for (const nama of ["arsip-manual", "README.txt", "tanpa-angka-", "x-abc"]) {
      await mkdir(join(akar, nama), { recursive: true });
      await tuakan(nama, 90);
    }
    const dibuang = await pruneOrphanResults(new Set(), 86_400_000, { akar });
    expect(dibuang).toEqual([]);
    expect((await readdir(akar)).sort()).toEqual(
      ["README.txt", "arsip-manual", "tanpa-angka-", "x-abc"].sort()
    );
  });

  it("akar yang belum ada bukan kegagalan", async () => {
    /* Volume yang baru dibuat datang kosong, dan container yang tidak memasang
       volume `hasil` sama sekali tidak melakukan apa pun. */
    const belumAda = join(akar, "belum-ada");
    expect(await pruneOrphanResults(new Set([1]), 86_400_000, { akar: belumAda })).toEqual([]);
  });

  it("membuang SELURUH isi direktori, bukan hanya berkas teratas", async () => {
    /* Paket laporan menghasilkan beberapa berkas dalam satu putaran. */
    await writeJobResult("report.package", 11, "a.xlsx", new Uint8Array([1]), { akar });
    await writeJobResult("report.package", 11, "b.xlsx", new Uint8Array([1]), { akar });
    await tuakan("report-package-11", 3);

    expect(await pruneOrphanResults(new Set(), 86_400_000, { akar })).toEqual([
      "report-package-11",
    ]);
    expect(await readdir(akar)).toEqual([]);
  });
});

describe("membuang hasil satu pekerjaan", () => {
  it("idempoten — memanggilnya dua kali tidak melempar", async () => {
    await writeJobResult("report.export", 4, "a.xlsx", new Uint8Array([1]), { akar });
    await removeJobResults("report.export", 4, { akar });
    await removeJobResults("report.export", 4, { akar });
    expect(await readdir(akar)).toEqual([]);
  });

  it("tidak menyentuh hasil pekerjaan lain", async () => {
    await writeJobResult("report.export", 4, "a.xlsx", new Uint8Array([1]), { akar });
    await writeJobResult("report.export", 5, "b.xlsx", new Uint8Array([1]), { akar });
    await removeJobResults("report.export", 4, { akar });
    expect(await readdir(akar)).toEqual(["report-export-5"]);
  });

  it("berkasnya ditulis dengan mode yang tidak bisa dibaca siapa pun lain", async () => {
    /* Isinya buku besar satu PT. Mode 600 bukan pengganti izin — ia hanya
       menghapus satu kelas kesalahan di mesin yang dipakai bersama. */
    const ref = await writeJobResult("report.export", 6, "a.xlsx", new Uint8Array([1]), { akar });
    const info = await stat(join(akar, ref));
    expect(info.mode & 0o077).toBe(0);
  });
});

describe("akar bawaan: di luar `public/`", () => {
  it("tidak ada satu pun jalur hasil di bawah `public/`", async () => {
    /* Berkas statis TIDAK melewati satu pun penjaga — pelajaran #367. */
    const p = resolveResultPath("report-export-1/a.xlsx");
    expect(p).not.toBeNull();
    expect(p!).not.toMatch(/[/\\]public[/\\]/);
    expect(p!).toMatch(/[/\\]data[/\\]hasil[/\\]/);
  });

  it("berkas sementara di akar uji tidak mengotori repo", async () => {
    // Penjaga atas tes ini sendiri: seam akar memang dipakai.
    await writeFile(join(akar, "bukti.txt"), "x");
    expect(akar).not.toContain("sai-luckyhands");
  });
});
