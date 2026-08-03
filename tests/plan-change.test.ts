/**
 * Aritmetika perpindahan paket swalayan (`lib/plan-change.ts`).
 *
 * Ini satu-satunya tempat di jalur swalayan yang menghitung UANG, dan uang yang
 * salah tidak berbunyi saat terjadi — ia muncul sebagai tagihan yang
 * dipersoalkan pelanggan berminggu-minggu kemudian. Karena itu yang diuji di
 * sini bukan "fungsinya mengembalikan angka" melainkan tiga keputusan komersial
 * yang ditanam di dalamnya, beserta kasus tepi yang membuat masing-masing
 * berubah menjadi kebocoran:
 *
 *   1. prorata SELISIH, dan tanggal jatuh tempo berikutnya tidak bergeser;
 *   2. turun paket DITOLAK bila pemakaian melampaui kuota baru;
 *   3. turun paket tidak mengembalikan uang, dan berlaku seketika.
 */
import { describe, expect, it } from "vitest";

import { quotePlanChange, type TargetPlan } from "@/lib/plan-change";

const STARTER: TargetPlan = {
  key: "starter",
  priceMonthly: 150_000,
  maxCompanies: 1,
  maxUsers: 3,
};
const PRO: TargetPlan = { key: "pro", priceMonthly: 450_000, maxCompanies: 3, maxUsers: 10 };

const PERIOD_START = new Date("2026-08-01T00:00:00Z");
const PERIOD_END = new Date("2026-08-31T00:00:00Z"); // 30 hari

function quote(over: Partial<Parameters<typeof quotePlanChange>[0]> = {}) {
  return quotePlanChange({
    currentPlanKey: "starter",
    currentPrice: 150_000,
    target: PRO,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    now: new Date("2026-08-21T00:00:00Z"), // hari ke-20, sisa 10
    usage: { companies: 1, users: 2 },
    ...over,
  });
}

describe("naik paket — prorata selisih", () => {
  it("hari ke-20 dari 30 menagih selisih untuk 10 hari sisanya, bukan sebulan penuh", () => {
    const result = quote();
    expect(result.outcome).toBe("invoice_required");
    if (result.outcome !== "invoice_required") return;

    // (450.000 − 150.000) × 10/30 = 100.000
    expect(result.chargeable).toBe(100_000);
    expect(result.remainingDays).toBe(10);
    expect(result.periodDays).toBe(30);
  });

  it("di hari pertama periode menagih selisih PENUH — tidak ada hari yang sudah lewat", () => {
    const result = quote({ now: PERIOD_START });
    expect(result.outcome).toBe("invoice_required");
    if (result.outcome !== "invoice_required") return;
    expect(result.chargeable).toBe(300_000);
    expect(result.remainingDays).toBe(30);
  });

  it("yang ditagih adalah SELISIH, bukan harga paket baru", () => {
    const result = quote({ now: PERIOD_START });
    if (result.outcome !== "invoice_required") throw new Error("harusnya bertagihan");
    // Menagih 450.000 di sini berarti menagih dua kali untuk periode yang sama:
    // 150.000 paket lama sudah dibayar di awal periode.
    expect(result.chargeable).not.toBe(PRO.priceMonthly);
    expect(result.chargeable).toBe(PRO.priceMonthly - STARTER.priceMonthly);
  });

  it("periode yang rusak menagih selisih PENUH — bukan menaikkan paket gratis", () => {
    // Akhir sebelum awal: data yang tidak masuk akal. Yang aman adalah menagih.
    const result = quote({
      periodStart: PERIOD_END,
      periodEnd: PERIOD_START,
    });
    expect(result.outcome).toBe("invoice_required");
    if (result.outcome !== "invoice_required") return;
    expect(result.chargeable).toBe(300_000);
  });

  it("sisa hari yang membulat ke nol berpindah seketika — bukan tagihan Rp 0", () => {
    // Tagihan nol tidak akan pernah "lunas", jadi paketnya tidak akan pernah
    // berpindah kalau perpindahannya menunggu pembayaran.
    const result = quote({ now: PERIOD_END });
    expect(result.outcome).toBe("apply_immediate");
  });
});

describe("turun paket", () => {
  it("ditolak saat pemakaian melampaui kuota baru, dengan angkanya", () => {
    const result = quotePlanChange({
      currentPlanKey: "pro",
      currentPrice: 450_000,
      target: STARTER,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      now: new Date("2026-08-21T00:00:00Z"),
      usage: { companies: 3, users: 8 },
    });

    expect(result.outcome).toBe("blocked_over_quota");
    if (result.outcome !== "blocked_over_quota") return;
    expect(result.companies).toEqual({ used: 3, max: 1 });
    expect(result.users).toEqual({ used: 8, max: 3 });
  });

  it("hanya sumbu yang benar-benar terlampaui yang disebut", () => {
    const result = quotePlanChange({
      currentPlanKey: "pro",
      currentPrice: 450_000,
      target: STARTER,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      now: new Date("2026-08-21T00:00:00Z"),
      usage: { companies: 3, users: 2 }, // pengguna masih muat
    });

    if (result.outcome !== "blocked_over_quota") throw new Error("harusnya ditolak");
    expect(result.companies).toEqual({ used: 3, max: 1 });
    expect(result.users).toBeNull();
  });

  it("diizinkan saat pemakaian muat — seketika, TANPA pengembalian uang", () => {
    const result = quotePlanChange({
      currentPlanKey: "pro",
      currentPrice: 450_000,
      target: STARTER,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      now: new Date("2026-08-21T00:00:00Z"),
      usage: { companies: 1, users: 2 },
    });

    expect(result).toEqual({ outcome: "apply_immediate", refund: false });
  });
});

describe("kuota diperiksa SEBELUM uang, dan untuk arah mana pun", () => {
  it("paket lebih MAHAL dengan kuota lebih kecil tetap ditolak", () => {
    /*
     * Memakai harga sebagai penanda arah ("yang lebih mahal pasti lebih luas")
     * adalah asumsi yang diam-diam salah pada hari daftar paket berubah —
     * mis. paket mahal untuk banyak pengguna di SATU badan usaha.
     */
    const narrowButPricey: TargetPlan = {
      key: "enterprise_single",
      priceMonthly: 900_000,
      maxCompanies: 1,
      maxUsers: 50,
    };
    const result = quotePlanChange({
      currentPlanKey: "pro",
      currentPrice: 450_000,
      target: narrowButPricey,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      now: new Date("2026-08-21T00:00:00Z"),
      usage: { companies: 3, users: 4 },
    });

    expect(result.outcome).toBe("blocked_over_quota");
  });
});

describe("paket yang sama", () => {
  it("tidak menghasilkan tagihan apa pun", () => {
    const result = quote({ target: { ...STARTER } });
    expect(result).toEqual({ outcome: "same_plan" });
  });
});
