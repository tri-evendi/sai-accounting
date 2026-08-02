/**
 * Ke mana pengguna diarahkan SETELAH sesinya sah — SATU aturan untuk semua
 * pintu (#159 temuan 3).
 *
 * Lahir di halaman /login (issue #104/#138), lalu ditarik ke sini karena
 * pemakainya bertambah: penjaga halaman (`page-auth.ts`) memakai aturan yang
 * sama saat pengguna TANPA perusahaan membuka halaman dashboard langsung dari
 * URL — dulu ia dijawab 200 berisi kerangka "Memuat sesi…" dan barulah klien
 * menemukan arahnya; kini server yang mengarahkan. Fungsi ini MURNI dan tanpa
 * `server-only` supaya kedua dunianya (komponen klien /login, penjaga server)
 * boleh mengimpornya.
 *
 * Catatan #157: saat halaman pindah ke /t/{tenant}/{company}, cukup fungsi ini
 * yang diajari bentuk jalur baru — pemanggilnya tidak menduplikasi aturannya.
 * Itulah yang terjadi di bawah: argumen kedua boleh berupa OBJEK berisi slug
 * tenant + slug perusahaan, dan bila keduanya ada, tujuannya (termasuk
 * `callbackUrl` berbentuk lama) dipetakan ke jalur kanonik. Bila slug-nya belum
 * ada — sesi lama yang terbit sebelum #157, atau halaman yang belum
 * dimigrasikan — jawabannya tetap jalur lama, yang masih hidup dan dipantulkan
 * `proxy.ts`.
 */
import { legacyTenantScopedPath, tenantPath } from "@/lib/tenant-routes";

export interface PostLoginCompany {
  companyId: number | null | undefined;
  tenantSlug?: string | null;
  companySlug?: string | null;
}

export function resolvePostLoginPath(
  mustChangePassword: boolean | undefined,
  company: number | PostLoginCompany | null | undefined,
  companyCount: number | null | undefined,
  callbackUrl: string | null
) {
  const active: PostLoginCompany =
    company == null || typeof company === "number" ? { companyId: company } : company;
  const { companyId } = active;
  const tenantSlug = active.tenantSlug ?? null;
  const companySlug = active.companySlug ?? null;

  if (mustChangePassword) return "/change-password";
  if (companyId == null) {
    /*
     * NOL perusahaan (issue #138) = pelanggan baru yang baru memverifikasi
     * emailnya: tujuannya layar BUAT PERUSAHAAN PERTAMA, bukan pemilih —
     * /select-company mengasumsikan ada sesuatu untuk dipilih. Penjaga
     * /companies/new yang memutuskan haknya; anggota tanpa izin dipantulkan
     * ke /select-company yang menjelaskan keadaannya.
     */
    if (companyCount === 0) return "/companies/new";
    /*
     * Lebih dari satu PT dan belum memilih (issue #104): langsung ke
     * pemilihnya — penjaga halaman toh akan memantulkannya ke sana, dan
     * pantulan itu hanya menambah satu layar berkedip.
     */
    return "/select-company";
  }
  const scoped = tenantSlug && companySlug;
  if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    /*
     * `callbackUrl` datang dari luar (parameter kueri) dan bisa berbentuk lama.
     * Memetakannya di sini — bukan membiarkan proxy memantulkannya sesudahnya —
     * menghemat satu pantulan pada langkah PERTAMA setiap sesi, dan membuat
     * tautan dalam yang dikirim lewat surel mendarat langsung di jalur kanonik.
     * Jalur yang segmennya belum dimigrasikan sengaja dibiarkan apa adanya.
     */
    if (scoped && legacyTenantScopedPath(callbackUrl.split("?")[0])) {
      return tenantPath(tenantSlug, companySlug, callbackUrl);
    }
    return callbackUrl;
  }
  return scoped ? tenantPath(tenantSlug, companySlug, "/dashboard") : "/dashboard";
}
