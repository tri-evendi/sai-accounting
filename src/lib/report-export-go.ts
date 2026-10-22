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
import { resolveAsOf, type ReportDefinition } from "@/lib/report-catalog";
import { reportEngine } from "@/lib/report-engine";

/** Muatan `report.export_go`. Dibaca `services/integrator/cmd/interactive`. */
export type GoExportPayload = {
  reportId: string;
  params: Record<string, string>;
  /** Batas tanggal INKLUSIF sebagai instan ISO UTC — lihat kepala berkas. */
  asOfInstant: string;
};

/**
 * Muatan pekerjaan dari laporan + parameternya. MURNI — diuji tanpa antrean.
 *
 * Hanya laporan ber-`paramKind: "as_of"` yang didukung hari ini, karena hanya
 * itu yang punya implementasi Go. Laporan berperiode yang pindah kelak
 * menambah cabangnya DI SINI — dan sampai itu, melempar lebih jujur daripada
 * menerbitkan pekerjaan yang pekerjanya tidak tahu cara membacanya.
 */
export function goExportPayload(
  report: ReportDefinition,
  params: Record<string, string>,
  now: Date = new Date()
): GoExportPayload {
  if (reportEngine(report.id) !== "go") {
    throw new Error(`laporan \`${report.id}\` bukan milik mesin Go (src/lib/report-engine.ts)`);
  }
  if (report.paramKind !== "as_of") {
    throw new Error(
      `laporan \`${report.id}\` ber-paramKind \`${report.paramKind}\` — penerbit Go baru ` +
        "mengenal `as_of`"
    );
  }
  const { asOf, asOfISO } = resolveAsOf(params.asOf, now);
  return {
    reportId: report.id,
    params: { ...params, asOf: asOfISO },
    asOfInstant: asOf.toISOString(),
  };
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
