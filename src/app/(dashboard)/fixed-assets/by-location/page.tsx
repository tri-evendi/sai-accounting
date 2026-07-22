/**
 * Aset per lokasi (issue #28) — active assets grouped by location, with cost,
 * accumulated depreciation and book value per location.
 */
import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { getFixedAssets, groupByLocation } from "@/lib/fixed-assets";
import { Card } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AssetsByLocationPage() {
  await requirePageSession(["bos", "core"]);

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
      <Breadcrumb items={[{ label: "Aset Tetap", href: "/fixed-assets" }, { label: "Aset per Lokasi" }]} />
      <h1 className="text-2xl font-bold text-foreground">Aset per Lokasi</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Aset aktif dikelompokkan berdasarkan lokasi. Nilai dalam IDR.
      </p>

      {groups.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-12 w-12" />}
          title="Belum ada aset aktif"
          description="Daftarkan aset dan isi lokasinya untuk melihat rekap per lokasi."
          actionLabel="Aset Baru"
          actionHref="/fixed-assets/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Lokasi</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Jumlah Aset</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Nilai Perolehan</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Akum. Penyusutan</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Nilai Buku</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.location ?? "__none__"} className="border-b border-border">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {g.location ?? <span className="text-muted-foreground">Tanpa lokasi</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{g.count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {formatCurrency(g.cost, "IDR")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {formatCurrency(g.accumulated, "IDR")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {formatCurrency(g.book, "IDR")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-4 py-3 text-foreground">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{totals.count}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(totals.cost, "IDR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(totals.accumulated, "IDR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(totals.book, "IDR")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/fixed-assets" className="text-primary hover:underline">
          ← Kembali ke daftar aset
        </Link>
      </p>
    </div>
  );
}
