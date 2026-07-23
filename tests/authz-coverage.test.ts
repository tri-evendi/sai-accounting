/**
 * Cakupan penjaga otorisasi (audit RBAC fase 2).
 *
 * Aturan yang dijaga: TIDAK ADA halaman dashboard atau API route yang lolos
 * tanpa deklarasi izin — inilah "deny-by-default yang bisa dibuktikan".
 * Halaman memakai `requirePagePermission`, route memakai `requireApiPermission`;
 * penjaga generasi lama (daftar peran) tidak boleh muncul lagi di titik pakai.
 * Pengecualian didaftar EKSPLISIT di bawah beserta alasannya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const APP_DIR = join(__dirname, "..", "src", "app");
const DASHBOARD_DIR = join(APP_DIR, "(dashboard)");
const API_DIR = join(APP_DIR, "api");

/** Halaman yang sah TANPA requirePagePermission, beserta alasannya. */
const PAGE_EXCEPTIONS = new Set([
  // Beranda terbuka untuk semua peran; menjaga sendiri dengan auth() dan
  // menyusun isinya per peran di server.
  "dashboard/page.tsx",
]);

/** Route yang sah TANPA requireApiPermission, beserta alasannya. */
const API_EXCEPTIONS = new Set([
  "auth/[...nextauth]/route.ts", // handler NextAuth
  "auth/change-password/route.ts", // self-scoped: auth() + target selalu diri sendiri
  "user/accountant-mode/route.ts", // self-scoped: preferensi tampilan milik sendiri
  // self-scoped (issue #73): auth() + hanya izin efektif PERAN SENDIRI, untuk
  // penyaringan menu client — tampilan saja, halaman tujuannya tetap dijaga.
  "user/permissions/route.ts",
  "health/route.ts", // health probe publik (container/load-balancer)
]);

function filesNamed(dir: string, filename: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return filesNamed(full, filename);
    return entry.name === filename ? [full] : [];
  });
}

describe("cakupan penjaga halaman dashboard", () => {
  const pages = filesNamed(DASHBOARD_DIR, "page.tsx");

  it("menemukan halaman untuk diperiksa", () => {
    expect(pages.length).toBeGreaterThan(50);
  });

  it("setiap halaman mendeklarasikan izinnya (requirePagePermission)", () => {
    const offenders = pages
      .map((f) => relative(DASHBOARD_DIR, f))
      .filter((rel) => !PAGE_EXCEPTIONS.has(rel))
      .filter((rel) => !readFileSync(join(DASHBOARD_DIR, rel), "utf8").includes("requirePagePermission("));
    expect(offenders).toEqual([]);
  });

  it("penjaga daftar-peran generasi lama tidak muncul lagi di halaman", () => {
    const offenders = pages
      .map((f) => relative(DASHBOARD_DIR, f))
      .filter((rel) => {
        const src = readFileSync(join(DASHBOARD_DIR, rel), "utf8");
        return src.includes("requirePageSession(") || src.includes("requireAccountantPage(");
      });
    expect(offenders).toEqual([]);
  });
});

describe("cakupan penjaga API route", () => {
  const routes = filesNamed(API_DIR, "route.ts");

  it("menemukan route untuk diperiksa", () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it("setiap route mendeklarasikan izinnya (requireApiPermission)", () => {
    const offenders = routes
      .map((f) => relative(API_DIR, f))
      .filter((rel) => !API_EXCEPTIONS.has(rel))
      .filter((rel) => !readFileSync(join(API_DIR, rel), "utf8").includes("requireApiPermission("));
    expect(offenders).toEqual([]);
  });

  it("requireAuth generasi lama tidak muncul lagi di route", () => {
    const offenders = routes
      .map((f) => relative(API_DIR, f))
      .filter((rel) => readFileSync(join(API_DIR, rel), "utf8").includes("requireAuth("));
    expect(offenders).toEqual([]);
  });
});

describe("jaring pengaman proxy", () => {
  it("src/proxy.ts ada, memverifikasi token, dan menegakkan alur ganti-kata-sandi", () => {
    const src = readFileSync(join(__dirname, "..", "src", "proxy.ts"), "utf8");
    expect(src).toMatch(/export (async )?function proxy/);
    expect(src).toContain("getToken");
    expect(src).toContain("/change-password");
    expect(src).not.toMatch(/roles:\s*\[/); // tak ada daftar peran diketik manual
  });

  it("proxy TIDAK membaca matriks izin — sejak issue #73 matriksnya bisa di-override DB", () => {
    // Gerbang per-prefix dari matriks statis dihapus: override yang MENGHADIAHKAN
    // izin tidak boleh diblokir oleh salinan bawaan yang tertanam di proxy, dan
    // dokumen Next melarang proxy mengandalkan modul/global bersama (cache
    // matriks + invalidasinya tak pernah terlihat dari sana). Penegakan izin
    // sepenuhnya di requirePagePermission/requireApiPermission — dua tes cakupan
    // di atas membuktikan setiap halaman & route memanggil penjaganya.
    const src = readFileSync(join(__dirname, "..", "src", "proxy.ts"), "utf8");
    expect(src).not.toContain("rolesFor");
    expect(src).not.toContain("PERMISSION_ROLES");
    expect(src).not.toContain("@/lib/prisma");
  });
});
