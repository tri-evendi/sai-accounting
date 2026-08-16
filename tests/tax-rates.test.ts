/**
 * TARIF PPN ADALAH DATA, BUKAN KONSTANTA KOMPILASI — issue #368, temuan F-12.
 *
 * ══ APA YANG DIJAGA BERKAS INI ═════════════════════════════════════════════
 * Tiga hal yang, bila rusak, rusaknya TIDAK menimbulkan pesan galat apa pun —
 * hanya angka yang salah di dokumen yang sudah dikirim ke pelanggan:
 *
 *   1. Dokumen bertanggal MUNDUR memakai tarif yang berlaku pada tanggalnya,
 *      bukan tarif hari ini.
 *   2. Perusahaan NON-PKP mendapat 0, bukan bawaan statuter.
 *   3. Tidak ada formulir dokumen yang diam-diam kembali ke `DEFAULT_TAX_RATE`.
 *
 * Yang ketiga adalah penjaga yang sesungguhnya. Dua yang pertama menguji fungsi
 * yang baru saja ditulis dan karena itu pasti lulus hari ini; yang ketiga
 * menguji apakah orang berikutnya bisa membatalkan seluruh issue ini dengan
 * satu impor yang kelihatan tak berbahaya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_TAX_RATE,
  companyTaxRateOn,
  defaultInvoiceTax,
  taxRateFor,
  type CompanyTaxProfile,
} from "@/lib/tax";

/** Riwayat tarif yang tidak urut — urutan masukan tak boleh berpengaruh. */
const RATES = [
  { rate: 12, effectiveFrom: "2025-01-01" },
  { rate: 10, effectiveFrom: "2010-04-01" },
  { rate: 11, effectiveFrom: "2022-04-01" },
];

const PKP: CompanyTaxProfile = { isPkp: true, rates: RATES };
const NON_PKP: CompanyTaxProfile = { isPkp: false, rates: RATES };

describe("taxRateFor — tarif yang berlaku pada sebuah tanggal", () => {
  it("mengambil baris terakhir yang tidak melewati tanggalnya", () => {
    expect(taxRateFor("2023-06-15", RATES)).toBe(11);
    expect(taxRateFor("2012-01-01", RATES)).toBe(10);
    expect(taxRateFor("2026-08-15", RATES)).toBe(12);
  });

  it("hari PERTAMA berlakunya sudah memakai tarif baru, bukan tarif kemarin", () => {
    // Batas inklusif. Kalau ini terbalik, seluruh faktur tanggal 1 pada bulan
    // pergantian tarif salah — dan tanggal 1 justru hari tersibuk penagihan.
    expect(taxRateFor("2022-04-01", RATES)).toBe(11);
    expect(taxRateFor("2022-03-31", RATES)).toBe(10);
  });

  it("null — bukan tarif hari ini — untuk tanggal sebelum baris paling awal", () => {
    // Mengarang tarif untuk dokumen 2009 lebih buruk daripada mengaku tidak
    // tahu: yang mengarang tidak meninggalkan jejak apa pun.
    expect(taxRateFor("2009-12-31", RATES)).toBeNull();
  });

  it("membandingkan TEKS, jadi zona waktu tak pernah menggeser bulannya", () => {
    /*
     * Ini alasan `taxRateFor` menerima string dan bukan `Date`. Dengan
     * aritmetika `Date`, sebuah faktur 1 April di mesin ber-UTC+7 yang
     * di-`toISOString()` jatuh ke 31 Maret dan mendapat tarif LAMA. Tanggal
     * dokumen adalah tanggal kalender; ia tidak punya jam.
     */
    const jakartaMidnight = new Date("2022-04-01T00:00:00+07:00");
    expect(jakartaMidnight.toISOString().slice(0, 10)).toBe("2022-03-31");
    expect(taxRateFor("2022-04-01", RATES)).toBe(11); // tetap 11, bukan 10
  });
});

describe("companyTaxRateOn — bawaan sebuah perusahaan", () => {
  it("non-PKP selalu 0, berapa pun isi tabel tarifnya", () => {
    for (const date of ["2023-06-15", "2026-08-15", ""]) {
      expect(companyTaxRateOn(date, NON_PKP)).toBe(0);
    }
  });

  it("tanggal kosong berarti tarif TERBARU, bukan konstanta", () => {
    /*
     * Formulir yang tanggalnya belum diisi. Perbandingan teks membuat "" lebih
     * kecil dari setiap tanggal ISO, jadi tanpa penanganan khusus tak ada baris
     * yang cocok dan tarifnya jatuh ke `DEFAULT_TAX_RATE`. Selama konstantanya
     * kebetulan sama dengan tarif terbaru, salahnya tak terlihat — dan berhenti
     * tak terlihat tepat pada hari tarifnya berubah. Di sini terbaru = 12.
     */
    expect(companyTaxRateOn("", PKP)).toBe(12);
    expect(companyTaxRateOn("", PKP)).not.toBe(DEFAULT_TAX_RATE);
  });

  it("perusahaan PKP tanpa satu pun baris jatuh ke bawaan statuter", () => {
    expect(companyTaxRateOn("2026-01-01", { isPkp: true, rates: [] })).toBe(DEFAULT_TAX_RATE);
  });
});

