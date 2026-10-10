/**
 * ANGKA PENDAPATAN — penjaga DEFINISI, bukan penjaga aritmetika.
 *
 * `docs/KOMERSIALISASI.md` §8 menuntut angka yang bisa dibaca tanpa pengetahuan
 * rahasia. Yang dijaga di sini adalah tiga keputusan yang membuatnya begitu,
 * dan ketiganya mudah dilanggar tanpa sadar:
 *
 *   1. UANG = baris `payments` berstatus `paid` — bukan tagihan lunas, bukan
 *      langganan aktif. Comp tidak melahirkan pembayaran, jadi hadiah tidak
 *      bisa menyelinap ke pendapatan.
 *   2. MRR hanya dari langganan yang BOLEH ditagih (`billing_mode ≠ none`).
 *   3. Tahunan dibagi DUA BELAS, bukan sepuluh — MRR menjawab "per bulan
 *      kalender", bukan "per bulan yang ditagih".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  countsTowardMrr,
  monthlyEquivalent,
  summarizeRevenue,
  type RevenueSubscription,
} from "@/lib/platform-revenue";

const sub = (over: Partial<RevenueSubscription> = {}): RevenueSubscription => ({
  tenantId: 1,
  status: "active",
  billingMode: "auto",
  billingCycle: "monthly",
  price: 599_000,
  ...over,
});

const NOW = new Date("2026-10-10T00:00:00Z");
const hariLalu = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("monthlyEquivalent", () => {
  it("tahunan dibagi DUA BELAS, bukan sepuluh", () => {
    /* Katalog menjual setahun seharga 10 bulan (PRICING.md §1), tapi MRR
       menjawab "per bulan KALENDER". Membaginya 10 melaporkan MRR 20% lebih
       tinggi daripada kas yang masuk tiap bulan. */
    expect(monthlyEquivalent(5_990_000, "yearly")).toBeCloseTo(499_166.67, 2);
    expect(monthlyEquivalent(5_990_000, "yearly")).not.toBeCloseTo(599_000, 2);
  });

  it("bulanan apa adanya; siklus tak dikenal diperlakukan bulanan", () => {
    expect(monthlyEquivalent(599_000, "monthly")).toBe(599_000);
    expect(monthlyEquivalent(599_000, "triwulan")).toBe(599_000);
  });

  it("harga nol/negatif/NaN tidak pernah menyumbang", () => {
    for (const nilai of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(monthlyEquivalent(nilai, "monthly"), String(nilai)).toBe(0);
    }
  });
});

describe("countsTowardMrr", () => {
  it("`auto` dan `manual` ikut — `manual` adalah seluruh pendapatan Fase B", () => {
    expect(countsTowardMrr(sub({ billingMode: "auto" }))).toBe(true);
    expect(countsTowardMrr(sub({ billingMode: "manual" }))).toBe(true);
  });

  it("`none` TIDAK — harga di baris itu snapshot katalog, bukan uang", () => {
    expect(countsTowardMrr(sub({ billingMode: "none" }))).toBe(false);
    /* Dan mode tak dikenal juga tidak: gagal-tertutup ke arah yang tidak
       membesarkan angkanya. */
    expect(countsTowardMrr(sub({ billingMode: "AUTO" }))).toBe(false);
    expect(countsTowardMrr(sub({ billingMode: "" }))).toBe(false);
  });

  it("`cancelled` tidak berulang lagi; `past_due` masih berjalan", () => {
    expect(countsTowardMrr(sub({ status: "cancelled" }))).toBe(false);
    /* Mencabut `past_due` membuat MRR turun saat seseorang terlambat bayar lalu
       naik lagi saat melunasi — angka yang bergoyang tanpa ada yang berubah. */
    expect(countsTowardMrr(sub({ status: "past_due" }))).toBe(true);
    expect(countsTowardMrr(sub({ status: "trialing" }))).toBe(true);
  });
});

