/**
 * `formatCurrency` harus tahan data kotor.
 *
 * Regresi untuk crash `/receivables`: satu dokumen dengan kode mata uang bukan
 * ISO-4217 (mis. "Rp") membuat `Intl.NumberFormat({ style: "currency" })`
 * melempar `RangeError: Invalid currency code`, dan karena halaman merender
 * `formatCurrency(total, currency)` per baris, seluruh server component ikut
 * tumbang (500). Nilai buruk pada satu baris tidak boleh menjatuhkan halaman —
 * ia harus tampil sebagai angka + kode mentah, bukan melempar.
 */
import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/utils";

describe("formatCurrency", () => {
  it("memformat kode ISO-4217 yang sah", () => {
    expect(formatCurrency(1000, "IDR")).toContain("1.000");
    expect(formatCurrency(1000, "USD")).toContain("1,000");
    expect(formatCurrency(1000, "CNY")).toContain("1,000");
  });

  it("default ke IDR saat currency dihilangkan", () => {
    expect(formatCurrency(1000)).toContain("1.000");
  });

  it("tidak melempar untuk kode mata uang tak sah, dan menampilkan kode mentah", () => {
    for (const bad of ["Rp", "RP", "rp", "S$", "Rupiah", ""]) {
      expect(() => formatCurrency(1500, bad)).not.toThrow();
    }
    const out = formatCurrency(1500, "Rp");
    expect(out).toContain("1.500");
    expect(out).toContain("Rp");
  });
});
