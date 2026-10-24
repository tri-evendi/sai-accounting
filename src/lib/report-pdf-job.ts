/**
 * Pekerjaan `report.pdf` — PDF laporan yang terlalu besar untuk permintaan
 * HTTP (09 §5), dikerjakan peran `interactive` (`workers/interactive.ts`).
 *
 * ══ SATU JALAN, DUA PEMICU ═════════════════════════════════════════════════
 * Rute sinkron `/api/reports/pdf/<jenis>` dan pekerjaan ini memanggil fungsi
 * yang SAMA dari `REPORT_PDF`: skema badan yang sama, pembangun muatan yang
 * sama (`src/lib/report-pdf-payload.ts`), generator jsPDF yang sama, nama
 * berkas yang sama. Yang berbeda hanya kapan ia berjalan — dan karena itu
 * berkas berantre adalah dokumen yang sama dengan berkas sinkron, bukan dua
 * yang mirip. Node, bukan Go: generatornya TS, dan menulis ulang di Go membuka
 * jendela dua-implementasi §3.3 tanpa pemicu.
 *
 * ══ MUATAN PEKERJAAN DIPERIKSA ULANG, TIDAK DIPERCAYA ═════════════════════
 * `{ jenis, params }` ditulis rute sesudah lolos penjaganya, tetapi ia
 * dibaca dari basis data kendali berjam-jam kemudian — oleh rilis yang bisa
 * berbeda. Jenis yang tak dikenal atau tidak bisa diantrekan, dan parameter
 * yang tidak lolos skema hari ini, MELEMPAR: pekerjaan yang diam-diam tidak
 * menghasilkan apa pun terbaca `done` tanpa berkas.
 *
 * ══ BYTE-NYA DIHASILKAN SEKALI ════════════════════════════════════════════
 * `output("arraybuffer")` tepat sekali, dan buffer itu yang disimpan dan
 * kemudian di-stream rute hasil — syarat audit §5 ("yang disimpan sama dengan
 * yang dikirim") dipenuhi dengan satu pembangkitan, bukan dua yang kebetulan
 * sama (`/ID` jsPDF acak).
 *
 * Konteks perusahaan dipasang PEMANGGILNYA (`dalamKonteksPerusahaan`): modul
 * ini memanggil `prisma` PT aktif dan melempar bila konteksnya hilang, tidak
 * pernah jatuh ke basis data bawaan.
 */
import "server-only";

import { businessISODate } from "@sai/core/business-date";

import { REPORT_PDF, isQueueableReportPdf } from "@/lib/report-pdf";
import { serverPdfCompany } from "@/lib/pdf-company";

/** Muatan `report.pdf` — PARAMETER saja, tak satu angka akuntansi (#104). */
export interface ReportPdfJobPayload {
  jenis?: unknown;
  params?: unknown;
}

export interface ReportPdfFile {
  filename: string;
  bytes: Uint8Array;
}

/**
 * Hitung muatan dari parameternya, lalu gambar SEKALI.
 *
 * `bacaBuku` membungkus pembacaan buku — pekerja menyerahkan `runReadOnly`
 * (replika baca bila terpasang); bawaannya langsung.
 */
export async function renderReportPdfJob(
  payload: ReportPdfJobPayload,
  bacaBuku: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn()
): Promise<ReportPdfFile> {
  const { jenis, params } = payload ?? {};
  if (!isQueueableReportPdf(jenis)) {
    throw new Error(
      `muatan \`report.pdf\` dengan jenis ${JSON.stringify(jenis)} — bukan laporan yang muatannya dihitung server`
    );
  }
  const spec = REPORT_PDF[jenis];
  const badan = spec.schema.safeParse(params ?? {});
  if (!badan.success) {
    throw new Error(`parameter \`report.pdf\`/${jenis} tidak lolos skema hari ini`);
  }

  const muatan = await bacaBuku(() => spec.muatan(badan.data));
  /* ⚠ TIDAK ada batas baris di sini, dan itu disengaja — sama dengan pekerja
     ekspor: batas di rute sinkron ada untuk melindungi event loop, dan jalur
     ini justru yang menggantikannya. Yang melindungi pelari ini adalah batas
     memorinya sendiri. */
  const company = await serverPdfCompany(`jobs/report.pdf/${jenis}`);
  const doc = await spec.gambar(muatan, company);
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);

  return { filename: `${spec.slug(muatan)}_${businessISODate(new Date())}.pdf`, bytes };
}
