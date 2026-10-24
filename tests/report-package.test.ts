/**
 * PAKET LAPORAN (`report.package`, 09 §5) — kontrak, set bawaan, periode
 * Jakarta, otorisasi (PT/pengguna lain, modul mati), idempotensi, isi ZIP.
 *
 * Bukti ujung-ke-ujung atas buku sungguhan (Go merangkai ZIP akhir) ada di PR;
 * tes Go (`internal/bulklane/package_test.go`, `internal/document/package_test.go`)
 * memaku perangkaian dan buku kerjanya.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";

import { AKAR_REPO } from "./akar-sumber";

/* ── mock ─────────────────────────────────────────────────────────────── */

const izin = vi.hoisted(() => ({
  /** Izin yang DIPEGANG peran. */
  peran: new Set<string>(),
  /** Izin yang modulnya AKTIF. */
  modul: new Set<string>(),
}));
vi.mock("@/lib/authz-effective", () => ({
  canEffective: vi.fn(async (_u: unknown, p: string) => izin.modul.has(p) && izin.peran.has(p)),
  isModuleActiveFor: vi.fn(async (p: string) => izin.modul.has(p)),
}));

const antrean = vi.hoisted(() => ({
  rows: [] as { id: number; kind: string; companyId: number; payload: unknown; dedupeKey: string | null; status: string }[],
}));
vi.mock("@sai/platform/job-queue", () => ({
  publishJob: vi.fn(async (j: { kind: string; companyId: number; payload: unknown; dedupeKey?: string }) => {
    if (j.dedupeKey && antrean.rows.some((r) => r.dedupeKey === j.dedupeKey)) return null;
    const id = antrean.rows.length + 1;
    antrean.rows.push({ id, kind: j.kind, companyId: j.companyId, payload: j.payload, dedupeKey: j.dedupeKey ?? null, status: "queued" });
    return { id };
  }),
  jobStatus: vi.fn(async (by: { dedupeKey: string }) => {
    const r = antrean.rows.find((x) => x.dedupeKey === by.dedupeKey);
    return r ? { id: r.id, kind: r.kind, status: r.status, payload: r.payload } : null;
  }),
  releaseFinishedDedupeKey: vi.fn(async (key: string) => {
    let n = 0;
    for (const r of antrean.rows) {
      if (r.dedupeKey === key && (r.status === "done" || r.status === "dead")) {
        r.dedupeKey = null;
        n++;
      }
    }
    return n;
  }),
}));

const audit = vi.hoisted(() => ({ baris: [] as Record<string, unknown>[] }));
vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(async (b: Record<string, unknown>) => {
    audit.baris.push(b);
  }),
}));

vi.mock("@/lib/pdf-company", () => ({
  serverPdfCompany: vi.fn(async () => ({ name: "PT Uji Paket", address: "Jl. Uji", logo: null })),
}));

const muatanDibangun = vi.hoisted(() => ({ panggilan: [] as { id: string; params: Record<string, string> }[] }));
vi.mock("@/lib/report-payload", async (asli) => ({
  ...(await asli<typeof import("@/lib/report-payload")>()),
  buildReportPayload: vi.fn(async (report: { id: string }, params: Record<string, string>) => {
    muatanDibangun.panggilan.push({ id: report.id, params });
    return {
      kind: "trial-balance",
      period: `Per ${params.asOf ?? params.to ?? "?"}`,
      rows: [{ code: "1-1000", name: "Kas", debit: 1000, credit: 0 }],
      totalDebit: 1000,
      totalCredit: 0,
      balanced: false,
    };
  }),
}));

const {
  PACKAGE_DEFAULT_REPORTS,
  buildPackagePayloads,
  packageDedupeKeys,
  packageReportParams,
  packageableReports,
  reportPackageRequestSchema,
  resolvePackagePeriod,
} = await import("@/lib/report-package");
const { planReportPackage, publishReportPackage } = await import("@/lib/report-package-job");
const { writeReportPackagePdfPart } = await import("@/lib/report-package-pdf");
const { bolehAmbilHasil } = await import("@/lib/job-result-gate");
const { JOB_KINDS } = await import("@sai/core/generated/job-kinds");
const { RESULT_RETENTION_DAYS, DONE_RETENTION_DAYS } = await import("@sai/core/generated/job-numbers");
const { JOB_RESULT_PERMISSION } = await import("@sai/core/job-result");
const { reportById } = await import("@/lib/report-catalog");

