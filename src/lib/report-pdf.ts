/**
 * REGISTRI LAPORAN PDF — satu rute, satu peta, empat jenis.
 *
 * Sampai tahap 1c `src/app/api/reports/pdf/route.ts` melayani SATU laporan
 * (laporan keuangan) dan tiga laporan lain masih digambar peramban. Peta ini
 * menutup sisanya tanpa menambah rute: jenis baru = satu entri di sini.
 *
 * ══ EMPAT HAL YANG WAJIB DIPUTUSKAN PER JENIS, DAN SEMUANYA DI SINI ════════
 * `Record` ini LENGKAP atas `ReportPdfKind`. Jenis baru tidak akan mengompilasi
 * sampai keempatnya diputuskan — dan itulah gunanya:
 *
 *  1. **izin** — bukan satu izin untuk semua. Lembar stok bukan laporan kas,
 *     dan orang yang boleh melihat yang satu belum tentu boleh yang lain;
 *  2. **bentuk muatannya** (`zod`) — rute menolak sebelum satu baris digambar;
 *  3. **penghitung BARISNYA** — ambang 413 butuh satu angka, dan muatan tiap
 *     laporan berbeda bentuk. Penghitung yang ditulis di dalam rute adalah
 *     penghitung yang akan melewatkan laporan berikutnya;
 *  4. **nama berkasnya**.
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
  financeReportPayloadSchema,
  opnameSheetPayloadSchema,
  stockReportPayloadSchema,
} from "@/lib/validations/report-pdf";
import { buildReportSheet } from "@/lib/report-export";
import { STATEMENT_TITLES } from "@/lib/statement-layout";

/* Kosakata jenisnya di modul tersendiri — ia dibaca juga oleh tombol di
   peramban, dan berkas INI `server-only`. */
export { REPORT_PDF_KINDS, isReportPdfKind } from "@/lib/report-pdf-kinds";
import type { ReportPdfKind } from "@/lib/report-pdf-kinds";
export type { ReportPdfKind };

type JenisLaporan<S extends z.ZodTypeAny> = {
  permission: Permission;
  schema: S;
  /** Baris yang akan digambar — dibandingkan dengan `EXPORT_MAX_ROWS`. */
  barisnya: (muatan: z.infer<S>) => number;
  /** Nama berkas TANPA tanggal; rutenya yang menempelkan tanggalnya. */
  slug: (muatan: z.infer<S>) => string;
  gambar: (muatan: z.infer<S>, company: PdfCompany) => Promise<jsPDF>;
};

/** Bentuk SERAGAM yang dilihat pemanggil — muatannya `unknown`. */
type JenisTerhapus = JenisLaporan<z.ZodTypeAny> & {
  barisnya: (muatan: unknown) => number;
  slug: (muatan: unknown) => string;
  gambar: (muatan: unknown, company: PdfCompany) => Promise<jsPDF>;
};

/**
 * Mengetik satu entri, lalu MENGHAPUS tipenya untuk pemanggil.
 *
 * Di dalam `REPORT_PDF` setiap entri diketik penuh terhadap skemanya sendiri —
 * `muatan.items` di entri `stock` benar-benar `StockReportPayload`, dan medan
 * yang salah tulis gugur di `tsc` di tempat ia ditulis. Yang dilihat rute
 * seragam, jadi rute tidak butuh satu pun cast dan tidak punya `switch` atas
 * jenis.
 *
 * ⚠ Satu `as` hidup di sini, dan HANYA di sini. Ia sah karena korelasinya
 * dijamin pembangunannya: `muatan` yang sampai ke ketiga fungsi di bawah selalu
 * keluaran `schema.parse` DARI ENTRI YANG SAMA — pemanggil mengambil keduanya
 * dari satu objek dan tidak punya jalan untuk memasangkannya silang. TypeScript
 * tidak bisa menyatakan korelasi itu tanpa mesin generik yang jauh lebih besar
 * daripada aturan yang dijaganya.
 */
function jenis<S extends z.ZodTypeAny>(def: JenisLaporan<S>): JenisTerhapus {
  return {
    permission: def.permission,
    schema: def.schema,
    barisnya: (muatan) => def.barisnya(muatan as z.infer<S>),
    slug: (muatan) => def.slug(muatan as z.infer<S>),
    gambar: (muatan, company) => def.gambar(muatan as z.infer<S>, company),
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
    schema: stockReportPayloadSchema,
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
    schema: opnameSheetPayloadSchema,
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
    schema: financeReportPayloadSchema,
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
