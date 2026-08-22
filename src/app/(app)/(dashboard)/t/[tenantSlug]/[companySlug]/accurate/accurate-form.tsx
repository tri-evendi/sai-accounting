"use client";

/**
 * Integrasi Accurate — unggah "Rincian Buku Besar", lihat hasil pencocokannya.
 *
 * ── Layar ini TIDAK MENULIS APA PUN, dan itu dikatakan di layarnya ─────────
 * Rincian buku besar hanya memuat satu sisi tiap transaksi, jadi ia tak bisa
 * jadi jurnal (lihat kepala `@/lib/accurate/ledger-report`). Yang dilakukan di
 * sini hanya membandingkan. Kalimatnya berdiri di atas hasil, bukan di catatan
 * kaki: orang yang mengunggah berkas ke aplikasi akuntansi berhak tahu sejak
 * detik pertama apakah bukunya baru saja berubah.
 *
 * ── Kotak jatuhkan & isian berkas tersembunyi ─────────────────────────────
 * Pola yang sama persis dengan impor Daftar Akun (`accounts/import/import-form.tsx`),
 * termasuk alasan `<input type="file">` tersembunyi dipertahankan alih-alih
 * `Upload` AntD — lihat kepala berkas itu. Satu bentuk untuk semua layar
 * unggahan lebih berharga daripada variasi per layar.
 *
 * Gaya SEBARIS + token AntD, tanpa `className` (AGENTS.md / MASTER.md #203).
 */
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Alert, Col, Flex, Row, Tag, theme } from "antd";
import { DownloadOutlined, FileExcelOutlined, UploadOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import { parseTenantPath, tenantApiPath } from "@/lib/tenant-routes";
import type {
  AccuratePreview,
  PreviewAccount,
  PreviewEntry,
  PreviewSaiRow,
} from "@/lib/accurate/preview";

/** Pengganti `sr-only` — lihat catatan yang sama di impor Daftar Akun. */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0,
};

const DROPZONE_ICON_SIZE = 32;
const LIST_MAX_HEIGHT = 280;

export function AccurateReconcileForm() {
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<AccuratePreview | null>(null);

  const pathname = usePathname();
  const scope = pathname ? parseTenantPath(pathname) : null;
  const endpoint = scope
    ? tenantApiPath(scope.tenantSlug, scope.companySlug, "/accurate/ledger")
    : "";

  function reset() {
    setError("");
    setPreview(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    reset();
    if (!file) {
      setError(t("accurate.pickFileFirst"));
      return;
    }
    setLoading(true);
    const body = new FormData();
    body.set("file", file);
    body.set("mode", "reconcile");
    const res = await apiFetch(endpoint, { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || t("accurate.failed"));
      return;
    }
    setPreview(data as AccuratePreview);
    toast(t("accurate.toastDone", { accounts: (data as AccuratePreview).summary.accounts }));
  }

  /**
   * Unduh rancangan saldo awal.
   *
   * Berkasnya dikirim ULANG, bukan diambil dari hasil sebelumnya: tidak ada
   * apa pun yang disimpan di server (lihat kepala route-nya), dan menyimpannya
   * hanya demi tombol ini berarti menyimpan buku besar orang lain di tempat
   * yang tidak dirancang untuk itu.
   */
  async function handleDraft() {
    if (!file) return;
    setDownloading(true);
    setError("");
    const body = new FormData();
    body.set("file", file);
    body.set("mode", "opening-draft");
    const res = await apiFetch(endpoint, { method: "POST", body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("accurate.failed"));
      setDownloading(false);
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const filename =
      disposition.match(/filename="?([^"]+)"?/)?.[1] ?? "rancangan_saldo_awal.xlsx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("ledger.title"), href: "/ledger" }, { label: t("accurate.title") }]}
        title={t("accurate.title")}
        description={t("accurate.description")}
      />

      {/* Yang paling penting berdiri paling atas: tak ada yang ditulis. */}
      <div style={{ marginBottom: token.marginLG }}>
        <Alert type="info" showIcon message={t("accurate.readOnlyNotice")} />
      </div>

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("accurate.prepTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Flex vertical gap={token.marginSM} style={{ color: token.colorTextSecondary }}>
            <ol style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
              <li>{t("accurate.prepStep1")}</li>
              <li>{t("accurate.prepStep2")}</li>
              <li>{t("accurate.prepStep3")}</li>
            </ol>
            <div>
              <Tag color="processing">{t("accurate.sourceFile")}</Tag>
              <Tag>{t("accurate.sourceApiSoon")}</Tag>
            </div>
          </Flex>
        </CardContent>
      </Card>

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("accurate.uploadTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Flex vertical gap={token.margin}>
              <label
                htmlFor="accurate-file"
                style={{
                  display: "flex",
                  cursor: "pointer",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: token.marginXS,
                  borderRadius: token.borderRadiusLG,
                  border: `${token.lineWidth}px dashed ${token.colorBorder}`,
                  background: token.colorFillQuaternary,
                  paddingInline: token.paddingLG,
                  paddingBlock: token.paddingXL,
                  textAlign: "center",
                }}
              >
                <FileExcelOutlined
                  aria-hidden="true"
                  style={{ fontSize: DROPZONE_ICON_SIZE, color: token.colorTextSecondary }}
                />
                <span style={{ fontWeight: token.fontWeightStrong, color: token.colorText }}>
                  {file ? file.name : t("accurate.filePlaceholder")}
                </span>
                <small style={{ color: token.colorTextSecondary }}>
                  {t("accurate.fileLimits")}
                </small>
                <input
                  id="accurate-file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  style={VISUALLY_HIDDEN}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    reset();
                  }}
                />
              </label>

              {error && (
                <div role="alert">
                  <Alert type="error" showIcon message={error} />
                </div>
              )}

              <Flex wrap align="center" gap={token.marginSM}>
                <Button variant="primary" type="submit" disabled={loading || !file}>
                  <UploadOutlined aria-hidden="true" />
                  {loading ? t("accurate.submitting") : t("accurate.submit")}
                </Button>
              </Flex>
            </Flex>
          </form>
        </CardContent>
      </Card>

      {preview && (
        <PreviewPanels
          preview={preview}
          onDraft={handleDraft}
          downloading={downloading}
          t={t}
        />
      )}
    </div>
  );
}

