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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import { textColumn, type SaiColumns } from "@/components/ui/table-columns";
import type { EfakturRow } from "@/lib/efaktur";
import { formatDateShort } from "@/lib/utils";
import { toISODate } from "@/lib/dashboard-summary";
import { getEfakturExport } from "@/lib/efaktur-data";
import { SellerIdentityForm } from "./seller-identity-form";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadOutlined, FileDoneOutlined, FileTextOutlined, InfoCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Dikonversi ke `StaticTable` + token AntD pada issue #198. **Tetap server
 * component**; satu-satunya pulau client di halaman ini adalah formulir
 * identitas penjual, seperti sebelumnya.
 *
 * Nominalnya lewat `moneyColumn` dengan mata uang PER BARIS (`mata_uang`):
 * pratinjau e-Faktur memuat faktur lokal dan ekspor pada tabel yang sama, dan
 * mencetak "Rp" di atas nilai USD adalah kesalahan yang tak terlihat sampai
 * berkasnya disetorkan.
 */

/** `marginLG` 24 · `margin` 16 — token AntD sebagai angka (berkas ini server). */
const SECTION_GAP = 24;
const EMPTY_ICON_SIZE = 48;
const ICON_SIZE = 16;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

const MUTED: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };
const NUMERIC_MUTED: React.CSSProperties = {
  ...MUTED,
  fontVariantNumeric: "tabular-nums",
};

