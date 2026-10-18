/**
 * EKSPOR e-FAKTUR TAGIHAN PLATFORM — logika `scripts/efaktur-platform.ts`
 * DIANGKAT ke sini (bukan disalin), supaya skrip CLI dan unduhan konsol
 * operator menghasilkan berkas yang SAMA dari kueri yang sama.
 *
 * Yang diekspor: tagihan platform berstatus `paid` (penjualan langganan SAI
 * kepada tenant), dengan profil pajak pembeli dari `tenant_billing_profiles`
 * dan identitas penjual dari env `PLATFORM_SELLER_NPWP`/`_NAME`.
 *
 * Klien disuntik, tanpa `server-only` (pola `change-tenant-plan.ts`).
 */
import type { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import type { PrismaClient as ControlClient } from "@sai/db/client/control";
import { buildEfaktur, efakturToCsv, type EfakturInvoiceInput } from "@sai/core/efaktur";

export interface PlatformEfakturResult {
  csv: string;
  rowCount: number;
  /** Tagihan yang TIDAK ikut karena kolom wajibnya kosong. */
  problems: { invoiceNo: string; missing: string[] }[];
}

export async function platformEfaktur(
  deps: { platform: PlatformClient; control: ControlClient },
  period: { from: string | null; to: string | null },
  seller: { npwp: string | null; name: string | null } = {
    npwp: process.env.PLATFORM_SELLER_NPWP ?? null,
    name: process.env.PLATFORM_SELLER_NAME ?? null,
  }
): Promise<PlatformEfakturResult> {
  const invoices = await deps.platform.platformInvoice.findMany({
    where: {
      status: "paid",
      ...(period.from ? { issueDate: { gte: new Date(period.from) } } : {}),
    },
    orderBy: { id: "asc" },
    select: {
      number: true,
      issueDate: true,
      amount: true,
      taxAmount: true,
      total: true,
      currency: true,
      tenantId: true,
    },
  });

  const profiles = await deps.platform.tenantBillingProfile.findMany({
    select: { tenantId: true, npwp: true, name: true, address: true },
  });
  const profileByTenant = new Map(profiles.map((p) => [p.tenantId, p]));
  const tenants = await deps.control.tenant.findMany({ select: { id: true, name: true } });
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const inputs: EfakturInvoiceInput[] = invoices.map((inv) => {
    const profile = profileByTenant.get(inv.tenantId);
    const dpp = Number(inv.amount);
    const taxAmount = Number(inv.taxAmount);
    return {
      invoiceNo: inv.number,
      date: inv.issueDate,
      currency: inv.currency, // IDR ⇒ lokal (faktur keluaran)
      rate: 1,
      dpp,
      taxAmount,
      /* Tarif efektif DIBACA dari angka tersimpan (PPN ÷ DPP), bukan diketik
       * ulang — tagihan lama yang terbit pada tarif lama tetap jujur. */
      taxRate: dpp > 0 ? Math.round((taxAmount / dpp) * 10000) / 100 : null,
      buyerName: profile?.name ?? tenantById.get(inv.tenantId)?.name ?? null,
      buyerNpwp: profile?.npwp ?? null,
      buyerAddress: profile?.address ?? null,
      pebNumber: null,
      pebDate: null,
      exportNote: null,
    };
  });

  const result = buildEfaktur(seller, inputs, { from: period.from, to: period.to });
  return { csv: efakturToCsv(result.rows), rowCount: result.rows.length, problems: result.problems };
}
