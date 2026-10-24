/**
 * GERBANG KEDUA atas hasil pekerjaan — izin yang dibawa MUATANNYA.
 *
 * ══ CELAH YANG DITUTUPNYA, DAN IA CELAH DI KODE SAYA SENDIRI ═══════════════
 * `JOB_RESULT_PERMISSION` menjawab "boleh mengunduh hasil JENIS ini". Itu
 * perlu, dan ia tidak cukup — persis dengan alasan yang sudah ditulis
 * `/api/reports/payload` sejak #355:
 *
 *   `report.export` hanya menjawab "boleh mengekspor laporan", bukan "boleh
 *   mengekspor laporan INI".
 *
 * Tanpa gerbang ini, sebuah pekerjaan `report.export` atas Nilai Persediaan
 * yang diterbitkan ketika modul Stok masih aktif tetap bisa diunduh SESUDAH
 * modul itu dimatikan — dan itu melanggar justru aturan yang §4 tuntut:
 * "izin diperiksa SAAT MENGUNDUH, bukan hanya saat pekerjaan lahir". Pekerjaan
 * hidup berjam-jam; modul dan peran berubah di antaranya.
 *
 * ══ MUATAN PEKERJAAN AMAN DIBACA DI SINI ═══════════════════════════════════
 * `jobs` hidup di basis data KENDALI, dan kendali TIDAK memuat satu angka
 * akuntansi pun (`@sai/core/control-db`). Muatan pekerjaan karena itu hanya
 * membawa PARAMETER — id laporan, periode, id perusahaan — dan pekerjanya yang
 * menghitung angkanya dari buku PT saat ia berjalan. Membaca parameter untuk
 * memutuskan izin tidak membuka apa pun yang belum diketahui penanyanya: ia
 * sendiri yang mengirimkannya.
 *
 * ══ `switch` YANG LENGKAP, BUKAN PETA OPSIONAL ═════════════════════════════
 * Setiap `kind` wajib disebut, dan `tsc` menolak yang tidak. `kind` baru yang
 * menghasilkan berkas karena itu tidak bisa lahir tanpa seseorang memutuskan
 * apakah hasilnya butuh gerbang kedua — dan keputusan "tidak butuh" ditulis
 * sebagai `return true` beserta alasannya, bukan sebagai ketiadaan baris.
 */
import "server-only";

import { canEffective } from "@/lib/authz-effective";
import { isExportable, reportById } from "@/lib/report-catalog";
import { REPORT_PDF, isQueueableReportPdf } from "@/lib/report-pdf";
import type { JobKind } from "@sai/core/generated/job-kinds";

/** Pengguna yang sedang meminta — bentuk yang dipulangkan penjaga API. */
export interface PemintaHasil {
  id: string;
  role: string;
}

/**
 * Apakah pengguna ini berhak atas hasil pekerjaan dengan muatan ini?
 *
 * Dipanggil SESUDAH `JOB_RESULT_PERMISSION` lolos. `false` dijawab 404 oleh
 * pemanggilnya — bukan 403: pemanggil yang tidak berhak tidak perlu tahu
 * laporan itu ada (pola yang sama dengan `/api/reports/payload`).
 */
