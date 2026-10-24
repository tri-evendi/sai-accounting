/**
 * PAKET LAPORAN — banyak laporan satu periode jadi SATU berkas (09 §5,
 * keputusan pemilik 24 Okt 2026). Bagian MURNI: kosakata, periode, muatan,
 * kunci idempotensi, nama berkas, kalimat ringkasan. Tanpa basis data.
 *
 * ══ BENTUK BERKASNYA: SATU ZIP ═════════════════════════════════════════════
 *
 *   Paket_Laporan_<dari>_<sampai>.zip
 *   ├── 00_Ringkasan_Paket.pdf         ← PT, periode, waktu dibuat, daftar laporan, yang dikecualikan + alasannya
 *   ├── PDF/01_Neraca.pdf …            ← satu PDF per laporan (format "pdf")
 *   └── Paket_Laporan_<…>.xlsx         ← SATU buku kerja: lembar "Ringkasan" + satu lembar per laporan (format "xlsx")
 *
 * Kenapa ZIP, bukan satu PDF gabungan atau satu buku kerja saja: dua
 * penghasil berkas laporan hidup di dua bahasa dan keduanya sudah dibuktikan
 * setara dengan layar — lembar sebar laporan `engine: "go"` HANYA boleh dari Go
 * (`src/lib/report-engine.ts`), PDF HANYA punya generator jsPDF (09 §5).
 * Menggabungkan PDF menuntut pustaka penggabung baru (jsPDF tidak bisa membaca
 * PDF), dan memaksa satu format berarti menulis ulang penghasil yang lain. ZIP
 * memakai keduanya apa adanya, dan pembacanya (akuntan, auditor) memang
 * meminta "PDF untuk diarsip, Excel untuk diolah".
 *
 * ══ SIAPA MENGERJAKAN APA ══════════════════════════════════════════════════
 *   • `/api/reports/package` → `src/lib/report-package-job.ts`: otorisasi per
 *     laporan, satu baris audit, menerbitkan DUA pekerjaan: `report.package_pdf`
 *     (Node, jalur `interactive`) lalu `report.package` (Go, jalur `bulk`) yang
 *     menyebut id anaknya;
 *   • `workers/interactive.ts` → `src/lib/report-package-pdf.ts`: ringkasan +
 *     PDF satu per satu, dialirkan ke ZIP antara;
 *   • `services/integrator/internal/bulklane/package.go`: lembar sebar (penghasil
 *     `report.export_go` yang sama), menunggu anak, merangkai ZIP akhir.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

import { REPORTS, isExportable, isValidISODate, resolvePeriod, type ReportDefinition } from "@/lib/report-catalog";
import { reportEngine } from "@/lib/report-engine";
import { goExportPayloadShape, type GoExportPayload } from "@/lib/report-export-go";
import { STATEMENT_TITLES } from "@/lib/statement-layout";
import {
  PACKAGE_DEFAULT_REPORTS,
  PACKAGE_EXCLUSION_TEXT,
  PACKAGE_FORMATS,
  PACKAGE_PERIOD_KINDS,
  PACKAGE_SUMMARY_TEXT,
  type PackageExclusionReason,
  type PackageFormat,
} from "@/lib/report-package-text";

export {
  PACKAGE_DEFAULT_REPORTS,
  PACKAGE_EXCLUSION_TEXT,
  PACKAGE_FORMATS,
  PACKAGE_PERIOD_KINDS,
  PACKAGE_SUMMARY_TEXT,
  type PackageExclusionReason,
  type PackageFormat,
};
import { formatDate } from "@sai/core/utils";
import { businessParts } from "@sai/core/business-date";

type ExportableReport = ReportDefinition & { payloadKind: NonNullable<ReportDefinition["payloadKind"]> };


/**
 * Laporan yang BOLEH masuk paket: berberkas (`payloadKind`) DAN lembar
 * sebarnya milik Go (`engine: "go"`) — pelari paket menghitung lembarnya lewat
 * penghasil `report.export_go`, dan laporan yang bukan milik Go tidak punya
 * penghasil di sana. Urutan: set bawaan lebih dulu, sisanya urutan katalog.
 */
