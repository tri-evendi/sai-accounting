/**
 * KESIAPAN MFA — akun mana yang authenticator-nya sudah terkonfirmasi untuk
 * rahasia yang berlaku sekarang. Server component (tabel statis, tanpa JS).
 *
 * Ditampilkan di `/accounts` dan `/accounts/authenticator`. Sejak pemasangan
 * wajib saat masuk (`lib/operator/enrolment.ts`), tabel ini bukan lagi syarat
 * mencabut `OPERATOR_MFA=off`: akun yang belum terkonfirmasi dipandu memasang
 * di login berikutnya. Gunanya kini: melihat siapa yang belum, dan siapa yang
 * rahasianya berganti. Layar ini tidak pernah mengubah env (PRODUCTION.md).
 */
import { Badge } from "@sai/ui/badge";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { getT } from "@sai/platform/i18n/server";
import { formatDateTime } from "@sai/core/utils";
import {
  ConsoleNotice,
  ConsolePanel,
  CONSOLE_MUTED,
  CONSOLE_TABULAR,
} from "@op/components/operator/console-ui";
import type { AuthenticatorReadinessRow } from "@op/lib/operator/authenticator";

export async function AuthenticatorReadinessTable({ rows }: { rows: AuthenticatorReadinessRow[] }) {
  const t = await getT();
  const columns: SaiColumns<AuthenticatorReadinessRow> = [
    {
      key: "name",
      title: t("operator.accounts.colName"),
      align: "left",
      render: (_v, row) => <span style={{ fontWeight: 500 }}>{row.name}</span>,
    },
    {
      key: "source",
      title: t("operator.authenticator.colSource"),
      align: "left",
      render: (_v, row) => (
        <span style={CONSOLE_MUTED}>
          {t(row.source === "env" ? "operator.authenticator.sourceEnv" : "operator.authenticator.sourceDb")}
        </span>
      ),
    },
    {
      key: "state",
      title: t("operator.accounts.colStatus"),
      align: "left",
      /* Teks di dalam lencana, bukan warna saja (MASTER.md). */
      render: (_v, row) =>
        row.state === "confirmed" ? (
          <Badge variant="success">{t("operator.authenticator.stateConfirmed")}</Badge>
        ) : row.state === "stale" ? (
          <Badge variant="warning">{t("operator.authenticator.stateStale")}</Badge>
        ) : (
          <Badge variant="outline">{t("operator.authenticator.stateMissing")}</Badge>
        ),
    },
    {
      key: "at",
      title: t("operator.authenticator.colConfirmedAt"),
      align: "left",
      render: (_v, row) => (
        <span style={{ ...CONSOLE_MUTED, ...CONSOLE_TABULAR }}>
          {row.confirmedAt ? formatDateTime(row.confirmedAt) : "—"}
        </span>
      ),
    },
  ];
  return (
    <StaticTable
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.source}:${row.name}`}
      empty={<p style={{ ...CONSOLE_MUTED, padding: "var(--ant-padding-lg)" }}>—</p>}
    />
  );
}

/**
 * Panel kesiapan lengkap. `rows === null` = salah satu bidang data tak
 * terjangkau → kalimat, bukan tabel kosong yang terbaca "belum ada yang siap".
 */
export async function AuthenticatorReadinessPanel({
  rows,
  mfaOff,
}: {
  rows: AuthenticatorReadinessRow[] | null;
  mfaOff: boolean;
}) {
  const t = await getT();
  return (
    <ConsolePanel
      title={t("operator.authenticator.readinessHeading")}
      description={t(mfaOff ? "operator.authenticator.readinessOff" : "operator.authenticator.readinessOn")}
      flush={rows !== null}
    >
      {rows === null ? (
        <ConsoleNotice>{t("operator.authenticator.readinessUnavailable")}</ConsoleNotice>
      ) : (
        <AuthenticatorReadinessTable rows={rows} />
      )}
    </ConsolePanel>
  );
}
