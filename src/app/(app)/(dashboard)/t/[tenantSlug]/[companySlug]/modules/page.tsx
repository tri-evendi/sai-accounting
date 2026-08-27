/**
 * MODUL USAHA — halamannya sendiri.
 *
 * ══ KENAPA DIPINDAH KELUAR DARI PENGATURAN ═════════════════════════════════
 * Modul menjawab "perusahaan ini bidangnya apa", dan jawabannya MENGUBAH
 * BENTUK APLIKASI: menu hilang, akun berhenti disemai, halaman berubah jadi
 * `/feature-inactive`. Itu bukan preferensi seperti bahasa atau tema — itu
 * keputusan yang dirasakan setiap orang di perusahaan, setiap hari.
 *
 * Sebagai satu kartu di tengah halaman Pengaturan, ia berbagi tempat dengan
 * profil pengguna, ganti kata sandi, dan "Tentang aplikasi" — dan karena itu
 * hanya ditemukan oleh yang sudah tahu ia ada. Orang yang bertanya "kenapa menu
 * Kontrak tidak ada?" tidak akan menebak jawabannya tersembunyi di bawah kartu
 * ganti kata sandi.
 *
 * Sebagai halaman bernama di menu samping, pertanyaan itu punya alamat.
 *
 * ══ APA YANG SENGAJA TETAP DI PENGATURAN ═══════════════════════════════════
 * Ringkasan "modul yang sedang MATI" (issue #103) TIDAK ikut pindah. Ia
 * menjawab pertanyaan yang berbeda — "kenapa menu itu hilang" — dan ia harus
 * terbaca oleh SEMUA yang boleh membuka Pengaturan, termasuk yang tidak berhak
 * menyalakan modul apa pun. Merekalah yang paling perlu tahu bahwa fiturnya ada
 * dan sedang dimatikan, supaya tahu ada yang bisa dimintai. Yang berubah cuma
 * tautannya: dari jangkar `#modules` di halaman yang sama, menjadi halaman ini.
 *
 * Halaman ini sendiri ber-gate `company_setting.manage` — izin yang sama dengan
 * API-nya (`api/company-settings/modules`), jadi bukan tampilan yang menjaga
 * dirinya sendiri.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { ModuleSettingsPanel } from "@/components/settings/module-settings-panel";

export const dynamic = "force-dynamic";

export default async function ModulesPage({ params }: { params: Promise<TenantScopedParams> }) {
  await requirePagePermission("company_setting.manage", params);
  const t = await getT();

  return (
    <div>
      <PageHeader title={t("modules.pageTitle")} description={t("modules.pageDescription")} />
      <ModuleSettingsPanel />
    </div>
  );
}
