/**
 * Pembanding paritas Neraca Saldo (tahap 1d) — diuji LANGSUNG, sebab
 * pembanding yang salah lulus dengan nol selisih, dan "nol selisih" adalah
 * satu-satunya bukti yang dipakai untuk memindahkan jalur berkas ke Go.
 */
import { describe, expect, it } from "vitest";
import {
  compareTrialBalance,
  goUnits,
  tsUnits,
  type GoTrialBalance,
  type TsTrialBalance,
} from "@/lib/trial-balance-parity";

function pair(): { ts: TsTrialBalance; go: GoTrialBalance } {
  return {
    ts: {
      rows: [
        { code: "110101", name: "Kas", debit: 750000, credit: 0 },
        { code: "110301", name: "Piutang", debit: 0, credit: 0 },
        { code: "410101", name: "Penjualan", debit: 0, credit: 750000 },
      ],
      totalDebit: 750000,
      totalCredit: 750000,
      balanced: true,
    },
    go: {
      asOf: "2026-06-30T16:59:59.999Z",
      rows: [
        { code: "110101", name: "Kas", type: "cash_bank", debit: "750000.00", credit: "0.00" },
        { code: "110301", name: "Piutang", type: "account_receivable", debit: "0.00", credit: "0.00" },
        { code: "410101", name: "Penjualan", type: "revenue", debit: "0.00", credit: "750000.00" },
      ],
      totalDebit: "750000.00",
      totalCredit: "750000.00",
      balanced: true,
      unknownTypes: [],
    },
  };
}

describe("compareTrialBalance", () => {
  it("setara → nol selisih", () => {
    const { ts, go } = pair();
    expect(compareTrialBalance(ts, go)).toEqual([]);
  });

  it("derau float di bawah satu sen BUKAN selisih", () => {
    const { ts, go } = pair();
    ts.rows[0]!.debit = 0.1 + 0.2 + 749999.7; // 750000.0000000001-an
    ts.totalDebit = ts.rows[0]!.debit;
    expect(compareTrialBalance(ts, go)).toEqual([]);
  });

  it("satu sen berbeda ADALAH selisih", () => {
    const { ts, go } = pair();
    go.rows[0]!.debit = "750000.01";
    expect(compareTrialBalance(ts, go)).toEqual([
      "akun 110101: debit TS 750000.00 ⇄ Go 750000.01",
    ]);
  });

  it("baris yang hanya ada di satu sisi dilaporkan, dari kedua arah", () => {
    const { ts, go } = pair();
    go.rows.splice(1, 1);
    go.rows.push({ code: "999", name: "X", type: "expense", debit: "0.00", credit: "0.00" });
    const d = compareTrialBalance(ts, go);
    expect(d).toContain("akun 110301: hanya di TS");
    expect(d).toContain("akun 999: hanya di Go");
  });

  it("urutan berbeda dilaporkan bila himpunannya sama", () => {
    const { ts, go } = pair();
    go.rows.reverse();
    expect(compareTrialBalance(ts, go)).toEqual([
      "urutan berbeda mulai baris 1: TS 110101 ⇄ Go 410101",
    ]);
  });

  it("nama, total, dan vonis seimbang ikut dibandingkan", () => {
    const { ts, go } = pair();
    go.rows[0]!.name = "Kas Besar";
    go.totalCredit = "749999.99";
    go.balanced = false;
    const d = compareTrialBalance(ts, go);
    expect(d).toContain('akun 110101: nama TS "Kas" ⇄ Go "Kas Besar"');
    expect(d).toContain("total kredit TS 750000.00 ⇄ Go 749999.99");
    expect(d).toContain("vonis seimbang TS true ⇄ Go false");
  });
});

describe("konversi satuan", () => {
  it("goUnits mengurai TEPAT, termasuk di atas 2^53", () => {
    expect(goUnits("0.00")).toBe(BigInt("0"));
    expect(goUnits("-12.34")).toBe(-BigInt("1234"));
    expect(goUnits("12.3")).toBe(BigInt("1230"));
    expect(goUnits("90071992547409.93")).toBe(BigInt("9007199254740993"));
    expect(() => goUnits("1.234")).toThrow();
    expect(() => goUnits("1e5")).toThrow();
  });

  it("tsUnits membulatkan ke sen", () => {
    expect(tsUnits(0.1 + 0.2)).toBe(BigInt("30"));
    expect(tsUnits(1234.565)).toBe(BigInt(Math.round(1234.565 * 100)));
    expect(() => tsUnits(Number.NaN)).toThrow();
  });
});
