/**
 * Pengaturan — semua peran (issue #59: penjaga sisi-server).
 *
 * Pembungkus server tipis yang minimal memastikan pengguna terautentikasi
 * (redirect ke /login bila belum), konsisten dengan halaman lain. Isi yang
 * spesifik-peran (mis. panel Audit Log) tetap dibedakan di dalam komponen
 * client dan API-nya tetap ber-gate peran masing-masing.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { canEffective } from "@/lib/authz-effective";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requirePagePermission("settings.view");
  // issue #73 — keputusan tampilan dihitung terhadap matriks EFEKTIF di server
  // dan diturunkan sebagai boolean; komponen client tidak lagi membaca matriks
  // bawaan dari bundle. API audit tetap ber-gate `audit.read` (pertahanan asli).
  const canReadAudit = await canEffective(session.user, "audit.read");
  return <SettingsClient canReadAudit={canReadAudit} />;
}
