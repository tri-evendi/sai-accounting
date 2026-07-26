/**
 * Retur penjualan & pembelian (issue #27).
 *
 * A return reverses part of an invoice or purchase: it reduces piutang/utang,
 * penjualan/persediaan and PPN, and moves stock back. Each row links to its
 * origin document and carries a nota-retur PDF. Values are shown in the return's
 * own currency (inherited from the origin), right-aligned and tabular, per MASTER.
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
import { Money, MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { Undo2, Plus, Info } from "lucide-react";
import { ReturnPdfButton } from "./pdf-button";

export const dynamic = "force-dynamic";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePagePermission("return.read");
  const t = await getT();
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
        title={t("returns.title")}
        description={t("returns.description")}
        actions={
          <Link href={`/returns/new?type=${tab}`}>
            <Button className="cursor-pointer">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("returns.addNew")}
            </Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          {
            label: t("returns.tabSales", { count: salesReturns.length }),
            href: "/returns?tab=sales",
            active: tab === "sales",
          },
          {
            label: t("returns.tabPurchase", { count: purchaseReturns.length }),
            href: "/returns?tab=purchase",
            active: tab === "purchase",
          },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className={`rounded-md border px-3 py-2 text-sm transition-colors duration-200 cursor-pointer ${
              f.active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <p className="mb-6 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {t("returns.noteA")} <strong>{t("returns.noteStrong")}</strong> {t("returns.noteB")}
        </span>
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Undo2 className="h-12 w-12" />}
          title={tab === "sales" ? t("returns.emptySales") : t("returns.emptyPurchase")}
          description={t("returns.emptyDescription")}
          actionLabel={t("returns.addNew")}
          actionHref={`/returns/new?type=${tab}`}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("returns.colNo")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>
                  {tab === "sales" ? t("returns.colOriginSales") : t("returns.colOriginPurchase")}
                </TableHead>
                <TableHead className="text-right">{t("returns.colDpp")}</TableHead>
                <TableHead className="text-right">{t("common.vat")}</TableHead>
                <TableHead className="text-right">{t("common.total")}</TableHead>
                <TableHead className="text-right">{t("returns.colTotalIdr")}</TableHead>
                <TableHead className="text-right">{t("returns.colNota")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                    <TableRow key={`${tab}-${r.id}`}>
                      <TableCell className="font-medium text-foreground">{r.returnNo}</TableCell>
                      <TableCell className="text-foreground">{formatDateShort(r.date)}</TableCell>
                      <TableCell className="text-foreground">
                        {originLabel}
                        {partyName && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{partyName}</span>
                        )}
                      </TableCell>
                      <TableCell className="p-0">
                        <MoneyCell className="text-foreground" value={subtotal} currency={currency} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {tax > 0 ? (
                          <Money value={tax} currency={currency} />
                        ) : (
                          <Badge variant="default">0%</Badge>
                        )}
                      </TableCell>
                      <TableCell className="p-0">
                        <MoneyCell
                          className="font-medium text-foreground"
                          value={subtotal + tax}
                          currency={currency}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {r.baseAmount != null ? (
                          <Money value={Number(r.baseAmount)} currency="IDR" />
                        ) : (
                          <span className="text-xs text-warning-strong">{t("common.rateMissing")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
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
