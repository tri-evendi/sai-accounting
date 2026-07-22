/**
 * e-Faktur export — the DATA layer (issue #17).
 *
 * The only Prisma-touching part: it READS the seller identity (CompanySetting)
 * and the output-VAT / export invoices for a period, maps them onto the pure
 * `@/lib/efaktur` builder's input, and returns the built result. It posts NO
 * journals and changes no posting rule — #16 already posts the VAT; this is a
 * read-only reporting surface over what is already in the ledger.
 *
 * Which invoices qualify: those that carry output PPN (a domestic faktur keluaran)
 * OR an export document (a PEB number). Concretely: `taxable = true` OR
 * `tax_amount > 0` OR `peb_number` present, within the date range. A plain
 * domestic non-VAT invoice with no PEB is not a faktur keluaran and is excluded.
 */
import { prisma } from "@/lib/prisma";
import { getCompanySettings } from "@/lib/opening-balance";
import {
  buildEfaktur,
  type EfakturInvoiceInput,
  type EfakturResult,
  type EfakturSeller,
} from "@/lib/efaktur";

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export interface EfakturExport {
  seller: { npwp: string | null; name: string | null; address: string | null };
  /** Whether the seller NPWP is set — the export cannot be filed without it. */
  sellerNpwpMissing: boolean;
  from: Date;
  to: Date;
  result: EfakturResult;
  /** How many invoices matched the period/output-VAT filter (rows + problems). */
  matched: number;
}

/**
 * Gather and build the e-Faktur export for the inclusive date range [from, to].
 * `to` is treated as the whole day (extended to 23:59:59.999).
 */
export async function getEfakturExport(from: Date, to: Date): Promise<EfakturExport> {
  const rangeEnd = new Date(to);
  rangeEnd.setHours(23, 59, 59, 999);

  const [settings, invoices] = await Promise.all([
    getCompanySettings(),
    prisma.invoice.findMany({
      where: {
        date: { gte: from, lte: rangeEnd },
        OR: [{ taxable: true }, { taxAmount: { gt: 0 } }, { NOT: { pebNumber: null } }],
      },
      include: { items: true, customer: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const seller: EfakturSeller = {
    npwp: settings?.npwp ?? null,
    // Nama sesuai NPWP, falling back to the trading name.
    name: settings?.taxName ?? settings?.name ?? null,
  };

  const inputs: EfakturInvoiceInput[] = invoices.map((inv) => {
    // DPP: prefer the stored value (#16); recompute from items for a legacy row
    // that predates the column, in the invoice's own currency.
    const subtotal = inv.items.reduce((s, i) => s + num(i.quantity) * num(i.price), 0);
    const dpp = inv.dpp != null ? num(inv.dpp) : subtotal;
    return {
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      currency: inv.currency || "IDR",
      rate: inv.rate != null ? num(inv.rate) : null,
      dpp,
      taxAmount: num(inv.taxAmount),
      taxRate: inv.taxRate != null ? num(inv.taxRate) : null,
      buyerName: inv.customer?.name ?? null,
      buyerNpwp: inv.customer?.npwp ?? null,
      buyerAddress: inv.customer?.address ?? null,
      pebNumber: inv.pebNumber ?? null,
      pebDate: inv.pebDate ?? null,
      exportNote: inv.exportNote ?? null,
    };
  });

  // Belt-and-suspenders: the SQL already narrowed by date; the pure builder
  // re-applies the period so an out-of-range row can never slip through.
  const result = buildEfaktur(seller, inputs, { from, to: rangeEnd });

  return {
    seller: {
      npwp: settings?.npwp ?? null,
      name: settings?.taxName ?? settings?.name ?? null,
      address: settings?.taxAddress ?? settings?.address ?? null,
    },
    sellerNpwpMissing: !(seller.npwp && seller.npwp.trim() !== ""),
    from,
    to,
    result,
    matched: invoices.length,
  };
}