export async function bolehAmbilHasil(
  kind: JobKind,
  payload: unknown,
  user: PemintaHasil,
  /**
   * Yang disebut ALAMAT permintaan. `report.pdf`: jenis laporan dari `?jenis=`
   * — dasar gerbang pertama rute hasil — yang wajib sama dengan muatannya.
   */
  diminta: { jenis?: string | null } = {}
): Promise<boolean> {
  switch (kind) {
    case "report.export":
    /* Ekspor yang dihitung Go (tahap 1d) — muatannya membawa `reportId` yang
       sama bentuknya (`src/lib/report-export-go.ts`), jadi gerbang keduanya
       SAMA, bukan versi kedua yang bisa menyimpang. */
    case "report.export_go":
    case "report.package": {
      /*
       * Muatannya WAJIB menyebut laporan mana. Muatan tanpa `reportId` adalah
       * pekerjaan yang tidak bisa diperiksa gerbang keduanya, dan jawabannya
       * TOLAK — bukan "lewati gerbangnya". Baris yang tidak bisa diperiksa
       * bukan baris yang bersih; aturan yang sama dengan `vonisVersi`
       * memulangkan `tak_terbaca` alih-alih `mutakhir`.
       */
      const reportId = (payload as { reportId?: unknown } | null)?.reportId;
      if (typeof reportId !== "string" || reportId === "") return false;

      const report = reportById(reportId);
      if (!report || !isExportable(report)) return false;

      /* `canEffective` memeriksa modul lebih dulu, jadi satu panggilan menutup
         modul-mati maupun peran-tak-berhak. */
      return canEffective(user, report.permission);
    }

    case "report.pdf": {
      /*
       * PDF laporan berantre (09 §5). Muatannya `{ jenis, params }`, dan izin
       * yang dituntut milik JENIS itu — izin halaman yang menampilkannya
       * (`REPORT_PDF[jenis].permission`). Rute hasil sudah menuntut izin yang
       * sama dari `?jenis=` di alamatnya dan mencocokkannya dengan muatan;
       * pemeriksaan ini lapis kedua atas MUATAN, terhadap keadaan peran HARI
       * INI. Jenis yang tidak bisa diantrekan (`statement`) atau tak dikenal
       * DITOLAK: baris yang tidak bisa diperiksa bukan baris yang bersih.
       */
      const jenis = (payload as { jenis?: unknown } | null)?.jenis;
      if (!isQueueableReportPdf(jenis)) return false;
      /* Gerbang pertama memakai izin jenis di ALAMAT. Hasil jenis lain — mis.
         alamat menyebut `stock` (semua peran) untuk hasil `finance` — DITOLAK:
         alamat hanya boleh mempersempit, tidak pernah memperluas. */
      if (diminta.jenis !== jenis) return false;
      return canEffective(user, REPORT_PDF[jenis].permission);
    }

    case "document.generate":
      /*
       * Belum diterbitkan siapa pun (tahap 1c berikutnya). Ketika ia lahir,
       * gerbang keduanya BUKAN opsional: muatannya akan menyebut dokumen mana,
       * dan dokumen itu wajib ADA di basis data PT yang sedang dibuka — sama
       * seperti rute berkas dokumen membuktikannya dengan `findUnique` atas
       * klien PT aktif, bukan dengan perbandingan kepemilikan yang ditulis
       * tangan. `false` sampai itu ditulis: jenis yang belum punya gerbangnya
       * tidak boleh bisa diunduh.
       */
      return false;

    /*
     * Jenis di bawah TIDAK PERNAH menghasilkan berkas yang bisa diunduh
     * pengguna — `JOB_RESULT_PERMISSION` sudah menyatakannya `null`, dan rute
     * unduhan gugur di sana sebelum sampai ke sini. Baris-baris ini ada supaya
     * `switch`-nya LENGKAP, sehingga `kind` baru tidak bisa lolos tanpa
     * keputusan.
     */
    case "company.provision":
    case "import.process":
    case "mail.batch":
    /* Diunduh lewat pintu TENANT-nya sendiri (`src/lib/tenant-export-job.ts`),
       tidak pernah lewat rute per-PT — `JOB_RESULT_PERMISSION` menyatakannya
       `null` di sini. */
    case "tenant.data_export":
    case "tenant.backup":
    case "tenant.conformance":
    case "schema.migrate":
    case "schedule.tick":
    case "ledger.recurring":
    case "ledger.dunning":
    case "integration.efaktur_submit":
    case "integration.efaktur_poll":
    case "integration.efaktur_cancel":
    case "efaktur.record":
    case "integration.bank_feed":
    case "document.invoice_send":
      return false;
  }
}
