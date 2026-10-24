/**
 * EKSPOR DATA MANDIRI SEBAGAI PEKERJAAN JALUR `bulk` (#142, 23 Okt 2026).
 *
 * Yang dijaga di sini sifat yang hilangnya TIDAK menghasilkan galat:
 *
 *   • teks pengantar arsip (`BACA-SAYA.txt`) ditulis DUA kali — TS dan Go — dan
 *     satu kalimat yang diubah di satu sisi saja adalah arsip yang berbeda
 *     tanpa satu tes Go pun memerah;
 *   • sakelar `runner:` membuka TEPAT SATU pintu: `GET` sinkron hanya bila
 *     `node`, `POST` (penerbit) hanya bila `go`;
 *   • jejak audit tenant ditulis rute Node, sebab Go tidak menulis
 *     `tenant_audit_logs`;
 *   • pintu hasil tingkat tenant: izin LEBIH DULU, lalu jenis, lalu tenant.
 *
 * Kesetaraan isi berkasnya sendiri dibuktikan `bun run parity:tenant-export`
 * atas buku sungguhan — tidak bisa dibuktikan dari teks.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AKAR_REPO } from "./akar-sumber";
import { JOB_KINDS, KIND_RUNNERS } from "@sai/core/generated/job-kinds";
import { JOB_RESULT_PERMISSION } from "@sai/core/job-result";

vi.mock("@sai/platform/job-queue", () => ({
  latestTenantJob: vi.fn(),
  publishJob: vi.fn(),
}));

const baca = (rel: string) => readFileSync(join(AKAR_REPO, rel), "utf8");

const TS_EXPORT = baca("src/lib/tenant-export.ts");
const GO_README = baca("services/integrator/internal/tenantexport/readme.go");
const RUTE = baca("src/app/api/tenant/export/route.ts");
const RUTE_HASIL = baca("src/app/api/tenant/export/jobs/[id]/result/route.ts");
const RUTE_STATUS = baca("src/app/api/tenant/export/jobs/route.ts");

/** Setiap literal string `"…\r\n"` di satu potongan sumber, tanpa kutipnya. */
function barisLiteral(potongan: string): string[] {
  return [...potongan.matchAll(/"((?:[^"\\]|\\.)*)\\r\\n"/g)].map((m) => m[1]!);
}

describe("kontrak: kind pertama jalur `bulk`", () => {
  it("`tenant.data_export` di jalur bulk, dengan sakelar pelaksana", () => {
    expect(JOB_KINDS["tenant.data_export"].lane).toBe("bulk");
    expect(JOB_KINDS["tenant.data_export"].writesLedger).toBe(false);
    expect(["node", "go"]).toContain(KIND_RUNNERS["tenant.data_export"]);
  });

  it("tidak punya pintu di rute hasil per-PT — barisnya tingkat TENANT", () => {
    expect(JOB_RESULT_PERMISSION["tenant.data_export"]).toBeNull();
  });
});

describe("BACA-SAYA.txt: satu teks, dua penulis", () => {
  it("setiap baris tetap sisi TS ada PERSIS di sisi Go", () => {
    const awal = TS_EXPORT.indexOf('"EKSPOR DATA SAI ACCOUNTING\\r\\n"');
    const akhir = TS_EXPORT.indexOf('"disimpan 10 (sepuluh) tahun.\\r\\n"');
    expect(awal, "teks BACA-SAYA sisi TS tidak ditemukan").toBeGreaterThan(0);
    const tetap = barisLiteral(TS_EXPORT.slice(awal, akhir + 40));
    /* Pemindai yang tidak menemukan apa pun LULUS dengan nol pelanggar. */
    expect(tetap.length).toBeGreaterThan(10);
    const go = new Set(barisLiteral(GO_README));
    const hilang = tetap.filter((b) => !go.has(b));
    expect(hilang, "baris BACA-SAYA yang tidak sama di readme.go").toEqual([]);
  });

  it("kalimat BERKAS-TIDAK-DITEMUKAN sama di kedua sisi", () => {
    for (const kalimat of [
      "Baris `documents` berikut ada di basis data, tetapi berkasnya tidak",
      "ditemukan di penyimpanan saat ekspor ini dibuat.",
      "id\\tnama berkas\\tkunci penyimpanan",
    ]) {
      expect(TS_EXPORT).toContain(kalimat);
      expect(GO_README).toContain(kalimat);
    }
  });
});

