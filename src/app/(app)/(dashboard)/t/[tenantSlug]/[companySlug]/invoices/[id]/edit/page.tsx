/**
 * Ubah Tagihan — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga server; kini dijaga
 * izin `invoice.write` lewat `requirePagePermission` sebelum form dirender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { TaxProfileProvider } from "@/lib/tax-profile-client";
import { readCompanyTaxProfile } from "@/lib/tax-rates";
import { EditInvoiceForm } from "./invoice-edit-form";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("invoice.write", params);
  /*
   * Profil pajak perusahaan (issue #368). Halaman UBAH pun membutuhkannya:
   * faktur tersimpan memang membawa tarifnya sendiri, tapi menyalakan kembali
   * PPN pada faktur yang tadinya tak kena pajak akan mengambil sebuah bawaan —
   * dan bawaan itu harus milik perusahaan ini, bukan konstanta.
   */
  const taxProfile = await readCompanyTaxProfile();
  return (
    <TaxProfileProvider profile={taxProfile}>
      <EditInvoiceForm />
    </TaxProfileProvider>
  );
}
