/**
 * Seri data grafik — bagian murni dari grafik yang pindah dari Beranda ke
 * halaman yang angkanya dijelaskan (`src/lib/chart-data.ts`).
 *
 * Yang dijaga di sini adalah hal-hal yang tidak kelihatan di layar sampai
 * datanya kebetulan pas: ember bulan yang lengkap (bulan sepi tetap tampil
 * sebagai nol), pemisahan mata uang tanpa konversi, dan URUTAN array —
 * warna donat dipasangkan per posisi, jadi seri yang tertukar urutannya
 * berarti irisan salah warna, bukan sekadar salah susun.
 */
import { describe, expect, it } from "vitest";
import {
  CHART_MONTHS_BACK,
  cashFlowSeriesByCurrency,
  chartPeriodStart,
  monthKey,
  monthlyActivitySeries,
  monthlyBuckets,
  stockLevelChartHeight,
  stockLevelSeries,
} from "@/lib/chart-data";

const NOW = new Date(2026, 6, 25); // 25 Juli 2026

describe("monthlyBuckets", () => {
  it("mengembalikan 6 bulan terakhir, tertua dulu, termasuk bulan berjalan", () => {
    const buckets = monthlyBuckets(CHART_MONTHS_BACK, NOW);
    expect(buckets).toHaveLength(6);
    expect(buckets.map((b) => b.key)).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });

  it("menyeberangi pergantian tahun tanpa bulan ke-13", () => {
    expect(monthlyBuckets(3, new Date(2026, 0, 15)).map((b) => b.key)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });

  it("chartPeriodStart menunjuk awal bulan tertua yang ditampilkan", () => {
    const start = chartPeriodStart(NOW);
    expect(monthKey(start)).toBe(monthlyBuckets(CHART_MONTHS_BACK, NOW)[0].key);
    expect(start.getDate()).toBe(1);
  });

  it("monthKey memakai bulan lokal, bukan pergeseran UTC", () => {
    // 1 Januari 00:30 lokal masih Januari; toISOString() akan bilang Desember.
    expect(monthKey(new Date(2026, 0, 1, 0, 30))).toBe("2026-01");
  });
});

describe("monthlyActivitySeries", () => {
  it("menghitung kontrak & tagihan per bulan dan menyisakan nol untuk bulan sepi", () => {
    const series = monthlyActivitySeries(
      [{ createdAt: new Date(2026, 6, 2) }, { createdAt: new Date(2026, 6, 20) }],
      [{ createdAt: new Date(2026, 4, 9) }],
      NOW
    );
    expect(series).toHaveLength(6);
    expect(series.at(-1)).toEqual({ month: series.at(-1)!.month, contracts: 2, invoices: 0 });
    expect(series[3]).toEqual({ month: series[3].month, contracts: 0, invoices: 1 });
    expect(series[0]).toEqual({ month: series[0].month, contracts: 0, invoices: 0 });
  });

  it("mengabaikan baris di luar jendela tanpa melempar", () => {
    const series = monthlyActivitySeries([{ createdAt: new Date(2020, 1, 1) }], [], NOW);
    expect(series.reduce((s, p) => s + p.contracts, 0)).toBe(0);
  });

  it("tanpa baris tagihan tetap mengembalikan seri kontrak yang utuh", () => {
    // Pengguna tanpa izin baca tagihan: barisnya tidak pernah diambil.
    const series = monthlyActivitySeries([{ createdAt: new Date(2026, 6, 2) }], [], NOW);
    expect(series.every((p) => p.invoices === 0)).toBe(true);
    expect(series.at(-1)!.contracts).toBe(1);
  });
});

describe("cashFlowSeriesByCurrency", () => {
  const rows = [
    { date: new Date(2026, 6, 3), debit: 1000, credit: 0, currency: "IDR" },
    { date: new Date(2026, 6, 9), debit: "500.50", credit: 200, currency: "IDR" },
    { date: new Date(2026, 5, 1), debit: 0, credit: 75, currency: "USD" },
  ];

  it("memisah per mata uang tanpa menjumlahkan lintas mata uang", () => {
    const series = cashFlowSeriesByCurrency(rows, NOW);
    expect(series.map((s) => s.currency)).toEqual(["IDR", "USD"]);
    const idr = series[0].points.at(-1)!;
    expect(idr.debit).toBeCloseTo(1500.5, 2);
    expect(idr.credit).toBe(200);
    expect(series[1].points.at(-1)!.credit).toBe(0); // Juli: USD tidak bergerak
    expect(series[1].points.at(-2)!.credit).toBe(75); // Juni
  });

  it("setiap seri punya 6 titik lengkap", () => {
    for (const s of cashFlowSeriesByCurrency(rows, NOW)) {
      expect(s.points).toHaveLength(CHART_MONTHS_BACK);
    }
  });

  it("mata uang tanpa transaksi tidak menghasilkan grafik kosong", () => {
    expect(cashFlowSeriesByCurrency([], NOW)).toEqual([]);
  });

  it("urutan mata uang stabil (A→Z), bukan urutan baris DB", () => {
    const shuffled = [...rows].reverse();
    expect(cashFlowSeriesByCurrency(shuffled, NOW).map((s) => s.currency)).toEqual(["IDR", "USD"]);
  });
});

describe("stockLevelSeries", () => {
  it("memendekkan nama panjang agar muat di sumbu Y", () => {
    const long = "Kayu Meranti Batangan Super";
    const [row] = stockLevelSeries([{ name: long, currentStock: 4, unit: "btg" }]);
    expect(row.name).toBe(`${long.slice(0, 20)}…`);
    expect(row.name.length).toBeLessThanOrEqual(21);
  });

  it("membiarkan nama pendek apa adanya", () => {
    expect(stockLevelSeries([{ name: "Paku", currentStock: 0, unit: null }])[0].name).toBe("Paku");
  });

  it("tinggi kartu tumbuh sampai 8 batang lalu berhenti", () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `B${i}`, currentStock: 1, unit: null }));
    expect(stockLevelChartHeight(stockLevelSeries(rows(1)))).toBe(300);
    expect(stockLevelChartHeight(stockLevelSeries(rows(8)))).toBe(368);
    expect(stockLevelChartHeight(stockLevelSeries(rows(50)))).toBe(368);
  });

  it("barang berstok nol tidak menambah tinggi (grafik memang menyaringnya)", () => {
    const data = stockLevelSeries([
      { name: "Kosong", currentStock: 0, unit: null },
      { name: "Ada", currentStock: 3, unit: null },
    ]);
    expect(stockLevelChartHeight(data)).toBe(300);
  });
});
