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
import { REPORTS, isExportable, resolveAsOf, resolvePeriod, type ReportId } from "@/lib/report-catalog";
import { COMPARABLE_REPORTS, goExportPayload, goExportPayloadShape } from "@/lib/report-export-go";
import { comparisonDate, comparisonRange } from "@/lib/statement-compare";
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

  it("`go` hanya untuk laporan yang PUNYA jalur berkas", () => {
    /* Laporan tanpa `payloadKind` tidak punya berkas yang diunduh — memindah
       "mesin berkas"-nya ke `go` adalah keputusan tentang sesuatu yang tidak
       ada. Laporan seperti itu BOLEH `go-parity` (23 Okt 2026, Laporan
       Perubahan Ekuitas): implementasi Go kedua yang hidup berdampingan dengan
       layar TS wajib tercatat di register beserta skrip paritas ANGKA-nya —
       menyembunyikannya dari register justru kelas kegagalan yang register ini
       cegah (09 §3.3). */
    for (const [id, e] of ENTRIES) {
      const def = REPORTS.find((r) => r.id === id);
      expect(def, id).toBeDefined();
      if (!isExportable(def!)) expect(e.engine, `${id} tanpa berkas`).toBe("go-parity");
    }
    /* Laporan Perubahan Ekuitas BERBERKAS sejak keputusan pemilik 23 Okt 2026
       (Excel & PDF seperti laporan keuangan lain) — dan tetap `go-parity`
       sampai sesi utama menjalankan paritas angka DAN isi berkasnya atas buku
       produksi. */
    expect(isExportable(REPORTS.find((r) => r.id === "equity-changes")!)).toBe(true);
    expect(reportEngine("equity-changes")).toBe("go");
    expect(REPORT_ENGINES["equity-changes"]!.parityProven).toEqual({ date: "2026-10-23", books: 17 });
    expect(exportJobKind("equity-changes")).toBe("report.export_go");
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

  it("Laba Rugi & Neraca: `go` — paritas PRODUKSI tercatat bersama peralihannya", () => {
    for (const id of ["income-statement", "balance-sheet"] as const) {
      expect(reportEngine(id), id).toBe("go");
      /* Bukti ditulis bersama perpindahan ke `go`, bukan sebelumnya — bukti
         yang mendahului paritasnya bohong (22 Okt 2026, 17 buku produksi). */
      expect(REPORT_ENGINES[id]!.parityProven, id).toEqual({ date: "2026-10-22", books: 17 });
      expect(exportJobKind(id), id).toBe("report.export_go");
    }
    /* Setiap laporan BERBERKAS di register punya skrip paritas ISI berkas
       juga (`-xlsx`) — pelajaran Neraca Saldo: angka setara belum berarti
       berkas setara. Laporan tanpa berkas tidak punya isi untuk dibandingkan. */
    for (const [id, e] of ENTRIES) {
      if (!isExportable(REPORTS.find((r) => r.id === id)!)) continue;
      expect(PKG.scripts[`${e.parityScript}-xlsx`], `${id}: ${e.parityScript}-xlsx`).toBeDefined();
    }
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
    /* Laporan yang bukan milik Go tidak bisa diterbitkan ke jalur Go. Sejak
       gelombang A + laporan stok, SETIAP laporan berberkas tercatat di
       register — yang belum `go` kini `go-parity`, jadi yang diuji adalah
       "bukan `go`", bukan "`ts`". Bila semuanya kelak `go`, uji ini tidak
       punya contoh lagi dan pernyataannya cukup dilewati. */
    const bukanGo = REPORTS.find((r) => isExportable(r) && reportEngine(r.id) !== "go");
    if (bukanGo) expect(() => goExportPayload(bukanGo, {})).toThrow(/bukan milik mesin Go/);
  });

  it("bentuk muatan laporan BERPERIODE (Laba Rugi) — instan dari `resolvePeriod`", () => {
    const report = REPORTS.find((r) => r.id === "income-statement")!;
    const now = new Date(2026, 9, 22, 10, 0, 0);
    /* Rentang terbalik DITUKAR oleh resolvePeriod — Go menerima hasilnya. */
    const p = goExportPayloadShape(report, { from: "2026-06-30", to: "2026-01-01", costCenter: "3" }, now);
    const r = resolvePeriod("2026-06-30", "2026-01-01", now);
    expect(p.params).toEqual({ from: r.fromISO, to: r.toISO, costCenter: "3" });
    expect(p.fromInstant).toBe(r.from.toISOString());
    expect(p.toInstant).toBe(r.to.toISOString());
    expect(p.asOfInstant).toBeUndefined();
    /* Sejak `go`, penerbitnya menerima laporan berperiode lewat jalur yang sama. */
    expect(goExportPayload(report, {}, now).reportId).toBe("income-statement");
  });

  it("kolom pembanding (#557) ikut muatan Go — instan dari `comparisonRange`/`comparisonDate`", () => {
    const now = new Date(2026, 9, 22, 10, 0, 0);
    const is = REPORTS.find((r) => r.id === "income-statement")!;
    const p = goExportPayloadShape(is, { from: "2026-01-01", to: "2026-06-30", compare: "previous_year" }, now);
    const { from, to } = resolvePeriod("2026-01-01", "2026-06-30", now);
    const r = comparisonRange(from, to, "previous_year");
    expect(p.params.compare).toBe("previous_year");
    expect(p.priorFromInstant).toBe(r.from.toISOString());
    expect(p.priorToInstant).toBe(r.to.toISOString());

    const bs = REPORTS.find((x) => x.id === "balance-sheet")!;
    const q = goExportPayloadShape(bs, { asOf: "2026-06-30", compare: "preceding" }, now);
    expect(q.priorAsOfInstant).toBe(comparisonDate(resolveAsOf("2026-06-30", now).asOf, "preceding").toISOString());

    /* Mode tak dikenal DIBUANG (seperti halaman: laporan biasa), dan laporan
       tanpa pembanding tidak membawa `compare` sama sekali. */
    const asing = goExportPayloadShape(is, { from: "2026-01-01", to: "2026-06-30", compare: "bulan_lalu" }, now);
    expect(asing.params).not.toHaveProperty("compare");
    expect(asing.priorFromInstant).toBeUndefined();
    const tb = REPORTS.find((x) => x.id === "trial-balance")!;
    const nt = goExportPayloadShape(tb, { asOf: "2026-06-30", compare: "previous_year" }, now);
    expect(nt.params).not.toHaveProperty("compare");
    expect(nt.priorAsOfInstant).toBeUndefined();
  });

  it("halaman laporan komparatif mengirim asal BESERTA `compare` ke tombol Excel", () => {
    /* Begitu register beralih ke `go`, lembar sebarnya dihitung dari
       PARAMETER — `compare` yang tertinggal di halaman berarti berkas tanpa
       kolom pembanding, tanpa satu galat pun. Dijaga SELAGI `go-parity`,
       supaya peralihannya hanya menyunting register. */
    for (const id of COMPARABLE_REPORTS) {
      const r = REPORTS.find((x) => x.id === id)!;
      const halaman = baca(
        "src", "app", "(app)", "(dashboard)", "t", "[tenantSlug]", "[companySlug]",
        ...(r.href ?? "").split("/").filter(Boolean),
        "page.tsx"
      );
      expect(halaman, `${r.href}/page.tsx`).toMatch(
        new RegExp(`<StatementExcelButton[\\s\\S]*?sumber=\\{\\{[\\s\\S]*?reportId: "${id}"[\\s\\S]*?compare: compare \\?\\? undefined`)
      );
    }
  });

  it("pelari Go punya penghasil Laba Rugi, Neraca, Arus Kas & Perubahan Ekuitas, tetapi register yang memutuskan", () => {
    const runner = baca("services", "integrator", "internal", "interactivelane", "runner.go");
    expect(runner).toContain("case contract.ReportIncomeStatement:");
    expect(runner).toContain("case contract.ReportBalanceSheet:");
    expect(runner).toContain("case contract.ReportCashFlow:");
    expect(runner).toContain("case contract.ReportEquityChanges:");
    /* Setiap laporan di register yang BERBERKAS punya cabang penghasil; laporan
       tanpa berkas tidak — cabangnya akan menjadi kode mati yang terlihat
       hidup. */
    for (const [id] of ENTRIES) {
      const go = `Report${id.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}`;
      const cabang = new RegExp(`\\bcase [^\\n]*contract\\.${go}[,:]`);
      expect(cabang.test(runner), `${id}: case contract.${go}`).toBe(isExportable(REPORTS.find((r) => r.id === id)!));
    }
    /* Penolakan register mendahului percabangan per laporan. */
    expect(runner.indexOf("contract.GoEngineReports[m.ReportID]")).toBeLessThan(
      runner.indexOf("case contract.ReportIncomeStatement:")
    );
    const gen = baca("services", "integrator", "internal", "contract", "report_layout_gen.go");
    const himpunan = /var GoEngineReports = map\[string\]bool\{([\s\S]*?)\}/.exec(gen)?.[1] ?? "";
    for (const [id, e] of ENTRIES) {
      const ada = new RegExp(`Report${id.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}:\\s+true`).test(himpunan);
      expect(ada, `${id} (${e.engine}) di GoEngineReports`).toBe(e.engine === "go");
    }
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

  it("Arus Kas (`go`, paritas produksi 23 Okt 2026): muatan berperiode TANPA pembanding", () => {
    const report = REPORTS.find((r) => r.id === "cash-flow")!;
    const now = new Date(2026, 9, 23, 10, 0, 0);
    const p = goExportPayloadShape(report, { from: "2026-01-01", to: "2026-03-31", compare: "previous_year" }, now);
    const r = resolvePeriod("2026-01-01", "2026-03-31", now);
    /* `compare` DIBUANG: halaman Arus Kas tidak membacanya, dan pelari Go
       menolak muatan Arus Kas yang membawanya. */
    expect(p.params).toEqual({ from: r.fromISO, to: r.toISO });
    expect(p.fromInstant).toBe(r.from.toISOString());
    expect(p.toInstant).toBe(r.to.toISOString());
    expect(p.priorFromInstant).toBeUndefined();
    /* Sejak `go`, penerbit Go menerimanya — register yang memutuskan. */
    expect(goExportPayload(report, {}, now).reportId).toBe("cash-flow");
    expect(COMPARABLE_REPORTS).not.toContain("cash-flow");
  });

  it("Perubahan Ekuitas (`go`, paritas produksi 23 Okt 2026): muatan berperiode TANPA pembanding", () => {
    const report = REPORTS.find((r) => r.id === "equity-changes")!;
    const now = new Date(2026, 9, 23, 10, 0, 0);
    const p = goExportPayloadShape(report, { from: "2025-12-01", to: "2026-03-31", compare: "preceding" }, now);
    const r = resolvePeriod("2025-12-01", "2026-03-31", now);
    /* `compare` DIBUANG: halaman ini tidak membacanya, dan pelari Go menolak
       muatan Perubahan Ekuitas yang membawanya. */
    expect(p.params).toEqual({ from: r.fromISO, to: r.toISO });
    expect(p.fromInstant).toBe(r.from.toISOString());
    expect(p.toInstant).toBe(r.to.toISOString());
    expect(p.priorFromInstant).toBeUndefined();
    expect(COMPARABLE_REPORTS).not.toContain("equity-changes");
    /* Sejak `go`, penerbit Go menerimanya — register yang memutuskan. */
    expect(goExportPayload(report, {}, now).reportId).toBe("equity-changes");
  });

  it("halaman laporan BERBERKAS di register (`go-parity` maupun `go`) sudah mengirim asalnya", () => {
    /* Supaya peralihan `go-parity` → `go` hanya menyunting register: halaman
       yang belum mengirim `sumber` akan menjawab 400 di hari peralihan. */
    for (const [id] of ENTRIES) {
      const r = REPORTS.find((x) => x.id === id)!;
      if (!isExportable(r)) continue;
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

describe("gelombang A (23 Okt 2026): Rekap per Pihak, Kas & Bank, Realisasi vs Anggaran", () => {
  const IDS = ["sales-by-customer", "purchases-by-supplier", "cash-bank", "budget-realization"] as const;

  it("keempatnya `go-parity` — berkas masih TS sampai paritas PRODUKSI", () => {
    for (const id of IDS) {
      expect(reportEngine(id), id).toBe("go-parity");
      expect(REPORT_ENGINES[id]!.parityProven, id).toBeUndefined();
      expect(exportJobKind(id), id).toBe("report.export");
    }
  });

  it("rekap pihak & kas-bank: muatan berperiode, `cols` ikut, `compare` dibuang", () => {
    const now = new Date(2026, 9, 23, 10, 0, 0);
    for (const id of ["sales-by-customer", "purchases-by-supplier", "cash-bank"] as const) {
      const report = REPORTS.find((r) => r.id === id)!;
      const p = goExportPayloadShape(report, { from: "2026-03-31", to: "2026-01-01", cols: "net", compare: "preceding" }, now);
      const r = resolvePeriod("2026-03-31", "2026-01-01", now);
      expect(p.params, id).toEqual({ from: r.fromISO, to: r.toISO, cols: "net" });
      expect(p.fromInstant, id).toBe(r.from.toISOString());
      expect(p.toInstant, id).toBe(r.to.toISOString());
      expect(p.priorFromInstant, id).toBeUndefined();
      expect(COMPARABLE_REPORTS).not.toContain(id);
    }
  });

  it("anggaran: `period_month` → tahun/bulan dari `resolveBudgetPeriod`, instan dari `budgetPeriodRange`", () => {
    const report = REPORTS.find((r) => r.id === "budget-realization")!;
    expect(report.paramKind).toBe("period_month");
    const now = new Date(2026, 9, 23, 10, 0, 0);
    const bulan = goExportPayloadShape(report, { year: "2026", month: "3" }, now);
    expect(bulan.params).toEqual({ year: "2026", month: "3" });
    /* Maret 2026 menurut kalender Jakarta: 1 Mar 00:00 WIB … 31 Mar 23:59:59.999 WIB. */
    expect(bulan.fromInstant).toBe("2026-02-28T17:00:00.000Z");
    expect(bulan.toInstant).toBe("2026-03-31T16:59:59.999Z");
    const setahun = goExportPayloadShape(report, { year: "2025", month: "0", compare: "preceding" }, now);
    expect(setahun.params).toEqual({ year: "2025", month: "0" });
    expect(setahun.fromInstant).toBe("2024-12-31T17:00:00.000Z");
    expect(setahun.toInstant).toBe("2025-12-31T16:59:59.999Z");
    /* Nilai yang diedit tangan jatuh ke periode berjalan — aturan halaman. */
    expect(goExportPayloadShape(report, { year: "abc", month: "13" }, now).params).toEqual({ year: "2026", month: "10" });
    expect(goExportPayloadShape(report, {}, now).params).toEqual({ year: "2026", month: "10" });
  });

  it("pelari Go punya cabang anggaran dan menolak tahun/bulan di luar bentuk penerbit", () => {
    const runner = readFileSync(
      join(AKAR_REPO, "services", "integrator", "internal", "interactivelane", "runner.go"),
      "utf8"
    );
    expect(runner).toContain("func budgetYearMonth(");
    expect(runner).toMatch(/case contract\.ReportBudgetRealization:\s*\n\s*data, filename, err = anggaran\(/);
  });
});
