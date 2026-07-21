/**
 * Satu aset tetap — nilai buku, riwayat penyusutan, pelepasan & pindah lokasi
 * (issue #28).
 */
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getFixedAsset } from "@/lib/fixed-assets";
import { DEPRECIATION_METHOD_LABELS, type DepreciationMethod } from "@/lib/depreciation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
  await requirePageSession(["bos", "core"]);
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
      <Breadcrumb items={[{ label: "Aset Tetap", href: "/fixed-assets" }, { label: asset.assetNo }]} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{asset.name}</h1>
            {asset.status === "disposed" ? (
              <Badge variant="default">Dilepas</Badge>
            ) : asset.isFullyDepreciated ? (
              <Badge variant="warning">Habis susut</Badge>
            ) : (
              <Badge variant="success">Aktif</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{asset.assetNo}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Nilai perolehan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {formatCurrency(asset.acquisitionCost, "IDR")}
          </p>
          {asset.residualValue > 0 && (
            <p className="mt-1 text-xs text-gray-500 tabular-nums">
              Residu {formatCurrency(asset.residualValue, "IDR")}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Akumulasi penyusutan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {formatCurrency(asset.accumulatedDepreciation, "IDR")}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Nilai buku</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {formatCurrency(asset.bookValue, "IDR")}
          </p>
        </Card>
      </div>

      <Card className="mb-6 p-6">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-gray-500">{k}</dt>
              <dd className="text-sm text-gray-900 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {asset.status === "disposed" ? (
        <Card className="mb-6 p-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Pelepasan</h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500">Tanggal</dt>
              <dd className="text-sm text-gray-900">
                {asset.disposalDate ? formatDateShort(asset.disposalDate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Hasil pelepasan</dt>
              <dd className="text-sm text-gray-900 tabular-nums">
                {formatCurrency(asset.disposalProceeds ?? 0, "IDR")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Laba/Rugi pelepasan</dt>
              <dd className="text-sm tabular-nums">
                {asset.disposalGainLoss == null ? (
                  "—"
                ) : asset.disposalGainLoss >= 0 ? (
                  <span className="text-green-700">{formatCurrency(asset.disposalGainLoss, "IDR")}</span>
                ) : (
                  <span className="text-red-700">
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
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Riwayat penyusutan</h2>
          </div>
          {depreciations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">Belum ada penyusutan yang diposting.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-4 py-2 font-medium text-gray-500">Periode</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Beban</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Akum.</th>
                  </tr>
                </thead>
                <tbody>
                  {depreciations.map((d) => (
                    <tr key={d.id} className="border-b border-gray-100">
                      <td className="px-4 py-2 text-gray-900">
                        {MONTH_NAMES[d.month - 1]} {d.year}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-900">
                        {formatCurrency(num(d.amount), "IDR")}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">
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
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Riwayat lokasi</h2>
          </div>
          {moves.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">Belum ada perpindahan lokasi.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-4 py-2 font-medium text-gray-500">Tanggal</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Dari</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Ke</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100">
                      <td className="px-4 py-2 text-gray-700">{formatDateShort(m.date)}</td>
                      <td className="px-4 py-2 text-gray-500">{m.fromLocation ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-900">{m.toLocation ?? "—"}</td>
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