describe("defaultInvoiceTax — bawaan formulir faktur", () => {
  it("tarif 0 dari perusahaan non-PKP mematikan PPN, bukan menjadi 'PPN 0%'", () => {
    // Faktur ber-"PPN 0" mencetak baris PPN pada faktur perusahaan yang memang
    // tidak memungut PPN sama sekali.
    const d = defaultInvoiceTax({ currency: "IDR", companyRate: 0 });
    expect(d).toEqual({ taxable: false, taxRate: 0 });
  });

  it("0 diteruskan apa adanya — `??`, bukan `||`", () => {
    // `opts.companyRate || DEFAULT_TAX_RATE` akan menukar 0 dengan 11 tanpa
    // suara, dan itu persis cacat yang dihapus issue ini.
    expect(defaultInvoiceTax({ currency: "IDR", companyRate: 0 }).taxRate).toBe(0);
  });

  it("memakai tarif perusahaan, bukan konstanta", () => {
    expect(defaultInvoiceTax({ currency: "IDR", companyRate: 12 })).toEqual({
      taxable: true,
      taxRate: 12,
    });
  });

  it("valas & pelanggan bebas pajak tetap 0%, apa pun tarif perusahaannya", () => {
    expect(defaultInvoiceTax({ currency: "USD", companyRate: 12 }).taxable).toBe(false);
    expect(
      defaultInvoiceTax({ currency: "IDR", customerTaxExempt: true, companyRate: 12 }).taxable
    ).toBe(false);
  });
});

describe("tidak ada formulir dokumen yang kembali ke konstanta", () => {
  /*
   * PENJAGA YANG SESUNGGUHNYA.
   *
   * `DEFAULT_TAX_RATE` sengaja TIDAK dihapus — ia masih benar sebagai benih
   * perusahaan baru dan sebagai fakta tingkat PLATFORM (PPN atas tagihan
   * langganan KAMI, dan klaim harga di halaman pemasaran). Justru karena itu ia
   * tetap tergoda untuk diimpor: sebuah formulir baru yang menulis
   * `taxRate: DEFAULT_TAX_RATE` akan lulus `tsc`, lulus lint, tampak benar di
   * layar pengembang yang perusahaannya PKP — dan salah pada setiap pelanggan
   * non-PKP.
   *
   * Daftarnya karena itu berupa IZIN EKSPLISIT, bukan pola. Berkas yang tidak
   * disebut di sini dan mengimpornya akan menggagalkan `bun run verify`, dan
   * orang yang menambahkannya harus menuliskan alasannya di sini.
   */
  const ALLOWED = new Set([
    /* Sumbernya sendiri. */
    "src/lib/tax.ts",
    /* Benih tarif pertama sebuah perusahaan baru. */
    "src/lib/tax-rates.ts",
    /* Cadangan pohon komponen TANPA provider (uji unit, layar di luar /t/…). */
    "src/lib/tax-profile-client.tsx",
    /* PPN atas tagihan langganan KAMI — fakta platform, bukan milik pelanggan. */
    "src/lib/subscription-lifecycle.ts",
    /* Klaim harga di halaman pemasaran — juga PPN yang dipungut SAI. */
    "src/components/landing/landing-pricing.tsx",
    "src/components/landing/landing-faq.tsx",
  ]);

  it("hanya berkas yang diizinkan yang MENGIMPOR DEFAULT_TAX_RATE", () => {
    const offenders = filesImportingConstant().filter((f) => !ALLOWED.has(f));
    expect(
      offenders,
      "Formulir dokumen tidak boleh memakai tarif konstanta — pakai " +
        "`useDefaultTaxRate(tanggalDokumen)` (client) atau `readCompanyTaxProfile()` " +
        "(server). Kalau berkas ini memang berbicara tentang PPN tingkat PLATFORM, " +
        "tambahkan ke ALLOWED beserta alasannya."
    ).toEqual([]);
  });
});

/**
 * Berkas sumber yang MENGIMPOR `DEFAULT_TAX_RATE`, relatif terhadap akar repo.
 *
 * Yang dicari impornya, bukan sekadar penyebutan teksnya: komentar yang
 * menjelaskan kenapa sebuah berkas TIDAK memakainya lagi menyebut namanya, dan
 * penjaga yang menghukum penjelasan akan mengajari orang menghapus
 * penjelasannya.
 */
function filesImportingConstant(): string[] {
  const root = process.cwd();
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "generated") continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const src = readFileSync(full, "utf8");
      const imports = src.match(/import\s*\{[^}]*\}\s*from\s*["'][^"']*tax["']/g) ?? [];
      if (imports.some((line) => /\bDEFAULT_TAX_RATE\b/.test(line))) {
        found.push(full.slice(root.length + 1));
      }
    }
  };
  walk(join(root, "src"));
  return found.sort();
}

