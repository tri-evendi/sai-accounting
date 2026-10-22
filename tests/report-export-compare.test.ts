/**
 * KOLOM PEMBANDING SAMPAI KE BERKAS (#557), dan label pusat biaya di luar
 * permintaan HTTP (#702, jebakan 4).
 *
 * ── Skema rute ekspor dulu MEMBUANG pembandingnya ──────────────────────────
 * Halaman Laba Rugi & Neraca mengirim `priorPeriod` + `prior` ke `/api/reports/
 * export` (dan `/api/reports/pdf/statement`), `buildReportSheet` dan PDF-nya
 * sanggup menggambar empat kolom — tetapi `statementPayloadSchema` tidak
 * menyebut kedua kunci itu, dan `z.object` membuang kunci yang tidak
 * disebutnya. Berkas dari halaman komparatif tetap SATU kolom, tanpa satu
 * galat pun, sejak rute ekspor memvalidasi muatannya. Penjaga di bawah memakai
 * skema yang SAMA dengan kedua rute.
 *
 * ── `costCenterFilterLabel` di pekerja ─────────────────────────────────────
 * `getT()` membaca cookie lewat `cookies()`, yang melempar di luar permintaan.
 * Jalur berkas menyerahkan label cetak, jadi kamus tidak disentuh; halaman
 * (tanpa label) tetap memakai bahasa penggunanya.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getT = vi.fn();
vi.mock("@sai/platform/i18n/server", async (importOriginal) => {
  const asli = await importOriginal<typeof import("@sai/platform/i18n/server")>();
  return { ...asli, getT: () => getT() };
});

import { EXPORT_MAX_ROWS } from "@sai/core/export-limits";
import { statementPayloadSchema } from "@/lib/validations/report-export";
import { buildReportSheet } from "@/lib/report-export";
import { costCenterFilterLabel } from "@/lib/cost-center-options";
import { COST_CENTER_UNASSIGNED_PRINT_LABEL } from "@/lib/cost-centers";
import { balanceSheetPrior, incomeStatementPrior } from "@/lib/report-payload";

const band = (amount: number) => ({ lines: [{ code: "4101", name: "Penjualan", amount }], total: amount });
const empty = { lines: [], total: 0 };
const income = (n: number) => ({
  sales: band(n),
  cogs: empty,
  grossProfit: n,
  operatingExpense: empty,
  operatingProfit: n,
  otherIncome: empty,
  otherExpense: empty,
  netIncome: n,
});
const balance = (n: number) => ({
  assets: [{ code: "1101", name: "Kas", amount: n }],
  liabilities: [],
  equity: [],
  totalAssets: n,
  totalLiabilities: 0,
  totalEquity: 0,
  netIncome: n,
  totalLiabilitiesEquity: n,
  balanced: true,
});

describe("skema rute ekspor MEMBAWA kolom pembanding", () => {
  it("Laba Rugi: `priorPeriod` + `prior` lolos, lembarnya empat kolom", () => {
    const payload = {
      kind: "income-statement" as const,
      period: "Periode 1 Januari 2026 – 30 Juni 2026",
      ...incomeStatementPrior(income(80), {
        from: new Date("2024-12-31T17:00:00.000Z"),
        to: new Date("2025-06-30T16:59:59.999Z"),
      }),
      ...income(100),
    };
    const parsed = statementPayloadSchema.parse(payload);
    expect(parsed).toEqual(payload);
    const sheet = buildReportSheet(parsed);
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "Keterangan",
      "Periode 1 Januari 2026 – 30 Juni 2026",
      "1 Januari 2025 – 30 Juni 2025",
      "Perubahan",
    ]);
    expect(sheet.rows.find((r) => r[0]?.value === "4101  Penjualan")?.[3]?.value).toBe("+25%");
  });

  it("Neraca: pecahan #555 pembanding ikut lolos — `balanceSheetLayout` membacanya", () => {
    const prior = { ...balance(50), currentYearIncome: 80, priorUnclosedIncome: -30 };
    const payload = {
      kind: "balance-sheet" as const,
      period: "Per 30 Juni 2026",
      ...balanceSheetPrior(prior, new Date("2025-06-30T16:59:59.999Z")),
      ...balance(70),
    };
    const parsed = statementPayloadSchema.parse(payload);
    expect(parsed).toEqual(payload);
    if (parsed.kind !== "balance-sheet") throw new Error(parsed.kind);
    expect(parsed.priorPeriod).toBe("Per 30 Juni 2025");
    expect(parsed.prior?.priorUnclosedIncome).toBe(-30);
    /* Jebakan yang DISALIN (09 §9): baris "Akumulasi" berjalan bersanding
       dengan laba tahun LALU pembanding. */
    const akumulasi = buildReportSheet(parsed).rows.find((r) => r[0]?.value === "Akumulasi Laba/Rugi");
    expect(akumulasi?.[2]?.value).toBe(-30);
  });

  it("tanpa pembanding: bentuknya tidak berubah satu kunci pun", () => {
    const payload = { kind: "income-statement" as const, period: "P", ...income(1) };
    expect(statementPayloadSchema.parse(payload)).toEqual(payload);
    expect(buildReportSheet(statementPayloadSchema.parse(payload)).columns).toHaveLength(2);
  });

  it("baris pembanding BERBATAS seperti baris berjalan", () => {
    const banyak = Array.from({ length: EXPORT_MAX_ROWS + 1 }, (_, i) => ({ code: `${i}`, name: "x", amount: 1 }));
    const payload = {
      kind: "balance-sheet" as const,
      period: "P",
      priorPeriod: "Q",
      prior: { ...balance(1), assets: banyak },
      ...balance(1),
    };
    expect(statementPayloadSchema.safeParse(payload).success).toBe(false);
  });
});

describe("label pusat biaya di luar permintaan HTTP (#702, jebakan 4)", () => {
  const client = {
    costCenter: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        where.id === 3 ? { id: 3, code: "CC03", name: "Cabang" } : null,
    },
  };

  beforeEach(() => {
    getT.mockReset();
    getT.mockImplementation(async () => {
      throw new Error("cookies() dipanggil di luar permintaan");
    });
  });

  it("jalur berkas (label cetak diserahkan): kamus TIDAK disentuh", async () => {
    const label = (raw: string) =>
      costCenterFilterLabel(raw, client as never, COST_CENTER_UNASSIGNED_PRINT_LABEL);
    await expect(label("unassigned")).resolves.toBe("Belum ditetapkan");
    await expect(label("3")).resolves.toBe("CC03 — Cabang");
    await expect(label("99")).resolves.toBeNull();
    expect(getT).not.toHaveBeenCalled();
  });

  it("halaman (tanpa label cetak): bahasa pengguna, seperti sebelumnya", async () => {
    getT.mockImplementation(async () => (key: string) => (key === "costCenters.filterUnassigned" ? "Unassigned" : key));
    await expect(costCenterFilterLabel("unassigned", client as never)).resolves.toBe("Unassigned");
    /* Pusat biaya bernomor tidak butuh kamus sama sekali. */
    getT.mockClear();
    await expect(costCenterFilterLabel("3", client as never)).resolves.toBe("CC03 — Cabang");
    expect(getT).not.toHaveBeenCalled();
  });
});
