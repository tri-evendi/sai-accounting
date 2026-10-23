/**
 * PENJAGA pembanding paritas Umur Piutang/Utang (`src/lib/aging-parity.ts`)
 * dan bentuk register-nya (tahap 1d). Pembanding yang diam-diam setara atas
 * apa pun adalah bukti palsu, jadi yang diuji di sini: ia MENEMUKAN selisih
 * sen, urutan, null-vs-nol, dan menandai selisih seri setengah sen — tanpa
 * meloloskannya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SERI_FLOAT, compareAging, type GoAgingReport, type TsAgingResult } from "@/lib/aging-parity";
import { REPORT_ENGINES, exportJobKind, reportEngine } from "@/lib/report-engine";
import { agingBucket } from "@/lib/receivables";
import { AGING_BUCKETS, AGING_BUCKET_MAX_DAYS } from "@sai/core/generated/accounting";
import { AKAR_REPO } from "./akar-sumber";

const tanggal = new Date("2026-03-01T00:00:00.000Z");

function ts(): TsAgingResult {
  return {
    rows: [
      {
        kind: "invoice", id: 2, documentNo: "INV-2", partyName: "PT A", date: tanggal, dueDate: null,
        total: 1.5 * 3.33, currency: "IDR", totalBase: 1.5 * 3.33, paidBase: 0, outstandingBase: 5,
        status: "unpaid", ageDays: 30, ageFromIssue: true, bucket: "b0_30",
      },
      {
        kind: "invoice", id: 1, documentNo: "INV-1", partyName: "PT B", date: tanggal, dueDate: tanggal,
        total: 100, currency: "USD", totalBase: null, paidBase: 0, outstandingBase: null,
        status: "overdue", ageDays: 30, ageFromIssue: false, bucket: "b0_30",
      },
    ],
    aging: { buckets: { b0_30: 5, b31_60: 0, b61_90: 0, b90_plus: 0 }, total: 5, unresolved: 1 },
    overdueCount: 1,
  };
}

function go(): GoAgingReport {
  const base = {
    date: "2026-03-01T00:00:00Z", currency: "IDR", allocationEstimated: false, halfCentTie: false,
    paidBase: "0.00", ageDays: 30, bucket: "b0_30",
  };
  return {
    kind: "receivables", asOf: "2026-03-31T16:59:59.999Z", overdueOnly: false,
    rows: [
      { ...base, kind: "invoice", id: 2, documentNo: "INV-2", partyName: "PT A", dueDate: null,
        total: "4.995", totalBase: "4.995", outstandingBase: "5.00", status: "unpaid", ageFromIssue: true },
      { ...base, kind: "invoice", id: 1, documentNo: "INV-1", partyName: "PT B", dueDate: "2026-03-01T00:00:00Z",
        total: "100", currency: "USD", totalBase: null, outstandingBase: null, status: "overdue", ageFromIssue: false },
    ],
    buckets: [
      { bucket: "b0_30", amount: "5.00" }, { bucket: "b31_60", amount: "0.00" },
      { bucket: "b61_90", amount: "0.00" }, { bucket: "b90_plus", amount: "0.00" },
    ],
    total: "5.00", unresolved: 1, overdueCount: 1,
  };
}

describe("compareAging", () => {
  it("setara: nilai float TS ⇄ desimal eksak Go, null ⇄ null", () => {
    expect(compareAging(ts(), go())).toEqual([]);
  });

  it("menemukan selisih satu sen, urutan, dan null-vs-nol", () => {
    const g = go();
    g.rows[0]!.outstandingBase = "4.99";
    g.rows[1]!.outstandingBase = "0.00";
    g.total = "4.99";
    const d = compareAging(ts(), g);
    expect(d.some((x) => x.includes("sisa: TS 5.00 ⇄ Go 4.99"))).toBe(true);
    expect(d.some((x) => x.includes("INV-1") && x.includes("sisa"))).toBe(true);
    expect(d.some((x) => x.startsWith("total:"))).toBe(true);

    const urut = go();
    urut.rows.reverse();
    expect(compareAging(ts(), urut)[0]).toMatch(/urutan berbeda mulai baris 1/);
  });

  it("selisih di dokumen seri setengah sen DITANDAI, tetap dihitung selisih", () => {
    const g = go();
    g.rows[0]!.halfCentTie = true;
    g.rows[0]!.outstandingBase = "5.01";
    g.buckets[0]!.amount = "5.01";
    g.total = "5.01";
    const d = compareAging(ts(), g);
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((x) => x.includes(SERI_FLOAT))).toBe(true);
  });
});

describe("ember umur dari kontrak", () => {
  it("batas atas inklusif, umur <= 0 di ember pertama", () => {
    expect(AGING_BUCKETS).toEqual(["b0_30", "b31_60", "b61_90", "b90_plus"]);
    expect(AGING_BUCKET_MAX_DAYS.b90_plus).toBeNull();
    const kasus: [number, string][] = [
      [-3, "b0_30"], [0, "b0_30"], [30, "b0_30"], [31, "b31_60"], [60, "b31_60"],
      [61, "b61_90"], [90, "b61_90"], [91, "b90_plus"],
    ];
    for (const [hari, ember] of kasus) expect(agingBucket(hari), String(hari)).toBe(ember);
  });
});

describe("register: Umur Piutang & Umur Utang `go`", () => {
  const baca = (...p: string[]) => readFileSync(join(AKAR_REPO, ...p), "utf8");

  it("terdaftar `go` sesudah paritas produksi 23 Okt 2026 — berkasnya dari Go", () => {
    for (const id of ["receivables", "payables"] as const) {
      expect(reportEngine(id), id).toBe("go");
      expect(REPORT_ENGINES[id]!.goSource).toBe("services/integrator/internal/ledgerread/aging.go");
      expect(REPORT_ENGINES[id]!.parityProven, id).toEqual({ date: "2026-10-23", books: 17 });
      expect(exportJobKind(id), id).toBe("report.export_go");
    }
  });

  it("halaman mengirim `sumber` BESERTA saringan & kolomnya — peralihan cukup menyunting register", () => {
    for (const id of ["receivables", "payables"]) {
      const halaman = baca("src", "app", "(app)", "(dashboard)", "t", "[tenantSlug]", "[companySlug]", id, "page.tsx");
      expect(halaman, id).toMatch(
        new RegExp(`<StatementExcelButton[\\s\\S]*?reportId: "${id}"[\\s\\S]*?asOf: asOfStr, cols: sp\\.cols, overdue:`)
      );
    }
  });

  it("pelari Go punya cabangnya, di belakang penolakan register", () => {
    const runner = baca("services", "integrator", "internal", "interactivelane", "runner.go");
    const cabang = runner.indexOf("case contract.ReportReceivables, contract.ReportPayables:");
    expect(cabang).toBeGreaterThan(-1);
    expect(runner.indexOf("contract.GoEngineReports[m.ReportID]")).toBeLessThan(cabang);
    /* Muatan membawa `cols` & `overdue` — dibaca dengan bunyi yang sama dengan TS. */
    expect(runner).toContain('m.Params["overdue"] == "1"');
    expect(runner).toContain('m.Params["cols"]');
  });
});
