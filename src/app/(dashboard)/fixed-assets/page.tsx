/**
 * Aset Tetap — register + depreciation run (issue #28).
 *
 * The register lists every asset with its running book value (nilai buku), the
 * number the Neraca reflects. Depreciation is posted monthly through the run
 * control (D: Beban Penyusutan / K: Akumulasi Penyusutan); disposal and location
 * moves live on each asset's detail page.
 */
import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { getFixedAssets, summarizeFixedAssets, getCategories } from "@/lib/fixed-assets";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Boxes, Info, MapPin, Plus, Tags } from "lucide-react";
import { RunDepreciation } from "./run-depreciation";

export const dynamic = "force-dynamic";

export default async function FixedAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const sp = await searchParams;
  const status = sp.status === "active" || sp.status === "disposed" ? sp.status : undefined;

  const [rows, categories] = await Promise.all([getFixedAssets({ status }), getCategories()]);
  const summary = summarizeFixedAssets(await getFixedAssets({}));
  const hasCategories = categories.length > 0;

  return (
    <div>
      <Breadcrumb items={[{ label: "Aset Tetap" }]} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aset Tetap</h1>
          <p className="mt-1 text-sm text-gray-500">
            Kendaraan, alat, dan bangunan beserta penyusutannya. Nilai buku &amp; beban
            penyusutan tercermin otomatis di Neraca dan Laba Rugi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/fixed-assets/by-location">
            <Button variant="secondary" className="cursor-pointer">
              <MapPin className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Aset per Lokasi
            </Button>
          </Link>
          <Link href="/fixed-assets/categories">
            <Button variant="secondary" className="cursor-pointer">
              <Tags className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Kategori
            </Button>
          </Link>
          <Link href="/fixed-assets/new">
            <Button className="cursor-pointer">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Aset Baru
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Aset aktif</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{summary.activeCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Nilai perolehan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {formatCurrency(summary.cost, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Akumulasi penyusutan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {formatCurrency(summary.accumulated, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Nilai buku</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {formatCurrency(summary.book, "IDR")}
          </p>
        </Card>
      </div>

      {hasCategories && <RunDepreciation />}

      <div className="my-6 flex flex-wrap gap-2">
        {[
          { label: "Semua", href: "/fixed-assets", active: !status },
          { label: "Aktif", href: "/fixed-assets?status=active", active: status === "active" },
          { label: "Dilepas", href: "/fixed-assets?status=disposed", active: status === "disposed" },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className={`rounded-md border px-3 py-2 text-sm transition-colors duration-200 cursor-pointer ${
              f.active
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {!hasCategories ? (
        <EmptyState
          icon={<Tags className="h-12 w-12" />}
          title="Buat kategori aset dulu"
          description="Kategori menentukan metode, umur manfaat, dan akun aset/akumulasi/beban penyusutan yang dipakai aset di dalamnya."
          actionLabel="Buat Kategori"
          actionHref="/fixed-assets/categories"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-12 w-12" />}
          title="Belum ada aset"
          description="Daftarkan kendaraan, alat, atau bangunan agar penyusutannya dihitung otomatis."
          actionLabel="Aset Baru"
          actionHref="/fixed-assets/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Nomor</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Nama</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Kategori</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Lokasi</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Perolehan</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Nilai Perolehan</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Akum. Penyusutan</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Nilai Buku</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link
                        href={`/fixed-assets/${r.id}`}
                        className="cursor-pointer text-blue-700 transition-colors hover:underline"
                      >
                        {r.assetNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{r.name}</td>
                    <td className="px-4 py-3 text-gray-700">{r.categoryName}</td>
                    <td className="px-4 py-3 text-gray-500">{r.location ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDateShort(r.acquisitionDate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {formatCurrency(r.acquisitionCost, "IDR")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {formatCurrency(r.accumulatedDepreciation, "IDR")}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                      {formatCurrency(r.bookValue, "IDR")}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "disposed" ? (
                        <Badge variant="default">Dilepas</Badge>
                      ) : r.isFullyDepreciated ? (
                        <Badge variant="warning">Habis susut</Badge>
                      ) : (
                        <Badge variant="success">Aktif</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-6 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Penyusutan garis lurus dijalankan per bulan dan diposting sebagai{" "}
          <strong>D: Beban Penyusutan / K: Akumulasi Penyusutan</strong>. Menjalankan ulang
          bulan yang sudah diposting tidak menggandakan jurnal.
        </span>
      </p>
    </div>
  );
}
