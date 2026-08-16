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

import { POST_LOGIN_PATH, resolvePostLoginPath } from "@/lib/post-login";

describe("resolvePostLoginPath", () => {
  it("wajib ganti kata sandi menang atas segalanya", () => {
    expect(resolvePostLoginPath(true, null, "/invoices")).toBe("/change-password");
    expect(resolvePostLoginPath(true, 1, null)).toBe("/change-password");
  });

  it("tujuan bawaannya /platform — untuk SETIAP keadaan perusahaan (issue #172)", () => {
    /*
     * Sebelum #172 jawabannya bercabang tiga (/companies/new, /select-company,
     * /dashboard) dan pemegang SATU PT tidak pernah melihat konteks akunnya.
     * Kini satu tujuan menjawab ketiganya, dan halaman itu yang menjelaskan
     * keadaannya: kosong + tombol buat, daftar PT, atau alasan tak ada akses.
     */
    expect(resolvePostLoginPath(false, null, null)).toBe("/platform"); // nol PT
    expect(resolvePostLoginPath(false, null, null)).toBe("/platform"); // banyak, belum pilih
    expect(resolvePostLoginPath(false, 1, null)).toBe("/platform"); // satu PT, sudah aktif
    expect(
      resolvePostLoginPath(false, { companyId: 1, tenantSlug: "acme", companySlug: "cv-maju" }, null)
    ).toBe("/platform");
  });

  it("TAUTAN DALAM tetap menang atas pendaratan — ini bukan gerbang", () => {
    expect(resolvePostLoginPath(false, 1, "/invoices")).toBe("/invoices");
    // Dan jalur lama dipetakan ke jalur kanonik saat slugnya diketahui (#157).
    expect(
      resolvePostLoginPath(
        false,
        { companyId: 1, tenantSlug: "acme", companySlug: "cv-maju" },
        "/invoices/12"
      )
    ).toBe("/t/acme/cv-maju/invoices/12");
  });

  it("tanpa perusahaan aktif, tujuan yang MENUNTUT perusahaan diabaikan", () => {
    // Menghormatinya berarti mengirim orang tanpa PT ke jalur lama yang sudah
    // tidak dilayani siapa pun: 404 pada langkah pertama sesi.
    expect(resolvePostLoginPath(false, null, "/invoices")).toBe("/platform");
    expect(resolvePostLoginPath(false, null, "/dashboard")).toBe("/platform");
  });

  it("…tetapi tujuan yang memang berdiri TANPA perusahaan tetap dihormati", () => {
    // Tombol "buat perusahaan pertama" di layar verifikasi email bermuara ke
    // /login?callbackUrl=/companies/new (docs/MULTI-TENANT.md §7.1); pelanggan
    // baru justru selalu berada di keadaan "belum punya PT".
    expect(resolvePostLoginPath(false, null, "/companies/new")).toBe("/companies/new");
    expect(resolvePostLoginPath(false, null, "/select-company")).toBe("/select-company");
  });

  it("callbackUrl terbuka (absolut / protocol-relative) DITOLAK — anti open-redirect", () => {
    expect(resolvePostLoginPath(false, 1, "https://evil.example")).toBe("/platform");
    expect(resolvePostLoginPath(false, 1, "//evil.example")).toBe("/platform");
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
    const src = read("src", "app", "(app)", "(auth)", "login", "page.tsx");
    expect(src).toContain('from "@/lib/post-login"');
    expect(src).not.toContain("function resolvePostLoginPath");
  });

  it("beranda (yang menjaga dirinya sendiri) juga memakai aturan yang sama", () => {
    const src = read("src", "app", "(app)", "(dashboard)", "dashboard", "page.tsx");
    expect(src).toContain("resolvePostLoginPath(");
  });

  it("proxy — pintu KETIGA — juga mengimpor aturannya, bukan menuliskan tujuan sendiri", () => {
    /*
     * Sesi yang sudah sah lalu membuka /login atau /register dipantulkan proxy.
     * Sampai #172 tujuannya ditulis harfiah di sana ("/dashboard"), dan salinan
     * itu adalah yang paling mudah ketinggalan: tak satu pun tes halaman
     * melihatnya. Kini ia memanggil aturan yang sama.
     */
    const src = read("src", "proxy.ts");
    expect(src).toContain('from "@/lib/post-login"');
    expect(src).toContain("resolvePostLoginPath(");
    expect(src).not.toMatch(/mustChangePassword \? "\/change-password" : "\/dashboard"/);
  });
});

/**
 * STAF MENDARAT DI BUKU (lanjutan #172).
 *
 * `/platform` menjadi tujuan bawaan setiap anggota, dan untuk PEMILIK akun itu
 * benar. Untuk staf yang diundang ke satu PT halaman itu tidak menjawab apa
 * pun — dan memaksanya lewat sana berarti satu layar tambahan SETIAP KALI
 * masuk, seumur pemakaiannya.
 *
 * Yang memutuskan adalah MATRIKS izin tenant, bukan nama peran: menulis
 * `role === "member"` di jalur pendaratan akan menjadi salinan kedua dari
 * matriks, dan salinan kedua menyimpang pada peran berikutnya.
 */
describe("pendaratan menurut peran tenant", () => {
  const withCompany = (tenantRole?: string | null) => ({
    companyId: 9,
    tenantSlug: "acme",
    companySlug: "pusat",
    tenantRole,
  });

  it("member (tanpa urusan akun) mendarat di BUKU", () => {
    expect(resolvePostLoginPath(false, withCompany("member"), null)).toBe(
      "/t/acme/pusat"
    );
  });

  it("owner & admin tetap mendarat di panel akun", () => {
    expect(resolvePostLoginPath(false, withCompany("owner"), null)).toBe(POST_LOGIN_PATH);
    expect(resolvePostLoginPath(false, withCompany("admin"), null)).toBe(POST_LOGIN_PATH);
  });

  it("peran TIDAK DIKETAHUI mempertahankan perilaku lama (/platform)", () => {
    /* Sesi yang terbit sebelum medan `tenantRole` ada. Menebak ke arah
     * sebaliknya akan melempar seorang owner ke buku salah satu PT-nya pada
     * hari kita paling tidak yakin. */
    expect(resolvePostLoginPath(false, withCompany(undefined), null)).toBe(POST_LOGIN_PATH);
  });

  it("peran kosong/tak dikenal juga tidak dianggap staf", () => {
    /* `null` berarti "diperiksa, dan orang ini bukan anggota tenant mana pun" —
     * keadaan yang seharusnya mustahil sesudah #134. Ia TIDAK boleh diam-diam
     * menjadi jalan pintas ke buku sebuah PT. */
    expect(resolvePostLoginPath(false, withCompany(null), null)).toBe(POST_LOGIN_PATH);
  });

  it("tanpa slug lengkap, staf pun tetap ke panel — jalurnya tidak bisa disusun", () => {
    expect(
      resolvePostLoginPath(false, { companyId: 9, tenantRole: "member" }, null)
    ).toBe(POST_LOGIN_PATH);
  });

  it("wajib ganti kata sandi tetap menang", () => {
    expect(resolvePostLoginPath(true, withCompany("member"), null)).toBe("/change-password");
  });

  it("callbackUrl relatif tetap menang atas pendaratan mana pun", () => {
    expect(resolvePostLoginPath(false, withCompany("member"), "/t/acme/pusat/invoices")).toBe(
      "/t/acme/pusat/invoices"
    );
  });
});
