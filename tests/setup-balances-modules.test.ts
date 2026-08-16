/**
 * Saldo awal di wisaya penyiapan MENGIKUTI MODUL (issue #349).
 *
 * Cacat yang dijaga di sini pernah hidup di produksi: perusahaan Jasa tidak
 * punya modul `inventory`, sehingga akun 1104 tidak pernah disemai dan slot
 * mapping `inventory` DILEWATI DIAM-DIAM oleh penyemai. Tapi wisaya tetap
 * merender isian "Persediaan" — jadi ia mengundang angka yang kemudian ia
 * tolak, di langkah terakhir, dengan pesan yang menyuruh pengguna ke layar
 * yang tidak pernah ada.
 *
 * Dua hal yang dikunci:
 *   1. keempat bagian saldo awal dipagari modul — di RENDER *dan* di PAYLOAD;
 *   2. `MissingMappingError` tidak pernah lagi menyebut layar yang tak ada.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MissingMappingError } from "@/lib/posting/mapping";
import { modulesForCategory } from "@/lib/business-modules";

const WIZARD = join(
  __dirname,
  "..",
  "src",
  "app",
  "(app)",
  "(setup)",
  "t",
  "[tenantSlug]",
  "[companySlug]",
  "setup",
  "setup-wizard.tsx"
);

describe("saldo awal mengikuti modul (issue #349)", () => {
  const src = readFileSync(WIZARD, "utf8");

  it("keempat bagian dipagari modul pemilik akunnya", () => {
    /*
     * Kas→cash_bank, Piutang→sales, Persediaan→inventory, Utang→purchasing.
     * Keempatnya, bukan hanya persediaan: kategori `custom` mulai dari KOSONG,
     * jadi ketiga yang lain bisa mati juga — perangkap yang sama, kebetulan
     * belum terpicu.
     */
    for (const slot of ["cash", "receivables", "inventory", "payables"]) {
      expect(src, `bagian ${slot} tidak dipagari`).toContain(`saldoAktif.${slot} &&`);
    }
    expect(src).toContain('cash: modules.has("cash_bank")');
    expect(src).toContain('receivables: modules.has("sales")');
    expect(src).toContain('inventory: modules.has("inventory")');
    expect(src).toContain('payables: modules.has("purchasing")');
  });

  it("PAYLOAD ikut dipagari — bukan hanya yang terlihat di layar", () => {
    /*
     * Bagian terpenting, dan yang paling mudah terlewat. Angka yang diketik
     * SEBELUM kategori usahanya diganti masih duduk di state; kalau hanya
     * rendernya yang dipagari, angka itu tetap terkirim dan galat aslinya
     * kembali — kali ini dari isian yang tidak terlihat siapa pun.
     */
    /* Bentuk persediaannya berubah di #379 — dari satu angka gelondongan
       menjadi daftar per barang — tapi PAGARNYA harus tetap ada, dan itulah
       yang diuji: modul mati → daftar KOSONG yang terkirim, bukan baris yang
       terlanjur diketik sebelum kategorinya diganti. */
    expect(src).toContain("inventory: saldoAktif.inventory");
    expect(src).toMatch(/inventory: saldoAktif\.inventory[\s\S]{0,400}?:\s*\[\],/);
    expect(src).toContain("cash: (saldoAktif.cash ? cash : [])");
    expect(src).toContain("receivables: (saldoAktif.receivables ? receivables : [])");
    expect(src).toContain("payables: (saldoAktif.payables ? payables : [])");
  });

  it("isian Persediaan TIDAK lagi dirender tanpa syarat", () => {
    /* Bentuk lamanya: komentar bagian langsung diikuti `<div>` pembuka.
       Sejak #379 bagiannya adalah `<StockSection>`, dan pagarnya tetap
       `saldoAktif.inventory` — yang diuji sifatnya, bukan tag-nya. */
    expect(src).not.toMatch(/\{\/\* Persediaan[^}]*\*\/\}\s*\n\s*<div>/);
    expect(src).toMatch(/\{saldoAktif\.inventory && \(\s*\n\s*<StockSection/);
  });

  it("kategori Jasa memang tanpa modul persediaan — pagar di atas menggigit", () => {
    /*
     * Tanpa pemeriksaan ini, keempat tes di atas bisa hijau sambil menjaga
     * keadaan yang tidak pernah terjadi: kalau `services` ternyata menyalakan
     * `inventory`, cacat aslinya tidak pernah ada dan pagarnya tidak menahan
     * apa pun.
     */
    expect(modulesForCategory("services")).not.toContain("inventory");
    expect(modulesForCategory("distribution")).toContain("inventory");
  });
});

describe("galat pemetaan tidak menunjuk layar yang tidak ada (issue #349)", () => {
  const pesan = new MissingMappingError("inventory", "IDR").message;

  it("tidak lagi menyuruh ke `account_mappings`", () => {
    /*
     * Tak satu pun berkas di `src/app/` menyentuh `accountMapping` — halaman
     * itu tidak pernah ada. Nasihat yang tidak bisa dijalankan lebih buruk
     * daripada tidak ada nasihat: yang membacanya mencari menu yang tidak akan
     * ditemukannya, lalu menyimpulkan aplikasinya rusak.
     */
    expect(pesan).not.toContain("account_mappings");
    expect(pesan).not.toContain("pengaturan akun");
  });

  it("menunjuk tempat yang BENAR-BENAR ada, dan tetap menyebut slot + keadaannya", () => {
    expect(pesan).toContain("Pengaturan → Modul");
    expect(pesan).toContain("Persediaan"); // label slot, bukan kunci mentah
    expect(pesan).toContain("inventory"); // kuncinya tetap disebut untuk admin
    expect(pesan).toContain("mata uang IDR");
    expect(pesan).toContain("Jurnal tidak diposting");
  });
});
