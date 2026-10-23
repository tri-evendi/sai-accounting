/**
 * e-Faktur (Coretax DJP) — issue #17, diperluas untuk Coretax (docs/EFAKTUR.md).
 *
 * Permukaan PELAPORAN di atas faktur keluaran: tidak menyentuh buku (#16 sudah
 * memposting PPN-nya). Seorang Manajer memilih masa, melihat faktur mana yang
 * siap dan mana yang kurang data, lalu:
 *
 *   1. mengunduh BERKAS IMPOR CORETAX (XML, templat resmi DJP) — aksi utama
 *      layar ini, dan jalur yang bisa dipakai HARI INI lewat unggah manual;
 *   2. bila PT-nya punya sambungan PJAP: mengirim per faktur / semuanya, dan
 *      melihat statusnya (antre → diterima → disetujui + NSFP).
 *
 * CSV lama tetap ada sebagai ringkasan untuk diperiksa (tombol sekunder).
 *
 * Tetap SERVER component; pulau client: formulir identitas penjual, tombol
 * kirim/batal, dan formulir sambungan PJAP.
 */
import { canOpenPage, requirePagePermission } from "@/lib/page-auth";
import { canEffective } from "@/lib/authz-effective";
import { tenantApiPath, type TenantScopedParams } from "@sai/core/tenant-routes";
import { PageHeader } from "@sai/ui/page-header";
import { Card } from "@sai/ui/card";
import { Badge } from "@sai/ui/badge";
import { Button } from "@sai/ui/button";
import { TextInput } from "@sai/ui/input";
import { StaticTable } from "@sai/ui/static-table";
import { moneyColumn } from "@sai/ui/money-column";
import { textColumn, type SaiColumns } from "@sai/ui/table-columns";
import { formatDateShort } from "@sai/core/utils";
import { monthRange } from "@/lib/dashboard-summary";
import { getEfakturExport } from "@/lib/efaktur-data";
import { getCoretaxExport } from "@/lib/coretax-data";
import { getEfakturConnection, latestSubmissions, type LatestSubmission } from "@/lib/efaktur-submissions";
import { encryptionKeyAvailable } from "@sai/core/settings-crypto";
import { canCancel, canSubmitAfter, type EfakturSubmissionStatus } from "@sai/core/efaktur-submission";
import type { CoretaxProblemCode, CoretaxTrxCode, CoretaxWarningCode } from "@sai/core/coretax-xml";
import { SellerIdentityForm } from "./seller-identity-form";
import { PjapRowAction, PjapSendAll } from "./pjap-actions";
import { PjapConnectionForm } from "./pjap-connection-form";
import { EmptyState } from "@sai/ui/empty-state";
import {
  DownloadOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { getT } from "@sai/platform/i18n/server";
import { SECTION_GAP, SPACE_XS } from "@sai/ui/layout-scale";

export const dynamic = "force-dynamic";

const EMPTY_ICON_SIZE = 48;
const ICON_SIZE = 16;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

const MUTED: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };
const NUMERIC: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** Kepala kartu: judul di atas garis pemisah, dengan aksi opsional di kanan. */
function CardTitleBar({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "var(--ant-padding-lg)",
        borderBottom: "1px solid var(--ant-color-border-secondary)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "var(--ant-font-size-lg)", fontWeight: STRONG }}>{children}</h2>
      {actions}
    </div>
  );
}

function currentMonthRange(): { from: string; to: string } {
  const { fromISO, toISO } = monthRange(new Date());
  return { from: fromISO, to: toISO };
}

function parseDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/*
 * Kunci kamus ditulis UTUH (bukan `tax.coretax.problem.${kode}`), supaya
 * penjaga kunci yatim melihatnya; `Record` bertipe penuh membuat kode baru
 * tanpa label ditolak `tsc`.
 */
const PROBLEM_KEY = {
  seller_npwp: "tax.coretax.problem.seller_npwp",
  seller_nitku: "tax.coretax.problem.seller_nitku",
  seller_not_pkp: "tax.coretax.problem.seller_not_pkp",
  before_coretax: "tax.coretax.problem.before_coretax",
  buyer_id: "tax.coretax.problem.buyer_id",
  buyer_nitku: "tax.coretax.problem.buyer_nitku",
  buyer_address: "tax.coretax.problem.buyer_address",
  no_lines: "tax.coretax.problem.no_lines",
  line_quantity: "tax.coretax.problem.line_quantity",
  rate_unsupported: "tax.coretax.problem.rate_unsupported",
} as const satisfies Record<CoretaxProblemCode, string>;

const WARNING_KEY = {
  unit_other: "tax.coretax.warning.unit_other",
  vat_rounding: "tax.coretax.warning.vat_rounding",
  dpp_mismatch: "tax.coretax.warning.dpp_mismatch",
} as const satisfies Record<CoretaxWarningCode, string>;

