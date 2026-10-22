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
 * ══ "BERKAS" = LEMBAR SEBAR (`report.export`), BUKAN PDF ═══════════════════
 * Yang dipindah register ini jalur EKSPOR — `/api/reports/export`, pekerjaan
 * `report.export` — dan itu lembar sebar. PDF laporan (`/api/reports/pdf`)
 * tetap TypeScript untuk SETIAP laporan: ia digambar dari muatan layar, sama
 * seperti layarnya, dan generator PDF Go belum ada. Memindahkannya adalah
 * keputusan tersendiri, bukan efek samping `engine: "go"`.
 *
 * ══ BAGAIMANA `go` DITEGAKKAN ══════════════════════════════════════════════
 *   1. `/api/reports/export` MEMBACA register sebelum merakit apa pun: laporan
 *      `go` SELALU diterbitkan ke `report.export_go` (pelari Go
 *      `svc-integrator`), berapa pun barisnya — tidak ada ambang
 *      "kecil, rakit di sini", sebab jalur sinkron itulah versi TS-nya.
 *   2. `workers/interactive.ts` MENOLAK laporan `go` yang datang lewat
 *      `report.export` (pekerjaan lama dari sebelum peralihan) — melempar,
 *      bukan diam-diam menghasilkan berkas TS.
 *   Keduanya dijaga `tests/report-engine.test.ts`.
 *
 * ══ KENAPA REGISTER, BUKAN SAKLAR DI env ═══════════════════════════════════
 * Saklar lingkungan bisa berbeda antara mesin uji dan produksi tanpa jejak di
 * git, dan "mesin mana yang menghitung angka ini" adalah pertanyaan yang
 * jawabannya harus bisa dibaca dari satu commit. Perpindahan `go-parity` → `go`
 * adalah KEPUTUSAN, dan penjaga `tests/report-engine.test.ts` menuntut bukti
 * paritasnya (`parityProven`) tertulis di entri yang sama.
 */
import type { ReportId } from "@/lib/report-catalog";
import type { JobKind } from "@sai/core/generated/job-kinds";

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
    engine: "go",
    goSource: "services/integrator/internal/ledgerread/trial_balance.go",
    parityScript: "parity:trial-balance",
    /* Sesi utama, buku PRODUKSI, 22 Okt 2026:
       `bun run parity:trial-balance` → "17 buku × 3 tanggal: 51 setara ·
       0 berselisih · 0 gagal". Paritas ISI lembar sebarnya:
       `bun run parity:trial-balance-xlsx`. */
    parityProven: { date: "2026-10-22", books: 17 },
  },
  /*
   * Laporan KEDUA dan KETIGA tahap 1d (keputusan pemilik 22 Okt 2026). Go
   * menghitung keduanya (`statements.go`) dan menulis lembar sebarnya
   * (`internal/document`), tetapi BERKAS masih dihasilkan TypeScript sampai
   * sesi utama menjalankan paritas atas buku PRODUKSI — angka DAN isi berkas:
   *   bun run parity:income-statement · parity:income-statement-xlsx
   *   bun run parity:balance-sheet    · parity:balance-sheet-xlsx
   * Pelari Go menolak keduanya selama `go-parity` (`GoEngineReports`
   * dibangkitkan dari entri ber-`engine: "go"` saja).
   */
  "income-statement": {
    engine: "go-parity",
    goSource: "services/integrator/internal/ledgerread/statements.go",
    parityScript: "parity:income-statement",
  },
  "balance-sheet": {
    engine: "go-parity",
    goSource: "services/integrator/internal/ledgerread/statements.go",
    parityScript: "parity:balance-sheet",
  },
};

/** Mesin yang menghasilkan BERKAS laporan ini hari ini. */
export function reportEngine(id: ReportId): ReportEngine {
  return REPORT_ENGINES[id]?.engine ?? "ts";
}

/**
 * `kind` pekerjaan yang menghasilkan lembar sebar laporan ini — SATU tempat
 * keputusan "TS atau Go" diterjemahkan menjadi antrean. `report.export`
 * diklaim `workers/interactive.ts` (Node), `report.export_go` diklaim
 * `services/integrator/cmd/interactive` (Go).
 */
export function exportJobKind(id: ReportId): Extract<JobKind, "report.export" | "report.export_go"> {
  return reportEngine(id) === "go" ? "report.export_go" : "report.export";
}
