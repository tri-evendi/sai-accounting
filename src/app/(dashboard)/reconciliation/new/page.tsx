/**
 * Rekonsiliasi Baru — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga server; kini dijaga
 * izin `reconciliation.write` lewat `requirePagePermission` sebelum form
 * dirender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { NewReconciliationForm } from "./reconciliation-form";

export const dynamic = "force-dynamic";

export default async function NewReconciliationPage() {
  await requirePagePermission("reconciliation.write");
  return <NewReconciliationForm />;
}
