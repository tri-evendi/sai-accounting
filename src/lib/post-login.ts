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
 */
export function resolvePostLoginPath(
  mustChangePassword: boolean | undefined,
  companyId: number | null | undefined,
  companyCount: number | null | undefined,
  callbackUrl: string | null
) {
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
  if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return callbackUrl;
  }
  return "/dashboard";
}
