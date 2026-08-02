/**
 * `/dashboard` TELANJANG — satu-satunya berkas yang sengaja ditinggalkan di
 * jalur lama (issue #157), dan ia tidak menampilkan apa pun.
 *
 * ══ KENAPA IA TIDAK IKUT PINDAH ════════════════════════════════════════════
 * `/dashboard` bukan sekadar salah satu halaman: ia TUJUAN BAWAAN seluruh
 * aplikasi. Penjaga izin memantulkan penolakan ke sana, alur pasca-masuk
 * berakhir di sana, dan ribuan bookmark pengguna menunjuk ke sana. Jalur itu
 * harus tetap menjawab.
 *
 * `proxy.ts` memang sudah memantulkan jalur lama ke jalur kanonik — TAPI hanya
 * bila tokennya membawa slug tenant DAN slug perusahaan. Yang tidak membawanya
 * justru rombongan yang paling butuh jawaban benar:
 *
 *   • pengguna dengan lebih dari satu PT yang belum memilih;
 *   • pelanggan baru yang belum punya PT sama sekali;
 *   • sesi lama yang terbit sebelum #157 dan belum sempat direvalidasi.
 *
 * Tanpa berkas ini mereka bertemu 404 — jawaban yang salah untuk ketiganya.
 *
 * ══ IA BUKAN SALINAN HALAMAN ═══════════════════════════════════════════════
 * Tidak ada satu pun query di sini, dan itu disengaja: salinan beranda di jalur
 * lama akan menjawab 200 dengan perusahaan dari SESI — persis kebiasaan yang
 * issue ini hapus, hanya bersembunyi di balik jalur yang terlihat usang.
 * Berkas ini hanya MENGARAHKAN, dan arahnya diputuskan `resolvePostLoginPath`,
 * aturan tunggal yang sama dengan halaman masuk dan penjaga halaman.
 */

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { routeForCompany } from "@/lib/company-route";
import { resolvePostLoginPath } from "@/lib/post-login";
import { tenantPath } from "@/lib/tenant-routes";

export const dynamic = "force-dynamic";

export default async function BareDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const companyId = session.user.companyId;
  if (companyId != null) {
    /*
     * Slugnya DICARI, tidak ditebak dari sesi.
     *
     * Sesi lama membawa `companyId` tanpa `tenantSlug`, dan
     * `resolvePostLoginPath` tanpa slug menjawab "/dashboard" — yaitu halaman
     * ini sendiri, tanpa henti. Satu query menutup lubang itu; ia hanya
     * berjalan untuk sesi yang belum direvalidasi, sebab yang sudah membawa
     * slug tidak pernah sampai ke berkas ini (proxy memantulkannya lebih dulu).
     *
     * Perusahaan yang sementara itu DINONAKTIFKAN dijawab `null` di sini, dan
     * jatuh ke pemilih perusahaan di bawah — bukan ke 404 pada halaman yang
     * seharusnya menjadi jalan pulang universal.
     */
    const route = await routeForCompany(companyId);
    if (route) redirect(tenantPath(route.tenantSlug, route.companySlug, "/dashboard"));
    redirect("/select-company");
  }

  redirect(
    resolvePostLoginPath(
      session.user.mustChangePassword,
      null,
      session.user.companyCount,
      null
    )
  );
}