describe("summarizeRevenue", () => {
  it("keadaan produksi 10 Okt 2026: semuanya NOL, dan itu jawaban yang benar", () => {
    /* Sebelas langganan, semuanya `billing_mode=none`; nol pembayaran; nol
       tagihan terbit. Angka yang jujur untuk keadaan itu adalah nol — bukan
       "Rp 6,5 juta" dari menjumlahkan harga snapshot akun uji coba. */
    const hasil = summarizeRevenue({
      subscriptions: Array.from({ length: 11 }, (_, i) =>
        sub({ tenantId: i + 1, billingMode: "none" })
      ),
      payingTenantIds: [],
      totalTenants: 11,
      outstanding: [],
      now: NOW,
    });

    expect(hasil).toMatchObject({
      payingTenants: 0,
      mrr: 0,
      arr: 0,
      billableSubscriptions: 0,
      conversionAllTime: 0,
      outstandingCount: 0,
      outstandingTotal: 0,
      oldestOutstandingDays: null,
    });
  });

  it("MRR menjumlahkan yang boleh ditagih saja, tahunan dinormalkan", () => {
    const hasil = summarizeRevenue({
      subscriptions: [
        sub({ tenantId: 1, billingMode: "auto", price: 599_000 }),
        sub({ tenantId: 2, billingMode: "manual", billingCycle: "yearly", price: 5_990_000 }),
        sub({ tenantId: 3, billingMode: "none", price: 1_199_000 }), // diabaikan
        sub({ tenantId: 4, billingMode: "auto", status: "cancelled", price: 249_000 }), // diabaikan
      ],
      payingTenantIds: [1, 2],
      totalTenants: 8,
      outstanding: [],
      now: NOW,
    });

    expect(hasil.billableSubscriptions).toBe(2);
    expect(hasil.mrr).toBe(599_000 + Math.round(5_990_000 / 12) - 1 + 1);
    expect(hasil.mrr).toBe(1_098_167);
    expect(hasil.arr).toBe(1_098_167 * 12);
    expect(hasil.payingTenants).toBe(2);
    expect(hasil.conversionAllTime).toBeCloseTo(0.25, 5);
  });

  it("pembayaran DUA KALI dari satu tenant tetap SATU pelanggan", () => {
    const hasil = summarizeRevenue({
      subscriptions: [],
      payingTenantIds: [7, 7, 7],
      totalTenants: 10,
      outstanding: [],
      now: NOW,
    });
    expect(hasil.payingTenants).toBe(1);
  });

  it("umur dihitung dari JATUH TEMPO, dan yang dilaporkan YANG TERTUA", () => {
    const hasil = summarizeRevenue({
      subscriptions: [],
      payingTenantIds: [],
      totalTenants: 3,
      outstanding: [
        { tenantId: 1, dueDate: hariLalu(3), total: 100_000 },
        { tenantId: 2, dueDate: hariLalu(41), total: 664_890 },
      ],
      now: NOW,
    });
    expect(hasil.outstandingCount).toBe(2);
    expect(hasil.outstandingTotal).toBe(764_890);
    /* Yang tertua, bukan rata-rata: di bawah sepuluh tagihan, rata-rata
       disetir satu pencilan dan menyembunyikan yang paling perlu ditindak. */
    expect(hasil.oldestOutstandingDays).toBe(41);
  });

  it("tagihan yang BELUM jatuh tempo berumur negatif — bukan 'yang tertua'", () => {
    const hasil = summarizeRevenue({
      subscriptions: [],
      payingTenantIds: [],
      totalTenants: 1,
      outstanding: [{ tenantId: 1, dueDate: new Date(NOW.getTime() + 7 * 86_400_000), total: 1 }],
      now: NOW,
    });
    expect(hasil.oldestOutstandingDays).toBe(-7);
  });

  it("nol pendaftar → konversi `null`, bukan nol", () => {
    /* Nol dari nol bukan 0% — ia belum punya jawaban, dan tampilan harus bisa
       membedakannya (lihat Prinsip Inti #4: yang tidak diketahui ditulis
       kosong, tak pernah 0). */
    const hasil = summarizeRevenue({
      subscriptions: [],
      payingTenantIds: [],
      totalTenants: 0,
      outstanding: [],
      now: NOW,
    });
    expect(hasil.conversionAllTime).toBeNull();
  });
});

/**
 * LAPISAN ANGKA TANPA LAYAR BUKAN HASIL KERJA.
 *
 * Penjaga ini sepola blok "panel tindakan benar-benar TERPASANG" di
 * `tests/operator-writes.test.ts`, dan ada karena alasan yang sama: definisi
 * pendapatan yang lengkap + teruji tetap tidak menjawab "berapa pendapatan
 * kita?" selama tidak ada layar yang memanggilnya.
 */
describe("angka pendapatan BENAR-BENAR tampil di konsol", () => {
  const baca = (...bagian: string[]) =>
    readFileSync(join(__dirname, "..", ...bagian), "utf8");

  const halaman = baca("src", "app", "(app)", "(operator)", "operator", "page.tsx");
  const store = baca("src", "lib", "operator", "store.ts");

  it("halaman ringkasan merender seksi pendapatan beserta keempat angkanya", () => {
    expect(halaman).toContain("operator.overview.revenueHeading");
    for (const kunci of [
      "operator.overview.payingTenants",
      "operator.overview.mrr",
      "operator.overview.billableSubs",
      "operator.overview.outstanding",
    ]) {
      expect(halaman, kunci).toContain(kunci);
    }
  });

  it("halamannya menyatakan apa yang TIDAK dihitung", () => {
    /* Angka pendapatan yang definisinya hanya hidup di kepala seseorang adalah
       angka yang suatu hari dibaca salah oleh orang lain. */
    expect(halaman).toContain("operator.overview.revenueNote");
  });

  it("store memakai `summarizeRevenue`, bukan menjumlahkan sendiri di halaman", () => {
    expect(store).toContain("summarizeRevenue({");
    /* Definisi pendapatan hidup di SATU tempat; halaman hanya menggambar. */
    expect(halaman).not.toContain("summarizeRevenue");
  });

  it("UANG dibaca dari `payments` berstatus `paid` — bukan dari tagihan lunas", () => {
    expect(store).toMatch(/payment\.groupBy\([\s\S]*status:\s*"paid"/);
  });

  it("penyebut konversi = SELURUH pendaftar dari basis data kendali", () => {
    /* Memakai jumlah langganan akan mengecualikan tenant yang belum pernah
       punya baris langganan — yaitu justru yang gagal dikonversi. */
    expect(store).toMatch(/totalTenants:\s*total/);
  });
});
