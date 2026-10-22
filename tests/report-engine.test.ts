/**
 * PENJAGA register pemilik mesin laporan — tahap 1d (09 §9).
 *
 * `src/lib/report-engine.ts` menyatakan, per laporan, mesin mana yang
 * menghasilkan BERKAS-nya: `ts`, `go-parity`, atau `go`. Penjaga ini menolak
 * register yang berbohong — entri yang menunjuk implementasi Go yang tidak ada,
 * skrip paritas yang tidak ada, atau perpindahan ke `go` tanpa bukti paritas.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPORT_ENGINES, reportEngine, type ReportEngineEntry } from "@/lib/report-engine";
import { REPORTS, isExportable, type ReportId } from "@/lib/report-catalog";
import { AKAR_REPO } from "./akar-sumber";

const ENTRIES = Object.entries(REPORT_ENGINES) as [ReportId, ReportEngineEntry][];
const PKG = JSON.parse(readFileSync(join(AKAR_REPO, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("register mesin laporan", () => {
  it("tidak kosong — tahap 1d sudah punya laporan pertamanya", () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
    expect(reportEngine("trial-balance")).not.toBe("ts");
  });

  it("setiap entri adalah laporan yang PUNYA jalur berkas", () => {
    /* Laporan tanpa `payloadKind` tidak punya berkas yang diunduh — memindah
       "mesin berkas"-nya adalah keputusan tentang sesuatu yang tidak ada. */
    for (const [id] of ENTRIES) {
      const def = REPORTS.find((r) => r.id === id);
      expect(def, id).toBeDefined();
      expect(isExportable(def!), id).toBe(true);
    }
  });

  it("implementasi Go yang disebut ADA", () => {
    for (const [id, e] of ENTRIES) {
      expect(e.goSource, id).toMatch(/^services\/integrator\/internal\/ledgerread\/.+\.go$/);
      expect(existsSync(join(AKAR_REPO, e.goSource)), `${id}: ${e.goSource}`).toBe(true);
    }
  });

  it("skrip paritas yang disebut ADA dan memanggil register ini", () => {
    for (const [id, e] of ENTRIES) {
      const cmd = PKG.scripts[e.parityScript];
      expect(cmd, `${id}: package.json → ${e.parityScript}`).toBeDefined();
      /* Skrip yang mengimpor `reports.ts` butuh kondisi react-server. */
      expect(cmd, e.parityScript).toContain("--conditions=react-server");
      const file = /scripts\/[\w-]+\.ts/.exec(cmd!)?.[0];
      expect(file, e.parityScript).toBeDefined();
      const src = readFileSync(join(AKAR_REPO, file!), "utf8");
      expect(src, file).toContain("runWithCompany");
      expect(src, file).toContain("reportEngine(");
    }
  });

  it("`go` hanya dengan bukti paritas atas buku sungguhan", () => {
    /* Perpindahan `go-parity` → `go` adalah keputusan, dan buktinya ditulis
       DI ENTRI yang sama — bukan di pesan commit yang tak dibaca orang. */
    for (const [id, e] of ENTRIES) {
      if (e.engine !== "go") continue;
      expect(e.parityProven, id).toBeDefined();
      expect(e.parityProven!.date, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.parityProven!.books, id).toBeGreaterThan(0);
    }
  });

  it("jalur ekspor BELUM memanggil Go — perpindahan menunggu paritas produksi", () => {
    /* Selama tidak satu entri pun `go`, jalur berkas masih sepenuhnya TS.
       Begitu ada entri `go`, tes ini wajib diganti dengan penjaga yang
       memastikan jalur ekspor MEMBACA register — bukan dihapus. */
    const payload = readFileSync(join(AKAR_REPO, "src", "lib", "report-payload.ts"), "utf8");
    expect(ENTRIES.some(([, e]) => e.engine === "go")).toBe(false);
    expect(payload).not.toMatch(/ledgerread|cmd\/parity/);
  });
});
