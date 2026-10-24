/**
 * RETENSI BERKAS HASIL — "berkas ekspor (volume `hasil`) dihapus setelah 7 hari"
 * (keputusan pemilik, docs/TATA-KELOLA.md §6).
 *
 * Sebelum ini satu-satunya penghapus berkas hasil adalah pembersih YATIM: ia
 * membuang direktori yang barisnya di `jobs` sudah hilang, dan baris `done` baru
 * hilang sesudah 14 hari — jadi setiap ekspor (laporan Node & Go, PDF berantre,
 * ekspor data mandiri tenant) hidup dua kali lebih lama daripada janji tata
 * kelolanya. Dijalankan atas berkas SUNGGUHAN di akar sementara.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import JSZip from "jszip";

import {
  isResultExpired,
  pruneExpiredResults,
  writeJobResult,
  writeJobResultStream,
} from "@sai/platform/job-result-store";
import { RESULT_RETENTION_DAYS } from "@sai/core/generated/job-numbers";
import { ZipStreamWriter, crc32 } from "@/lib/zip-stream";
import { AKAR_REPO } from "./akar-sumber";

let akar: string;
beforeEach(async () => {
  akar = await mkdtemp(join(tmpdir(), "retensi-uji-"));
});

async function tuakan(nama: string, hariLalu: number): Promise<void> {
  const saat = new Date(Date.now() - hariLalu * 86_400_000);
  await utimes(join(akar, nama), saat, saat);
}

describe("pembersih hasil kedaluwarsa", () => {
  it("bawaan 7 hari dari kontrak", () => {
    expect(RESULT_RETENTION_DAYS).toBe(7);
  });

  it("membuang direktori hasil yang lebih tua dari retensi — Node, Go, paket, tenant — dan menyisakan yang muda", async () => {
    await writeJobResult("report.export", 1, "a.xlsx", new Uint8Array([1]), { akar });
    await writeJobResult("report.export_go", 2, "b.xlsx", new Uint8Array([1]), { akar });
    await writeJobResult("report.package", 3, "c.zip", new Uint8Array([1]), { akar });
    await writeJobResult("tenant.data_export", 4, "d.zip", new Uint8Array([1]), { akar });
    await writeJobResult("report.pdf", 5, "e.pdf", new Uint8Array([1]), { akar });
    await tuakan("report-export-1", 8);
    await tuakan("report-export_go-2", 7.01);
    await tuakan("report-package-3", 30);
    await tuakan("tenant-data_export-4", 9);
    await tuakan("report-pdf-5", 6.9);

    const dibuang = await pruneExpiredResults(7, { akar });
    expect(dibuang.sort()).toEqual(["report-export-1", "report-export_go-2", "report-package-3", "tenant-data_export-4"]);
    expect(await readdir(akar)).toEqual(["report-pdf-5"]);
  });

  it("tidak menyentuh apa pun yang bukan direktori putaran (`<kind>-<jobId>`)", async () => {
    await mkdir(join(akar, "lost+found"));
    await writeFile(join(akar, "README-1"), "bukan direktori");
    await mkdir(join(akar, "cadangan-x"));
    for (const n of ["lost+found", "README-1", "cadangan-x"]) await tuakan(n, 99);
    expect(await pruneExpiredResults(7, { akar })).toEqual([]);
    expect((await readdir(akar)).sort()).toEqual(["README-1", "cadangan-x", "lost+found"]);
  });

  it("retensi yang tidak sah DITOLAK, akar yang belum ada bukan galat", async () => {
    await expect(pruneExpiredResults(0, { akar })).rejects.toThrow();
    await expect(pruneExpiredResults(1.5, { akar })).rejects.toThrow();
    expect(await pruneExpiredResults(7, { akar: join(akar, "belum-ada") })).toEqual([]);
  });

  it("`isResultExpired`: dari `finished_at` barisnya", () => {
    const now = Date.parse("2026-10-24T00:00:00Z");
    expect(isResultExpired(new Date("2026-10-16T23:59:59Z"), now, 7)).toBe(true);
    expect(isResultExpired(new Date("2026-10-17T00:00:01Z"), now, 7)).toBe(false);
    expect(isResultExpired(null, now, 7)).toBe(false);
  });

  it("dijalankan putaran upkeep pelari Node, SEBELUM pembersih yatim dan tanpa basis data", () => {
    const runner = readFileSync(join(AKAR_REPO, "workers/runner.ts"), "utf8");
    const kedaluwarsa = runner.indexOf("await pruneExpiredResults()");
    expect(kedaluwarsa).toBeGreaterThan(0);
    expect(kedaluwarsa).toBeLessThan(runner.indexOf("await jobIdsPresent()"));
  });

  it("rute unduhan per-PT dan tenant menjawab 410 `result_expired` untuk berkas yang lewat masa simpan", () => {
    for (const rel of [
      "src/app/api/t/[tenantSlug]/[companySlug]/jobs/[kind]/[id]/result/route.ts",
      "src/app/api/tenant/export/jobs/[id]/result/route.ts",
    ]) {
      const isi = readFileSync(join(AKAR_REPO, rel), "utf8");
      expect(isi, rel).toContain("isResultExpired(job.finishedAt)");
      expect(isi, rel).toContain('code: "result_expired"');
      expect(isi, rel).toContain("status: 410");
    }
    const klien = readFileSync(join(AKAR_REPO, "src/lib/report-files.ts"), "utf8");
    expect(klien).toContain("res.status === 410");
  });
});

describe("penulisan hasil yang mengalir", () => {
  it("`writeJobResultStream` menulis `.partial` lalu rename, dan membuang sisa saat gagal", async () => {
    const ref = await writeJobResultStream(
      "report.package_pdf",
      9,
      "pdf.zip",
      async (out) => {
        out.write("bagian-1;");
        out.write("bagian-2");
      },
      { akar }
    );
    expect(ref).toBe("report-package_pdf-9/pdf.zip");
    expect(await readFile(join(akar, ref), "utf8")).toBe("bagian-1;bagian-2");

    await expect(
      writeJobResultStream(
        "report.package_pdf",
        10,
        "pdf.zip",
        async (out) => {
          out.write("setengah");
          throw new Error("putus");
        },
        { akar }
      )
    ).rejects.toThrow("putus");
    expect(await readdir(join(akar, "report-package_pdf-10"))).toEqual([]);
  });

  it("ZIP yang mengalir terbaca pembaca ZIP lain, isi & CRC utuh", async () => {
    const potong: Buffer[] = [];
    const { PassThrough } = await import("node:stream");
    const out = new PassThrough();
    out.on("data", (b: Buffer) => potong.push(b));
    const zip = new ZipStreamWriter(out, new Date("2026-02-03T03:00:00Z"));
    const besar = new Uint8Array(200_000).map((_, i) => i % 251);
    await zip.addFile("00_Ringkasan_Paket.pdf", new TextEncoder().encode("%PDF-ringkasan"));
    await zip.addFile("PDF/01_Neraca.pdf", besar);
    await zip.finish();
    out.end();
    const z = await JSZip.loadAsync(Buffer.concat(potong), { checkCRC32: true });
    expect(Object.keys(z.files)).toEqual(["00_Ringkasan_Paket.pdf", "PDF/01_Neraca.pdf"]);
    expect(await z.file("00_Ringkasan_Paket.pdf")!.async("string")).toBe("%PDF-ringkasan");
    expect(Buffer.from(await z.file("PDF/01_Neraca.pdf")!.async("uint8array")).equals(Buffer.from(besar))).toBe(true);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    await expect(zip.addFile("x.pdf", new Uint8Array())).rejects.toThrow();
    const lain = new ZipStreamWriter(new PassThrough());
    await expect(lain.addFile("../luar.pdf", new Uint8Array())).rejects.toThrow();
  });
});
