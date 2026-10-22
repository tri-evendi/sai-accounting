/**
 * `/accounts/authenticator` — PASANG AUTHENTICATOR untuk akun yang sedang
 * masuk: lihat QR (sesudah bukti ulang), pindai, konfirmasi dengan satu kode.
 *
 * Halaman ini yang membuat `OPERATOR_MFA=off` bisa dicabut tanpa mengunci
 * pemiliknya: setiap operator memasang faktor keduanya sendiri, lalu tabel
 * kesiapan di bawah menunjukkan kapan semuanya siap. Runbook lengkapnya di
 * docs/PRODUCTION.md §Konsol operator.
 *
 * `Cache-Control: no-store` dipasang untuk jalur ini di `next.config.ts`:
 * halaman ini sendiri tidak memuat rahasia (rahasia hanya datang sebagai
 * jawaban server action), tetapi jalur yang dikenal sebagai "tempat QR"
 * tidak boleh punya salinan di cache mana pun.
 */
import { ConsoleNotice, ConsolePanel, CONSOLE_PAGE } from "@op/components/operator/console-ui";
import { AuthenticatorReadinessPanel } from "@op/components/operator/authenticator-readiness";
import { AuthenticatorSetup } from "@op/components/operator/authenticator-setup";
import { PageHeader } from "@sai/ui/page-header";
import { getT } from "@sai/platform/i18n/server";
import { operatorMfaOff } from "@op/lib/operator/credentials";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { loadAuthenticatorReadiness } from "@op/lib/operator/authenticator-status";
import { Badge } from "@sai/ui/badge";
import { formatDateTime } from "@sai/core/utils";

import { authenticatorConfirm, authenticatorReveal } from "./actions";

export const dynamic = "force-dynamic";

export default async function OperatorAuthenticatorPage() {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const mfaOff = operatorMfaOff();
  const readiness = await loadAuthenticatorReadiness();
  const mine = readiness?.find(
    (r) => r.source === operator.source && r.name.toLowerCase() === operator.name.toLowerCase()
  );

  return (
    <div>
      <PageHeader
        title={t("operator.authenticator.heading")}
        description={t("operator.authenticator.description")}
        breadcrumbs={[
          { label: t("operator.accounts.heading"), href: "/accounts" },
          { label: t("operator.authenticator.heading") },
        ]}
      />
      <div style={CONSOLE_PAGE}>
        {mfaOff && <ConsoleNotice>{t("operator.authenticator.mfaOffNotice")}</ConsoleNotice>}

        <ConsolePanel
          title={t("operator.authenticator.setupHeading", { name: operator.name })}
          actions={
            mine ? (
              mine.state === "confirmed" ? (
                <Badge variant="success">
                  {t("operator.authenticator.stateConfirmed")}
                  {mine.confirmedAt ? ` · ${formatDateTime(mine.confirmedAt)}` : ""}
                </Badge>
              ) : mine.state === "stale" ? (
                <Badge variant="warning">{t("operator.authenticator.stateStale")}</Badge>
              ) : (
                <Badge variant="outline">{t("operator.authenticator.stateMissing")}</Badge>
              )
            ) : undefined
          }
          footnote={t(
            operator.source === "env" ? "operator.authenticator.envRotate" : "operator.authenticator.dbRotateNote"
          )}
        >
          <AuthenticatorSetup
            mfaOff={mfaOff}
            canRotate={operator.source === "db"}
            reveal={authenticatorReveal}
            confirm={authenticatorConfirm}
          />
        </ConsolePanel>

        <AuthenticatorReadinessPanel rows={readiness} mfaOff={mfaOff} />
      </div>
    </div>
  );
}
