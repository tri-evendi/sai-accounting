/**
 * Aset per lokasi (issue #28) — active assets grouped by location, with cost,
 * accumulated depreciation and book value per location.
 */
import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { getFixedAssets, groupByLocation } from "@/lib/fixed-assets";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { MapPin } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AssetsByLocationPage() {
  await requirePagePermission("fixed_asset.read");
  const t = await getT();

  const rows = await getFixedAssets({ status: "active" });
  const groups = groupByLocation(rows);
  const totals = groups.reduce(
    (t, g) => ({
      count: t.count + g.count,
      cost: t.cost + g.cost,
      accumulated: t.accumulated + g.accumulated,
      book: t.book + g.book,
    }),
    { count: 0, cost: 0, accumulated: 0, book: 0 }
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.fixedAssets"), href: "/fixed-assets" },
          { label: t("fixedAssets.byLocation") },
        ]}
        title={t("fixedAssets.byLocation")}
        description={t("fixedAssets.byLocationDescription")}
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-12 w-12" />}
          title={t("fixedAssets.emptyActiveTitle")}
          description={t("fixedAssets.emptyActiveDescription")}
          actionLabel={t("fixedAssets.addNew")}
          actionHref="/fixed-assets/new"
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("fixedAssets.colLocation")}</TableHead>
                <TableHead className="text-right">{t("fixedAssets.colAssetCount")}</TableHead>
                <TableHead className="text-right">{t("fixedAssets.colCost")}</TableHead>
                <TableHead className="text-right">{t("fixedAssets.colAccumulated")}</TableHead>
                <TableHead className="text-right">{t("fixedAssets.colBookValue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.location ?? "__none__"}>
                  <TableCell className="font-medium text-foreground">
                    {g.location ?? <span className="text-muted-foreground">{t("fixedAssets.noLocation")}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">{g.count}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={g.cost} currency="IDR" />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={g.accumulated} currency="IDR" />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={g.book} currency="IDR" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="border-t-2 bg-transparent">
              <TableRow className="font-semibold hover:bg-transparent">
                <TableCell className="text-foreground">{t("common.total")}</TableCell>
                <TableCell className="text-right tabular-nums text-foreground">{totals.count}</TableCell>
                <TableCell className="p-0">
                  <MoneyCell value={totals.cost} currency="IDR" />
                </TableCell>
                <TableCell className="p-0">
                  <MoneyCell value={totals.accumulated} currency="IDR" />
                </TableCell>
                <TableCell className="p-0">
                  <MoneyCell value={totals.book} currency="IDR" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/fixed-assets" className="text-primary hover:underline">
          {t("fixedAssets.backToList")}
        </Link>
      </p>
    </div>
  );
}
