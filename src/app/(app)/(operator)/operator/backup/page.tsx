/**
 * `/operator/backup` — CADANGAN dan VERSI SKEMA setiap basis data.
 *
 * Dua pertanyaan yang setiap rilis dan setiap pagi harus terjawab, dan yang
 * sampai halaman ini hanya bisa dijawab lewat SSH + `psql`:
 *   1. Apakah cadangan semalam berhasil, dan apakah ia ada DI LUAR server ini?
 *   2. Apakah SETIAP basis data — kendali, platform, tiap buku PT — berada di
 *      migration yang diharapkan kode yang sedang berjalan?
 *
 * `/api/health` menjawab keduanya sebagai satu bit; halaman ini menjawab
 * "yang mana". Status cadangan `local` (artefak dibuat tapi tidak dikirim ke
 * S3) ditandai sebagai peringatan, bukan keberhasilan: cadangan yang tinggal
 * di disk yang sama dengan basis datanya hilang bersama disk itu.
 */
import { CloudServerOutlined } from "@ant-design/icons";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import {
  ConsoleNotice,
  ConsolePanel,
  CONSOLE_MUTED,
  CONSOLE_PAGE,
  CONSOLE_TABULAR,
} from "@/components/operator/console-ui";
import { requireOperatorPage } from "@/lib/operator/guard";
import {
  backupRunsForOperator,
  schemaVersionsForOperator,
  type OperatorBackupRun,
  type SchemaVersionRow,
} from "@/lib/operator/backups";
import { perluTindakan, type StatusVersi } from "@/lib/schema-version";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Peta STATIS, bukan `operator.backups.version.${status}`: penjaga kunci
 *  yatim membaca rujukan kamus sebagai teks, dan kunci yang hanya dirakit saat
 *  berjalan terbaca sebagai kunci yang tidak dipakai siapa pun. */
const LABEL_VERSI: Record<StatusVersi, DictionaryKey> = {
  mutakhir: "operator.backups.version.mutakhir",
  tertinggal: "operator.backups.version.tertinggal",
  mendahului: "operator.backups.version.mendahului",
  menggantung: "operator.backups.version.menggantung",
  tak_terbaca: "operator.backups.version.tak_terbaca",
};

const VARIAN_VERSI: Record<StatusVersi, "success" | "warning" | "danger"> = {
  mutakhir: "success",
  tertinggal: "warning",
  mendahului: "warning",
  menggantung: "danger",
  tak_terbaca: "danger",
};

