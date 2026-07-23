/**
 * Jurnal Baru — pembungkus server (audit RBAC fase 0).
 *
 * Sebelumnya halaman ini client component TANPA penjaga: bos yang mematikan
 * Mode Akuntan (ditolak dari daftar jurnal) tetap bisa membuka form ini lewat
 * URL. Kini dijaga sama persis dengan saudaranya (/journal, /journal/[id]):
 * peran bos DAN Mode Akuntan efektif ON — penjaga terakhirnya tetap
 * `POST /api/journals` (bos-only) seperti sebelumnya.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { NewJournalForm } from "./journal-form";

export const dynamic = "force-dynamic";

export default async function NewJournalPage() {
  await requirePagePermission("journal.write");
  return <NewJournalForm />;
}
