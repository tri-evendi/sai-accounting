/**
 * Templat berulang BARU (issue #469, tahap 3).
 *
 * Selalu lahir DARI sebuah dokumen yang sudah ada — `?invoiceId=` datang dari
 * tombol "Ulangi faktur ini" di halaman faktur. Membuka halaman ini tanpa
 * sumber tidak masuk akal: templat menunjuk dokumen, dan tidak ada satu pun
 * isian di form ini yang bisa mengarang isinya.
 */
import { notFound, redirect } from "next/navigation";

import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { tenantPath } from "@/lib/tenant-routes";
import { RecurringForm } from "../recurring-form";

export const dynamic = "force-dynamic";

export default async function NewRecurringPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  await requirePagePermission("invoice.write", params);
  const { invoiceId } = await searchParams;
  const { tenantSlug, companySlug } = await params;

  const sourceId = Number(invoiceId);
  /* Tanpa sumber, kembalikan ke daftar faktur — di sanalah tombolnya berada.
     Menampilkan form kosong hanya akan menghasilkan templat yang menahan
     dirinya sendiri setiap bulan. */
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    redirect(tenantPath(tenantSlug, companySlug, "/invoices"));
  }

  const source = await prisma.invoice.findUnique({
    where: { id: sourceId },
    select: { id: true, invoiceNo: true, date: true },
  });
  if (!source) notFound();

  return (
    <RecurringForm
      initial={{
        name: source.invoiceNo,
        kind: "invoice",
        sourceId: source.id,
        frequency: "monthly",
        /* Mulai dari tanggal faktur sumbernya: ia juga JANGKAR tanggalnya, dan
           faktur sewa tanggal 31 memang harus berjangkar di 31. */
        startDate: source.date.toISOString().slice(0, 10),
        endDate: null,
        maxOccurrences: null,
        isActive: true,
      }}
    />
  );
}
