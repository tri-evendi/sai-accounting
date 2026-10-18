/**
 * `/accounts` — AKUN OPERATOR (migration kendali 0004).
 *
 * Semua operator boleh MELIHAT daftar ini (siapa yang memegang kunci konsol
 * bukan rahasia di antara pemegangnya); hanya `owner` yang mengubahnya —
 * ditegakkan di action, layar hanya menyembunyikan tombolnya.
 *
 * Akun ENV (`OPERATOR_USERS`) dipajang terpisah dan hanya-baca: ia akun
 * darurat yang sengaja tidak bisa diubah dari layar — kalau bisa, satu sesi
 * owner yang dicuri bisa mencabut jalan masuk darurat itu sendiri.
 */
import { ConsoleNotice, ConsolePanel, CONSOLE_PAGE } from "@op/components/operator/console-ui";
import { OperatorAccounts, type OperatorAccountView } from "@op/components/operator/operator-accounts";
import { PageHeader } from "@sai/ui/page-header";
import { controlDb } from "@sai/core/control-db";
import { getT } from "@sai/platform/i18n/server";
import { parseOperatorAccounts } from "@op/lib/operator/credentials";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { listOperatorAccounts } from "@op/lib/operator/operator-accounts";
import { operatorCan } from "@op/lib/operator/roles";
import { encryptionKeyAvailable } from "@sai/core/settings-crypto";
import { formatDateTime } from "@sai/core/utils";

import { operatorCreateAccount, operatorUpdateAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function OperatorAccountsPage() {
  const { operator } = await requireOperatorPage();
  const t = await getT();

  let rows: OperatorAccountView[] | null;
  try {
    rows = (await listOperatorAccounts({ control: controlDb })).map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      isActive: r.isActive,
      lastLoginLabel: r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "—",
      createdBy: r.createdBy,
    }));
  } catch (error) {
    console.error("[operator-accounts] daftar akun tak terbaca:", error);
    rows = null;
  }
  const envNames = parseOperatorAccounts(process.env.OPERATOR_USERS).map((a) => a.name);
  const canManage = operatorCan(operator.role, "operator.accounts");

  return (
    <div>
      <PageHeader title={t("operator.accounts.heading")} description={t("operator.accounts.description")} />
      <div style={CONSOLE_PAGE}>
        {!canManage && <ConsoleNotice>{t("operator.accounts.readOnly")}</ConsoleNotice>}
        {canManage && !encryptionKeyAvailable() && (
          <ConsoleNotice>{t("operator.accounts.keyMissing")}</ConsoleNotice>
        )}

        {rows === null ? (
          <ConsoleNotice>{t("operator.accounts.unavailable")}</ConsoleNotice>
        ) : (
          <ConsolePanel title={t("operator.accounts.dbHeading")} footnote={t("operator.accounts.rolesNote")}>
            <OperatorAccounts
              rows={rows}
              currentName={operator.name}
              canManage={canManage}
              create={operatorCreateAccount}
              update={operatorUpdateAccount}
            />
          </ConsolePanel>
        )}

        <ConsolePanel title={t("operator.accounts.envHeading")} footnote={t("operator.accounts.envNote")}>
          <p style={{ margin: 0 }}>{envNames.length > 0 ? envNames.join(", ") : "—"}</p>
        </ConsolePanel>
      </div>
    </div>
  );
}
