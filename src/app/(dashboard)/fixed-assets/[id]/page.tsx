/**
 * Satu aset tetap — nilai buku, riwayat penyusutan, pelepasan & pindah lokasi
 * (issue #28).
 */
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getFixedAsset } from "@/lib/fixed-assets";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { monthNames } from "@/lib/i18n/labels";
import { AssetActions } from "./asset-actions";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v == null ? 0 : Number(v));

export default async function FixedAssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("fixed_asset.read");
  const t = await getT();
  const months = monthNames(await getDictionary(await getLocale()));
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const asset = await getFixedAsset(id);
  if (!asset) notFound();

  const [depreciations, moves] = await Promise.all([
    prisma.fixedAssetDepreciation.findMany({
      where: { assetId: id },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    prisma.fixedAssetLocationHistory.findMany({
      where: { assetId: id },
      orderBy: { date: "desc" },
    }),
  ]);

  const pct =
    asset.depreciableBase > 0
      ? Math.min(100, Math.round((asset.accumulatedDepreciation / asset.depreciableBase) * 100))
      : 0;

  const info: [string, string][] = [
    [t("fixedAssets.colCategory"), asset.categoryName],
    [
      t("fixedAssets.infoMethod"),
      asset.depreciationMethod === "straight_line"
        ? t("depreciationMethod.straight_line")
        : asset.depreciationMethod,
    ],
    [t("fixedAssets.infoUsefulLife"), t("fixedAssets.infoMonths", { count: asset.usefulLifeMonths })],
    [t("fixedAssets.acquisitionDateField"), formatDateShort(asset.acquisitionDate)],
    [t("fixedAssets.colLocation"), asset.location ?? "—"],
    [t("fixedAssets.infoMonthlyDepreciation"), formatCurrency(asset.monthlyDepreciation, "IDR")],
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.fixedAssets"), href: "/fixed-assets" },
          { label: asset.assetNo },
        ]}
        title={asset.name}
        badge={
          asset.status === "disposed" ? (
            <Badge variant="default">{t("fixedAssets.statusDisposed")}</Badge>
          ) : asset.isFullyDepreciated ? (
            <Badge variant="warning">{t("fixedAssets.statusFullyDepreciated")}</Badge>
          ) : (
            <Badge variant="success">{t("common.active")}</Badge>
          )
        }
        description={asset.assetNo}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t("fixedAssets.cost")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(asset.acquisitionCost, "IDR")}
          </p>
          {asset.residualValue > 0 && (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {t("fixedAssets.residualLine", { amount: formatCurrency(asset.residualValue, "IDR") })}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t("fixedAssets.accumulated")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(asset.accumulatedDepreciation, "IDR")}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t("fixedAssets.bookValue")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(asset.bookValue, "IDR")}
          </p>
        </Card>
      </div>

      <Card className="mb-6 p-6">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-sm text-foreground tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {asset.status === "disposed" ? (
        <Card className="mb-6 p-6">
          <h2 className="mb-3 text-lg font-semibold text-foreground">{t("fixedAssets.disposalTitle")}</h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t("common.date")}</dt>
              <dd className="text-sm text-foreground">
                {asset.disposalDate ? formatDateShort(asset.disposalDate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("fixedAssets.disposalProceeds")}</dt>
              <dd className="text-sm text-foreground tabular-nums">
                {formatCurrency(asset.disposalProceeds ?? 0, "IDR")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("fixedAssets.disposalGainLoss")}</dt>
              <dd className="text-sm tabular-nums">
                {asset.disposalGainLoss == null ? (
                  "—"
                ) : asset.disposalGainLoss >= 0 ? (
                  <span className="text-success-strong">{formatCurrency(asset.disposalGainLoss, "IDR")}</span>
                ) : (
                  <span className="text-destructive-strong">
                    ({formatCurrency(Math.abs(asset.disposalGainLoss), "IDR")})
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </Card>
      ) : (
        <div className="mb-6">
          <AssetActions assetId={asset.id} bookValue={asset.bookValue} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">{t("fixedAssets.depreciationHistory")}</h2>
          </div>
          {depreciations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("fixedAssets.noDepreciation")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("fixedAssets.colPeriod")}</TableHead>
                  <TableHead className="text-right">{t("fixedAssets.colExpense")}</TableHead>
                  <TableHead className="text-right">{t("fixedAssets.colAccumShort")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depreciations.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-foreground">
                      {t("common.monthOfYear", { month: months[d.month - 1], year: d.year })}
                    </TableCell>
                    <TableCell className="p-0">
                      <MoneyCell value={num(d.amount)} currency="IDR" />
                    </TableCell>
                    <TableCell className="p-0">
                      <MoneyCell value={num(d.accumulatedAfter)} currency="IDR" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">{t("fixedAssets.locationHistory")}</h2>
          </div>
          {moves.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("fixedAssets.noMoves")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("fixedAssets.colFrom")}</TableHead>
                  <TableHead>{t("fixedAssets.colTo")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moves.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-foreground">{formatDateShort(m.date)}</TableCell>
                    <TableCell className="text-muted-foreground">{m.fromLocation ?? "—"}</TableCell>
                    <TableCell className="text-foreground">{m.toLocation ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
