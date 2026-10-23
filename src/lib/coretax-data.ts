/**
 * BERKAS IMPOR CORETAX — lapisan DATA (docs/EFAKTUR.md).
 *
 * Satu-satunya bagian yang menyentuh Prisma: membaca identitas pajak penjual
 * dan faktur keluaran sebuah masa, memetakannya ke masukan pembangun murni
 * `@sai/core/coretax-xml`, dan memulangkan hasilnya. TIDAK memposting apa pun
 * — PPN sudah diposting saat faktur disimpan (#16); ini permukaan pelaporan
 * di atas apa yang sudah ada di buku.
 *
 * Faktur yang ikut: tidak dibatalkan, bukan saldo awal, dan memungut PPN
 * (`taxable` / `tax_amount > 0`) ATAU ber-PEB — yang terakhir supaya layar bisa
 * menyebut faktur ekspor yang dilaporkan lewat "Prepopulated PEB", bukan
 * menghilangkannya diam-diam.
 */
import { prisma } from "@/lib/prisma";
import { getCompanySettings } from "@/lib/opening-balance";
import { businessDayEnd, businessDayStart, businessISODate } from "@sai/core/business-date";
import {
  buildCoretax,
  type CoretaxInvoiceInput,
  type CoretaxResult,
  type CoretaxSeller,
} from "@sai/core/coretax-xml";

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export interface CoretaxExport {
  seller: CoretaxSeller;
  result: CoretaxResult;
  /** invoiceNo → id faktur, untuk tombol kirim per faktur. */
  invoiceIds: Map<string, number>;
  /** Berapa faktur yang cocok dengan saringan masa (siap + masalah + ekspor). */
  matched: number;
}

interface Scope {
  from?: Date;
  to?: Date;
  /** Batasi ke faktur tertentu (kirim per faktur). */
  invoiceIds?: number[];
}

/**
 * Bangun isi berkas Coretax untuk rentang [from, to] (hari kalender JAKARTA,
 * sama dengan ekspor CSV lama) atau untuk daftar faktur tertentu.
 */
export async function getCoretaxExport(scope: Scope): Promise<CoretaxExport> {
  const dateWhere =
    scope.from && scope.to
      ? {
          date: {
            gte: businessDayStart(businessISODate(scope.from)),
            lte: businessDayEnd(businessISODate(scope.to)),
          },
        }
      : {};
  const [settings, invoices] = await Promise.all([
    getCompanySettings(),
    prisma.invoice.findMany({
      where: {
        ...dateWhere,
        ...(scope.invoiceIds ? { id: { in: scope.invoiceIds } } : {}),
        status: { not: "canceled" },
        isOpening: false,
        OR: [{ taxable: true }, { taxAmount: { gt: 0 } }, { NOT: { pebNumber: null } }],
      },
      include: { items: { orderBy: { id: "asc" } }, customer: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ]);

  const seller: CoretaxSeller = {
    npwp: settings?.npwp ?? null,
    nitku: settings?.nitku ?? null,
    isPkp: settings?.isPkp ?? true,
  };

  const inputs: CoretaxInvoiceInput[] = invoices.map((inv) => ({
    invoiceNo: inv.invoiceNo,
    date: inv.date,
    currency: inv.currency || "IDR",
    pebNumber: inv.pebNumber ?? null,
    dpp: inv.dpp != null ? num(inv.dpp) : null,
    taxAmount: num(inv.taxAmount),
    taxRate: inv.taxRate != null ? num(inv.taxRate) : null,
    buyer: {
      name: inv.customer?.name ?? null,
      address: inv.customer?.address ?? null,
      email: inv.customer?.email ?? null,
      npwp: inv.customer?.npwp ?? null,
      nik: inv.customer?.nik ?? null,
      nitku: inv.customer?.nitku ?? null,
      trxCode: inv.customer?.efakturTrxCode ?? null,
    },
    lines: inv.items.map((it) => ({
      name: it.itemName,
      unit: it.unit,
      quantity: num(it.quantity),
      price: num(it.price),
    })),
  }));

  return {
    seller,
    result: buildCoretax(seller, inputs),
    invoiceIds: new Map(invoices.map((i) => [i.invoiceNo, i.id])),
    matched: invoices.length,
  };
}
