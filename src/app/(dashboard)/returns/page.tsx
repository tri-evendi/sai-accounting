/**
 * Retur penjualan & pembelian (issue #27).
 *
 * A return reverses part of an invoice or purchase: it reduces piutang/utang,
 * penjualan/persediaan and PPN, and moves stock back. Each row links to its
 * origin document and carries a nota-retur PDF. Values are shown in the return's
 * own currency (inherited from the origin), right-aligned and tabular, per MASTER.
 */
import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Undo2, Plus, Info } from "lucide-react";
import { ReturnPdfButton } from "./pdf-button";

export const dynamic = "force-dynamic";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const sp = await searchParams;
  const tab = sp.tab === "purchase" ? "purchase" : "sales";

  const [salesReturns, purchaseReturns] = await Promise.all([
    prisma.salesReturn.findMany({
      orderBy: { date: "desc" },
      include: {
        items: true,
        invoice: { select: { invoiceNo: true } },
        customer: { select: { name: true } },
      },
    }),
    prisma.purchaseReturn.findMany({
      orderBy: { date: "desc" },
      include: { items: true, supplier: { select: { name: true } } },
    }),
  ]);

  const rows = tab === "sales" ? salesReturns : purchaseReturns;

  return (
    <div>
      <PageHeader
        title="Retur"
        description={
          <>
            Barang yang dikembalikan — membalik sebagian faktur/pembelian beserta stok,
            piutang/utang, dan PPN-nya.
          </>
        }
        actions={
          <Link href={`/returns/new?type=${tab}`}>
            <Button className="cursor-pointer">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Buat Retur
            </Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { label: `Retur Penjualan (${salesReturns.length})`, href: "/returns?tab=sales", active: tab === "sales" },
          { label: `Retur Pembelian (${purchaseReturns.length})`, href: "/returns?tab=purchase", active: tab === "purchase" },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className={`rounded-md border px-3 py-2 text-sm transition-colors duration-200 cursor-pointer ${
              f.active
                ? "border-primary bg-primary text-white"
                : "border-border bg-white text-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <p className="mb-6 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Retur dinilai dengan <strong>kurs dokumen asal</strong> dan tidak boleh melebihi
          jumlah/nilai yang tersisa. Retur penjualan mengembalikan stok masuk; retur
          pembelian mengeluarkan stok.
        </span>
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Undo2 className="h-12 w-12" />}
          title={tab === "sales" ? "Belum ada retur penjualan" : "Belum ada retur pembelian"}
          description="Catat barang yang dikembalikan dari faktur atau pembelian di sini."
          actionLabel="Buat Retur"
          actionHref={`/returns/new?type=${tab}`}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">No. Retur</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Tanggal</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    {tab === "sales" ? "Faktur / Pelanggan" : "Pembelian / Supplier"}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">DPP</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">PPN</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total (IDR)</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Nota</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const currency = r.currency;
                  const subtotal = Number(r.subtotal);
                  const tax = Number(r.taxAmount);
                  const isSales = "invoice" in r;
                  const originLabel = isSales
                    ? (r as typeof salesReturns[number]).invoice.invoiceNo
                    : `TRX-${(r as typeof purchaseReturns[number]).purchaseId}`;
                  const partyName = isSales
                    ? (r as typeof salesReturns[number]).customer?.name
                    : (r as typeof purchaseReturns[number]).supplier?.name;
                  return (
                    <tr key={`${tab}-${r.id}`} className="border-b border-border">
                      <td className="px-4 py-3 font-medium text-foreground">{r.returnNo}</td>
                      <td className="px-4 py-3 text-foreground">{formatDateShort(r.date)}</td>
                      <td className="px-4 py-3 text-foreground">
                        {originLabel}
                        {partyName && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{partyName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {formatCurrency(subtotal, currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {tax > 0 ? (
                          formatCurrency(tax, currency)
                        ) : (
                          <Badge variant="default">0%</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                        {formatCurrency(subtotal + tax, currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {r.baseAmount != null ? (
                          formatCurrency(Number(r.baseAmount), "IDR")
                        ) : (
                          <span className="text-xs text-warning-strong">Kurs belum diisi</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ReturnPdfButton
                          data={{
                            kind: isSales ? "sales" : "purchase",
                            returnNo: r.returnNo,
                            date: r.date.toISOString(),
                            originLabel,
                            partyName,
                            currency,
                            taxAmount: tax,
                            taxRate: r.taxRate == null ? null : Number(r.taxRate),
                            reason: r.reason,
                            items: r.items.map((it) => ({
                              itemName: it.itemName,
                              quantity: Number(it.quantity),
                              price: Number(it.price),
                            })),
                          }}
                        />
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