type Translate = ReturnType<typeof useT>;

function PreviewPanels({
  preview,
  onDraft,
  downloading,
  t,
}: {
  preview: AccuratePreview;
  onDraft: () => void;
  downloading: boolean;
  t: Translate;
}) {
  const { token } = theme.useToken();
  const { meta, summary, draft } = preview;

  const facts: { label: string; value: string }[] = [
    { label: t("accurate.metaCompany"), value: meta.company ?? "—" },
    { label: t("accurate.metaReport"), value: meta.title ?? "—" },
    { label: t("accurate.metaPeriod"), value: meta.period ?? "—" },
    { label: t("accurate.metaPrintedAt"), value: meta.printedAt ?? "—" },
    {
      label: t("accurate.metaPages"),
      value: meta.pageCount === null ? "—" : String(meta.pageCount),
    },
  ];

  const stats: { label: string; value: number }[] = [
    { label: t("accurate.sumAccounts"), value: summary.accounts },
    { label: t("accurate.sumBalanced"), value: summary.balanced },
    { label: t("accurate.sumDifference"), value: summary.withDifference },
    { label: t("accurate.sumMissing"), value: summary.missingInSai },
    { label: t("accurate.sumMatched"), value: summary.matched },
    { label: t("accurate.sumOnlyAccurate"), value: summary.onlyInAccurate },
    { label: t("accurate.sumOnlySai"), value: summary.onlyInSai },
    { label: t("accurate.sumDateShifted"), value: summary.dateShifted },
  ];

  return (
    <>
      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("accurate.reportTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Row gutter={[token.marginLG, token.marginSM]}>
            {facts.map((fact) => (
              <Col key={fact.label} xs={24} sm={12} md={8}>
                <div style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
                  {fact.label}
                </div>
                <div style={{ color: token.colorText }}>{fact.value}</div>
              </Col>
            ))}
          </Row>
        </CardContent>
      </Card>

      {preview.repairs.length > 0 && (
        <div style={{ marginBottom: token.marginLG }}>
          <Alert
            type="warning"
            showIcon
            message={t("accurate.repairsTitle", { count: preview.repairs.length })}
            description={
              <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
                {preview.repairs.map((repair) => (
                  <li key={`${repair.kind}-${repair.row}`}>
                    {repair.kind === "joined_wrapped_cell"
                      ? t("accurate.repairJoined", {
                          row: repair.row,
                          into: repair.joinedInto ?? 0,
                          text: repair.text,
                        })
                      : t("accurate.repairStray", { row: repair.row, text: repair.text })}
                  </li>
                ))}
              </ul>
            }
          />
        </div>
      )}

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("accurate.summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Row gutter={[token.marginLG, token.marginSM]}>
            {stats.map((stat) => (
              <Col key={stat.label} xs={12} sm={8} md={6}>
                <div style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
                  {stat.label}
                </div>
                <div
                  style={{
                    color: token.colorText,
                    fontSize: token.fontSizeHeading4,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {stat.value}
                </div>
              </Col>
            ))}
          </Row>
        </CardContent>
      </Card>

      {preview.accounts.map((account) => (
        <AccountPanel key={account.code || account.name} account={account} t={t} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle level={2}>{t("accurate.draftTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Flex vertical gap={token.margin}>
            <p style={{ margin: 0, color: token.colorTextSecondary }}>
              {t("accurate.draftDescription")}
            </p>
            <Row gutter={[token.marginLG, token.marginSM]}>
              <Col xs={12} sm={8}>
                <div style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
                  {t("accurate.draftDebit")}
                </div>
                <Money value={draft.totals.debit} />
              </Col>
              <Col xs={12} sm={8}>
                <div style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
                  {t("accurate.draftCredit")}
                </div>
                <Money value={draft.totals.credit} />
              </Col>
              <Col xs={12} sm={8}>
                <div style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
                  {t("accurate.draftPlug")}
                </div>
                <Money value={draft.totals.equityPlug} signed />
              </Col>
            </Row>
            {draft.unknownCodes.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={t("accurate.draftUnknown", {
                  codes: draft.unknownCodes.join(", "),
                })}
              />
            )}
            <div>
              <Button variant="secondary" type="button" onClick={onDraft} disabled={downloading}>
                <DownloadOutlined aria-hidden="true" />
                {downloading ? t("accurate.downloading") : t("accurate.downloadDraft")}
              </Button>
            </div>
          </Flex>
        </CardContent>
      </Card>
    </>
  );
}

/** Satu akun: angka berdampingan, lalu apa yang tidak cocok. */
function AccountPanel({ account, t }: { account: PreviewAccount; t: Translate }) {
  const { token } = theme.useToken();

  const statusLabel =
    account.status === "balanced"
      ? t("accurate.statusBalanced")
      : account.status === "missing_in_sai"
        ? t("accurate.statusMissing")
        : t("accurate.statusDifference");
  const statusColor =
    account.status === "balanced" ? "success" : account.status === "missing_in_sai" ? "error" : "warning";

  interface CompareRow {
    key: string;
    label: string;
    opening: number | null;
    debit: number | null;
    credit: number | null;
    closing: number | null;
    signed?: boolean;
  }

  const compareRows: CompareRow[] = [
    {
      key: "accurate",
      label: t("accurate.rowAccurate"),
      opening: account.accurate.opening,
      debit: account.accurate.debit,
      credit: account.accurate.credit,
      closing: account.accurate.closing,
    },
    {
      key: "sai",
      label: t("accurate.rowSai"),
      opening: account.sai?.opening ?? null,
      debit: account.sai?.debit ?? null,
      credit: account.sai?.credit ?? null,
      closing: account.sai?.closing ?? null,
    },
    {
      key: "difference",
      label: t("accurate.rowDifference"),
      opening: account.difference.opening,
      debit: account.difference.debit,
      credit: account.difference.credit,
      closing: account.difference.closing,
      signed: true,
    },
  ];

  const money = (value: number | null, signed?: boolean) => (
    <Money value={value} signed={signed} hideCurrency />
  );

  const compareColumns: SaiColumns<CompareRow> = [
    { key: "label", dataIndex: "label", title: "", align: "left" },
    {
      key: "opening",
      dataIndex: "opening",
      title: t("accurate.colOpening"),
      align: "right",
      render: (_v, r) => money(r.opening, r.signed),
    },
    {
      key: "debit",
      dataIndex: "debit",
      title: t("accurate.colDebit"),
      align: "right",
      render: (_v, r) => money(r.debit, r.signed),
    },
    {
      key: "credit",
      dataIndex: "credit",
      title: t("accurate.colCredit"),
      align: "right",
      render: (_v, r) => money(r.credit, r.signed),
    },
    {
      key: "closing",
      dataIndex: "closing",
      title: t("accurate.colClosing"),
      align: "right",
      render: (_v, r) => money(r.closing, r.signed),
    },
  ];

  const entryColumns: SaiColumns<PreviewEntry> = [
    { key: "row", dataIndex: "row", title: t("accurate.colRow"), align: "right", width: 72 },
    { key: "date", dataIndex: "date", title: t("accurate.colDate"), align: "left", width: 110 },
    { key: "description", dataIndex: "description", title: t("accurate.colDesc"), align: "left" },
    { key: "reference", dataIndex: "reference", title: t("accurate.colRef"), align: "left" },
    {
      key: "debit",
      dataIndex: "debit",
      title: t("accurate.colDebit"),
      align: "right",
      render: (_v, r) => money(r.debit),
    },
    {
      key: "credit",
      dataIndex: "credit",
      title: t("accurate.colCredit"),
      align: "right",
      render: (_v, r) => money(r.credit),
    },
  ];

  const saiColumns: SaiColumns<PreviewSaiRow> = [
    { key: "number", dataIndex: "number", title: t("accurate.colJournal"), align: "left" },
    { key: "date", dataIndex: "date", title: t("accurate.colDate"), align: "left", width: 110 },
    { key: "memo", dataIndex: "memo", title: t("accurate.colMemo"), align: "left" },
    {
      key: "debit",
      dataIndex: "debit",
      title: t("accurate.colDebit"),
      align: "right",
      render: (_v, r) => money(r.debit),
    },
    {
      key: "credit",
      dataIndex: "credit",
      title: t("accurate.colCredit"),
      align: "right",
      render: (_v, r) => money(r.credit),
    },
  ];

  return (
    <Card style={{ marginBottom: token.marginLG }}>
      <CardHeader>
        <CardTitle level={2}>
          {account.code} — {account.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Flex vertical gap={token.margin}>
          <div>
            <Tag color={statusColor}>{statusLabel}</Tag>
            <span style={{ color: token.colorTextSecondary }}>
              {t("accurate.matchBreakdown", {
                exact: account.counts.exact,
                amountDate: account.counts.amountDate,
                referenceOnly: account.counts.referenceOnly,
              })}
            </span>
          </div>

          <StaticTable
            columns={compareColumns}
            rows={compareRows}
            rowKey={(r) => r.key}
            size="small"
          />

          {account.truncated && (
            <Alert type="info" showIcon message={t("accurate.truncated")} />
          )}

          {account.onlyInAccurate.length > 0 && (
            <div>
              <h3 style={{ margin: 0, marginBottom: token.marginXS, fontSize: token.fontSize }}>
                {t("accurate.onlyAccurateTitle", { count: account.counts.onlyInAccurate })}
              </h3>
              <StaticTable
                columns={entryColumns}
                rows={account.onlyInAccurate}
                rowKey={(r) => r.row}
                size="small"
                sticky
                maxHeight={LIST_MAX_HEIGHT}
              />
            </div>
          )}

          {account.onlyInSai.length > 0 && (
            <div>
              <h3 style={{ margin: 0, marginBottom: token.marginXS, fontSize: token.fontSize }}>
                {t("accurate.onlySaiTitle", { count: account.counts.onlyInSai })}
              </h3>
              <StaticTable
                columns={saiColumns}
                rows={account.onlyInSai}
                rowKey={(r) => r.lineId}
                size="small"
                sticky
                maxHeight={LIST_MAX_HEIGHT}
              />
            </div>
          )}

          {account.warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={t("accurate.warningsTitle", { count: account.warnings.length })}
              description={
                <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
                  {account.warnings.map((warning, i) => (
                    <li key={`${warning.kind}-${warning.row}-${i}`}>
                      {warning.row === null
                        ? warning.message
                        : t("accurate.warningAtRow", {
                            row: warning.row,
                            message: warning.message,
                          })}
                    </li>
                  ))}
                </ul>
              }
            />
          )}
        </Flex>
      </CardContent>
    </Card>
  );
}
