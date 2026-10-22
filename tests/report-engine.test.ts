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
import {
  REPORT_ENGINES,
  exportJobKind,
  reportEngine,
  type ReportEngineEntry,
} from "@/lib/report-engine";
import { REPORTS, isExportable, resolveAsOf, type ReportId } from "@/lib/report-catalog";
import { goExportPayload } from "@/lib/report-export-go";
import { isValidResultRef } from "@sai/core/job-result";
import { resultDir } from "@sai/platform/job-result-store";
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

  it("peralihan pertama tercatat: Neraca Saldo `go`, dengan bukti produksinya", () => {
    expect(reportEngine("trial-balance")).toBe("go");
    expect(REPORT_ENGINES["trial-balance"]!.parityProven).toEqual({ date: "2026-10-22", books: 17 });
  });
});

/**
 * `go` BERARTI SESUATU HANYA BILA JALUR EKSPOR MEMBACANYA.
 *
 * Penjaga ini menggantikan "jalur ekspor BELUM memanggil Go" — bukan
 * menghapusnya. Register yang menyatakan `go` sementara rute ekspor tetap
 * merakit lembar TS adalah register yang berbohong, dan kebohongannya tidak
 * menghasilkan satu galat pun: berkasnya tetap jadi, hanya dari mesin yang
 * salah. Yang dijaga: (1) rute ekspor bertanya ke register SEBELUM merakit apa
 * pun, (2) laporan `go` diterbitkan ke `report.export_go`, (3) pelari Node
 * MENOLAK laporan `go`, (4) halaman laporan `go` mengirim asalnya, dan (5)
 * bentuk hasil Go dibaca rute unduhan TS.
 */
describe("jalur berkas laporan `go` dicabut dari TypeScript", () => {
  const GO_IDS = ENTRIES.filter(([, e]) => e.engine === "go").map(([id]) => id);
  const baca = (...p: string[]) => readFileSync(join(AKAR_REPO, ...p), "utf8");

  it("ada laporan `go` — kalau tidak, penjaga di bawah tidak menjaga apa pun", () => {
    expect(GO_IDS.length).toBeGreaterThan(0);
  });

  it("rute ekspor membaca register SEBELUM merakit lembar TS", () => {
    const route = baca("src", "app", "api", "reports", "export", "route.ts");
    const tanya = route.indexOf("reportEngine(");
    const rakit = route.indexOf("buildReportSheet(payload)");
    expect(tanya, "rute ekspor tidak membaca register").toBeGreaterThan(-1);
    expect(rakit).toBeGreaterThan(-1);
    expect(tanya, "register dibaca SESUDAH lembar TS dirakit").toBeLessThan(rakit);
    expect(route).toContain("publishGoExport(");
    /* Cabang `go` pulang sebelum perakitan — tidak ada jalan mundur ke TS. */
    const cabang = route.slice(tanya, rakit);
    expect(cabang).toMatch(/status: 202/);
    expect(cabang).not.toMatch(/buildWorkbookBuffer|buildReportSheet/);
  });

  it("laporan `go` diterbitkan ke `report.export_go`, yang lain ke `report.export`", () => {
    for (const id of GO_IDS) expect(exportJobKind(id), id).toBe("report.export_go");
    for (const r of REPORTS.filter((x) => isExportable(x) && reportEngine(x.id) !== "go")) {
      expect(exportJobKind(r.id), r.id).toBe("report.export");
    }
  });

  it("penerbit Go mengirim INSTAN yang dihitung `resolveAsOf`, bukan tanggal saja", () => {
    const report = REPORTS.find((r) => r.id === "trial-balance")!;
    const now = new Date(2026, 9, 22, 10, 0, 0);
    const p = goExportPayload(report, { asOf: "2025-12-31" }, now);
    expect(p.reportId).toBe("trial-balance");
    expect(p.params.asOf).toBe("2025-12-31");
    expect(p.asOfInstant).toBe(resolveAsOf("2025-12-31", now).asOf.toISOString());
    /* Tanpa tanggal → hari ini, persis seperti layar. */
    expect(goExportPayload(report, {}, now).params.asOf).toBe(resolveAsOf(undefined, now).asOfISO);
    /* Laporan yang bukan milik Go tidak bisa diterbitkan ke jalur Go. */
    const ts = REPORTS.find((r) => isExportable(r) && reportEngine(r.id) === "ts")!;
    expect(() => goExportPayload(ts, {})).toThrow(/bukan milik mesin Go/);
  });

  it("pelari Node MENOLAK laporan `go` sebelum menghitung apa pun", () => {
    const worker = baca("workers", "interactive.ts");
    const tolak = worker.indexOf('reportEngine(report.id) === "go"');
    expect(tolak, "workers/interactive.ts tidak membaca register").toBeGreaterThan(-1);
    expect(tolak).toBeLessThan(worker.indexOf("buildReportPayload(report"));
    expect(worker.slice(tolak, tolak + 1200)).toMatch(/throw new Error/);
  });

  it("pelari Go menolak laporan yang register-nya bukan `go`", () => {
    /* Logika pelari Go jalur `interactive` di paket bersama sejak
       `svc-integrator` (22 Okt 2026); `cmd/interactive` tinggal pintu. */
    const main = baca("services", "integrator", "internal", "interactivelane", "runner.go");
    expect(main).toContain("contract.GoEngineReports[m.ReportID]");
    expect(main).toContain("contract.KindReportExportGo");
    /* Himpunannya DIBANGKITKAN dari register ini (`contract:gen --cek`). */
    const gen = baca("services", "integrator", "internal", "contract", "report_layout_gen.go");
    for (const id of GO_IDS) expect(gen, id).toContain(`"${id}"`);
  });

  it("halaman laporan `go` mengirim asalnya ke tombol Excel", () => {
    /* Tanpa `sumber`, rute ekspor menjawab 400: pekerja Go menghitung dari
       PARAMETER, dan muatan layar tidak membawa tanggalnya. */
    for (const id of GO_IDS) {
      const r = REPORTS.find((x) => x.id === id)!;
      const halaman = baca(
        "src", "app", "(app)", "(dashboard)", "t", "[tenantSlug]", "[companySlug]",
        ...(r.href ?? "").split("/").filter(Boolean),
        "page.tsx"
      );
      expect(halaman, `${r.href}/page.tsx`).toMatch(
        new RegExp(`<StatementExcelButton[\\s\\S]*?sumber=\\{\\{ reportId: "${id}"`)
      );
    }
  });

  it("bentuk hasil Go dibaca rute unduhan TS", () => {
    /* Penulis Go dan pembaca TS menyepakati jalurnya tanpa generator — maka
       keduanya dibandingkan di sini, dari teksnya. */
    expect(resultDir("report.export_go", 42)).toBe("report-export_go-42");
    expect(isValidResultRef("report-export_go-42/Neraca_Saldo_2026-10-22.xlsx")).toBe(true);

    const segmenTs = /const SEGMEN = \/(.+)\/;/.exec(baca("packages", "core", "src", "job-result.ts"))?.[1];
    const segmenGo = /resultSegment = regexp\.MustCompile\(`(.+)`\)/.exec(
      baca("services", "integrator", "internal", "document", "result.go")
    )?.[1];
    expect(segmenTs).toBeDefined();
    expect(segmenGo, "pola segmen Go ≠ SEGMEN TS").toBe(segmenTs);
  });
});
