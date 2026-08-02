/**
 * Arah pasca-masuk (#159 temuan 3) — SATU aturan, dua pintu:
 *   • /login (komponen klien) memakainya setelah kredensial sah;
 *   • penjaga halaman server (`page-auth.ts`) memakainya saat pengguna TANPA
 *     perusahaan membuka halaman dashboard langsung dari URL — dulu dijawab
 *     200 berisi kerangka "Memuat sesi…", kini server yang mengarahkan.
 * Aturannya sendiri MURNI dan diuji di sini; kedua pintu dikunci secara
 * struktural supaya salinan aturan tidak lahir kembali (catatan #157: saat
 * halaman pindah ke /t/{tenant}/{company}, cukup fungsi ini yang diajari
 * bentuk jalur baru).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolvePostLoginPath } from "@/lib/post-login";

describe("resolvePostLoginPath", () => {
  it("wajib ganti kata sandi menang atas segalanya", () => {
    expect(resolvePostLoginPath(true, null, 0, "/invoices")).toBe("/change-password");
    expect(resolvePostLoginPath(true, 1, 3, null)).toBe("/change-password");
  });

  it("NOL perusahaan → layar buat PT pertama, bukan pemilih (issue #138)", () => {
    expect(resolvePostLoginPath(false, null, 0, null)).toBe("/companies/new");
    expect(resolvePostLoginPath(false, null, 0, "/invoices")).toBe("/companies/new");
  });

  it("punya perusahaan tapi belum memilih → /select-company (issue #104)", () => {
    expect(resolvePostLoginPath(false, null, 2, null)).toBe("/select-company");
    // companyCount tak terbaca (undefined/null) diperlakukan sama: pemilihlah
    // yang menjelaskan keadaannya, bukan layar buat PT baru.
    expect(resolvePostLoginPath(false, null, undefined, null)).toBe("/select-company");
    expect(resolvePostLoginPath(false, null, null, null)).toBe("/select-company");
  });

  it("perusahaan aktif → callbackUrl relatif dihormati, selainnya /dashboard", () => {
    expect(resolvePostLoginPath(false, 1, 1, "/invoices")).toBe("/invoices");
    expect(resolvePostLoginPath(false, 1, 1, null)).toBe("/dashboard");
  });

  it("callbackUrl terbuka (absolut / protocol-relative) DITOLAK — anti open-redirect", () => {
    expect(resolvePostLoginPath(false, 1, 1, "https://evil.example")).toBe("/dashboard");
    expect(resolvePostLoginPath(false, 1, 1, "//evil.example")).toBe("/dashboard");
  });
});

describe("kedua pintu memakai aturan yang sama — tanpa salinan", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

  it("penjaga halaman TIDAK LAGI memutuskan tujuan pasca-masuk — perusahaannya dari URL (issue #158)", () => {
    /*
     * Sampai #158 penjaga halaman punya cabang "sesi tanpa perusahaan aktif"
     * dan memantulkannya lewat `resolvePostLoginPath`. Cabang itu hilang
     * bersama perusahaan-dari-sesi: setiap halaman berizin kini hidup di
     * `/t/{tenant}/{company}/…`, jadi keadaan "belum memilih PT" tidak bisa
     * lagi terjadi DI DALAM sebuah halaman — ia hanya ada sebelum masuk ke
     * jalur bertenant, dan di sanalah aturannya tinggal (/login dan /dashboard
     * telanjang, dua tes di bawah).
     *
     * Aturan lama "semua tanpa perusahaan → /select-company" tetap tidak boleh
     * hidup kembali sebagai literal di penjaga.
     */
    const src = read("src", "lib", "page-auth.ts");
    expect(src).not.toContain("resolvePostLoginPath(");
    expect(src).not.toContain('"/select-company"');
    // Dan penjaga tidak boleh punya jalan masuk kedua yang mengambil
    // perusahaan dari sesi.
    expect(src).not.toContain("enterCompanyFromSession");
  });

  it("halaman /login mengimpor, bukan mendefinisikan ulang", () => {
    const src = read("src", "app", "(auth)", "login", "page.tsx");
    expect(src).toContain('from "@/lib/post-login"');
    expect(src).not.toContain("function resolvePostLoginPath");
  });

  it("beranda (yang menjaga dirinya sendiri) juga memakai aturan yang sama", () => {
    const src = read("src", "app", "(dashboard)", "dashboard", "page.tsx");
    expect(src).toContain("resolvePostLoginPath(");
  });
});
