/**
 * PENERBIT `report.export_go` — lembar sebar yang dihitung Go (tahap 1d).
 *
 * Satu-satunya tempat pekerjaan ini diterbitkan. Pemanggilnya
 * `/api/reports/export`, dan ia memanggilnya HANYA untuk laporan yang register
 * `src/lib/report-engine.ts` nyatakan `go` — keputusan "TS atau Go" tidak
 * ditulis di dua tempat.
 *
 * ══ MUATANNYA PARAMETER, DAN SATU INSTAN YANG SUDAH DIHITUNG ═══════════════
 * Sama seperti `report.export`: `jobs` hidup di basis data KENDALI, dan kendali
 * tidak memuat satu angka akuntansi pun (#104). Bedanya satu: batas tanggal
 * laporan dikirim SEBAGAI INSTAN (`asOfInstant`, ISO UTC) yang dihitung DI SINI
 * oleh `resolveAsOf` — fungsi yang sama yang dipakai layar.
 *
 * Sebabnya zona waktu. `resolveAsOf` membuat "akhir hari" menurut zona PROSES
 * Node, sementara `journals.date` disimpan sebagai jam dinding UTC; paritas
 * 22 Okt 2026 memperlihatkan buku yang sama memberi 14 baris di
 * `TZ=Asia/Jakarta` dan 15 di UTC (09 §9). Pekerja Go yang menghitung ulang
 * "akhir hari" sendiri akan bergantung pada TZ container-nya — dan selisih
 * itu tidak menghasilkan satu galat pun, hanya Neraca Saldo yang berbeda satu
 * jurnal dari layar. Instan yang diterima apa adanya menutup kelas itu.
 *
 * `params.asOf` (YYYY-MM-DD) tetap ikut: dari situ Go menyusun label periode
 * ("Per 5 Januari 2026"), dan gerbang kedua unduhan membaca `reportId`-nya.
 */
import "server-only";

import { publishJob } from "@sai/platform/job-queue";
import { resolveAsOf, resolvePeriod, type ReportDefinition } from "@/lib/report-catalog";
import { reportEngine } from "@/lib/report-engine";
import { comparisonDate, comparisonRange, parseComparison } from "@/lib/statement-compare";
import { resolveStockPeriod } from "@/lib/stock-period";

/** Muatan `report.export_go`. Dibaca `services/integrator/internal/interactivelane`. */
export type GoExportPayload = {
  reportId: string;
  params: Record<string, string>;
  /** `as_of`: batas tanggal INKLUSIF sebagai instan ISO UTC — lihat kepala berkas. */
  asOfInstant?: string;
  /**
   * `period` (Laba Rugi, tahap 1d): awal & akhir INKLUSIF sebagai instan ISO
   * UTC, dari `resolvePeriod` — fungsi yang SAMA dengan layar, termasuk
   * penukaran rentang terbalik dan pemendekan rentang keterlaluan. `params.from`
   * / `params.to` ditimpa dengan tanggal hasil penyelesaian itu, sebab dari
   * situlah Go menyusun label periodenya.
   */
  fromInstant?: string;
  toInstant?: string;
  /**
   * Kolom PEMBANDING (#557), hanya bila `params.compare` sah dan laporannya
   * komparatif (`COMPARABLE_REPORTS`). Instan, bukan tanggal, dengan alasan
   * yang sama dengan `asOfInstant`: `comparisonRange`/`comparisonDate` memakai
   * kalender zona PROSES (`new Date(y - 1, m, d, …)`), dan pelari Go yang
   * menghitung ulang "tahun lalu" sendiri akan bergantung pada TZ
   * container-nya. Go membaca label kolomnya dari instan ini (tanggal bisnis
   * Jakarta = `formatDate`).
   *
   *   • `period` (Laba Rugi): `priorFromInstant` + `priorToInstant`
   *   • `as_of`  (Neraca):    `priorAsOfInstant`
   */
  priorFromInstant?: string;
  priorToInstant?: string;
  priorAsOfInstant?: string;
};

/**
 * Laporan yang punya kolom pembanding (#557) — halaman keduanya membaca
 * `?compare=`. Laporan lain mengabaikan `compare`; ia DIBUANG dari parameter
 * muatan, supaya pekerjaan tidak membawa permintaan yang tidak akan dipenuhi
 * siapa pun.
 */
export const COMPARABLE_REPORTS: readonly string[] = ["income-statement", "balance-sheet"];

