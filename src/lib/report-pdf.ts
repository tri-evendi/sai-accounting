/**
 * REGISTRI LAPORAN PDF — satu rute, satu peta, empat jenis.
 *
 * Sampai tahap 1c `src/app/api/reports/pdf/route.ts` melayani SATU laporan
 * (laporan keuangan) dan tiga laporan lain masih digambar peramban. Peta ini
 * menutup sisanya tanpa menambah rute: jenis baru = satu entri di sini.
 *
 * ══ HAL YANG WAJIB DIPUTUSKAN PER JENIS, DAN SEMUANYA DI SINI ══════════════
 * `Record` ini LENGKAP atas `ReportPdfKind`. Jenis baru tidak akan mengompilasi
 * sampai semuanya diputuskan — dan itulah gunanya:
 *
 *  1. **izin** — bukan satu izin untuk semua. Lembar stok bukan laporan kas,
 *     dan orang yang boleh melihat yang satu belum tentu boleh yang lain;
 *  2. **bentuk BADANNYA** (`zod`) — rute menolak sebelum satu baris dibaca;
 *  3. **asal muatannya** (`sumber` + `muatan`) — lihat di bawah;
 *  4. **penghitung BARISNYA** — ambang penyerahan & 413 butuh satu angka, dan
 *     muatan tiap laporan berbeda bentuk. Penghitung yang ditulis di dalam rute
 *     adalah penghitung yang akan melewatkan laporan berikutnya;
 *  5. **nama berkasnya**.
 *
 * ══ DUA ASAL MUATAN, DAN HANYA SATU YANG BISA DIANTREKAN ══════════════════
 *  • `"parameter"` — badannya PARAMETER, dan muatannya dihitung DI SERVER dari
 *    buku PT (`src/lib/report-pdf-payload.ts`). Tiga laporan yang dulu dirakit
 *    peramban (stok, opname, kas). Karena asalnya parameter, laporan yang besar
 *    bisa diserahkan ke antrean (`report.pdf`): pekerjaan di basis data KENDALI
 *    hanya membawa parameter (#104), dan pekerjanya menghitung ulang dengan
 *    `muatan` yang SAMA.
 *  • `"muatan"` — badannya muatan JADI yang sudah dihitung halaman laporan
 *    keuangan (`statement`). Ia tidak bisa diantrekan dari sini: muatan tanpa
 *    asal tidak bisa dihitung ulang siapa pun. Jalur ekspor besarnya tetap
 *    `/api/reports/export` (laporan katalog, dari `reportId` + parameter).
 *
 * ⚠ Entri `statement` memakai `buildReportSheet` — pemeta yang SAMA dengan
 * ekspor Excel — dan itu disengaja: dua penghitung untuk satu laporan berarti
 * ada ukuran muatan yang ditolak satu tombol dan diterima tombol di sebelahnya.
 * Tiga jenis lain tidak punya ekspor Excel, jadi barisnya dihitung dari
 * muatannya sendiri.
 */
import "server-only";

import type { z } from "zod";
import type { jsPDF } from "jspdf";

import type { Permission } from "@sai/core/authz";
import type { PdfCompany } from "@/lib/pdf/company-header";
import { statementPayloadSchema } from "@/lib/validations/report-export";
import {
  financeReportParamsSchema,
  opnameSheetParamsSchema,
  stockReportParamsSchema,
} from "@/lib/validations/report-pdf";
import {
  financeReportPayload,
  opnameSheetPayload,
  stockReportPayload,
} from "@/lib/report-pdf-payload";
import { buildReportSheet } from "@/lib/report-export";
import { STATEMENT_TITLES } from "@/lib/statement-layout";

/* Kosakata jenisnya di modul tersendiri — ia dibaca juga oleh tombol di
   peramban, dan berkas INI `server-only`. */
export { REPORT_PDF_KINDS, isReportPdfKind } from "@/lib/report-pdf-kinds";
import { isReportPdfKind, type ReportPdfKind } from "@/lib/report-pdf-kinds";
export type { ReportPdfKind };

/** Asal muatan sebuah jenis — lihat "DUA ASAL MUATAN" di kepala berkas. */
export type ReportPdfSource = "parameter" | "muatan";

type JenisLaporan<S extends z.ZodTypeAny, M> = {
  permission: Permission;
  /** Bentuk BADAN permintaan — parameter atau muatan jadi, menurut `sumber`. */
  schema: S;
  sumber: ReportPdfSource;
  /**
   * Badan yang sudah divalidasi → muatan generator. Untuk `"parameter"` ia
   * MEMBACA buku PT aktif; untuk `"muatan"` badannya sudah muatannya.
   */
  muatan: (badan: z.infer<S>) => Promise<M>;
  /** Baris yang akan digambar — dibandingkan dengan ambang penyerahan & `EXPORT_MAX_ROWS`. */
  barisnya: (muatan: M) => number;
  /** Nama berkas TANPA tanggal; pemanggilnya yang menempelkan tanggalnya. */
  slug: (muatan: M) => string;
  gambar: (muatan: M, company: PdfCompany) => Promise<jsPDF>;
};

/** Bentuk SERAGAM yang dilihat pemanggil — badan dan muatannya `unknown`. */
type JenisTerhapus = {
  permission: Permission;
  schema: z.ZodTypeAny;
  sumber: ReportPdfSource;
  muatan: (badan: unknown) => Promise<unknown>;
  barisnya: (muatan: unknown) => number;
  slug: (muatan: unknown) => string;
  gambar: (muatan: unknown, company: PdfCompany) => Promise<jsPDF>;
};

