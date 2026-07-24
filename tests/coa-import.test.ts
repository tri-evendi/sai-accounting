/**
 * Impor Daftar Akun — aturan parse/validasi murni (tanpa DB/ExcelJS).
 */
import { describe, it, expect } from "vitest";
import {
  parseCoaRows,
  ACCURATE_TYPE_MAP,
  MAX_IMPORT_ROWS,
} from "@/lib/coa-import";

const HEADER = ["Kode", "Nama", "Tipe", "Mata Uang"];

describe("parseCoaRows", () => {
  it("melewati baris judul dan memetakan kode tipe Accurate", () => {
    const { accounts, errors } = parseCoaRows([
      HEADER,
      ["1101001", "Kas Kecil", "BANK", "IDR"],
      ["110201", "Piutang Usaha", "AREC"],
    ]);
    expect(errors).toEqual([]);
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toMatchObject({
      code: "1101001",
      name: "Kas Kecil",
      type: "cash_bank",
      normalBalance: "debit",
      currency: "IDR",
    });
    // AREC → account_receivable, saldo normal debit, currency default IDR
    expect(accounts[1]).toMatchObject({ type: "account_receivable", currency: "IDR" });
  });

  it("menurunkan saldo normal dari tipe (DEPR = kredit)", () => {
    const { accounts } = parseCoaRows([HEADER, ["1501", "Akm. Penyusutan", "DEPR"]]);
    expect(accounts[0].normalBalance).toBe("credit");
  });

  it("menolak kode tipe tak dikenal, kode/nama kosong", () => {
    const { accounts, errors } = parseCoaRows([
      HEADER,
      ["", "Tanpa kode", "BANK"],
      ["2001", "", "APAY"],
      ["3001", "Tipe ngawur", "XXXX"],
    ]);
    expect(accounts).toHaveLength(0);
    expect(errors).toHaveLength(3);
    expect(errors[0].row).toBe(2);
    expect(errors[2].message).toMatch(/XXXX/);
  });

  it("mendefault mata uang ke IDR dan menolak mata uang tak didukung", () => {
    const { accounts, errors } = parseCoaRows([
      HEADER,
      ["4001", "Pendapatan Ekspor", "REVE", "USD"],
      ["4002", "Pendapatan Aneh", "REVE", "RP"],
    ]);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].currency).toBe("USD");
    expect(errors[0].message).toMatch(/RP/);
  });

  it("melewati baris kosong tanpa galat", () => {
    const { accounts, errors } = parseCoaRows([HEADER, [], ["", "", "", ""], ["5001", "Beban", "EXPS"]]);
    expect(errors).toEqual([]);
    expect(accounts).toHaveLength(1);
  });

  it("membuang kode ganda di dalam file dan mencatatnya", () => {
    const { accounts, errors, duplicateCodesInFile } = parseCoaRows([
      HEADER,
      ["1101", "Kas A", "BANK"],
      ["1101", "Kas B", "BANK"],
    ]);
    expect(accounts).toHaveLength(1);
    expect(duplicateCodesInFile).toEqual(["1101"]);
    expect(errors[0].message).toMatch(/ganda/);
  });

  it("membatasi jumlah baris data ke MAX_IMPORT_ROWS", () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS + 50 }, (_, i) => [
      `C${i}`,
      `Akun ${i}`,
      "EXPS",
    ]);
    const { accounts } = parseCoaRows([HEADER, ...many]);
    expect(accounts).toHaveLength(MAX_IMPORT_ROWS);
  });

  it("setiap kode tipe di peta menghasilkan tipe internal yang sah", () => {
    for (const [code, type] of Object.entries(ACCURATE_TYPE_MAP)) {
      const { accounts, errors } = parseCoaRows([HEADER, [`X-${code}`, `Akun ${code}`, code]]);
      expect(errors, code).toEqual([]);
      expect(accounts[0].type).toBe(type);
    }
  });
});
