/**
 * Cakupan penjaga otorisasi (audit RBAC fase 2).
 *
 * Aturan yang dijaga: TIDAK ADA halaman aplikasi atau API route yang lolos
 * tanpa deklarasi izin — inilah "deny-by-default yang bisa dibuktikan".
 * Halaman memakai `requirePagePermission`, route memakai `requireApiPermission`;
 * penjaga generasi lama (daftar peran) tidak boleh muncul lagi di titik pakai.
 * Pengecualian didaftar EKSPLISIT di bawah beserta alasannya.
 *
 * ── Kenapa lebih dari satu grup rute (issue #103) ──────────────────────────
 * Penjaga ini dulu hanya menelusuri `(dashboard)`, karena di situlah semua
 * halaman berizin tinggal. Sejak wizard penyiapan pindah ke grup `(setup)`
 * demi kerangkanya sendiri, asumsi itu tidak lagi benar — dan grup rute TIDAK
 * mengubah URL, jadi halaman yang "pindah keluar" dari penjaga ini tidak
 * meninggalkan jejak apa pun di URL yang bisa memperingatkan siapa pun.
 * Karena itu daftarnya eksplisit di `GUARDED_PAGE_DIRS`: menambah grup rute
 * baru yang berisi halaman berizin berarti menambahkannya DI SINI juga.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP_DIR = join(__dirname, "..", "src", "app");
const API_DIR = join(APP_DIR, "api");

/**
 * Grup rute yang halamannya WAJIB mendeklarasikan izin. Jalurnya relatif
 * terhadap `src/app`, dan itu pula bentuk kunci `PAGE_EXCEPTIONS` di bawah.
 *
 * `(auth)` sengaja TIDAK di sini: halaman di grup itu (masuk, ganti kata sandi,
 * "belum disiapkan", "fitur belum aktif") adalah keadaan PRA-aplikasi yang
 * justru tidak boleh memanggil `requirePagePermission()` — penjaga yang sama
 * akan memantulkannya ke dirinya sendiri tanpa henti.
 */
const GUARDED_PAGE_GROUPS = ["(dashboard)", "(setup)"];

/** Halaman yang sah TANPA requirePagePermission, beserta alasannya. */
const PAGE_EXCEPTIONS = new Set([
  // Beranda terbuka untuk semua peran; menjaga sendiri dengan auth() dan
  // menyusun isinya per peran di server.
  "(dashboard)/dashboard/page.tsx",
]);

/** Route yang sah TANPA requireApiPermission, beserta alasannya. */
const API_EXCEPTIONS = new Set([
  "auth/[...nextauth]/route.ts", // handler NextAuth
  "auth/change-password/route.ts", // self-scoped: auth() + target selalu diri sendiri
  "user/accountant-mode/route.ts", // self-scoped: preferensi tampilan milik sendiri
  // self-scoped (issue #73): auth() + hanya izin efektif PERAN SENDIRI, untuk
  // penyaringan menu client — tampilan saja, halaman tujuannya tetap dijaga.
  "user/permissions/route.ts",
  // self-scoped (issue #104): daftar perusahaan MILIK PEMANGGIL SENDIRI, dipakai
  // pemilih & penukar perusahaan. Tidak boleh memakai requireApiPermission —
  // penjaga itu menuntut konteks perusahaan, sedangkan route ini justru dipanggil
  // saat perusahaan BELUM dipilih.
  "user/companies/route.ts",
  "health/route.ts", // health probe publik (container/load-balancer)
  // publik: hanya NAMA & ALAMAT perusahaan — keduanya sudah tercetak di halaman
  // masuk sebelum siapa pun log in, dan di setiap dokumen yang dikirim ke
  // pelanggan. Identitas pajak (NPWP dll.) TIDAK di sini; itu tetap lewat
  // `company-settings/route.ts` yang dijaga `company_setting.manage`.
  "company/identity/route.ts",
]);

function filesNamed(dir: string, filename: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return filesNamed(full, filename);
    return entry.name === filename ? [full] : [];
  });
}

describe("cakupan penjaga halaman aplikasi", () => {
  const pages = GUARDED_PAGE_GROUPS.flatMap((group) =>
    filesNamed(join(APP_DIR, group), "page.tsx")
  ).map((f) => relative(APP_DIR, f).split(sep).join("/"));

  it("menemukan halaman untuk diperiksa", () => {
    expect(pages.length).toBeGreaterThan(50);
  });

  it("setiap grup rute yang didaftar benar-benar ada dan berisi halaman", () => {
    // Penjaga bagi penjaga: grup yang salah tulis (atau grup yang dihapus)
    // membuat telusurnya kosong, dan tes di bawah akan lulus tanpa memeriksa
    // apa pun. Wizard penyiapan disebut namanya karena justru dialah alasan
    // daftar ini ada (issue #103).
    for (const group of GUARDED_PAGE_GROUPS) {
      expect(existsSync(join(APP_DIR, group)), `grup rute ${group} tidak ada`).toBe(true);
      expect(
        pages.some((rel) => rel.startsWith(`${group}/`)),
        `grup rute ${group} tidak berisi satu pun page.tsx`
      ).toBe(true);
    }
    expect(pages).toContain("(setup)/setup/page.tsx");
  });

  it("setiap halaman mendeklarasikan izinnya (requirePagePermission)", () => {
    const offenders = pages
      .filter((rel) => !PAGE_EXCEPTIONS.has(rel))
      .filter((rel) => !readFileSync(join(APP_DIR, rel), "utf8").includes("requirePagePermission("));
    expect(offenders).toEqual([]);
  });

  it("penjaga daftar-peran generasi lama tidak muncul lagi di halaman", () => {
    const offenders = pages.filter((rel) => {
      const src = readFileSync(join(APP_DIR, rel), "utf8");
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
