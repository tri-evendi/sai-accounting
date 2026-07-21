/**
 * Surat Jalan / Delivery Order — daftar (issue #14).
 *
 * Surat jalan kini dokumen tersimpan (bukan sekadar PDF): setiap baris menyebut
 * dokumen sumber (kontrak/faktur) dan consignee, membawa total kuantitas (kg),
 * dan menautkan ke detail + cetak PDF. Kuantitas rata-kanan & tabular per MASTER.
 */
import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber, formatDateShort } from "@/lib/utils";
import { Truck, Plus, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DeliveryOrdersPage() {
  await requirePageSession(["bos", "core"]);

  const orders = await prisma.deliveryOrder.findMany({
    orderBy: { date: "desc" },
    include: {
      items: true,
      contract: { select: { contractNo: true } },
      invoice: { select: { invoiceNo: true } },
      consignee: { select: { name: true } },
    },
  });

  return (
    <div>
      <Breadcrumb items={[{ label: "Surat Jalan" }]} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Surat Jalan</h1>
          <p className="mt-1 text-sm text-gray-500">
            Dokumen pengiriman barang. Menerbitkan surat jalan mengurangi stok dan
            mengakui HPP atas barang yang keluar.
          </p>
        </div>
        <Link href="/delivery-orders/new">
          <Button className="cursor-pointer">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Buat Surat Jalan
          </Button>
        </Link>
      </div>

      <p className="mb-6 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Stok berkurang dalam <strong>kilogram</strong> (bags × kg/bag) saat surat jalan
          diterbitkan. Penerbitan ditolak bila stok tidak mencukupi.
        </span>
      </p>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-12 w-12" />}
          title="Belum ada surat jalan"
          description="Buat surat jalan untuk mengirim barang dan mengurangi stok."
          actionLabel="Buat Surat Jalan"
          actionHref="/delivery-orders/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">No. Surat Jalan</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Consignee</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Dokumen Sumber</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Bags</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Total (kg)</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const totalBags = o.items.reduce((s, i) => s + i.bags, 0);
                  const totalKg = o.items.reduce((s, i) => s + Number(i.quantity), 0);
                  const source =
                    o.contract?.contractNo || o.invoice?.invoiceNo || "—";
                  return (
                    <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link
                          href={`/delivery-orders/${o.id}`}
                          className="text-blue-700 hover:underline"
                        >
                          {o.no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDateShort(o.date)}</td>
                      <td className="px-4 py-3 text-gray-900">{o.consignee?.name || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{source}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {formatNumber(totalBags)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {formatNumber(totalKg)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={o.status === "canceled" ? "danger" : "success"}>
                          {o.status === "canceled" ? "Dibatalkan" : "Diterbitkan"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
