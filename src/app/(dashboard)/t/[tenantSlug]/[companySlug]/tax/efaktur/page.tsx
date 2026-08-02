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
import { canOpenPage, requirePagePermission } from "@/lib/page-auth";
import { tenantApiPath, type TenantScopedParams } from "@/lib/tenant-routes";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { formatDateShort } from "@/lib/utils";
import { toISODate } from "@/lib/dashboard-summary";
import { getEfakturExport } from "@/lib/efaktur-data";
import { SellerIdentityForm } from "./seller-identity-form";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle, Download, Info, FileText, ReceiptText } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * First and last day of the current month as `YYYY-MM-DD`, in LOCAL time —
 * the same convention as every other report (`resolvePeriod`). UTC month
 * bounds land on the previous month during the first hours of the 1st under
 * TZ=Asia/Jakarta, so the default period would disagree with the rest of the
 * app.
 */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function EfakturPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requirePagePermission("tax.read", params);
  // issue #103 — "Buat tagihan pertama" menunjuk ke /invoices/new, milik modul
  // `sales`. Pajak (`tax_id`) dan penjualan dua sakelar terpisah: perusahaan
  // yang mematikan salah satunya tidak boleh diajak ke halaman yang memantul.
  const canCreateInvoice = await canOpenPage(session.user, "invoice.write");
  const t = await getT();
  const filters = await searchParams;

  const defaults = currentMonthRange();
  const fromStr = filters.from || defaults.from;
  const toStr = filters.to || defaults.to;
  const from = parseDate(fromStr) ?? new Date(defaults.from);
  const to = parseDate(toStr) ?? new Date(defaults.to);

  const { seller, sellerNpwpMissing, result, matched } = await getEfakturExport(from, to);
  const { rows, problems } = result;

  /*
   * Alamat unduhan menyebut perusahaannya di JALUR (issue #158): berkasnya
   * diambil lewat `<a href>` biasa, yang tidak melewati `apiFetch()` dan
   * karenanya tidak bisa membawa header lingkup. Slugnya datang dari `params`
   * halaman ini — alamat yang sedang dibuka, bukan sesi.
   */
  const { tenantSlug, companySlug } = await params;
  const downloadHref = `${tenantApiPath(tenantSlug, companySlug, "/tax/efaktur")}?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;

  return (
    <div className="w-full">
      <PageHeader
        title={t("tax.title")}
        description={t("tax.description")}
      />

      {/* Honesty / disclaimer */}
      <div className="mb-6 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-strong">
        <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>
          {t("tax.disclaimerBefore")} <strong>{t("tax.disclaimerStrong")}</strong>{" "}
          {t("tax.disclaimerAfter")}
        </span>
      </div>

      {/* Seller tax identity */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("tax.sellerTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {sellerNpwpMissing && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-strong">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {t("tax.npwpMissing")}
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
          <CardTitle>{t("tax.periodTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="from" className="block text-sm font-medium text-foreground">
                {t("tax.fromDate")}
              </label>
              <TextInput
                id="from"
                name="from"
                type="date"
                defaultValue={fromStr}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="to" className="block text-sm font-medium text-foreground">
                {t("tax.toDate")}
              </label>
              <TextInput
                id="to"
                name="to"
                type="date"
                defaultValue={toStr}
                className="mt-1"
              />
            </div>
            <Button type="submit" variant="secondary">
              {t("tax.apply")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Summary + download */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="text-sm text-muted-foreground">
            <span className="tabular-nums font-medium text-foreground">{matched}</span>{" "}
            {t("tax.summaryMatched")} ·{" "}
            <span className="tabular-nums font-medium text-success-strong">{rows.length}</span>{" "}
            {t("tax.summaryReady")}
            {problems.length > 0 && (
              <>
                {" "}·{" "}
                <span className="tabular-nums font-medium text-warning-strong">{problems.length}</span>{" "}
                {t("tax.summaryNeedsWork")}
              </>
            )}
          </div>
          {sellerNpwpMissing ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("tax.npwpNeededToDownload")}
            </span>
          ) : (
            <a href={downloadHref} download>
              <Button disabled={rows.length === 0}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("tax.downloadCsv")}
              </Button>
            </a>
          )}
        </CardContent>
      </Card>

      {/* Problems — invoices held back for a missing required field */}
      {problems.length > 0 && (
        <Card className="mb-6 border-warning/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning-strong">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              {t("tax.problemsTitle", { count: problems.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              {t("tax.problemsDescription")}
            </p>
            <ul className="space-y-1 text-sm">
              {problems.map((p) => (
                <li key={p.invoiceNo} className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-foreground">{p.invoiceNo}</span>
                  <span className="text-warning-strong">
                    {t("tax.missingFields", { fields: p.missing.join(", ") })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Preview of the exportable rows */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tax.previewTitle")}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("tax.colKind")}</TableHead>
              <TableHead>{t("tax.colDocNo")}</TableHead>
              <TableHead>{t("tax.colBuyer")}</TableHead>
              <TableHead>{t("common.currency")}</TableHead>
              <TableHead className="text-right">{t("tax.colDpp")}</TableHead>
              <TableHead className="text-right">{t("common.vat")}</TableHead>
              <TableHead>{t("tax.colPebNo")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="p-0">
                  <EmptyState
                    icon={<ReceiptText className="h-12 w-12" />}
                    title={t("tax.emptyTitle")}
                    description={t("tax.emptyDescription")}
                    actionLabel={canCreateInvoice ? t("tax.emptyAction") : undefined}
                    actionHref={canCreateInvoice ? "/invoices/new" : undefined}
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow key={`${row.nomor_dokumen}-${i}`}>
                  <TableCell className="text-muted-foreground">{formatDateShort(row.tanggal_dokumen)}</TableCell>
                  <TableCell>
                    <span
                      className={
                        "inline-flex rounded px-2 py-0.5 text-xs font-medium " +
                        (row.jenis === "ekspor"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-foreground")
                      }
                    >
                      {row.jenis}
                    </span>
                  </TableCell>
                  <TableCell className="text-foreground">{row.nomor_dokumen}</TableCell>
                  <TableCell className="text-foreground">{row.nama_pembeli || "-"}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{row.mata_uang}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="text-foreground"
                      value={Number(row.dpp)}
                      currency={row.mata_uang}
                    />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="text-foreground"
                      value={Number(row.ppn)}
                      currency={row.mata_uang}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{row.nomor_peb || "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
