/**
 * `/operator/deletions` — PERMINTAAN PENGHAPUSAN AKUN lintas tenant (UU PDP).
 *
 * Eksekusinya tetap di halaman tenant masing-masing (gerbang ketik-ulang slug
 * #142); halaman ini menjawab "permintaan mana yang menunggu tindakan" tanpa
 * membuka tenant satu per satu. Yang tenggangnya SUDAH lewat ditandai paling
 * keras: itulah permintaan pemilik yang sedang menunggu kita.
 */
import Link from "next/link";

import { Badge } from "@sai/ui/badge";
import { EmptyState } from "@sai/ui/empty-state";
import { PageHeader } from "@sai/ui/page-header";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { ConsolePanel, CONSOLE_MUTED } from "@op/components/operator/console-ui";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { deletionRequestsForOperator, type OperatorDeletionRequest } from "@op/lib/operator/store";
import { executionVerdict } from "@sai/core/tenant-deletion";
import { getT } from "@sai/platform/i18n/server";
import { formatDateMedium as formatDate } from "@sai/core/utils";

export const dynamic = "force-dynamic";

export default async function OperatorDeletionsPage() {
  await requireOperatorPage();
  const t = await getT();
  const rows = await deletionRequestsForOperator();
  const now = new Date();

  const columns: SaiColumns<OperatorDeletionRequest> = [
    {
      key: "tenant",
      title: t("operator.tenants.colName"),
      align: "left",
      render: (_v, r) => (
        <Link href={`/operator/tenants/${r.tenantId}`} style={{ color: "var(--ant-color-link)", fontWeight: 500 }}>
          {r.tenantName}
        </Link>
      ),
    },
    {
      key: "status",
      title: t("operator.deletions.colStatus"),
      align: "left",
      render: (_v, r) => {
        if (r.status === "executed") return <Badge variant="outline">{t("operator.deletions.executed")}</Badge>;
        if (r.status === "cancelled") return <span style={CONSOLE_MUTED}>{t("operator.deletions.cancelled")}</span>;
        return executionVerdict({ status: r.status, graceEndsAt: r.graceEndsAt }, now) === "executable" ? (
          <Badge variant="danger">{t("operator.deletions.ready")}</Badge>
        ) : (
          <Badge variant="warning">{t("operator.deletions.grace")}</Badge>
        );
      },
    },
    {
      key: "requested",
      title: t("operator.deletions.colRequested"),
      align: "left",
      render: (_v, r) => <span style={CONSOLE_MUTED}>{formatDate(r.createdAt)}</span>,
    },
    {
      key: "grace",
      title: t("operator.deletions.colGrace"),
      align: "left",
      render: (_v, r) => formatDate(r.graceEndsAt),
    },
    {
      key: "retention",
      title: t("operator.deletions.colRetention"),
      align: "left",
      render: (_v, r) => <span style={CONSOLE_MUTED}>{r.retentionUntil ? formatDate(r.retentionUntil) : "—"}</span>,
    },
  ];

  const menunggu = rows.filter(
    (r) => r.status === "pending" && executionVerdict({ status: r.status, graceEndsAt: r.graceEndsAt }, now) === "executable"
  ).length;

  return (
    <div>
      <PageHeader
        title={`${t("operator.deletions.heading")} (${rows.length})`}
        description={t("operator.deletions.description", { ready: menunggu })}
      />
      <ConsolePanel flush>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title={t("operator.deletions.empty")} />}
        />
      </ConsolePanel>
    </div>
  );
}
