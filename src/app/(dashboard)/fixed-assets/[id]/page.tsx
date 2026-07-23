/**
 * Satu aset tetap — nilai buku, riwayat penyusutan, pelepasan & pindah lokasi
 * (issue #28).
 */
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getFixedAsset } from "@/lib/fixed-assets";
import { DEPRECIATION_METHOD_LABELS, type DepreciationMethod } from "@/lib/depreciation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { MONTH_NAMES } from "@/lib/period";
import { AssetActions } from "./asset-actions";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v == null ? 0 : Number(v));

export default async function FixedAssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("fixed_asset.read");
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
    ["Kategori", asset.categoryName],
    ["Metode", DEPRECIATION_METHOD_LABELS[asset.depreciationMethod as DepreciationMethod] ?? asset.depreciationMethod],
    ["Umur manfaat", `${asset.usefulLifeMonths} bulan`],
    ["Tanggal perolehan", formatDateShort(asset.acquisitionDate)],
    ["Lokasi", asset.location ?? "—"],
    ["Penyusutan / bulan", formatCurrency(asset.monthlyDepreciation, "IDR")],
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Barang Milik Perusahaan", href: "/fixed-assets" },
          { label: asset.assetNo },
        ]}
        title={asset.name}
        badge={
          asset.status === "disposed" ? (
            <Badge variant="default">Dilepas</Badge>
          ) : asset.isFullyDepreciated ? (
            <Badge variant="warning">Habis susut</Badge>
          ) : (
            <Badge variant="success">Aktif</Badge>
          )
        }
        description={asset.assetNo}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Nilai perolehan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(asset.acquisitionCost, "IDR")}
          </p>
          {asset.residualValue > 0 && (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Residu {formatCurrency(asset.residualValue, "IDR")}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Akumulasi penyusutan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(asset.accumulatedDepreciation, "IDR")}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Nilai buku</p>
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
          <h2 className="mb-3 text-lg font-semibold text-foreground">Pelepasan</h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Tanggal</dt>
              <dd className="text-sm text-foreground">
                {asset.disposalDate ? formatDateShort(asset.disposalDate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Hasil pelepasan</dt>
              <dd className="text-sm text-foreground tabular-nums">
                {formatCurrency(asset.disposalProceeds ?? 0, "IDR")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Laba/Rugi pelepasan</dt>
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
            <h2 className="text-sm font-semibold text-foreground">Riwayat penyusutan</h2>
          </div>
          {depreciations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Belum ada penyusutan yang diposting.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2 font-medium text-muted-foreground">Periode</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Beban</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Akum.</th>
                  </tr>
                </thead>
                <tbody>
                  {depreciations.map((d) => (
                    <tr key={d.id} className="border-b border-border">
                      <td className="px-4 py-2 text-foreground">
                        {MONTH_NAMES[d.month - 1]} {d.year}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {formatCurrency(num(d.amount), "IDR")}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {formatCurrency(num(d.accumulatedAfter), "IDR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Riwayat lokasi</h2>
          </div>
          {moves.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Belum ada perpindahan lokasi.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2 font-medium text-muted-foreground">Tanggal</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Dari</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Ke</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.id} className="border-b border-border">
                      <td className="px-4 py-2 text-foreground">{formatDateShort(m.date)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{m.fromLocation ?? "—"}</td>
                      <td className="px-4 py-2 text-foreground">{m.toLocation ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
