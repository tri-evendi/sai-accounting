/**
 * Pengaturan — semua peran (issue #59: penjaga sisi-server).
 *
 * Pembungkus server tipis yang minimal memastikan pengguna terautentikasi
 * (redirect ke /login bila belum), konsisten dengan halaman lain. Isi yang
 * spesifik-peran (mis. panel Audit Log) tetap dibedakan di dalam komponen
 * client dan API-nya tetap ber-gate peran masing-masing.
 */
import { requirePageSession } from "@/lib/page-auth";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageSession(["bos", "core", "ptg"]);
  return <SettingsClient />;
}
