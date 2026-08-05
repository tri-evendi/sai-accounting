/**
 * Report catalogue + parameter validation (issue #19).
 *
 * Two things must hold. First, the catalogue is honest: an `available` report
 * always has a link, a `coming_soon` one never does, and ids are unique — a
 * broken link or a "ready" report with nowhere to go is exactly the dishonesty
 * the coming-soon state exists to avoid. Second, parameter parsing rejects
 * non-dates (`2026-02-30`, `garbage`, empty) and falls back to a sensible
 * default, so a hand-edited URL can never hand a reader an Invalid Date that
 * would poison every figure.
 */
import { describe, it, expect } from "vitest";
import {
  REPORTS,
  REPORT_CATEGORIES,
  reportsByCategory,
  isReportCategory,
  isValidISODate,
  resolvePeriod,
  resolveAsOf,
  resolveColumns,
  reportById,
  isExportable,
} from "@/lib/report-catalog";
import { toISODate } from "@/lib/dashboard-summary";
import { resolveBudgetPeriod } from "@/lib/report-payload";

describe("catalogue integrity", () => {
  it("covers the six issue categories, in order", () => {
    expect([...REPORT_CATEGORIES]).toEqual([
      "keuangan",
      "penjualan",
      "pembelian",
      "stok",
      "kas_bank",
      "pajak",
    ]);
  });

  it("groups every report under exactly one known category", () => {
    const groups = reportsByCategory();
    expect(groups).toHaveLength(6);
    const grouped = groups.flatMap((g) => g.reports);
    expect(grouped).toHaveLength(REPORTS.length);
    for (const r of REPORTS) expect(isReportCategory(r.category)).toBe(true);
  });

  it("gives every available report a link and every coming-soon report none", () => {
    for (const r of REPORTS) {
      if (r.status === "available") expect(r.href, r.id).toBeTruthy();
      else expect(r.href, r.id).toBeUndefined();
    }
  });

  it("has unique report ids", () => {
    const ids = REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects an unknown category name", () => {
    expect(isReportCategory("keuangan")).toBe(true);
    expect(isReportCategory("marketing")).toBe(false);
  });
});

describe("isValidISODate", () => {
  it("accepts a real date", () => {
    expect(isValidISODate("2026-07-20")).toBe(true);
  });

  it("rejects an impossible day, which Date would silently roll forward", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
  });

  it("rejects unpadded, empty and non-date strings", () => {
    expect(isValidISODate("2026-7-1")).toBe(false);
    expect(isValidISODate("")).toBe(false);
    expect(isValidISODate("garbage")).toBe(false);
  });
});

describe("resolvePeriod", () => {
  const now = new Date(2026, 6, 20); // 20 Jul 2026

  it("defaults to year-to-date when no params are given", () => {
    const p = resolvePeriod(undefined, undefined, now);
    expect(p.fromISO).toBe("2026-01-01");
    expect(p.toISO).toBe("2026-07-20");
  });

  it("uses valid params and round-trips them to the exact Date bounds", () => {
    const p = resolvePeriod("2026-03-01", "2026-03-31", now);
    expect(p.fromISO).toBe("2026-03-01");
    expect(p.toISO).toBe("2026-03-31");
    expect(toISODate(p.from)).toBe("2026-03-01");
    expect(toISODate(p.to)).toBe("2026-03-31");
    expect(p.to.getHours()).toBe(23);
    expect(p.to.getMilliseconds()).toBe(999);
  });

  it("falls back to the default for an invalid date instead of Invalid Date", () => {
    const p = resolvePeriod("2026-02-30", "nope", now);
    expect(p.fromISO).toBe("2026-01-01");
    expect(p.toISO).toBe("2026-07-20");
    expect(Number.isNaN(p.from.getTime())).toBe(false);
    expect(Number.isNaN(p.to.getTime())).toBe(false);
  });
});

describe("resolveAsOf", () => {
  const now = new Date(2026, 6, 20);

  it("defaults to today", () => {
    expect(resolveAsOf(undefined, now).asOfISO).toBe("2026-07-20");
  });

  it("uses a valid date as an end-of-day bound", () => {
    const r = resolveAsOf("2026-05-15", now);
    expect(r.asOfISO).toBe("2026-05-15");
    expect(toISODate(r.asOf)).toBe("2026-05-15");
    expect(r.asOf.getHours()).toBe(23);
  });

  it("falls back to today for an invalid date", () => {
    expect(resolveAsOf("2026-02-30", now).asOfISO).toBe("2026-07-20");
  });
});

/**
 * Kontrak dialog parameter (dialog di Pusat Laporan merender kendalinya dari
 * katalog). Dua kelas kegagalan yang dijaga di sini:
 *
 * 1. **Kendali yang berbohong** — laporan menyatakan parameter yang halaman
 *    tujuannya tidak baca, atau menawarkan unduhan tanpa payload cetak.
 * 2. **Halaman kosong** — pilihan kolom yang kotor (id asing, daftar kosong)
 *    menghasilkan laporan tanpa satu kolom pun.
 */
