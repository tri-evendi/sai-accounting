/**
 * Aturan tampilan uang (issue #52).
 *
 * Ini bukan uji kosmetik. Di aplikasi pembukuan, angka yang tampil salah
 * format sama berbahayanya dengan angka yang salah hitung: pemisah ribuan
 * yang berbeda antar-halaman membuat pengguna salah baca besaran, dan tanda
 * negatif yang hilang mengubah arti uang keluar jadi uang masuk.
 */

import { describe, it, expect } from "vitest";
import { formatAmount, formatMoney, isNegative } from "@/lib/money-format";

/**
 * `Intl` menyisipkan spasi tak-putus (U+00A0) antara simbol dan angkanya, dan
 * itu memang diinginkan: "Rp" tidak boleh terlempar ke baris lain terpisah
 * dari angkanya di sel tabel yang sempit. Jadi outputnya dibiarkan apa adanya
 * dan perbandingan di sini yang dinormalkan — bukan sebaliknya.
 */
const norm = (s: string) => s.replace(/ /g, " ");

describe("formatMoney", () => {
  it("rupiah tanpa desimal, pemisah ribuan id-ID", () => {
    expect(norm(formatMoney(1234567, "IDR"))).toBe("Rp 1.234.567");
  });

  it("memakai spasi tak-putus supaya simbol tidak terpisah dari angkanya", () => {
    expect(formatMoney(1234567, "IDR")).toContain(" ");
  });

  it("rupiah tidak dibulatkan jadi berdesimal", () => {
    // "Rp 1.000.000,00" akan terbaca janggal bagi staf di sini.
    expect(formatMoney(1000000, "IDR")).not.toContain(",");
  });

  it("valas tetap memakai separator id-ID, bukan en-US", () => {
    // Inti perubahan #52: dalam satu tabel, IDR dan USD harus memakai
    // pemisah yang sama supaya besarannya bisa dibandingkan sekilas.
    const usd = formatMoney(1234.56, "USD");
    expect(usd).toContain("1.234,56");
    expect(usd).not.toContain("1,234.56");
  });

  it("mata uang selalu eksplisit dan tidak ambigu", () => {
    // "$" saja ambigu (USD/SGD/AUD) di konteks ekspor.
    expect(formatMoney(1000, "USD")).toContain("US$");
    expect(formatMoney(1000, "CNY")).toContain("CN¥");
    expect(formatMoney(1000, "IDR")).toContain("Rp");
  });

  it("negatif ditandai minus — penanda non-warna", () => {
    // MASTER.md melarang warna sebagai satu-satunya penanda; tanda minus
    // inilah yang tetap terbaca oleh pengguna buta warna / cetakan hitam-putih.
    expect(formatMoney(-1234567, "IDR")).toContain("-");
    expect(formatMoney(-1234567, "IDR")).toContain("1.234.567");
  });

  it("nol tidak dianggap negatif", () => {
    expect(norm(formatMoney(0, "IDR"))).toBe("Rp 0");
    expect(isNegative(0)).toBe(false);
    expect(isNegative(-0)).toBe(false);
  });

  it("default-nya IDR", () => {
    expect(formatMoney(5000)).toBe(formatMoney(5000, "IDR"));
  });
});

describe("formatAmount", () => {
  it("tanpa simbol, untuk kolom yang mata uangnya sudah di judul", () => {
    const out = formatAmount(1234567, "IDR");
    expect(out).toBe("1.234.567");
    expect(out).not.toContain("Rp");
  });

  it("presisi valas tetap 2 desimal", () => {
    expect(formatAmount(1234.5, "USD")).toBe("1.234,50");
  });
});

describe("isNegative", () => {
  it("membedakan uang keluar dari uang masuk", () => {
    expect(isNegative(-1)).toBe(true);
    expect(isNegative(1)).toBe(false);
  });
});