const TRX_KEY = {
  "01": "tax.coretax.trx.code01",
  "02": "tax.coretax.trx.code02",
  "03": "tax.coretax.trx.code03",
  "04": "tax.coretax.trx.code04",
} as const satisfies Record<CoretaxTrxCode, string>;

const STATUS_KEY = {
  queued: "tax.pjap.status.queued",
  submitted: "tax.pjap.status.submitted",
  approved: "tax.pjap.status.approved",
  rejected: "tax.pjap.status.rejected",
  failed: "tax.pjap.status.failed",
  cancel_requested: "tax.pjap.status.cancel_requested",
  canceled: "tax.pjap.status.canceled",
} as const satisfies Record<EfakturSubmissionStatus, string>;

/** Status kiriman → varian badge. Badge selalu berteks (MASTER §Badge). */
const STATUS_BADGE: Record<EfakturSubmissionStatus, "default" | "success" | "warning" | "danger" | "outline"> = {
  queued: "outline",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
  failed: "danger",
  cancel_requested: "warning",
  canceled: "default",
};

interface ReadyRow {
  invoiceId: number;
  invoiceNo: string;
  date: string;
  buyerName: string;
  trxCode: CoretaxTrxCode;
  dpp: number;
  vat: number;
  submission: LatestSubmission | null;
}