/** Kepala kartu: judul di atas garis pemisah — pengganti `CardHeader`/`CardTitle`. */
function CardTitleBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "var(--ant-padding-lg)",
        borderBottom: "1px solid var(--ant-color-border-secondary)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "var(--ant-font-size-lg)", fontWeight: STRONG }}>
        {children}
      </h2>
    </div>
  );
}

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

  const columns: SaiColumns<EfakturRow> = [
    {
      ...textColumn<EfakturRow>({ dataIndex: "tanggal_dokumen", title: t("common.date") }),
      render: (raw) => <span style={MUTED}>{formatDateShort(String(raw))}</span>,
    },
    {
      ...textColumn<EfakturRow>({ dataIndex: "jenis", title: t("tax.colKind") }),
      render: (raw) => (
        <Badge variant={raw === "ekspor" ? "default" : "outline"}>{String(raw)}</Badge>
      ),
    },
    textColumn<EfakturRow>({ dataIndex: "nomor_dokumen", title: t("tax.colDocNo") }),
    {
      ...textColumn<EfakturRow>({ dataIndex: "nama_pembeli", title: t("tax.colBuyer") }),
      render: (raw) => (raw ? String(raw) : "-"),
    },
    {
      ...textColumn<EfakturRow>({ dataIndex: "mata_uang", title: t("common.currency") }),
      render: (raw) => <span style={NUMERIC_MUTED}>{String(raw)}</span>,
    },
    moneyColumn<EfakturRow>({
      dataIndex: "dpp",
      title: t("tax.colDpp"),
      currency: (row) => row.mata_uang,
    }),
    moneyColumn<EfakturRow>({
      dataIndex: "ppn",
      title: t("common.vat"),
      currency: (row) => row.mata_uang,
    }),
    {
      ...textColumn<EfakturRow>({ dataIndex: "nomor_peb", title: t("tax.colPebNo") }),
      render: (raw) => <span style={NUMERIC_MUTED}>{raw ? String(raw) : "-"}</span>,
    },
  ];

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        title={t("tax.title")}
        description={t("tax.description")}
      />

      {/* Honesty / disclaimer */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: SECTION_GAP,
          padding: "12px 16px",
          borderRadius: "var(--ant-border-radius)",
          border: "1px solid var(--ant-color-warning-border)",
          background: "var(--ant-color-warning-bg)",
          color: "var(--ant-color-money-pending)",
        }}
      >
        <InfoCircleOutlined aria-hidden="true" style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }} />
        <span>
          {t("tax.disclaimerBefore")} <strong>{t("tax.disclaimerStrong")}</strong>{" "}
          {t("tax.disclaimerAfter")}
        </span>
      </div>

      {/* Seller tax identity */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardTitleBar>{t("tax.sellerTitle")}</CardTitleBar>
        <div style={{ padding: "var(--ant-padding-lg)" }}>
          {sellerNpwpMissing && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginBottom: 16,
                padding: "8px 12px",
                borderRadius: "var(--ant-border-radius)",
                border: "1px solid var(--ant-color-error-border)",
                background: "var(--ant-color-error-bg)",
                color: "var(--ant-color-money-negative)",
              }}
            >
              <WarningOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, flexShrink: 0, marginTop: 2 }} />
              <span>
                {t("tax.npwpMissing")}
              </span>
            </div>
          )}
          <SellerIdentityForm
            initial={{ npwp: seller.npwp, taxName: seller.name, taxAddress: seller.address }}
            identityIncomplete={sellerNpwpMissing}
          />
        </div>
      </Card>

      {/* Period filter */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardTitleBar>{t("tax.periodTitle")}</CardTitleBar>
        <div style={{ padding: "var(--ant-padding-lg)" }}>
          <form
            method="get"
            style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}
          >
            <div>
              <label htmlFor="from" style={{ display: "block", fontWeight: STRONG }}>
                {t("tax.fromDate")}
              </label>
              <TextInput
                id="from"
                name="from"
                type="date"
                defaultValue={fromStr}
                style={{ marginTop: 4 }}
              />
            </div>
            <div>
              <label htmlFor="to" style={{ display: "block", fontWeight: STRONG }}>
                {t("tax.toDate")}
              </label>
              <TextInput
                id="to"
                name="to"
                type="date"
                defaultValue={toStr}
                style={{ marginTop: 4 }}
              />
            </div>
            <Button type="submit" variant="secondary">
              {t("tax.apply")}
            </Button>
          </form>
        </div>
      </Card>

      {/* Summary + download */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "var(--ant-padding)",
          }}
        >
          <div style={MUTED}>
            <span style={{ ...NUMERIC_MUTED, fontWeight: STRONG, color: "var(--ant-color-text)" }}>
              {matched}
            </span>{" "}
            {t("tax.summaryMatched")} ·{" "}
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: STRONG,
                color: "var(--ant-color-money-positive)",
              }}
            >
              {rows.length}
            </span>{" "}
            {t("tax.summaryReady")}
            {problems.length > 0 && (
              <>
                {" "}·{" "}
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: STRONG,
                    color: "var(--ant-color-money-pending)",
                  }}
                >
                  {problems.length}
                </span>{" "}
                {t("tax.summaryNeedsWork")}
              </>
            )}
          </div>
          {sellerNpwpMissing ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: "var(--ant-border-radius)",
                background: "var(--ant-color-fill-quaternary)",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              <DownloadOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE }} />
              {t("tax.npwpNeededToDownload")}
            </span>
          ) : (
            <a href={downloadHref} download>
              {/* Aksi utama layar ini (#267) — dan hanya pada cabang ini ia ada.
                  Cabang sebelahnya (NPWP kosong) tidak punya tombol sama sekali;
                  di sana yang primer adalah simpan identitas di kartu atas,
                  lewat eskalasi berkondisi. */}
              <Button variant="primary" disabled={rows.length === 0}>
                <DownloadOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, marginInlineEnd: 6 }} />
                {t("tax.downloadCsv")}
              </Button>
            </a>
          )}
        </div>
      </Card>

      {/* Problems — invoices held back for a missing required field */}
      {problems.length > 0 && (
        <Card
          style={{
            marginBottom: SECTION_GAP,
            borderColor: "var(--ant-color-warning-border)",
          }}
        >
          <div
            style={{
              padding: "var(--ant-padding-lg)",
              borderBottom: "1px solid var(--ant-color-border-secondary)",
            }}
          >
            <h2
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: 0,
                fontSize: "var(--ant-font-size-lg)",
                fontWeight: STRONG,
                color: "var(--ant-color-money-pending)",
              }}
            >
              <WarningOutlined aria-hidden="true" style={{ fontSize: 20 }} />
              {t("tax.problemsTitle", { count: problems.length })}
            </h2>
          </div>
          <div style={{ padding: "var(--ant-padding-lg)" }}>
            <p style={{ margin: 0, marginBottom: 12, ...MUTED }}>
              {t("tax.problemsDescription")}
            </p>
            <ul style={{ display: "grid", gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
              {problems.map((p) => (
                <li
                  key={p.invoiceNo}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
                >
                  <FileTextOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, flexShrink: 0, marginTop: 2, color: "var(--ant-color-text-secondary)" }} />
                  <span>{p.invoiceNo}</span>
                  <span style={{ color: "var(--ant-color-money-pending)" }}>
                    {t("tax.missingFields", { fields: p.missing.join(", ") })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Preview of the exportable rows */}
      <Card>
        <CardTitleBar>{t("tax.previewTitle")}</CardTitleBar>
        <StaticTable<EfakturRow>
          columns={columns}
          rows={rows}
          rowKey={(row, index) => `${row.nomor_dokumen}-${index}`}
          empty={
            <EmptyState
              icon={<FileDoneOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("tax.emptyTitle")}
              description={t("tax.emptyDescription")}
              actionLabel={canCreateInvoice ? t("tax.emptyAction") : undefined}
              actionHref={canCreateInvoice ? "/invoices/new" : undefined}
            />
          }
        />
      </Card>
    </div>
  );
}