/**
 * Mengetik satu entri, lalu MENGHAPUS tipenya untuk pemanggil.
 *
 * Di dalam `REPORT_PDF` setiap entri diketik penuh terhadap skema dan
 * muatannya sendiri — `muatan.items` di entri `stock` benar-benar
 * `StockReportPayload`, dan medan yang salah tulis gugur di `tsc` di tempat ia
 * ditulis. Yang dilihat rute dan pekerja seragam, jadi keduanya tidak butuh
 * satu pun cast dan tidak punya `switch` atas jenis.
 *
 * ⚠ `as` hidup di sini, dan HANYA di sini. Ia sah karena korelasinya dijamin
 * pembangunannya: badan yang sampai ke `muatan` selalu keluaran `schema.parse`
 * DARI ENTRI YANG SAMA, dan muatan yang sampai ke tiga fungsi lain selalu
 * keluaran `muatan` entri itu — pemanggil mengambil semuanya dari satu objek
 * dan tidak punya jalan untuk memasangkannya silang. TypeScript tidak bisa
 * menyatakan korelasi itu tanpa mesin generik yang jauh lebih besar daripada
 * aturan yang dijaganya.
 */
function jenis<S extends z.ZodTypeAny, M>(def: JenisLaporan<S, M>): JenisTerhapus {
  return {
    permission: def.permission,
    schema: def.schema,
    sumber: def.sumber,
    muatan: (badan) => def.muatan(badan as z.infer<S>),
    barisnya: (muatan) => def.barisnya(muatan as M),
    slug: (muatan) => def.slug(muatan as M),
    gambar: (muatan, company) => def.gambar(muatan as M, company),
  };
}

/* Nama berkas yang aman lintas sistem berkas DAN lintas header — aturan yang
   sama dengan lampiran faktur (#465). */
function aman(nama: string): string {
  return nama.replace(/[^A-Za-z0-9._-]/g, "_");
}

export const REPORT_PDF = {
  statement: jenis({
    permission: "report.export",
    schema: statementPayloadSchema,
    /* Muatan JADI dari halaman laporan keuangan — tidak diantrekan dari sini. */
    sumber: "muatan",
    muatan: async (badan) => badan,
    /* Pemeta yang SAMA dengan ekspor Excel — lihat ⚠ di kepala berkas. */
    barisnya: (muatan) => buildReportSheet(muatan).rows.length,
    slug: (muatan) => aman(STATEMENT_TITLES[muatan.kind]),
    gambar: async (muatan, company) =>
      (await import("@/lib/pdf/statement-pdf")).generateStatementPDF(muatan, company),
  }),
  stock: jenis({
    /* `inventory.read` — izin yang SAMA dengan halaman yang menampilkannya.
       Laporan yang bisa dicetak oleh orang yang tidak boleh membuka halamannya
       adalah pintu kedua ke data yang sama. */
    permission: "inventory.read",
    schema: stockReportParamsSchema,
    sumber: "parameter",
    muatan: () => stockReportPayload(),
    barisnya: (muatan) => muatan.items.length,
    slug: () => "Stock_Report",
    gambar: async (muatan, company) =>
      (await import("@/lib/pdf/stock-report-pdf")).generateStockReportPDF(muatan.items, company),
  }),
  opname: jenis({
    /*
     * `inventory.write`, bukan `.read` — dan ini satu-satunya entri yang
     * izinnya lebih tinggi dari "boleh melihat laporannya".
     *
     * Lembar ini dicetak untuk DIISI lalu diketik balik sebagai penyesuaian
     * stok, dan halaman opname-nya memang menuntut `inventory.write` (#129).
     * Menurunkannya ke `.read` di sini akan memberi orang yang hanya boleh
     * melihat stok sebuah formulir resmi berkop perusahaan untuk pekerjaan
     * yang tidak boleh ia lakukan.
     */
    permission: "inventory.write",
    schema: opnameSheetParamsSchema,
    sumber: "parameter",
    muatan: (badan) => opnameSheetPayload(badan),
    barisnya: (muatan) => muatan.items.length,
    slug: () => "Lembar_Hitung_Stok",
    gambar: async (muatan, company) =>
      (await import("@/lib/pdf/opname-sheet-pdf")).generateOpnameSheetPDF(muatan.items, company, {
        date: muatan.date,
        showSystemQty: muatan.showSystemQty,
      }),
  }),
  finance: jenis({
    /* `cash.read` — izin halaman Kas & Bank, bukan `report.*`. */
    permission: "cash.read",
    schema: financeReportParamsSchema,
    sumber: "parameter",
    muatan: (badan) => financeReportPayload(badan),
    /* Kedua bagian digambar di lembar yang sama, jadi keduanya dihitung. */
    barisnya: (muatan) => muatan.balances.length + muatan.transactions.length,
    slug: () => "Finance_Report",
    gambar: async (muatan, company) =>
      (await import("@/lib/pdf/finance-report-pdf")).generateFinanceReportPDF(
        muatan.balances,
        muatan.transactions,
        company
      ),
  }),
  /* `Record<…, unknown>`: yang dijaga `satisfies` di sini KELENGKAPAN kuncinya —
     tak ada jenis yang hilang, tak ada kunci yang bukan jenis. Bentuk nilainya
     sudah dijaga `jenis()` di tempat tiap entri ditulis. */
} as const satisfies Record<ReportPdfKind, unknown>;

/** Jenis yang muatannya dihitung server — satu-satunya yang boleh diantrekan. */
export function isQueueableReportPdf(nilai: unknown): nilai is ReportPdfKind {
  return typeof nilai === "string" && isReportPdfKind(nilai) && REPORT_PDF[nilai].sumber === "parameter";
}
