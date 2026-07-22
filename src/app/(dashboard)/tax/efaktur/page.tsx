/**
 * Ekspor e-Faktur (DJP/CTAS) — issue #17.
 *
 * A read-only reporting surface over output-VAT / export invoices: it does NOT
 * touch the ledger (#16 already posts the VAT). A Manager picks a period, reviews
 * the invoices that will be exported (and any held back for a missing required
 * field), sets the seller NPWP if needed, and downloads the CSV.
 *
 * HONESTY: this is a DJP/CTAS-ORIENTED export with the standard faktur-keluaran
 * columns, not a byte-exact DJP import file. Validate against the current DJP
 * schema before production filing (see `@/lib/efaktur`).
 */
import { requirePageSession } from "@/lib/page-auth";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { getEfakturExport } from "@/lib/efaktur-data";
import { SellerIdentityForm } from "./seller-identity-form";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle, Download, Info, FileText, ReceiptText } from "lucide-react";

export const dynamic = "force-dynamic";

/** First and last day of the current month as `YYYY-MM-DD`. */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function EfakturPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePageSession(["bos"]);
  const params = await searchParams;

  const defaults = currentMonthRange();
  const fromStr = params.from || defaults.from;
  const toStr = params.to || defaults.to;
  const from = parseDate(fromStr) ?? new Date(defaults.from);
  const to = parseDate(toStr) ?? new Date(defaults.to);

  const { seller, sellerNpwpMissing, result, matched } = await getEfakturExport(from, to);
  const { rows, problems } = result;

  const downloadHref = `/api/tax/efaktur?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;

  return (
    <div className="max-w-5xl">
      <Breadcrumb items={[{ label: "Pajak" }, { label: "Ekspor e-Faktur" }]} />
      <h1 className="text-2xl font-bold text-gray-900">Ekspor e-Faktur (DJP/CTAS)</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Ekspor faktur keluaran &amp; ekspor (PEB) untuk suatu masa pajak dalam format CSV
        berorientasi DJP/CTAS.
      </p>

      {/* Honesty / disclaimer */}
      <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>
          Format ini <strong>berorientasi</strong> DJP/CTAS dengan kolom standar faktur keluaran,
          bukan salinan persis skema impor DJP terbaru. Validasi terhadap skema DJP yang berlaku
          sebelum pelaporan resmi.
        </span>
      </div>

      {/* Seller tax identity */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Identitas Pajak Penjual</CardTitle>
        </CardHeader>
        <CardContent>
          {sellerNpwpMissing && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                NPWP penjual belum diisi. File e-Faktur tidak dapat dibuat sampai NPWP terisi.
              </span>
            </div>
          )}
          <SellerIdentityForm
            initial={{ npwp: seller.npwp, taxName: seller.name, taxAddress: seller.address }}
          />
        </CardContent>
      </Card>

      {/* Period filter */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Masa Pajak</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="from" className="block text-sm font-medium text-gray-700">
                Dari tanggal
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={fromStr}
                className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="to" className="block text-sm font-medium text-gray-700">
                Sampai tanggal
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={toStr}
                className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <Button type="submit" variant="secondary">
              Terapkan
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Summary + download */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="text-sm text-gray-600">
            <span className="tabular-nums font-medium text-gray-900">{matched}</span> faktur cocok ·{" "}
            <span className="tabular-nums font-medium text-green-700">{rows.length}</span> siap ekspor
            {problems.length > 0 && (
              <>
                {" "}·{" "}
                <span className="tabular-nums font-medium text-amber-700">{problems.length}</span>{" "}
                perlu dilengkapi
              </>
            )}
          </div>
          {sellerNpwpMissing ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-500">
              <Download className="h-4 w-4" aria-hidden="true" />
              Isi NPWP penjual untuk mengunduh
            </span>
          ) : (
            <a href={downloadHref} download>
              <Button disabled={rows.length === 0}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Unduh CSV
              </Button>
            </a>
          )}
        </CardContent>
      </Card>

      {/* Problems — invoices held back for a missing required field */}
      {problems.length > 0 && (
        <Card className="mb-6 border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              Perlu dilengkapi ({problems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-gray-600">
              Faktur berikut tidak diikutkan karena kekurangan field yang wajib untuk e-Faktur —
              dilengkapi dulu, bukan dikosongkan (agar tidak gagal impor DJP).
            </p>
            <ul className="space-y-1 text-sm">
              {problems.map((p) => (
                <li key={p.invoiceNo} className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                  <span className="text-gray-900">{p.invoiceNo}</span>
                  <span className="text-amber-700">— kurang: {p.missing.join(", ")}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Preview of the exportable rows */}
      <Card>
        <CardHeader>
          <CardTitle>Pratinjau Baris Ekspor</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Tanggal</th>
                <th className="px-4 py-3 font-medium text-gray-500">Jenis</th>
                <th className="px-4 py-3 font-medium text-gray-500">No. Dokumen</th>
                <th className="px-4 py-3 font-medium text-gray-500">Pembeli</th>
                <th className="px-4 py-3 font-medium text-gray-500">Mata Uang</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">DPP</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">PPN</th>
                <th className="px-4 py-3 font-medium text-gray-500">No. PEB</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<ReceiptText className="h-12 w-12" />}
                      title="Tidak ada baris siap ekspor pada masa ini"
                      description="Hanya faktur ber-PPN keluaran (atau ekspor) di masa yang dipilih yang muncul di sini. Pilih masa lain, atau buat tagihan penjualannya dulu."
                      actionLabel="+ Buat Tagihan"
                      actionHref="/invoices/new"
                    />
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={`${row.nomor_dokumen}-${i}`} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-500">{formatDateShort(row.tanggal_dokumen)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex rounded px-2 py-0.5 text-xs font-medium " +
                          (row.jenis === "ekspor"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-100 text-gray-700")
                        }
                      >
                        {row.jenis}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{row.nomor_dokumen}</td>
                    <td className="px-4 py-3 text-gray-700">{row.nama_pembeli || "-"}</td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{row.mata_uang}</td>
                    <td className="px-4 py-3 text-right text-gray-900 tabular-nums">
                      {formatCurrency(Number(row.dpp), row.mata_uang)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 tabular-nums">
                      {formatCurrency(Number(row.ppn), row.mata_uang)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{row.nomor_peb || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
