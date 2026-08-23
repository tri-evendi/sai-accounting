/**
 * Nama AKUN terpisah dari nama ORANG (issue #458).
 *
 * Yang dijaga di sini adalah dua janji yang tidak berbunyi kalau dilanggar:
 * slug tenant tidak boleh lagi lahir dari nama pendaftar, dan halaman yang
 * mengganti nama akun tidak boleh diam-diam ikut mengganti ALAMAT-nya —
 * alamat itu sudah ada di bookmark dan di surel undangan yang sudah terkirim.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const baca = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("nama akun ≠ nama orang (#458)", () => {
  const store = baca("src/lib/registration-store.ts");

  it("tenant lahir dari nama AKUN, dan pengguna dari nama ORANG", () => {
    /* `row.name` masih dipakai — untuk `users.name`. Yang tidak boleh lagi
       adalah slug/nama tenant yang dibangun darinya. */
    expect(store).toContain("row.accountName");
    expect(store, "slug tenant masih dibangun dari nama pendaftar").not.toMatch(
      /tenantSlugCandidates\(\s*row\.name\s*\)/
    );
  });

  it("baris pendaftaran LAMA tetap bisa diverifikasi", () => {
    /*
     * Kolomnya nullable dengan sengaja: tautan verifikasi yang sudah telanjur
     * ada di kotak masuk seseorang tidak boleh mati karena kita menambah
     * kolom. Cabang cadangannya harus ADA dan harus jatuh ke `row.name`.
     */
    expect(store).toMatch(/row\.accountName\?\.trim\(\)\s*\|\|\s*row\.name/);
  });

  it("formulir daftar menanyakan keduanya, dan memperlihatkan akibat ketikannya", () => {
    const form = baca("src/app/(app)/(auth)/register/page.tsx");
    expect(form).toContain('name="accountName"');
    expect(form).toContain('name="name"');
    /* Pratinjau slug memakai fungsi SERVER, bukan tiruan di klien: dua aturan
       untuk satu slug berarti pratinjau yang menjanjikan alamat yang tidak
       jadi. */
    expect(form).toContain("tenantSlugFrom");

    const skema = baca("src/lib/validations/auth.ts");
    expect(skema).toMatch(/accountName:\s*z\.string\(\)/);
  });
});

describe("ganti nama akun TIDAK menyentuh alamatnya (#458)", () => {
  const route = baca("src/app/api/tenant/profile/route.ts");

  it("dijaga `tenant.settings` dan tercatat di jejak audit", () => {
    expect(route).toContain('requireTenantApiPermission("tenant.settings")');
    expect(route).toContain('action: "tenant.profile.rename"');
    /* Nama LAMA ikut dicatat — tanpa itu jejaknya hanya menyatakan keadaan
       sekarang, bukan riwayat. */
    expect(route).toMatch(/details:\s*\{\s*from:/);
  });

  it("hanya `name` yang ditulis — slug tidak pernah ikut", () => {
    expect(route).toMatch(/data:\s*\{\s*name:/);
    expect(route, "route ini menulis slug tenant").not.toMatch(/data:\s*\{[^}]*slug/);
  });

  it("halamannya memajang alamat itu dan menyatakan ia tetap", () => {
    const page = baca("src/app/(app)/(tenant)/(panel)/platform/account/account-name-form.tsx");
    expect(page).toContain("accountAddressFixed");
    /* Slug ditampilkan sebagai TEKS, bukan isian yang dinonaktifkan: isian
       kelabu mengundang orang mencoba menyuntingnya lalu menyimpulkan
       aplikasinya rusak. */
    expect(page).not.toMatch(/<Input[^>]*slug/i);
  });
});
