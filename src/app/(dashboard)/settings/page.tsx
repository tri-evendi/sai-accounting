/**
 * Pengaturan — semua peran (issue #59: penjaga sisi-server).
 *
 * Pembungkus server tipis yang minimal memastikan pengguna terautentikasi
 * (redirect ke /login bila belum), konsisten dengan halaman lain. Isi yang
 * spesifik-peran (mis. panel Audit Log) tetap dibedakan di dalam komponen
 * client dan API-nya tetap ber-gate peran masing-masing.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { canEffective, getEnabledModules } from "@/lib/authz-effective";
import { BUSINESS_MODULES, isModuleEnabled } from "@/lib/business-modules";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requirePagePermission("settings.view");
  // issue #73 — keputusan tampilan dihitung terhadap matriks EFEKTIF di server
  // dan diturunkan sebagai boolean; komponen client tidak lagi membaca matriks
  // bawaan dari bundle. API audit tetap ber-gate `audit.read` (pertahanan asli).
  const canReadAudit = await canEffective(session.user, "audit.read");
  // issue #99 — kartu "Modul Usaha" (fitur mana yang dipakai perusahaan ini).
  // Keputusannya dihitung di server dengan pola yang sama; API-nya tetap
  // ber-gate `company_setting.manage`, jadi bukan tampilan yang menjaga dirinya.
  const canManageModules = await canEffective(session.user, "company_setting.manage");
  /*
   * issue #103 — modul yang sedang MATI, disebutkan namanya.
   *
   * Orang yang mencari "Kontrak" dan tidak menemukannya menyimpulkan
   * aplikasinya TIDAK BISA kontrak — bukan "fitur itu sedang dimatikan".
   * `/feature-inactive` hanya menolong yang mengetik URL-nya langsung, dan
   * kartu "Modul Usaha" hanya terlihat oleh yang boleh mengubahnya. Baris ini
   * untuk semua orang yang membuka Pengaturan, termasuk yang tidak berhak
   * menyalakannya sendiri — mereka justru yang paling perlu tahu bahwa ada
   * yang bisa dimintai.
   */
  const enabled = await getEnabledModules();
  const inactiveModules = BUSINESS_MODULES.filter((m) => !isModuleEnabled(m, enabled));
  return (
    <SettingsClient
      canReadAudit={canReadAudit}
      canManageModules={canManageModules}
      inactiveModules={inactiveModules}
    />
  );
}
