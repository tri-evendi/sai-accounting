/**
 * Sumber data Accurate — satu seam, dua jalan (integrasi Accurate, tahap 4).
 *
 * ══ KENAPA SEBUAH ANTARMUKA UNTUK SATU IMPLEMENTASI ════════════════════════
 * Hari ini hanya ada satu jalan masuk: berkas `.xlsx` yang diunduh orang dari
 * layar Ekspor Accurate. Itu jalan yang benar untuk memulai — tanpa kredensial,
 * tanpa ketergantungan jaringan, dan bisa dibuktikan hari ini dengan berkas
 * yang sudah ada di tangan.
 *
 * Yang direncanakan berikutnya adalah menarik langsung lewat Accurate Open API.
 * Perbedaan keduanya HANYA di cara byte-nya tiba; seluruh aturan sesudah itu —
 * membaca halaman cetak, mencocokkan buku, menyusun saldo awal — sama persis.
 * Antarmuka ini menaruh perbedaan itu di satu tempat, supaya penambahan
 * nantinya tidak menyentuh satu pun konsumennya.
 *
 * ══ SUMBER YANG BELUM ADA MELAPORKAN DIRINYA BELUM ADA ═════════════════════
 * `openApiLedgerSource` sengaja HADIR dan sengaja `available: false`. Ia
 * melempar bila dipanggil, bukan memulangkan kosong: sumber yang diam-diam
 * memulangkan "tidak ada apa-apa" akan terbaca sebagai buku Accurate yang
 * kosong, dan buku kosong yang dibandingkan dengan buku kita menghasilkan
 * "semua transaksi hanya ada di sisi kita" — laporan yang salah total dan
 * tampak masuk akal. Lebih baik satu galat yang jelas.
 *
 * SERVER-ONLY: `readFirstSheetRows` memakai ExcelJS (pustaka Node).
 */
import { readFirstSheetRows } from "@/lib/xlsx-read";
import { isAccurateReport } from "@/lib/accurate/report-sheet";
import {
  parseAccurateLedgerReport,
  type AccurateLedgerReport,
} from "@/lib/accurate/ledger-report";

export type AccurateSourceId = "file" | "open_api";

/** Dilempar bila sumbernya dipanggil sebelum ia benar-benar ada. */
export class AccurateSourceUnavailableError extends Error {
  constructor(readonly sourceId: AccurateSourceId, message: string) {
    super(message);
    this.name = "AccurateSourceUnavailableError";
  }
}

/** Dilempar bila berkasnya terbaca tapi jelas bukan yang diminta. */
export class AccurateReportShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccurateReportShapeError";
  }
}

export interface AccurateFetchInput {
  /** Isi berkas ekspor `.xlsx` — dipakai sumber `file`. */
  buffer?: Buffer;
}

export interface AccurateLedgerSource {
  readonly id: AccurateSourceId;
  /** `false` berarti jalur ini belum terpasang; UI menampilkannya redup. */
  readonly available: boolean;
  fetchLedgerReport(input: AccurateFetchInput): Promise<AccurateLedgerReport>;
}

/** Sumber BERKAS — satu-satunya yang hidup hari ini. */
export const fileLedgerSource: AccurateLedgerSource = {
  id: "file",
  available: true,
  async fetchLedgerReport({ buffer }) {
    if (!buffer) {
      throw new AccurateReportShapeError("Tidak ada berkas yang dibaca.");
    }

    const sheet = await readFirstSheetRows(buffer);
    if (!isAccurateReport(sheet)) {
      throw new AccurateReportShapeError(
        "Berkas ini bukan ekspor laporan Accurate — penanda kaki halamannya tidak ditemukan. " +
          "Ekspor ulang lewat tombol Excel di layar laporan Accurate, tanpa menyunting hasilnya."
      );
    }

    const report = parseAccurateLedgerReport(sheet);
    if (!report) {
      throw new AccurateReportShapeError(
        "Laporan Accurate terbaca, tapi baris judul kolomnya tidak ditemukan."
      );
    }
    if (report.missingColumns.length > 0) {
      throw new AccurateReportShapeError(
        `Kolom wajib tidak ada di laporan ini: ${report.missingColumns.join(", ")}. ` +
          "Yang diharapkan laporan Rincian Buku Besar."
      );
    }
    return report;
  },
};

/** Sumber OPEN API — seam-nya sudah ada, jalurnya belum. */
export const openApiLedgerSource: AccurateLedgerSource = {
  id: "open_api",
  available: false,
  async fetchLedgerReport() {
    throw new AccurateSourceUnavailableError(
      "open_api",
      "Penarikan langsung dari Accurate Online belum tersedia. Untuk sekarang unggah berkas ekspornya."
    );
  },
};

export const ACCURATE_LEDGER_SOURCES: readonly AccurateLedgerSource[] = [
  fileLedgerSource,
  openApiLedgerSource,
];

export function ledgerSource(id: AccurateSourceId): AccurateLedgerSource {
  const found = ACCURATE_LEDGER_SOURCES.find((s) => s.id === id);
  if (!found) throw new AccurateSourceUnavailableError(id, `Sumber "${id}" tidak dikenal.`);
  return found;
}
