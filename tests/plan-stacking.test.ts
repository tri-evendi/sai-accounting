/**
 * MENUMPUK vs NAIK PAKET — penjaga klaim yang dipajang halaman publik.
 *
 * Halaman harga kini memajang kalimat "lebih murah naik paket daripada
 * menumpuk paket kecil" beserta ANGKANYA. Klaim berangka di permukaan publik
 * hanya sah kalau ia diturunkan dari katalog (`pages/landing.md` §KLAIM HARUS
 * PUNYA SUMBER) — dan kalau hitungannya kelak TIDAK mendukungnya, barisnya
 * harus hilang alih-alih membantah dirinya sendiri.
 *
 * Yang dijaga di sini terutama yang kedua: ia keadaan yang tidak terjadi hari
 * ini, dan karena itu satu-satunya yang mustahil terlihat di layar.
 */
import { describe, expect, it } from "vitest";

import { stackingComparisons, type StackablePlan } from "@/lib/plan-stacking";

const paket = (
  key: string,
  priceMonthly: number,
  maxCompanies: number,
  contactOnly = false
): StackablePlan => ({ key, name: key, priceMonthly, currency: "IDR", maxCompanies, contactOnly });

/** Tangga harga produksi hari ini (docs/PRICING.md §1). */
const KATALOG = [
  paket("starter", 249_000, 1),
  paket("pro", 599_000, 3),
  paket("business", 1_199_000, 8),
];

describe("stackingComparisons", () => {
  it("menurunkan PERSIS dua klaim yang tercatat di docs/PRICING.md §1", () => {
    const hasil = stackingComparisons(KATALOG);

    expect(hasil).toHaveLength(2);
    /* "3 × Starter = Rp 747.000 > Pro" */
    expect(hasil[0]).toMatchObject({
      count: 3,
      stacked: 747_000,
      upgrade: 599_000,
      saving: 148_000,
    });
    expect(hasil[0].small.key).toBe("starter");
    expect(hasil[0].large.key).toBe("pro");
    /* "8 PT lewat 3 × Pro = Rp 1.797.000 > Business" */
    expect(hasil[1]).toMatchObject({
      count: 3,
      stacked: 1_797_000,
      upgrade: 1_199_000,
      saving: 598_000,
    });
  });

  it("baris yang TIDAK hemat dijatuhkan — halaman tidak membantah dirinya", () => {
    /* Starter pada Rp 199.000 membuat 3 × Starter (597.000) lebih murah
       daripada Pro (599.000) — persis angka yang `PRICING.md` tolak. Pada
       keadaan itu klaimnya salah, jadi barisnya harus hilang, bukan memajang
       "hemat −Rp 2.000". */
    const hasil = stackingComparisons([
      paket("starter", 199_000, 1),
      paket("pro", 599_000, 3),
    ]);
    expect(hasil).toEqual([]);
  });

  it("paket rundingan & berharga nol tidak pernah dibandingkan", () => {
    /* `contactOnly` menyimpan `price_monthly = 0` dengan sengaja
       (`plan-catalog.ts`); memasukkannya berarti membandingkan nol rupiah. */
    const hasil = stackingComparisons([
      ...KATALOG,
      paket("enterprise", 0, 10, true),
      paket("internal", 0, 10),
    ]);
    expect(hasil).toHaveLength(2);
    expect(hasil.some((r) => r.large.key === "enterprise")).toBe(false);
    expect(hasil.some((r) => r.large.key === "internal")).toBe(false);
  });

  it("kuota yang SAMA tidak menghasilkan baris — tidak ada yang ditumpuk", () => {
    expect(stackingComparisons([paket("a", 100, 3), paket("b", 150, 3)])).toEqual([]);
  });

  it("pembulatan KE ATAS: setengah lisensi tidak bisa dibeli", () => {
    /* 5 PT dari paket 2-PT menuntut TIGA paket, bukan dua setengah. Membulatkan
       ke bawah akan membandingkan kuota yang tidak setara — perbandingan yang
       menguntungkan kami secara tidak jujur. */
    const hasil = stackingComparisons([paket("kecil", 100_000, 2), paket("besar", 250_000, 5)]);
    expect(hasil[0]).toMatchObject({ count: 3, stacked: 300_000, saving: 50_000 });
  });

  it("katalog kurang dari dua paket berbayar → tidak ada perbandingan", () => {
    expect(stackingComparisons([])).toEqual([]);
    expect(stackingComparisons([paket("pro", 599_000, 3)])).toEqual([]);
  });

  it("urutan tidak bergantung pada urutan masukan", () => {
    const terbalik = stackingComparisons([...KATALOG].reverse());
    expect(terbalik.map((r) => r.small.key)).toEqual(["starter", "pro"]);
  });
});
