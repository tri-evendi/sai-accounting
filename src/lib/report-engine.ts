/**
 * REGISTER PEMILIK MESIN LAPORAN — tahap 1d (09 §9).
 *
 * Tahap 1d memindahkan perhitungan laporan ke Go SATU LAPORAN SEKALIGUS, dan
 * selama transisinya satu laporan bisa punya dua implementasi. Register ini
 * menjawab satu pertanyaan tanpa menebak: untuk laporan X, mesin mana yang
 * menghasilkan BERKAS-nya hari ini?
 *
 *   • `ts`        — hanya TypeScript. Bawaan untuk setiap laporan yang tidak
 *                   tercantum di bawah.
 *   • `go-parity` — implementasi Go ADA dan dibuktikan setara lewat skrip
 *                   paritasnya, tetapi berkas masih dihasilkan TypeScript.
 *                   Keadaan ini menunggu sesi utama menjalankan paritas
 *                   terhadap buku produksi.
 *   • `go`        — berkas dihasilkan Go; versi TS untuk jalur berkas dicabut.
 *                   Layar TETAP TypeScript sampai diputuskan lain (09 §3.3:
 *                   layar tidak bisa menunggu pekerjaan).
 *
 * ══ KENAPA REGISTER, BUKAN SAKLAR DI env ═══════════════════════════════════
 * Saklar lingkungan bisa berbeda antara mesin uji dan produksi tanpa jejak di
 * git, dan "mesin mana yang menghitung angka ini" adalah pertanyaan yang
 * jawabannya harus bisa dibaca dari satu commit. Perpindahan `go-parity` → `go`
 * adalah KEPUTUSAN, dan penjaga `tests/report-engine.test.ts` menuntut bukti
 * paritasnya (`parityProven`) tertulis di entri yang sama.
 */
import type { ReportId } from "@/lib/report-catalog";

export type ReportEngine = "ts" | "go-parity" | "go";

export interface ReportEngineEntry {
  engine: Exclude<ReportEngine, "ts">;
  /** Berkas Go yang menghitungnya, relatif terhadap akar repo. */
  goSource: string;
  /** Skrip `package.json` yang membuktikan paritasnya (`bun run <ini>`). */
  parityScript: string;
  /**
   * Bukti paritas terhadap buku SUNGGUHAN — WAJIB sebelum `engine: "go"`.
   * Tanggal ISO dan jumlah buku yang diperiksa; keluaran lengkapnya di PR
   * yang memindahkan laporannya.
   */
  parityProven?: { date: string; books: number };
}

export const REPORT_ENGINES: Partial<Record<ReportId, ReportEngineEntry>> = {
  "trial-balance": {
    engine: "go-parity",
    goSource: "services/integrator/internal/ledgerread/trial_balance.go",
    parityScript: "parity:trial-balance",
  },
};

/** Mesin yang menghasilkan BERKAS laporan ini hari ini. */
export function reportEngine(id: ReportId): ReportEngine {
  return REPORT_ENGINES[id]?.engine ?? "ts";
}
