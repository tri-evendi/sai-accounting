/**
 * Surat Jalan / Delivery Order — daftar (issue #14).
 *
 * Surat jalan kini dokumen tersimpan (bukan sekadar PDF): setiap baris menyebut
 * dokumen sumber (kontrak/faktur) dan consignee, membawa total kuantitas (kg),
 * dan menautkan ke detail + cetak PDF. Kuantitas rata-kanan & tabular per MASTER.
 */
import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber, formatDateShort } from "@/lib/utils";
import { Truck, Plus, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DeliveryOrdersPage() {
  await requirePagePermission("delivery_order.read");

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
      <PageHeader
        title="Surat Jalan"
        description={
          <>
            Dokumen pengiriman barang. Menerbitkan surat jalan mengurangi stok dan
            mengakui HPP atas barang yang keluar.
          </>
        }
        actions={
          <Link href="/delivery-orders/new">
            <Button className="cursor-pointer">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Buat Surat Jalan
            </Button>
          </Link>
        }
      />

      <p className="mb-6 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
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
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>No. Surat Jalan</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Consignee</TableHead>
                <TableHead>Dokumen Sumber</TableHead>
                <TableHead className="text-right">Bags</TableHead>
                <TableHead className="text-right">Total (kg)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const totalBags = o.items.reduce((s, i) => s + i.bags, 0);
                const totalKg = o.items.reduce((s, i) => s + Number(i.quantity), 0);
                const source =
                  o.contract?.contractNo || o.invoice?.invoiceNo || "—";
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium text-foreground">
                      <Link
                        href={`/delivery-orders/${o.id}`}
                        className="text-primary hover:underline"
                      >
                        {o.no}
                      </Link>
                    </TableCell>
                    <TableCell className="text-foreground">{formatDateShort(o.date)}</TableCell>
                    <TableCell className="text-foreground">{o.consignee?.name || "—"}</TableCell>
                    <TableCell className="text-foreground">{source}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatNumber(totalBags)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatNumber(totalKg)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.status === "canceled" ? "danger" : "success"}>
                        {o.status === "canceled" ? "Dibatalkan" : "Diterbitkan"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