describe("sakelar membuka TEPAT SATU pintu", () => {
  it("GET sinkron hanya selama pelaksananya node; POST hanya bila go", () => {
    const get = RUTE.slice(RUTE.indexOf("export async function GET"), RUTE.indexOf("export async function POST"));
    const post = RUTE.slice(RUTE.indexOf("export async function POST"));
    expect(get).toMatch(/tenantExportRunner\(\) !== "node"[\s\S]*?status: 409/);
    expect(get.indexOf('tenantExportRunner() !== "node"')).toBeLessThan(get.indexOf("buildTenantExport("));
    expect(post).toMatch(/tenantExportRunner\(\) !== "go"[\s\S]*?status: 409/);
    expect(post.indexOf('tenantExportRunner() !== "go"')).toBeLessThan(post.indexOf("requestTenantExport("));
  });

  it("penerbit (Node) menulis jejak audit tenant — Go tidak bisa", () => {
    const post = RUTE.slice(RUTE.indexOf("export async function POST"));
    expect(post).toContain("writeTenantAuditLog(");
    expect(post.indexOf("requestTenantExport(")).toBeLessThan(post.indexOf("writeTenantAuditLog("));
    expect(RUTE_HASIL).toContain('action: "tenant.export.download"');
  });

  it("izin tenant di ketiga rute", () => {
    for (const r of [RUTE, RUTE_HASIL, RUTE_STATUS]) {
      expect(r).toContain('requireTenantApiPermission("tenant.export")');
    }
  });
});

describe("pintu hasil tingkat tenant", () => {
  it("izin SEBELUM barisnya dibaca, lalu jenis, lalu tenant", () => {
    const izin = RUTE_HASIL.indexOf("requireTenantApiPermission(");
    const baris = RUTE_HASIL.indexOf("jobForDownload(id)");
    const jenis = RUTE_HASIL.indexOf("job.kind !== TENANT_EXPORT_KIND");
    const tenant = RUTE_HASIL.indexOf("job.tenantId !== authz.tenant.tenantId");
    expect(izin).toBeGreaterThan(0);
    expect(izin).toBeLessThan(baris);
    expect(baris).toBeLessThan(jenis);
    expect(jenis).toBeLessThan(tenant);
    expect(RUTE_HASIL).toContain("job.tenantId === null");
  });

  it("di-stream, `attachment`, tidak di-cache, tidak pernah 302", () => {
    expect(RUTE_HASIL).toContain("createReadStream(absolute)");
    expect(RUTE_HASIL).toContain("attachment;");
    expect(RUTE_HASIL).toContain("private, no-store");
    expect(RUTE_HASIL).not.toMatch(/redirect\(|status: 30[1278]/);
  });

  it("rute status tidak memulangkan payload, last_error, atau result_ref", () => {
    const kode = RUTE_STATUS.slice(RUTE_STATUS.indexOf("import "));
    expect(kode).not.toMatch(/payload|lastError|resultRef|last_error|result_ref/);
  });
});

describe("keadaan layar", () => {
  it("`failed` antrean = masih berjalan (menunggu percobaan berikutnya)", async () => {
    const { tenantExportState } = await import("@/lib/tenant-export-job");
    expect(tenantExportState("queued", false)).toBe("queued");
    expect(tenantExportState("claimed", false)).toBe("running");
    expect(tenantExportState("failed", false)).toBe("running");
    expect(tenantExportState("done", true)).toBe("ready");
    expect(tenantExportState("done", false)).toBe("failed");
    expect(tenantExportState("dead", false)).toBe("failed");
  });

  it("ekspor yang masih berjalan DIPAKAI ULANG, bukan digandakan", async () => {
    const queue = await import("@sai/platform/job-queue");
    const { requestTenantExport } = await import("@/lib/tenant-export-job");
    vi.mocked(queue.latestTenantJob).mockResolvedValueOnce({ id: 41, status: "claimed" } as never);
    expect(await requestTenantExport(7)).toEqual({ jobId: 41, reused: true });
    expect(queue.publishJob).not.toHaveBeenCalled();

    vi.mocked(queue.latestTenantJob).mockResolvedValueOnce({ id: 41, status: "done" } as never);
    vi.mocked(queue.publishJob).mockResolvedValueOnce({ id: 42 });
    expect(await requestTenantExport(7)).toEqual({ jobId: 42, reused: false });
    expect(queue.publishJob).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "tenant.data_export", tenantId: 7, companyId: null })
    );
  });
});