export function packageableReports(): ExportableReport[] {
  const boleh = REPORTS.filter(
    (r): r is ExportableReport => isExportable(r) && r.status === "available" && reportEngine(r.id) === "go"
  );
  const bawaan = PACKAGE_DEFAULT_REPORTS.map((id) => boleh.find((r) => r.id === id)).filter(
    (r): r is ExportableReport => r !== undefined
  );
  return [...bawaan, ...boleh.filter((r) => !(PACKAGE_DEFAULT_REPORTS as readonly string[]).includes(r.id))];
}


/** Paling banyak laporan per paket — seluruh daftar yang boleh, dengan ruang. */
export const PACKAGE_MAX_REPORTS = 20;

/** Badan `POST /api/reports/package`. `.strict()`: kunci asing = 400. */
export const reportPackageRequestSchema = z
  .object({
    period: z
      .object({
        kind: z.enum(PACKAGE_PERIOD_KINDS),
        year: z.number().int().min(2000).max(2100).optional(),
        month: z.number().int().min(1).max(12).optional(),
        quarter: z.number().int().min(1).max(4).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .strict(),
    reports: z.array(z.string().min(1).max(64)).min(1).max(PACKAGE_MAX_REPORTS),
    formats: z.array(z.enum(PACKAGE_FORMATS)).min(1).max(2),
  })
  .strict();

export type ReportPackageRequest = z.infer<typeof reportPackageRequestSchema>;

export interface PackagePeriod {
  fromISO: string;
  toISO: string;
  /** Satu bulan kalender penuh — Realisasi vs Anggaran membaca bulannya. */
  month: { year: number; month: number } | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Hari terakhir sebuah bulan (1–12) — tanggal kalender, bukan instan. */
function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Periode paket → tanggal bisnis Jakarta (`YYYY-MM-DD`) inklusif. `null` bila
 * isiannya tidak lengkap/tidak sah — rute menjawab 400, tidak menebak.
 *
 * Tanggal ini KALENDER, bukan instan: instan batasnya (awal hari Jakarta =
 * 17.00 UTC hari sebelumnya; akhir hari = 16.59.59,999 UTC) dihitung SEKALI
 * oleh `goExportPayloadShape` → `resolvePeriod`/`resolveAsOf`, fungsi yang sama
 * dengan layar dan ekspor satu laporan. Rentang terbalik ditukar dan rentang
 * keterlaluan dipendekkan di sana juga (aturan 03 §4).
 */
export function resolvePackagePeriod(p: ReportPackageRequest["period"]): PackagePeriod | null {
  const { kind, year, month, quarter } = p;
  if (kind === "month") {
    if (year === undefined || month === undefined) return null;
    return {
      fromISO: `${year}-${pad(month)}-01`,
      toISO: `${year}-${pad(month)}-${pad(lastDay(year, month))}`,
      month: { year, month },
    };
  }
  if (kind === "quarter") {
    if (year === undefined || quarter === undefined) return null;
    const m0 = (quarter - 1) * 3 + 1;
    return {
      fromISO: `${year}-${pad(m0)}-01`,
      toISO: `${year}-${pad(m0 + 2)}-${pad(lastDay(year, m0 + 2))}`,
      month: null,
    };
  }
  if (kind === "year") {
    if (year === undefined) return null;
    return { fromISO: `${year}-01-01`, toISO: `${year}-12-31`, month: null };
  }
  if (!p.from || !p.to || !isValidISODate(p.from) || !isValidISODate(p.to)) return null;
  const r = resolvePeriod(p.from, p.to);
  const [fy, fm, fd] = r.fromISO.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = r.toISO.split("-").map(Number) as [number, number, number];
  const fullMonth = fy === ty && fm === tm && fd === 1 && td === lastDay(ty, tm);
  return { fromISO: r.fromISO, toISO: r.toISO, month: fullMonth ? { year: fy, month: fm } : null };
}

/**
 * Parameter halaman untuk SATU laporan dari periode paket — bentuk yang sama
 * dengan dialog Pusat Laporan (`queryParams`):
 *   • `period`       → `?from=&to=`
 *   • `as_of`        → `?asOf=<akhir periode>` (Neraca, Neraca Saldo, Umur Piutang/Utang)
 *   • `period_month` → `?year=&month=` — bulan bila periodenya tepat satu bulan
 *                      kalender, selain itu `month=0` (setahun penuh, tahun akhir periode)
 * Kolom tidak dipilih: susunan bawaan katalog (`resolveColumns`).
 */
export function packageReportParams(report: ReportDefinition, period: PackagePeriod): Record<string, string> {
  switch (report.paramKind) {
    case "period":
      return { from: period.fromISO, to: period.toISO };
    case "as_of":
      return { asOf: period.toISO };
    case "period_month":
      return period.month
        ? { year: String(period.month.year), month: String(period.month.month) }
        : { year: period.toISO.slice(0, 4), month: "0" };
    default:
      return {};
  }
}


/** "PDF & Excel" — baris format di ringkasan. */
export function formatsLine(formats: readonly PackageFormat[]): string {
  const nama = PACKAGE_FORMATS.filter((f) => formats.includes(f)).map((f) => (f === "pdf" ? "PDF" : "Excel (XLSX)"));
  return `Format: ${nama.join(" & ")}`;
}

/** Label periode cetak — kalimat yang sama dengan Laba Rugi / Arus Kas. */
export function packagePeriodLabel(period: PackagePeriod): string {
  return `Periode ${formatDate(`${period.fromISO}T12:00:00+07:00`)} – ${formatDate(`${period.toISO}T12:00:00+07:00`)}`;
}

/** Dasar nama berkas aman dari judul dokumen. */
function slug(title: string): string {
  return title.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Laporan";
}

export function packageFileName(period: PackagePeriod): string {
  return `Paket_Laporan_${period.fromISO}_${period.toISO}.zip`;
}
export function packageWorkbookName(period: PackagePeriod): string {
  return `Paket_Laporan_${period.fromISO}_${period.toISO}.xlsx`;
}
export const PACKAGE_COVER_ENTRY = "00_Ringkasan_Paket.pdf";

/** `PDF/01_Neraca.pdf` — nomor urut dua digit supaya urutan cetak = urutan nama. */
export function packagePdfEntryName(index: number, report: ExportableReport): string {
  return `PDF/${pad(index + 1)}_${slug(STATEMENT_TITLES[report.payloadKind])}.pdf`;
}

/** Satu laporan di muatan induk — yang dihitung Go. */
export interface PackageReportEntry {
  reportId: string;
  title: string;
  /** Muatan `report.export_go` yang SAMA bentuknya — dari `goExportPayloadShape`. */
  export: GoExportPayload;
}

/** Satu laporan di muatan anak PDF — yang digambar Node. */
export interface PackagePdfEntry {
  reportId: string;
  title: string;
  /** Parameter yang SUDAH diselesaikan (`export.params`) — kedua sisi melihat tanggal yang sama. */
  params: Record<string, string>;
  entry: string;
}

export interface PackageExclusionEntry {
  reportId: string;
  title: string;
  reason: string;
}

/** Muatan `report.package` (Go). Parameter & kalimat saja — tak satu angka akuntansi (#104). */
export type ReportPackagePayload = {
  requestedBy: string;
  from: string;
  to: string;
  periodLabel: string;
  formats: PackageFormat[];
  pdfJobId: number;
  fileName: string;
  workbookName: string;
  reports: PackageReportEntry[];
  excluded: PackageExclusionEntry[];
  summary: typeof PACKAGE_SUMMARY_TEXT & { formatsLine: string; generatedForLine: string };
};

/** Muatan `report.package_pdf` (Node). */
export type ReportPackagePdfPayload = {
  packageKey: string;
  requestedBy: string;
  requestedByName: string;
  from: string;
  to: string;
  periodLabel: string;
  formats: PackageFormat[];
  reports: PackagePdfEntry[];
  excluded: PackageExclusionEntry[];
  requestedAt: string;
};

/**
 * Kunci idempotensi: pengguna × PT × periode × HIMPUNAN laporan × format,
 * dalam jendela 10 menit. Klik ganda, dua tab, atau tombol yang ditekan lagi
 * karena tak sabar memakai pekerjaan yang SAMA — sementara permintaan yang
 * berbeda satu laporan pun menghasilkan paket baru. Himpunan diurutkan, jadi
 * urutan centang tidak mengubah kuncinya.
 *
 * Dua kunci: jendela sekarang DAN sebelumnya — klik di 10.09.59 dan 10.10.01
 * jatuh di dua jendela, dan pemeriksa yang hanya melihat jendela sekarang
 * akan menerbitkan dua paket untuk satu niat.
 */
export const PACKAGE_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export function packageDedupeKeys(
  input: { companyId: number; userId: string; period: PackagePeriod; reportIds: readonly string[]; formats: readonly string[] },
  now: Date = new Date()
): { current: string; previous: string } {
  const sidik = createHash("sha256")
    .update(
      JSON.stringify([
        input.companyId,
        input.userId,
        input.period.fromISO,
        input.period.toISO,
        [...new Set(input.reportIds)].sort(),
        [...new Set(input.formats)].sort(),
      ])
    )
    .digest("hex")
    .slice(0, 24);
  const jendela = Math.floor(now.getTime() / PACKAGE_DEDUPE_WINDOW_MS);
  const kunci = (j: number) => `report.package:${input.companyId}:${sidik}:${j}`;
  return { current: kunci(jendela), previous: kunci(jendela - 1) };
}

export interface PackagePlanEntry {
  report: ExportableReport;
  excluded: PackageExclusionReason | null;
}

/**
 * Susun kedua muatan dari rencana yang sudah diotorisasi. MURNI — `now`
 * disuntik supaya batas periode teruji tanpa jam dinding.
 */
export function buildPackagePayloads(
  input: {
    plan: PackagePlanEntry[];
    period: PackagePeriod;
    formats: readonly PackageFormat[];
    userId: string;
    userName: string;
    packageKey: string;
  },
  now: Date = new Date()
): { parent: Omit<ReportPackagePayload, "pdfJobId">; child: ReportPackagePdfPayload } {
  const formats = PACKAGE_FORMATS.filter((f) => input.formats.includes(f));
  const included = input.plan.filter((p) => p.excluded === null).map((p) => p.report);
  const excluded = input.plan
    .filter((p) => p.excluded !== null)
    .map((p) => ({
      reportId: p.report.id,
      title: STATEMENT_TITLES[p.report.payloadKind],
      reason: PACKAGE_EXCLUSION_TEXT[p.excluded as PackageExclusionReason],
    }));
  const reports = included.map((report) => ({
    reportId: report.id,
    title: STATEMENT_TITLES[report.payloadKind],
    export: goExportPayloadShape(report, packageReportParams(report, input.period), now),
  }));
  const periodLabel = packagePeriodLabel(input.period);
  const generatedForLine = `Diminta oleh: ${input.userName}`;
  return {
    parent: {
      requestedBy: input.userId,
      from: input.period.fromISO,
      to: input.period.toISO,
      periodLabel,
      formats,
      fileName: packageFileName(input.period),
      workbookName: packageWorkbookName(input.period),
      reports,
      excluded,
      summary: { ...PACKAGE_SUMMARY_TEXT, formatsLine: formatsLine(formats), generatedForLine },
    },
    child: {
      packageKey: input.packageKey,
      requestedBy: input.userId,
      requestedByName: input.userName,
      from: input.period.fromISO,
      to: input.period.toISO,
      periodLabel,
      formats,
      reports: reports.map((r, i) => ({
        reportId: r.reportId,
        title: r.title,
        params: r.export.params,
        entry: packagePdfEntryName(i, included[i]!),
      })),
      excluded,
      requestedAt: now.toISOString(),
    },
  };
}

/** "Sekarang" menurut kalender Jakarta — bawaan isian tahun/bulan dialog. */
export function packageDefaultPeriod(now: Date = new Date()): { year: number; month: number } {
  const p = businessParts(now);
  return { year: p.year, month: p.month + 1 };
}
