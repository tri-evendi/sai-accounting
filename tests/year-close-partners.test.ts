/**
 * TUTUP BUKU TAHUNAN per bentuk usaha (24 Okt 2026).
 *
 * PT tidak berubah (`tests/year-close.test.ts` tetap hijau). Di sini: CV/Firma
 * membagi laba ke modal sekutu menurut porsi — termasuk aturan sisa pembulatan
 * — usaha perorangan ke Modal Pemilik, dan prive ditutup ke modal masing-
 * masing; jurnalnya SELALU seimbang.
 */
import { describe, expect, it } from "vitest";

import { planPartnerYearClose, planYearClose, type ClosingBalance, type PartnerCloseInput } from "@/lib/year-close";

const PENJUALAN = 40;
const BEBAN = 60;
const pl = (revenue: number, expense: number): ClosingBalance[] => [
  { accountId: PENJUALAN, accountCode: "4101", accountName: "Penjualan", balance: -revenue },
  { accountId: BEBAN, accountCode: "6101", accountName: "Beban", balance: expense },
];

const cv: PartnerCloseInput[] = [
  { partnerId: 1, name: "Andi", shareBp: 5000, sortOrder: 0, capitalAccountId: 11, drawingAccountId: 21, drawingBalance: 1_000_000 },
  { partnerId: 2, name: "Budi", shareBp: 3333, sortOrder: 1, capitalAccountId: 12, drawingAccountId: 22, drawingBalance: 500_000 },
  { partnerId: 3, name: "Citra", shareBp: 1667, sortOrder: 2, capitalAccountId: 13, drawingAccountId: 23, drawingBalance: 0 },
];

const seimbang = (lines: { debit: number; credit: number }[]) => {
  const d = lines.reduce((s, l) => s + Math.round(l.debit * 100), 0);
  const c = lines.reduce((s, l) => s + Math.round(l.credit * 100), 0);
  return d === c;
};
const sisi = (lines: { accountId: number; debit: number; credit: number }[], id: number) =>
  lines.filter((l) => l.accountId === id).map((l) => (l.credit ? `K ${l.credit}` : `D ${l.debit}`));

describe("CV/Firma — laba dibagi per porsi", () => {
  it("laba 7.500.000,01: sisa 1 sen ke porsi terbesar (Andi 50%)", () => {
    const plan = planPartnerYearClose(pl(10_000_000.01, 2_500_000), cv);
    expect(plan.netIncome).toBe(7_500_000.01);
    expect(plan.closedAccounts).toBe(2);
    expect(plan.allocations!.map((a) => [a.name, a.profitShare])).toEqual([
      ["Andi", 3_750_000.01],
      ["Budi", 2_499_750],
      ["Citra", 1_250_250],
    ]);
    const total = plan.allocations!.reduce((s, a) => s + Math.round(a.profitShare * 100), 0);
    expect(total).toBe(750_000_001);
    expect(seimbang(plan.lines)).toBe(true);
  });

  it("prive ditutup ke modal MASING-MASING, baris terpisah dari bagian laba", () => {
    const plan = planPartnerYearClose(pl(10_000_000.01, 2_500_000), cv);
    expect(sisi(plan.lines, 11)).toEqual(["K 3750000.01", "D 1000000"]);
    expect(sisi(plan.lines, 21)).toEqual(["K 1000000"]);
    expect(sisi(plan.lines, 22)).toEqual(["K 500000"]);
    expect(sisi(plan.lines, 23)).toEqual([]); // prive nol: tidak ada baris
    expect(plan.allocations!.map((a) => a.drawingsClosed)).toEqual([1_000_000, 500_000, 0]);
  });

  it("rugi dibagi simetris — modal sekutu DIDEBIT", () => {
    const plan = planPartnerYearClose(pl(1_000, 1_100.03), cv.map((p) => ({ ...p, drawingBalance: 0 })));
    expect(plan.netIncome).toBe(-100.03);
    /* trunc: −50,01 · −33,33 · −16,67 = −100,01 → sisa −0,02 ke Andi (porsi terbesar). */
    expect(plan.allocations!.map((a) => a.profitShare)).toEqual([-50.03, -33.33, -16.67]);
    expect(sisi(plan.lines, 11)).toEqual(["D 50.03"]);
    expect(seimbang(plan.lines)).toBe(true);
  });

  it("tahun tanpa laba rugi tapi dengan prive: prive tetap ditutup", () => {
    const plan = planPartnerYearClose([], cv);
    expect(plan.closedAccounts).toBe(0);
    expect(plan.netIncome).toBe(0);
    expect(plan.lines).toHaveLength(4);
    expect(seimbang(plan.lines)).toBe(true);
  });

  it("tahun kosong total: tidak ada baris (pemanggil menolak menutupnya)", () => {
    expect(planPartnerYearClose([], cv.map((p) => ({ ...p, drawingBalance: 0 }))).lines).toEqual([]);
  });

  it("tanpa sekutu: menolak, tidak menebak tujuan laba", () => {
    expect(() => planPartnerYearClose(pl(1, 0), [])).toThrow();
  });
});

describe("usaha perorangan — laba ke Modal Pemilik", () => {
  const owner: PartnerCloseInput[] = [
    { partnerId: 1, name: "Sari", shareBp: 10000, sortOrder: 0, capitalAccountId: 31, drawingAccountId: 33, drawingBalance: 250_000 },
  ];
  it("seluruh laba ke Modal Pemilik, prive ditutup ke modal", () => {
    const plan = planPartnerYearClose(pl(1_000_000, 400_000), owner);
    expect(plan.allocations).toEqual([
      { partnerId: 1, name: "Sari", shareBp: 10000, profitShare: 600_000, drawingsClosed: 250_000 },
    ]);
    expect(sisi(plan.lines, 31)).toEqual(["K 600000", "D 250000"]);
    expect(sisi(plan.lines, 33)).toEqual(["K 250000"]);
    expect(seimbang(plan.lines)).toBe(true);
  });
});

describe("PT tidak berubah", () => {
  it("planYearClose: laba ke satu akun Laba Ditahan, tanpa rincian sekutu", () => {
    const plan = planYearClose(pl(1_000_000, 400_000), 99);
    expect(plan.allocations).toBeUndefined();
    expect(plan.lines.at(-1)).toEqual({ accountId: 99, debit: 0, credit: 600_000 });
    expect(plan.lines).toHaveLength(3);
  });
});