/**
 * Laporan berperiode yang rentangnya diselesaikan `resolveStockPeriod`, bukan
 * `resolvePeriod` — sama dengan cabangnya di `buildReportPayload`.
 */
export const STOCK_PERIOD_REPORTS: readonly string[] = ["stock-movement", "opname-history"];

/**
 * `compare` yang sah untuk laporan ini, atau `null` — dan parameter tanpa
 * `compare` yang tidak sah. Nilai tak dikenal DIABAIKAN, seperti halaman
 * (`parseComparison`): tautan lama memulangkan laporan biasa, bukan galat.
 */
function comparisonParams(
  report: ReportDefinition,
  params: Record<string, string>
): { compare: ReturnType<typeof parseComparison>; params: Record<string, string> } {
  const compare = COMPARABLE_REPORTS.includes(report.id) ? parseComparison(params.compare) : null;
  const rest = Object.fromEntries(Object.entries(params).filter(([k]) => k !== "compare"));
  return { compare, params: compare === null ? rest : { ...rest, compare } };
}

/**
 * Bentuk muatan per `paramKind`, TANPA memeriksa register. Dipisah dari
 * `goExportPayload` supaya bentuk laporan `go-parity` (Laba Rugi berperiode)
 * teruji SEBELUM peralihannya — pelari Go sudah membacanya, dan bentuk yang baru
 * diuji pada hari peralihan adalah bentuk yang diuji di produksi. MURNI.
 */
export function goExportPayloadShape(
  report: ReportDefinition,
  params: Record<string, string>,
  now: Date = new Date()
): GoExportPayload {
  switch (report.paramKind) {
    case "as_of": {
      const { asOf, asOfISO } = resolveAsOf(params.asOf, now);
      const c = comparisonParams(report, params);
      const priorAsOf = c.compare === null ? null : comparisonDate(asOf, c.compare);
      return {
        reportId: report.id,
        params: { ...c.params, asOf: asOfISO },
        asOfInstant: asOf.toISOString(),
        ...(priorAsOf ? { priorAsOfInstant: priorAsOf.toISOString() } : {}),
      };
    }
    case "period": {
      /* Riwayat Stok & Riwayat Hitung Ulang Stok memakai penentu periode
         MILIKNYA (`resolveStockPeriod`), persis `buildReportPayload` dan
         halamannya: bawaannya bulan berjalan, bukan awal tahun. Dengan dua
         penentu, muatan tanpa `from`/`to` akan menyebut periode lain dari
         berkas TS-nya. */
      const { from, to, fromISO, toISO } = STOCK_PERIOD_REPORTS.includes(report.id)
        ? resolveStockPeriod(undefined, undefined, params.from, params.to, now)
        : resolvePeriod(params.from, params.to, now);
      const c = comparisonParams(report, params);
      const prior = c.compare === null ? null : comparisonRange(from, to, c.compare);
      return {
        reportId: report.id,
        params: { ...c.params, from: fromISO, to: toISO },
        fromInstant: from.toISOString(),
        toInstant: to.toISOString(),
        ...(prior
          ? { priorFromInstant: prior.from.toISOString(), priorToInstant: prior.to.toISOString() }
          : {}),
      };
    }
    default:
      /* Melempar lebih jujur daripada menerbitkan pekerjaan yang pekerjanya
         tidak tahu cara membacanya. */
      throw new Error(
        `laporan \`${report.id}\` ber-paramKind \`${report.paramKind}\` — penerbit Go baru ` +
          "mengenal `as_of` dan `period`"
      );
  }
}

/**
 * Muatan pekerjaan dari laporan + parameternya. MURNI — diuji tanpa antrean.
 * Hanya untuk laporan yang register-nya `go`.
 */
export function goExportPayload(
  report: ReportDefinition,
  params: Record<string, string>,
  now: Date = new Date()
): GoExportPayload {
  if (reportEngine(report.id) !== "go") {
    throw new Error(`laporan \`${report.id}\` bukan milik mesin Go (src/lib/report-engine.ts)`);
  }
  return goExportPayloadShape(report, params, now);
}

/** Terbitkan satu ekspor Go. `null` hanya bila `dedupeKey` bertabrakan — dan ia tidak dipakai. */
export async function publishGoExport(
  report: ReportDefinition,
  params: Record<string, string>,
  companyId: number
): Promise<{ id: number } | null> {
  return publishJob({
    kind: "report.export_go",
    companyId,
    payload: goExportPayload(report, params),
    /* TANPA `dedupeKey`, alasan yang sama dengan `report.export`: dua klik
       adalah dua berkas yang diminta. */
  });
}
