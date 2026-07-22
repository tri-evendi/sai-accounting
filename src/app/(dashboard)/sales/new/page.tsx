import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { listClosedPeriods } from "@/lib/period";
import { calculateStockTotals } from "@/lib/inventory";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { LearnMore } from "@/components/ui/learn-more";
import { SalesWizard } from "./sales-wizard";

export const dynamic = "force-dynamic";

/**
 * Wizard "Penjualan Baru" — server shell (issue #5).
 *
 * Sama seperti `/invoices/new` dan `/delivery-orders/new`: halaman ini hanya
 * MEMBACA daftar yang dibutuhkan wizard, dan seluruh interaksinya milik komponen
 * klien. Tidak ada satu pun tulisan ke database yang berasal dari halaman ini —
 * itu baru terjadi pada satu panggilan `POST /api/wizard/sales` di langkah
 * terakhir.
 */
export default async function NewSaleWizardPage() {
  await requirePageSession(["bos", "core"]);

  const [customers, contracts, consignees, items, closedPeriods] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, taxExempt: true },
    }),
    prisma.contract.findMany({
      where: { status: { not: "canceled" } },
      orderBy: { date: "desc" },
      take: 300,
      select: { id: true, contractNo: true, buyer: true, currency: true },
    }),
    prisma.consignee.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take: 300,
      select: { id: true, name: true, country: true },
    }),
    prisma.item.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        unit: true,
        stock: { select: { quantity: true, type: true, date: true } },
      },
    }),
    listClosedPeriods(),
  ]);

  return (
    <div className="max-w-4xl">
      <Breadcrumb
        items={[{ label: "Tagihan Penjualan", href: "/invoices" }, { label: "Penjualan Baru" }]}
      />
      <h1 className="text-2xl font-bold text-gray-900">Penjualan Baru</h1>
      <p className="mt-1 text-sm text-gray-500">
        Dipandu langkah demi langkah: pelanggan, barang, pengiriman, lalu tagihan. Anda bisa
        mundur-maju sesuka hati — <strong>tidak ada yang tersimpan</strong> sampai tombol
        &ldquo;Selesai &amp; Simpan&rdquo; di langkah terakhir ditekan.
      </p>
      <LearnMore
        term="faktur"
        className="mt-1 mb-6"
        label="Pelajari ini: apa itu tagihan penjualan"
      />

      <SalesWizard
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          taxExempt: Boolean(c.taxExempt),
        }))}
        contracts={contracts.map((c) => ({
          id: c.id,
          contractNo: c.contractNo,
          buyer: c.buyer,
          currency: c.currency || "IDR",
        }))}
        consignees={consignees}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentStock: calculateStockTotals(i.stock).currentStock,
        }))}
        closedPeriods={closedPeriods}
      />
    </div>
  );
}
