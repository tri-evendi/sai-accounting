/**
 * Ke mana pengguna diarahkan SETELAH sesinya sah — SATU aturan untuk semua
 * pintu (#159 temuan 3).
 *
 * Lahir di halaman /login (issue #104/#138), lalu ditarik ke sini karena
 * pemakainya bertambah: `/dashboard` telanjang memakai aturan yang sama untuk
 * sesi yang belum membawa slug, dan sejak #172 `proxy.ts` juga — pengguna yang
 * SUDAH masuk lalu membuka /login atau /register. Fungsi ini MURNI dan tanpa
 * `server-only` supaya ketiga dunianya (komponen klien /login, halaman server,
 * proxy di runtime Edge) boleh mengimpornya.
 *
 * Catatan #157: saat halaman pindah ke /t/{tenant}/{company}, cukup fungsi ini
 * yang diajari bentuk jalur baru — pemanggilnya tidak menduplikasi aturannya.
 * Itulah yang terjadi di bawah: argumen kedua boleh berupa OBJEK berisi slug
 * tenant + slug perusahaan, dan bila keduanya ada, `callbackUrl` berbentuk lama
 * dipetakan ke jalur kanonik.
 *
 * ══ TUJUAN BAWAAN = /platform (issue #172) ═════════════════════════════════
 * Sampai issue itu, pemegang SATU perusahaan mendarat langsung di buku besarnya
 * dan tidak pernah melihat konteks akunnya sendiri: langganan, kuota, daftar
 * PT — semuanya hidup di halaman yang praktis tak terjangkau. Kini setiap
 * pintu berakhir di `/platform`, halaman yang menjawab "akun saya sedang
 * bagaimana, dan buku mana yang boleh saya buka" lebih dulu.
 *
 * Yang TIDAK berubah karenanya, dan tidak boleh berubah:
 *   • TAUTAN DALAM tetap sampai — `/t/{tenant}/{company}/invoices` dibuka
 *     langsung tetap mendarat di sana; ini mengubah tujuan BAWAAN, bukan
 *     memasang gerbang. `callbackUrl` relatif tetap menang atas /platform.
 *   • "Jangan pernah memilihkan PT ketika ada BANYAK" (issue #104) tetap
 *     ditegakkan di `lib/auth.ts`; halaman ini justru yang menampilkan
 *     pilihannya, dan /select-company tetap hidup untuk BERGANTI perusahaan.
 */
import { hasAccountBusiness } from "@/lib/tenant-authz";
import { legacyTenantScopedPath, tenantPath } from "@/lib/tenant-routes";

export interface PostLoginCompany {
  companyId: number | null | undefined;
  tenantSlug?: string | null;
  companySlug?: string | null;
  /**
   * Peran TENANT pemakainya (owner/admin/member). Menentukan apakah `/platform`
   * punya isi baginya — lihat blok "STAF MENDARAT DI BUKU" di bawah.
   *
   * HANYA peran yang benar-benar DIKETAHUI (string) boleh mengubah pendaratan.
   * `undefined` (sesi yang terbit sebelum medan ini ada) DAN `null` ("diperiksa,
   * dan orang ini bukan anggota tenant mana pun" — keadaan yang seharusnya
   * mustahil sesudah #134) sama-sama mempertahankan perilaku lama: mendarat di
   * `/platform`. Deny-by-default, sejalan dengan matriks izin: menebak ke arah
   * sebaliknya akan melempar seorang owner ke buku salah satu PT-nya pada hari
   * kita paling tidak yakin.
   */
  tenantRole?: string | null;
}

/** Pendaratan pasca-masuk. Ditulis sekali; jangan disalin sebagai literal. */
export const POST_LOGIN_PATH = "/platform";

export function resolvePostLoginPath(
  mustChangePassword: boolean | undefined,
  company: number | PostLoginCompany | null | undefined,
  callbackUrl: string | null
) {
  const active: PostLoginCompany =
    company == null || typeof company === "number" ? { companyId: company } : company;
  const { companyId } = active;
  const tenantSlug = active.tenantSlug ?? null;
  const companySlug = active.companySlug ?? null;

  if (mustChangePassword) return "/change-password";

  const relative =
    callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : null;

  if (companyId == null) {
    /*
     * TANPA perusahaan aktif — belum punya satu pun, atau punya banyak dan
     * belum memilih. Tujuan yang MENUNTUT perusahaan tidak bisa dihormati di
     * sini: jalurnya berbentuk lama (`/invoices`) dan tanpa slug tak ada yang
     * bisa memetakannya, jadi menghormatinya berarti mengirim orang ke 404.
     *
     * Tujuan yang justru dibuat untuk keadaan ini TETAP dihormati — terutama
     * `/companies/new`, tempat tombol "buat perusahaan pertama" di layar
     * verifikasi email bermuara (docs/MULTI-TENANT.md §7.1). Selebihnya
     * /platform yang menjelaskan keadaannya: kosong, atau daftar PT-nya.
     */
    if (relative && !legacyTenantScopedPath(relative.split("?")[0])) return relative;
    return POST_LOGIN_PATH;
  }

  const scoped = tenantSlug && companySlug;
  if (relative) {
    /*
     * `callbackUrl` datang dari luar (parameter kueri) dan bisa berbentuk lama.
     * Memetakannya di sini — bukan membiarkan proxy memantulkannya sesudahnya —
     * menghemat satu pantulan pada langkah PERTAMA setiap sesi, dan membuat
     * tautan dalam yang dikirim lewat surel mendarat langsung di jalur kanonik.
     * Jalur yang segmennya belum dimigrasikan sengaja dibiarkan apa adanya.
     */
    if (scoped && legacyTenantScopedPath(relative.split("?")[0])) {
      return tenantPath(tenantSlug, companySlug, relative);
    }
    return relative;
  }

  /*
   * ══ STAF MENDARAT DI BUKU, BUKAN DI PANEL AKUN ═══════════════════════════
   * Issue #172 menjadikan `/platform` tujuan bawaan SETIAP anggota, dan untuk
   * pemilik akun itu benar: langganan, kuota, dan daftar PT memang pertanyaan
   * pertamanya. Untuk STAF yang diundang ke satu PT, halaman itu tidak
   * menjawab apa pun — ia tidak mengurus langganan, tidak melihat tagihan,
   * tidak mengundang siapa pun. Yang ia bawa adalah pekerjaan pembukuan, dan
   * memaksanya melewati panel akun berarti satu layar tambahan SETIAP KALI
   * masuk, seumur pemakaiannya.
   *
   * Yang memutuskan bukan nama peran melainkan MATRIKS: punya urusan akun
   * (langganan, tim, ekspor, membuat PT) → panel; tidak punya → buku. Menulis
   * `role === "member"` di sini akan menjadi salinan kedua dari matriks yang
   * akan menyimpang pada peran berikutnya.
   *
   * Tiga syarat, semuanya wajib: perusahaannya sudah pasti (satu PT, jadi tidak
   * ada yang perlu dipilih), jalurnya bisa disusun (slug lengkap), dan
   * perannya DIKETAHUI. Ketidaktahuan mempertahankan perilaku lama.
   */
  if (scoped && typeof active.tenantRole === "string" && !hasAccountBusiness(active.tenantRole)) {
    return tenantPath(tenantSlug, companySlug, "/dashboard");
  }

  return POST_LOGIN_PATH;
}