describe("kontrak dialog parameter", () => {
  it("hanya menawarkan ekspor untuk laporan yang punya payload cetak", () => {
    for (const r of REPORTS) {
      expect(isExportable(r), `${r.id}`).toBe(r.payloadKind !== undefined);
    }
  });

  it("setiap laporan berpayload punya halaman untuk dibuka", () => {
    for (const r of REPORTS.filter(isExportable)) {
      expect(r.href, `${r.id} tanpa href`).toBeTruthy();
    }
  });

  it("kolom yang dideklarasikan punya id unik dan tepat satu kolom identitas", () => {
    for (const r of REPORTS.filter((x) => x.columns)) {
      const ids = r.columns!.map((c) => c.id);
      expect(new Set(ids).size, `${r.id}`).toBe(ids.length);
      expect(r.columns!.filter((c) => c.fixed).length, `${r.id}`).toBe(1);
    }
  });

  it("hanya laporan bertipe daftar yang menawarkan pilihan kolom", () => {
    // Susunan Laba/Rugi, Neraca, dan Arus Kas ditentukan standar akuntansi:
    // memberi centang kolom di situ adalah kendali yang tak mengubah apa pun.
    const withColumns = REPORTS.filter((r) => r.columns).map((r) => r.id);
    expect(withColumns).not.toContain("income-statement");
    expect(withColumns).not.toContain("balance-sheet");
    expect(withColumns).not.toContain("cash-flow");
  });

  it("reportById mengembalikan undefined untuk id yang tak dikenal", () => {
    expect(reportById("stock-movement")?.id).toBe("stock-movement");
    expect(reportById("tidak-ada")).toBeUndefined();
  });
});

describe("resolveColumns", () => {
  const report = reportById("stock-movement")!;

  it("memakai kolom bawaan bila tak ada yang diminta", () => {
    expect(resolveColumns(report, undefined)).toEqual([
      "name",
      "unit",
      "opening",
      "movedIn",
      "movedOut",
      "processed",
      "closing",
    ]);
  });

  it("mempertahankan urutan katalog, bukan urutan yang diketik pengguna", () => {
    expect(resolveColumns(report, "closing,opening")).toEqual(["name", "opening", "closing"]);
  });

  it("selalu menyertakan kolom identitas meski tak diminta", () => {
    expect(resolveColumns(report, "closing")).toContain("name");
  });

  it("mengabaikan id asing, dan daftar yang seluruhnya asing kembali ke bawaan", () => {
    expect(resolveColumns(report, "closing,tidak-ada")).toEqual(["name", "closing"]);
    expect(resolveColumns(report, "tidak-ada,juga-tidak")).toHaveLength(7);
  });

  it("daftar kosong berarti bawaan, bukan laporan tanpa kolom", () => {
    expect(resolveColumns(report, "")).toHaveLength(7);
    expect(resolveColumns(report, " , ")).toHaveLength(7);
  });

  it("laporan tanpa deklarasi kolom tidak menghasilkan kolom apa pun", () => {
    expect(resolveColumns(reportById("balance-sheet")!, "aset")).toEqual([]);
  });
});

/**
 * Kartu katalog harus mendarat di LAPORANNYA, bukan di persimpangan menuju
 * laporan itu. `/budget` adalah hub berisi tiga tautan; dua kartu yang
 * menjanjikan realisasi anggaran & target penjualan dulu berhenti di sana.
 */
describe("tujuan kartu katalog", () => {
  it("tidak ada kartu yang mendarat di hub /budget", () => {
    expect(REPORTS.filter((r) => r.href === "/budget")).toEqual([]);
  });

  it("laporan rencana-vs-kenyataan menunjuk halaman laporannya", () => {
    expect(reportById("budget-realization")?.href).toBe("/budget/report");
    expect(reportById("sales-target")?.href).toBe("/budget/report");
  });

  it("keduanya menyatakan bentuk parameter yang dibaca halaman itu", () => {
    // `/budget/report` membaca `?year=&month=`, dengan month=0 = setahun penuh.
    expect(reportById("budget-realization")?.paramKind).toBe("period_month");
    expect(reportById("sales-target")?.paramKind).toBe("period_month");
  });

  it("setiap laporan yang bisa dibuka punya alamat", () => {
    for (const r of REPORTS.filter((x) => x.status === "available")) {
      expect(r.href, `${r.id}`).toMatch(/^\//);
    }
  });
});

describe("resolveBudgetPeriod", () => {
  const now = new Date(2026, 6, 20);

  it("memakai tahun & bulan yang sah", () => {
    expect(resolveBudgetPeriod("2025", "3", now)).toEqual({ year: 2025, month: 3 });
  });

  it("month=0 berarti setahun penuh", () => {
    expect(resolveBudgetPeriod("2025", "0", now)).toEqual({ year: 2025, month: undefined });
  });

  it("nilai tak sah jatuh ke periode berjalan, bukan NaN ke Prisma", () => {
    expect(resolveBudgetPeriod("abc", "13", now)).toEqual({ year: 2026, month: 7 });
    expect(resolveBudgetPeriod("1899", "x", now)).toEqual({ year: 2026, month: 7 });
  });

  it("tanpa parameter sama sekali memakai bulan berjalan", () => {
    expect(resolveBudgetPeriod(undefined, undefined, now)).toEqual({ year: 2026, month: 7 });
  });
});