/** Peringatan / masalah: satu kartu, satu gaya — beda hanya judul & warnanya. */
function IssueCard({
  title,
  description,
  items,
  tone,
}: {
  title: string;
  description: string;
  items: { key: string; label: string; detail: string }[];
  tone: "pending" | "neutral";
}) {
  const color = tone === "pending" ? "var(--ant-color-money-pending)" : "var(--ant-color-text)";
  return (
    <Card
      style={{
        marginBottom: SECTION_GAP,
        borderColor: tone === "pending" ? "var(--ant-color-warning-border)" : undefined,
      }}
    >
      <div style={{ padding: "var(--ant-padding-lg)", borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
        <h2
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: 0,
            fontSize: "var(--ant-font-size-lg)",
            fontWeight: STRONG,
            color,
          }}
        >
          {tone === "pending" ? (
            <WarningOutlined aria-hidden="true" style={{ fontSize: 20 }} />
          ) : (
            <InfoCircleOutlined aria-hidden="true" style={{ fontSize: 20 }} />
          )}
          {title}
        </h2>
      </div>
      <div style={{ padding: "var(--ant-padding-lg)" }}>
        <p style={{ margin: 0, marginBottom: 12, ...MUTED }}>{description}</p>
        <ul style={{ display: "grid", gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((it) => (
            <li key={it.key} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 8 }}>
              <FileTextOutlined
                aria-hidden="true"
                style={{ fontSize: ICON_SIZE, flexShrink: 0, marginTop: 4, color: "var(--ant-color-text-secondary)" }}
              />
              <span style={NUMERIC}>{it.label}</span>
              <span style={{ color }}>— {it.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export default async function EfakturPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requirePagePermission("tax.read", params);
  const [canCreateInvoice, canSubmit, canManage] = await Promise.all([
    canOpenPage(session.user, "invoice.write"),
    canEffective(session.user, "tax.submit"),
    canEffective(session.user, "tax.manage"),
  ]);
  const t = await getT();
  const filters = await searchParams;

  const defaults = currentMonthRange();
  const from = parseDate(filters.from) ?? new Date(defaults.from);
  const to = parseDate(filters.to) ?? new Date(defaults.to);
  const fromStr = parseDate(filters.from) ? filters.from! : defaults.from;
  const toStr = parseDate(filters.to) ? filters.to! : defaults.to;

  const [legacy, coretax, connection] = await Promise.all([
    getEfakturExport(from, to),
    getCoretaxExport({ from, to }),
    getEfakturConnection(),
  ]);
  const { seller, sellerNpwpMissing } = legacy;
  const { result } = coretax;
  const submissions = await latestSubmissions([...coretax.invoiceIds.values()]);

  const { tenantSlug, companySlug } = await params;
  const basePath = tenantApiPath(tenantSlug, companySlug, "/tax/efaktur");
  const range = `from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;
  const xmlHref = `${basePath}/coretax?${range}`;
  const csvHref = `${basePath}?${range}`;

  const problemLabel = (c: CoretaxProblemCode) => t(PROBLEM_KEY[c]);
  const warningLabel = (c: CoretaxWarningCode) => t(WARNING_KEY[c]);

  const rows: ReadyRow[] = result.invoices.map((inv) => ({
    invoiceId: coretax.invoiceIds.get(inv.invoiceNo)!,
    invoiceNo: inv.invoiceNo,
    date: inv.date,
    buyerName: inv.buyerName,
    trxCode: inv.trxCode,
    dpp: inv.lines.reduce((s, l) => s + l.taxBaseCents, 0) / 100,
    vat: inv.lines.reduce((s, l) => s + l.vatCents, 0) / 100,
    submission: submissions.get(coretax.invoiceIds.get(inv.invoiceNo)!) ?? null,
  }));
  const pjapOn = connection.provider !== null;
  const sendable = rows.filter((r) => canSubmitAfter(r.submission?.status ?? null)).map((r) => r.invoiceId);

  const columns: SaiColumns<ReadyRow> = [
    {
      ...textColumn<ReadyRow>({ dataIndex: "date", title: t("common.date") }),
      render: (raw) => <span style={MUTED}>{formatDateShort(String(raw))}</span>,
    },
    textColumn<ReadyRow>({ dataIndex: "invoiceNo", title: t("tax.colDocNo") }),
    {
      ...textColumn<ReadyRow>({ dataIndex: "buyerName", title: t("tax.colBuyer") }),
      render: (raw) => (raw ? String(raw) : "—"),
    },
    {
      ...textColumn<ReadyRow>({ dataIndex: "trxCode", title: t("tax.coretax.colTrxCode") }),
      render: (_raw, row) => (
        <span title={t(TRX_KEY[row.trxCode])} style={NUMERIC}>
          {row.trxCode}
        </span>
      ),
    },
    moneyColumn<ReadyRow>({ dataIndex: "dpp", title: t("tax.colDpp"), currency: "IDR" }),
    moneyColumn<ReadyRow>({ dataIndex: "vat", title: t("common.vat"), currency: "IDR" }),
  ];
  if (pjapOn) {
    columns.push({
      key: "status",
      dataIndex: "submission",
      title: t("tax.pjap.colStatus"),
      render: (_raw, row) => {
        const s = row.submission;
        if (!s) return <span style={MUTED}>{t("tax.pjap.notSent")}</span>;
        return (
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ display: "inline-flex", gap: SPACE_XS, flexWrap: "wrap" }}>
              <Badge variant={STATUS_BADGE[s.status]}>{t(STATUS_KEY[s.status])}</Badge>
              {s.provider === "mock" && <Badge variant="outline">{t("tax.pjap.mockBadge")}</Badge>}
            </span>
            {s.taxInvoiceNumber && <span style={{ ...NUMERIC, ...MUTED }}>{s.taxInvoiceNumber}</span>}
            {s.statusMessage && <span style={MUTED}>{s.statusMessage}</span>}
          </div>
        );
      },
    });
    if (canSubmit) {
      columns.push({
        key: "action",
        dataIndex: "invoiceId",
        title: t("common.actions"),
        render: (_raw, row) => {
          const s = row.submission;
          const mode = !s ? "send" : canSubmitAfter(s.status) ? "resend" : canCancel(s.status) ? "cancel" : "none";
          return <PjapRowAction basePath={basePath} invoiceId={row.invoiceId} submissionId={s?.id ?? null} mode={mode} />;
        },
      });
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <PageHeader title={t("tax.title")} description={t("tax.description")} />

      {/* Apa berkas ini, dan apa yang TIDAK — ditulis terus terang. */}
      <div
        role="note"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: SECTION_GAP,
          padding: "12px 16px",
          borderRadius: "var(--ant-border-radius)",
          border: "1px solid var(--ant-color-info-border)",
          background: "var(--ant-color-info-bg)",
        }}
      >
        <InfoCircleOutlined aria-hidden="true" style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }} />
        <span>{t("tax.coretax.notice")}</span>
      </div>

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
              <span>{t("tax.npwpMissing")}</span>
            </div>
          )}
          <SellerIdentityForm
            initial={{
              npwp: seller.npwp,
              taxName: seller.name,
              taxAddress: seller.address,
              nitku: coretax.seller.nitku,
            }}
            identityIncomplete={sellerNpwpMissing}
          />
        </div>
      </Card>

      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardTitleBar>{t("tax.periodTitle")}</CardTitleBar>
        <div style={{ padding: "var(--ant-padding-lg)" }}>
          <form method="get" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
            <div>
              <label htmlFor="from" style={{ display: "block", fontWeight: STRONG }}>
                {t("tax.fromDate")}
              </label>
              <TextInput id="from" name="from" type="date" defaultValue={fromStr} style={{ marginTop: 4 }} />
            </div>
            <div>
              <label htmlFor="to" style={{ display: "block", fontWeight: STRONG }}>
                {t("tax.toDate")}
              </label>
              <TextInput id="to" name="to" type="date" defaultValue={toStr} style={{ marginTop: 4 }} />
            </div>
            <Button type="submit" variant="secondary">
              {t("tax.apply")}
            </Button>
          </form>
        </div>
      </Card>

      {/* Ringkasan + unduhan */}
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
          <div role="status" style={MUTED}>
            <span style={{ ...NUMERIC, fontWeight: STRONG, color: "var(--ant-color-text)" }}>{coretax.matched}</span>{" "}
            {t("tax.summaryMatched")} ·{" "}
            <span style={{ ...NUMERIC, fontWeight: STRONG, color: "var(--ant-color-money-positive)" }}>
              {result.invoices.length}
            </span>{" "}
            {t("tax.summaryReady")}
            {result.problems.length > 0 && (
              <>
                {" "}·{" "}
                <span style={{ ...NUMERIC, fontWeight: STRONG, color: "var(--ant-color-money-pending)" }}>
                  {result.problems.length}
                </span>{" "}
                {t("tax.summaryNeedsWork")}
              </>
            )}
            {result.exports.length > 0 && (
              <>
                {" "}·{" "}
                <span style={{ ...NUMERIC, fontWeight: STRONG, color: "var(--ant-color-text)" }}>
                  {result.exports.length}
                </span>{" "}
                {t("tax.coretax.summaryExport")}
              </>
            )}
          </div>
          {sellerNpwpMissing ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: SPACE_XS,
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
            <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 8 }}>
              {/* Aksi utama layar ini (#267): berkas impor Coretax. `<Button
                  href download>`, bukan `<ButtonLink>` — tujuannya route API
                  yang mengalirkan berkas. CSV turun ke sekunder: ringkasan
                  untuk diperiksa, bukan berkas untuk DJP. */}
              <Button href={xmlHref} download variant="primary" disabled={result.invoices.length === 0}>
                <DownloadOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, marginInlineEnd: 6 }} />
                {t("tax.coretax.downloadXml")}
              </Button>
              <Button href={csvHref} download variant="secondary" disabled={legacy.result.rows.length === 0}>
                {t("tax.downloadCsv")}
              </Button>
            </span>
          )}
        </div>
      </Card>

      {result.problems.length > 0 && (
        <IssueCard
          tone="pending"
          title={t("tax.problemsTitle", { count: result.problems.length })}
          description={t("tax.coretax.problemsDescription")}
          items={result.problems.map((p) => ({
            key: p.invoiceNo,
            label: p.invoiceNo,
            detail: p.codes.map(problemLabel).join("; "),
          }))}
        />
      )}

      {result.warnings.length > 0 && (
        <IssueCard
          tone="neutral"
          title={t("tax.coretax.warningsTitle", { count: result.warnings.length })}
          description={t("tax.coretax.warningsDescription")}
          items={result.warnings.map((w) => ({
            key: w.invoiceNo,
            label: w.invoiceNo,
            detail: w.codes.map(warningLabel).join("; "),
          }))}
        />
      )}

      {result.exports.length > 0 && (
        <IssueCard
          tone="neutral"
          title={t("tax.coretax.exportsTitle", { count: result.exports.length })}
          description={t("tax.coretax.exportsDescription")}
          items={result.exports.map((e) => ({
            key: e.invoiceNo,
            label: e.invoiceNo,
            detail: e.pebNumber ? `PEB ${e.pebNumber}` : t("tax.coretax.pebMissing"),
          }))}
        />
      )}

      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardTitleBar
          actions={
            pjapOn && canSubmit && sendable.length > 0 ? (
              <PjapSendAll basePath={basePath} invoiceIds={sendable} />
            ) : undefined
          }
        >
          {t("tax.coretax.readyTitle")}
        </CardTitleBar>
        {!pjapOn && (
          <p style={{ margin: 0, padding: "var(--ant-padding) var(--ant-padding-lg) 0", ...MUTED }}>
            {t("tax.pjap.offNote")}
          </p>
        )}
        <StaticTable<ReadyRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => String(row.invoiceId)}
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

      {canManage && (
        <Card>
          <CardTitleBar>{t("tax.pjap.connectionTitle")}</CardTitleBar>
          <div style={{ padding: "var(--ant-padding-lg)", display: "grid", gap: 16 }}>
            <p style={{ margin: 0, ...MUTED }}>{t("tax.pjap.connectionDescription")}</p>
            {!encryptionKeyAvailable() && (
              <p role="alert" style={{ margin: 0, color: "var(--ant-color-money-negative)" }}>
                {t("tax.pjap.encryptionKeyMissing")}
              </p>
            )}
            <PjapConnectionForm basePath={basePath} initial={connection} />
          </div>
        </Card>
      )}
    </div>
  );
}