const PENGGUNA = { id: "11", role: "finance_manager", email: "fm@pt.uji", name: "Manajer Keuangan" };
const SEMUA_IZIN = ["report.read", "receivable.read", "payable.read", "inventory.read", "cash.read", "budget.manage"];

beforeEach(() => {
  izin.peran = new Set(SEMUA_IZIN);
  izin.modul = new Set(SEMUA_IZIN);
  antrean.rows = [];
  audit.baris = [];
  muatanDibangun.panggilan = [];
});
afterEach(() => vi.clearAllMocks());

/* ── kontrak ──────────────────────────────────────────────────────────── */

describe("kontrak: `report.package` dideklarasikan dan dibangkitkan", () => {
  it("induk di jalur `bulk` (Go), anak PDF di jalur `interactive` (Node)", () => {
    expect(JOB_KINDS["report.package"]).toMatchObject({ lane: "bulk", maxAttempts: 2, writesLedger: false });
    expect(JOB_KINDS["report.package_pdf"]).toMatchObject({ lane: "interactive", maxAttempts: 2, writesLedger: false });
    const go = readFileSync(join(AKAR_REPO, "services/integrator/internal/contract/jobs_gen.go"), "utf8");
    expect(go).toContain('KindReportPackagePdf         JobKind = "report.package_pdf"');
  });

  it("pengklaimnya: Go `bulklane` untuk induk, Node `workers/interactive.ts` untuk anak", () => {
    const bulk = readFileSync(join(AKAR_REPO, "services/integrator/internal/bulklane/runner.go"), "utf8");
    expect(bulk).toMatch(/contract\.KindReportPackage:\s+handlerPaket\(/);
    const node = readFileSync(join(AKAR_REPO, "workers/interactive.ts"), "utf8");
    expect(node).toContain('"report.package_pdf": bagianPdfPaket');
  });

  it("anak PDF tidak punya pintu unduh; induk lewat gerbang `report.read` + gerbang kedua", () => {
    expect(JOB_RESULT_PERMISSION["report.package_pdf"]).toBeNull();
    expect(JOB_RESULT_PERMISSION["report.package"]).toBe("report.read");
  });

  it("retensi berkas hasil 7 hari dari kontrak, tidak melewati retensi baris", () => {
    expect(RESULT_RETENTION_DAYS).toBe(7);
    expect(RESULT_RETENTION_DAYS).toBeLessThanOrEqual(DONE_RETENTION_DAYS);
  });
});

/* ── set laporan ──────────────────────────────────────────────────────── */

describe("set laporan", () => {
  it("set bawaan = penutupan bulanan, dalam urutan cetaknya", () => {
    expect([...PACKAGE_DEFAULT_REPORTS]).toEqual([
      "balance-sheet",
      "income-statement",
      "cash-flow",
      "equity-changes",
      "trial-balance",
      "receivables",
      "payables",
    ]);
    expect(packageableReports().slice(0, 7).map((r) => r.id)).toEqual([...PACKAGE_DEFAULT_REPORTS]);
  });

  it("hanya laporan berberkas yang lembar sebarnya milik Go — pelari paket memakai penghasil `report.export_go`", () => {
    const ids = packageableReports().map((r) => r.id);
    expect(ids).toContain("stock-value");
    expect(ids).toContain("budget-realization");
    expect(ids).not.toContain("project-profit");
    expect(ids).not.toContain("efaktur");
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ── periode Jakarta ──────────────────────────────────────────────────── */

describe("periode: tanggal bisnis Jakarta → instan batas", () => {
  it("bulan, kuartal, tahun, dan rentang khusus", () => {
    expect(resolvePackagePeriod({ kind: "month", year: 2026, month: 2 })).toEqual({
      fromISO: "2026-02-01",
      toISO: "2026-02-28",
      month: { year: 2026, month: 2 },
    });
    expect(resolvePackagePeriod({ kind: "month", year: 2028, month: 2 })?.toISO).toBe("2028-02-29");
    expect(resolvePackagePeriod({ kind: "quarter", year: 2026, quarter: 4 })).toMatchObject({
      fromISO: "2026-10-01",
      toISO: "2026-12-31",
      month: null,
    });
    expect(resolvePackagePeriod({ kind: "year", year: 2025 })).toMatchObject({ fromISO: "2025-01-01", toISO: "2025-12-31" });
    /* Rentang khusus yang tepat satu bulan kalender dikenali sebagai bulan. */
    expect(resolvePackagePeriod({ kind: "custom", from: "2026-03-01", to: "2026-03-31" })?.month).toEqual({ year: 2026, month: 3 });
    /* Terbalik ditukar (aturan `resolvePeriod`, 03 §4). */
    expect(resolvePackagePeriod({ kind: "custom", from: "2026-03-31", to: "2026-03-01" })).toMatchObject({
      fromISO: "2026-03-01",
      toISO: "2026-03-31",
    });
    for (const salah of [
      { kind: "month" as const, year: 2026 },
      { kind: "quarter" as const, year: 2026 },
      { kind: "custom" as const, from: "2026-02-30", to: "2026-03-01" },
      { kind: "custom" as const, from: "2026-01-01" },
    ]) {
      expect(resolvePackagePeriod(salah), JSON.stringify(salah)).toBeNull();
    }
  });

  it("instan batas = awal & akhir HARI JAKARTA (UTC+7), apa pun zona proses", () => {
    const period = resolvePackagePeriod({ kind: "month", year: 2026, month: 1 })!;
    const plan = ["income-statement", "balance-sheet", "budget-realization"].map((id) => ({
      report: packageableReports().find((r) => r.id === id)!,
      excluded: null,
    }));
    const { parent } = buildPackagePayloads(
      { plan, period, formats: ["pdf", "xlsx"], userId: "11", userName: "U", packageKey: "k" },
      new Date("2026-02-03T03:00:00Z")
    );
    const is = parent.reports.find((r) => r.reportId === "income-statement")!.export;
    expect(is.fromInstant).toBe("2025-12-31T17:00:00.000Z");
    expect(is.toInstant).toBe("2026-01-31T16:59:59.999Z");
    expect(is.params).toMatchObject({ from: "2026-01-01", to: "2026-01-31" });
    const bs = parent.reports.find((r) => r.reportId === "balance-sheet")!.export;
    expect(bs.asOfInstant).toBe("2026-01-31T16:59:59.999Z");
    expect(bs.params.asOf).toBe("2026-01-31");
    /* Realisasi vs Anggaran membaca BULANNYA bila periodenya tepat satu bulan. */
    const budget = parent.reports.find((r) => r.reportId === "budget-realization")!.export;
    expect(budget.params).toMatchObject({ year: "2026", month: "1" });
    expect(parent.periodLabel).toBe("Periode 1 Januari 2026 – 31 Januari 2026");
  });

  it("parameter per bentuk laporan", () => {
    const q = resolvePackagePeriod({ kind: "quarter", year: 2026, quarter: 1 })!;
    expect(packageReportParams(reportById("cash-flow")!, q)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(packageReportParams(reportById("receivables")!, q)).toEqual({ asOf: "2026-03-31" });
    expect(packageReportParams(reportById("budget-realization")!, q)).toEqual({ year: "2026", month: "0" });
  });
});

/* ── otorisasi ────────────────────────────────────────────────────────── */

describe("otorisasi", () => {
  it("modul yang tidak aktif → laporannya DIKECUALIKAN dengan alasan modul; peran tak berwenang → alasan peran", async () => {
    izin.modul.delete("inventory.read");
    izin.peran.delete("payable.read");
    const { plan, unknown } = await planReportPackage(PENGGUNA, ["balance-sheet", "stock-value", "payables", "receivables"]);
    expect(unknown).toEqual([]);
    expect(plan.map((p) => [p.report.id, p.excluded])).toEqual([
      ["balance-sheet", null],
      ["receivables", null],
      ["payables", "role"],
      ["stock-value", "module"],
    ]);
    const { parent, child } = buildPackagePayloads({
      plan,
      period: resolvePackagePeriod({ kind: "month", year: 2026, month: 1 })!,
      formats: ["pdf"],
      userId: "11",
      userName: "U",
      packageKey: "k",
    });
    expect(parent.reports.map((r) => r.reportId)).toEqual(["balance-sheet", "receivables"]);
    expect(parent.excluded).toEqual([
      { reportId: "payables", title: "Utang & Umur Utang", reason: "Peran Anda tidak berwenang membuka laporan ini" },
      { reportId: "stock-value", title: "Nilai Persediaan", reason: "Modul laporan ini tidak aktif untuk PT ini" },
    ]);
    expect(child.excluded).toEqual(parent.excluded);
  });

  it("id yang tidak boleh masuk paket ditolak, dan paket tanpa satu laporan yang boleh TIDAK terbit", async () => {
    const r = await planReportPackage(PENGGUNA, ["project-profit", "balance-sheet"]);
    expect(r.unknown).toEqual(["project-profit"]);

    izin.modul = new Set();
    const { plan } = await planReportPackage(PENGGUNA, ["balance-sheet"]);
    const hasil = await publishReportPackage({
      companyId: 1,
      user: PENGGUNA,
      period: resolvePackagePeriod({ kind: "month", year: 2026, month: 1 })!,
      formats: ["pdf"],
      plan,
    });
    expect(hasil).toEqual({ ok: false, reason: "nothing_permitted" });
    expect(antrean.rows).toEqual([]);
  });

  it("unduhan: hanya PEMINTANYA, dan setiap laporan di dalamnya masih boleh dibuka", async () => {
    const payload = { requestedBy: "11", reports: [{ reportId: "balance-sheet" }, { reportId: "receivables" }] };
    expect(await bolehAmbilHasil("report.package", payload, { id: "11", role: "finance_manager" })).toBe(true);
    /* Pengguna lain di PT yang sama — berizin `report.read` pun — ditolak. */
    expect(await bolehAmbilHasil("report.package", payload, { id: "12", role: "finance_manager" })).toBe(false);
    /* Modul dimatikan SESUDAH paket diminta → seluruh berkas tertutup. */
    izin.modul.delete("receivable.read");
    expect(await bolehAmbilHasil("report.package", payload, { id: "11", role: "finance_manager" })).toBe(false);
    /* Muatan yang tidak bisa diperiksa ditolak. */
    expect(await bolehAmbilHasil("report.package", { requestedBy: "11" }, { id: "11", role: "x" })).toBe(false);
    expect(await bolehAmbilHasil("report.package_pdf", payload, { id: "11", role: "x" })).toBe(false);
  });

  it("PT lain: rute hasil membandingkan `company_id` baris dengan PT aktif SEBELUM gerbang kedua", () => {
    const rute = readFileSync(
      join(AKAR_REPO, "src/app/api/t/[tenantSlug]/[companySlug]/jobs/[kind]/[id]/result/route.ts"),
      "utf8"
    );
    const banding = rute.indexOf("job.companyId !== authz.companyId");
    expect(banding).toBeGreaterThan(0);
    expect(banding).toBeLessThan(rute.indexOf("bolehAmbilHasil(job.kind"));
    /* Penerbit memakai PT aktif penjaga, bukan badan permintaan. */
    const route = readFileSync(join(AKAR_REPO, "src/app/api/reports/package/route.ts"), "utf8");
    expect(route).toContain("companyId: authz.companyId");
    expect(route).toContain('requireApiPermission("report.read")');
  });
});

/* ── idempotensi ──────────────────────────────────────────────────────── */

describe("idempotensi", () => {
  const period = () => resolvePackagePeriod({ kind: "month", year: 2026, month: 1 })!;
  const T = new Date("2026-02-03T03:01:00Z");

  it("kunci tidak bergantung urutan centang; berubah bila himpunan, format, periode, pengguna, atau PT berubah", () => {
    const dasar = { companyId: 1, userId: "11", period: period(), reportIds: ["a", "b"], formats: ["pdf", "xlsx"] };
    const k = packageDedupeKeys(dasar, T).current;
    expect(packageDedupeKeys({ ...dasar, reportIds: ["b", "a", "a"], formats: ["xlsx", "pdf"] }, T).current).toBe(k);
    for (const beda of [
      { reportIds: ["a"] },
      { formats: ["pdf"] },
      { userId: "12" },
      { companyId: 2 },
      { period: resolvePackagePeriod({ kind: "month", year: 2026, month: 2 })! },
    ]) {
      expect(packageDedupeKeys({ ...dasar, ...beda }, T).current, JSON.stringify(beda)).not.toBe(k);
    }
    /* Jendela 10 menit: jendela sebelumnya ikut diperiksa. */
    const nanti = packageDedupeKeys(dasar, new Date(T.getTime() + 10 * 60 * 1000));
    expect(nanti.previous).toBe(k);
  });

  it("permintaan yang sama dalam jendela memakai pekerjaan yang SAMA — satu induk, satu anak, satu baris audit", async () => {
    const { plan } = await planReportPackage(PENGGUNA, [...PACKAGE_DEFAULT_REPORTS]);
    const input = { companyId: 1, user: PENGGUNA, period: period(), formats: ["pdf", "xlsx"] as ("pdf" | "xlsx")[], plan };
    const a = await publishReportPackage(input, T);
    const b = await publishReportPackage(input, new Date(T.getTime() + 4 * 60 * 1000));
    const c = await publishReportPackage(input, new Date(T.getTime() + 11 * 60 * 1000));
    expect(a).toMatchObject({ ok: true, reused: false, included: 7, excluded: 0 });
    expect(b).toMatchObject({ ok: true, reused: true });
    expect(c).toMatchObject({ ok: true, reused: true });
    if (a.ok && b.ok && c.ok) expect(new Set([a.jobId, b.jobId, c.jobId]).size).toBe(1);
    expect(antrean.rows.map((r) => r.kind)).toEqual(["report.package_pdf", "report.package"]);
    expect(audit.baris).toHaveLength(1);
    expect(audit.baris[0]).toMatchObject({ action: "report.package", entity: "report_package", userId: "11" });

    /* Induk menyebut anaknya; muatan hanya parameter & kalimat. */
    const induk = antrean.rows[1]!.payload as { pdfJobId: number; requestedBy: string; reports: { reportId: string }[] };
    expect(induk.pdfJobId).toBe(antrean.rows[0]!.id);
    expect(induk.requestedBy).toBe("11");
    expect(induk.reports.map((r) => r.reportId)).toEqual([...PACKAGE_DEFAULT_REPORTS]);
  });

  it("paket yang MATI tidak dipakai ulang — permintaan berikutnya menerbitkan baru", async () => {
    const { plan } = await planReportPackage(PENGGUNA, ["balance-sheet"]);
    const input = { companyId: 1, user: PENGGUNA, period: period(), formats: ["xlsx"] as ("pdf" | "xlsx")[], plan };
    const a = await publishReportPackage(input, T);
    for (const r of antrean.rows) r.status = "dead";
    const b = await publishReportPackage(input, T);
    expect(a.ok && b.ok && a.jobId !== b.jobId).toBe(true);
    expect(antrean.rows).toHaveLength(4);
  });

  it("badan permintaan ketat: kunci asing, format asing, daftar kosong ditolak", () => {
    const sah = { period: { kind: "month", year: 2026, month: 1 }, reports: ["balance-sheet"], formats: ["pdf"] };
    expect(reportPackageRequestSchema.safeParse(sah).success).toBe(true);
    for (const salah of [
      { ...sah, companyId: 2 },
      { ...sah, formats: ["docx"] },
      { ...sah, reports: [] },
      { ...sah, formats: [] },
      { ...sah, period: { kind: "week" } },
    ]) {
      expect(reportPackageRequestSchema.safeParse(salah).success, JSON.stringify(salah)).toBe(false);
    }
  });
});

/* ── isi ZIP (bagian PDF) ─────────────────────────────────────────────── */

async function bagianPdf(formats: ("pdf" | "xlsx")[], ids: string[]) {
  izin.modul.delete("inventory.read");
  const { plan } = await planReportPackage(PENGGUNA, ids);
  const { child } = buildPackagePayloads(
    {
      plan,
      period: resolvePackagePeriod({ kind: "month", year: 2026, month: 1 })!,
      formats,
      userId: "11",
      userName: "Manajer Keuangan",
      packageKey: "k",
    },
    new Date("2026-02-03T03:00:00Z")
  );
  const out = new PassThrough();
  const potong: Buffer[] = [];
  out.on("data", (b: Buffer) => potong.push(b));
  const names = await writeReportPackagePdfPart(child, out);
  out.end();
  const zip = await JSZip.loadAsync(Buffer.concat(potong));
  return { names, zip };
}

describe("isi ZIP: ringkasan lebih dulu, satu PDF per laporan", () => {
  it("nama, jumlah, dan urutan entri; setiap entri PDF sah", async () => {
    const { names, zip } = await bagianPdf(["pdf", "xlsx"], [...PACKAGE_DEFAULT_REPORTS, "stock-value"]);
    expect(names).toEqual([
      "00_Ringkasan_Paket.pdf",
      "PDF/01_Neraca.pdf",
      "PDF/02_Laporan_Laba_Rugi.pdf",
      "PDF/03_Laporan_Arus_Kas.pdf",
      "PDF/04_Laporan_Perubahan_Ekuitas.pdf",
      "PDF/05_Neraca_Saldo.pdf",
      "PDF/06_Piutang_Umur_Piutang.pdf",
      "PDF/07_Utang_Umur_Utang.pdf",
    ]);
    expect(Object.keys(zip.files)).toEqual(names);
    for (const n of names) {
      const isi = await zip.file(n)!.async("uint8array");
      expect(Buffer.from(isi.subarray(0, 5)).toString("latin1"), n).toBe("%PDF-");
    }
    /* Laporan dihitung dengan parameter yang SUDAH diselesaikan penerbit. */
    expect(muatanDibangun.panggilan.map((p) => p.id)).toEqual([...PACKAGE_DEFAULT_REPORTS]);
    expect(muatanDibangun.panggilan[0]!.params).toEqual({ asOf: "2026-01-31" });
    expect(muatanDibangun.panggilan[1]!.params).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("ringkasan menyebut PT, periode, laporan yang disertakan, dan yang dikecualikan beserta alasannya", async () => {
    const { zip } = await bagianPdf(["pdf"], ["balance-sheet", "stock-value"]);
    const teks = Buffer.from(await zip.file("00_Ringkasan_Paket.pdf")!.async("uint8array")).toString("latin1");
    for (const s of ["PT Uji Paket", "Paket Laporan", "Periode 1 Januari 2026", "Neraca", "Nilai Persediaan", "Modul laporan ini tidak aktif untuk PT ini", "Diminta oleh: Manajer Keuangan"]) {
      expect(teks, s).toContain(s);
    }
  });

  it("format Excel saja: bagian PDF hanya memuat ringkasan (lembar sebar dari Go)", async () => {
    const { names } = await bagianPdf(["xlsx"], ["balance-sheet", "income-statement"]);
    expect(names).toEqual(["00_Ringkasan_Paket.pdf"]);
    expect(muatanDibangun.panggilan).toEqual([]);
  });

  it("muatan yang tidak lolos pemeriksaan ulang ditolak", async () => {
    const out = new PassThrough();
    await expect(writeReportPackagePdfPart({ reports: [] }, out)).rejects.toThrow();
    await expect(
      writeReportPackagePdfPart(
        { reports: [{ reportId: "balance-sheet", entry: "../x.pdf", params: {} }], formats: ["pdf"], periodLabel: "p", requestedAt: "x" },
        out
      )
    ).rejects.toThrow(/entri/);
  });
});
