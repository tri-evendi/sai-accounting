/**
 * Jurnal produksi (#495 butir 3, tahap 2) — tiga aturan dan satu penolakan.
 *
 *   D WIP        K Persediaan   bahan keluar     `production_issue`
 *   D WIP        K beban        upah & overhead  `production_absorption`
 *   D Persediaan K WIP          barang jadi      `production_receipt`
 *
 * Yang paling penting diuji di sini bukan ketiganya melainkan yang KEEMPAT:
 * gerakan stok milik perintah produksi TIDAK boleh memposting HPP. Tanpa itu,
 * nilai bahannya dibebankan dua kali — sekali sebagai HPP, sekali sebagai WIP —
 * dan keduanya seimbang, jadi tak satu pun penjaga jurnal akan mengeluh.
 *
 * Murni: pembangun barisnya tidak menyentuh basis data.
 */
import { describe, expect, it } from "vitest";
import {
  buildProductionAbsorptionLines,
  buildProductionIssueLines,
  buildProductionReceiptLines,
  PostingRuleError,
} from "@/lib/posting/rules";
import { jurnalnyaMilikPerintahProduksi } from "@/lib/manufacturing/production-cost";

const WIP = 1106;
const PERSEDIAAN = 1104;
const UPAH = 5103;
const OVERHEAD = 5104;

/** Jurnal harus seimbang — penjaga yang sama dengan `UnbalancedJournalError`. */
const seimbang = (lines: { debit?: number; credit?: number }[]) => {
  const d = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const k = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  return Math.abs(d - k) < 0.005;
};

describe("production_issue — bahan keluar ke WIP", () => {
  const lines = buildProductionIssueLines({
    wipAccountId: WIP,
    inventoryAccountId: PERSEDIAAN,
    value: 45_100_000,
    memo: "PO.2026.08.00001",
  });

  it("mendebet WIP dan mengkredit Persediaan — BUKAN HPP", () => {
    // Barangnya belum terjual; ia hanya berpindah bentuk dan masih aset.
    // Membebankannya sebagai HPP menurunkan laba oleh barang yang belum
    // menghasilkan pendapatan apa pun.
    expect(lines).toEqual([
      { accountId: WIP, debit: 45_100_000, currency: "IDR", rate: 1, memo: "PO.2026.08.00001" },
      { accountId: PERSEDIAAN, credit: 45_100_000, currency: "IDR", rate: 1, memo: "PO.2026.08.00001" },
    ]);
    expect(seimbang(lines)).toBe(true);
  });

  it("menolak nilai nol atau negatif", () => {
    for (const value of [0, -1]) {
      expect(() =>
        buildProductionIssueLines({ wipAccountId: WIP, inventoryAccountId: PERSEDIAAN, value, memo: "x" })
      ).toThrow(PostingRuleError);
    }
  });
});

describe("production_absorption — upah & overhead masuk WIP", () => {
  it("mendebet WIP sekali, mengkredit tiap beban terpisah", () => {
    const lines = buildProductionAbsorptionLines({
      wipAccountId: WIP,
      directLaborAccountId: UPAH,
      factoryOverheadAccountId: OVERHEAD,
      labor: 250_000,
      overhead: 100_000,
      memo: "PO-1",
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ accountId: WIP, debit: 350_000 });
    expect(lines[1]).toMatchObject({ accountId: UPAH, credit: 250_000 });
    expect(lines[2]).toMatchObject({ accountId: OVERHEAD, credit: 100_000 });
    expect(seimbang(lines)).toBe(true);
  });

  it("TIDAK menerbitkan baris nol", () => {
    // Jurnal berbaris nol tetap seimbang dan lolos setiap penjaga, tapi ia
    // memenuhi buku besar dengan baris yang tak berarti bagi pembacanya.
    const lines = buildProductionAbsorptionLines({
      wipAccountId: WIP,
      directLaborAccountId: UPAH,
      factoryOverheadAccountId: OVERHEAD,
      labor: 250_000,
      overhead: 0,
      memo: "PO-1",
    });
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.accountId === OVERHEAD)).toBe(false);
    expect(seimbang(lines)).toBe(true);
  });

  it("menolak ketika tak ada yang diserap sama sekali", () => {
    expect(() =>
      buildProductionAbsorptionLines({
        wipAccountId: WIP,
        directLaborAccountId: UPAH,
        factoryOverheadAccountId: OVERHEAD,
        labor: 0,
        overhead: 0,
        memo: "x",
      })
    ).toThrow(PostingRuleError);
  });
});

describe("production_receipt — WIP menjadi barang jadi", () => {
  it("memindahkan seluruh isi WIP ke Persediaan", () => {
    // WIP kembali nol setiap kali sebuah perintah selesai; saldo WIP yang
    // tersisa di neraca karena itu SELALU berarti "ada perintah belum selesai".
    const lines = buildProductionReceiptLines({
      inventoryAccountId: PERSEDIAAN,
      wipAccountId: WIP,
      value: 45_450_000,
      memo: "PO-1",
    });
    expect(lines[0]).toMatchObject({ accountId: PERSEDIAAN, debit: 45_450_000 });
    expect(lines[1]).toMatchObject({ accountId: WIP, credit: 45_450_000 });
    expect(seimbang(lines)).toBe(true);
  });

  it("menolak nilai nol", () => {
    expect(() =>
      buildProductionReceiptLines({ inventoryAccountId: PERSEDIAAN, wipAccountId: WIP, value: 0, memo: "x" })
    ).toThrow(PostingRuleError);
  });
});

describe("siklus penuh: WIP kembali nol", () => {
  it("keluar + serap = terima, sehingga WIP nol sesudah selesai", () => {
    const bahan = 45_100_000;
    const upah = 250_000;
    const oh = 100_000;
    const wipMasuk =
      buildProductionIssueLines({ wipAccountId: WIP, inventoryAccountId: PERSEDIAAN, value: bahan, memo: "x" })
        .filter((l) => l.accountId === WIP)
        .reduce((s, l) => s + (l.debit ?? 0), 0) +
      buildProductionAbsorptionLines({
        wipAccountId: WIP,
        directLaborAccountId: UPAH,
        factoryOverheadAccountId: OVERHEAD,
        labor: upah,
        overhead: oh,
        memo: "x",
      })
        .filter((l) => l.accountId === WIP)
        .reduce((s, l) => s + (l.debit ?? 0), 0);

    const wipKeluar = buildProductionReceiptLines({
      inventoryAccountId: PERSEDIAAN,
      wipAccountId: WIP,
      value: bahan + upah + oh,
      memo: "x",
    })
      .filter((l) => l.accountId === WIP)
      .reduce((s, l) => s + (l.credit ?? 0), 0);

    expect(wipMasuk).toBe(45_450_000);
    expect(wipKeluar).toBe(wipMasuk);
  });
});

// ─── Invarian: HPP tidak boleh terbit dua kali ──────────────────────────────

describe("jurnalnyaMilikPerintahProduksi", () => {
  it("menolak gerakan yang lahir dari perintah produksi", () => {
    expect(jurnalnyaMilikPerintahProduksi({ productionOrderId: 7 })).toBe(true);
  });

  it("meloloskan gerakan biasa — penjualan & pengeluaran manual tetap ber-HPP", () => {
    // Penjaga yang terlalu lebar akan MEMATIKAN HPP seluruh perusahaan tanpa
    // satu pun galat: bahaya yang persis sebesar cacat yang ia cegah.
    expect(jurnalnyaMilikPerintahProduksi({ productionOrderId: null })).toBe(false);
  });
});