/** Ukuran cadangan dalam satuan yang terbaca; `id-ID` untuk angkanya. */
function ukuran(bytes: number | null): string {
  if (bytes === null) return "—";
  const satuan = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < satuan.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n)} ${satuan[i]}`;
}

export default async function OperatorBackupsPage() {
  await requireOperatorPage();
  const t = await getT();

  const [runs, versions] = await Promise.all([backupRunsForOperator(20), schemaVersionsForOperator()]);
  const latest = runs?.[0] ?? null;
  const lastOffsite = runs?.find((r) => r.status === "ok") ?? null;
  const butuhTindakan = versions?.filter((v) => perluTindakan(v.status)).length ?? 0;

  const statusCadangan = (status: string) =>
    status === "ok"
      ? t("operator.backups.statusOk")
      : status === "local"
        ? t("operator.backups.statusLocal")
        : t("operator.backups.statusError");

  const runColumns: SaiColumns<OperatorBackupRun> = [
    {
      key: "finished",
      title: t("operator.backups.colFinished"),
      align: "left",
      render: (_v, r) => (
        <span style={{ ...CONSOLE_MUTED, whiteSpace: "nowrap" }}>{formatDateTime(r.finishedAt)}</span>
      ),
    },
    {
      key: "status",
      title: t("operator.backups.colStatus"),
      align: "left",
      render: (_v, r) => (
        <Badge variant={r.status === "ok" ? "success" : r.status === "local" ? "warning" : "danger"}>
          {statusCadangan(r.status)}
        </Badge>
      ),
    },
    {
      key: "size",
      title: t("operator.backups.colSize"),
      align: "right",
      render: (_v, r) => <span style={CONSOLE_TABULAR}>{ukuran(r.sizeBytes)}</span>,
    },
    {
      key: "artifact",
      title: t("operator.backups.colArtifact"),
      align: "left",
      render: (_v, r) => (
        <span style={{ ...CONSOLE_MUTED, wordBreak: "break-all", fontSize: "var(--ant-font-size-sm)" }}>
          {r.error ?? r.artifact ?? "—"}
        </span>
      ),
    },
  ];

  const versionColumns: SaiColumns<SchemaVersionRow> = [
    {
      key: "label",
      title: t("operator.backups.colDatabase"),
      align: "left",
      render: (_v, v) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 500 }}>
            {v.label}
            {!v.isActive && (
              <span style={{ ...CONSOLE_MUTED, fontWeight: 400 }}> · {t("operator.backups.inactive")}</span>
            )}
          </span>
          <span style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>{v.database}</span>
        </div>
      ),
    },
    {
      key: "latest",
      title: t("operator.backups.colLatest"),
      align: "left",
      render: (_v, v) => (
        <span style={CONSOLE_TABULAR}>
          {v.ringkasan?.terakhir ?? "—"}
          {v.ringkasan && v.ringkasan.terakhir !== v.diharapkan && (
            <span style={CONSOLE_MUTED}>
              {" "}
              ({t("operator.backups.expected", { name: v.diharapkan })})
            </span>
          )}
        </span>
      ),
    },
    {
      key: "applied",
      title: t("operator.backups.colApplied"),
      align: "right",
      render: (_v, v) => <span style={CONSOLE_TABULAR}>{v.ringkasan?.terapan ?? "—"}</span>,
    },
    {
      key: "status",
      title: t("operator.backups.colVersion"),
      align: "left",
      render: (_v, v) => (
        <Badge variant={VARIAN_VERSI[v.status]}>
          {t(LABEL_VERSI[v.status])}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t("operator.backups.heading")} description={t("operator.backups.description")} />
      <div style={CONSOLE_PAGE}>
        {/* ── Cadangan ─────────────────────────────────────────────────── */}
        {runs === null ? (
          <ConsoleNotice>{t("operator.backups.runsUnavailable")}</ConsoleNotice>
        ) : (
          <ConsolePanel
            title={t("operator.backups.runsHeading")}
            footnote={
              lastOffsite
                ? t("operator.backups.lastOffsite", { date: formatDateTime(lastOffsite.finishedAt) })
                : t("operator.backups.neverOffsite")
            }
            flush
          >
            {latest && latest.status !== "ok" && (
              <div style={{ padding: "var(--ant-padding-lg)", paddingBottom: 0 }}>
                <ConsoleNotice>
                  {latest.status === "local"
                    ? t("operator.backups.latestLocal")
                    : t("operator.backups.latestError")}
                </ConsoleNotice>
              </div>
            )}
            <StaticTable
              columns={runColumns}
              rows={runs}
              rowKey={(r) => r.id}
              empty={
                <EmptyState
                  icon={<CloudServerOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
                  title={t("operator.backups.runsEmpty")}
                />
              }
            />
          </ConsolePanel>
        )}

        {/* ── Versi skema ──────────────────────────────────────────────── */}
        {versions === null ? (
          <ConsoleNotice>{t("operator.backups.versionsUnavailable")}</ConsoleNotice>
        ) : (
          <ConsolePanel
            title={t("operator.backups.versionsHeading", {
              ok: versions.length - butuhTindakan,
              total: versions.length,
            })}
            footnote={t("operator.backups.versionsNote")}
            flush
          >
            <StaticTable columns={versionColumns} rows={versions} rowKey={(v) => v.database} />
          </ConsolePanel>
        )}
      </div>
    </div>
  );
}
