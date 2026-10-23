/**
 * `/login/authenticator` — PEMASANGAN AUTHENTICATOR WAJIB saat masuk.
 *
 * Dibuka dengan sesi PEMASANGAN (bukan sesi konsol), yang terbit ketika MFA
 * hidup, kata sandinya benar, dan akunnya belum terkonfirmasi untuk rahasia
 * yang berlaku (`lib/operator/enrolment.ts`). Satu-satunya halaman yang bisa
 * dibuka sesi itu (`lib/console-gate.ts` di proxy; penjaga halaman lain hanya
 * membaca cookie sesi konsol).
 *
 * SENGAJA tanpa `requireOperatorPage()` — pemanggilnya belum bersesi konsol.
 * Pengecualian ini terdaftar di tests/authz-coverage.test.ts; halaman menjaga
 * dirinya lewat `operatorPlaneViolation()` + verifikasi token pemasangan.
 *
 * Rahasia + QR dirender di server ke orang yang baru saja membuktikan kata
 * sandinya. `Cache-Control: no-store` untuk jalur ini di `next.config.ts`.
 */
import { notFound, redirect } from "next/navigation";
import { SafetyOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { Card, CardContent } from "@sai/ui/card";
import { controlDb } from "@sai/core/control-db";
import { getT } from "@sai/platform/i18n/server";
import { CONSOLE_MUTED } from "@op/components/operator/console-ui";
import { QrCode } from "@op/components/operator/qr-code";
import { readAuthenticatorConfirmationsFor } from "@op/lib/operator/audit";
import { enrolmentFor } from "@op/lib/operator/authenticator";
import { resolveEnrolment } from "@op/lib/operator/enrolment";
import { operatorPlaneViolation, optionalOperatorSession } from "@op/lib/operator/guard";
import { findDbOperatorCredential } from "@op/lib/operator/operator-accounts";
import { verifyEnrolmentToken } from "@op/lib/operator/session";
import { readEnrolmentCookie } from "@op/lib/operator/session-cookies";

import { enrolmentCancel } from "./actions";
import { OperatorEnrolmentForm } from "../login-form";

export const dynamic = "force-dynamic";

const COLUMN: React.CSSProperties = { display: "flex", flexDirection: "column" };

const CODE: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  wordBreak: "break-all",
  userSelect: "all",
};

export default async function OperatorEnrolmentPage() {
  if ((await operatorPlaneViolation()) !== null) notFound();
  if (await optionalOperatorSession()) redirect("/");

  const payload = verifyEnrolmentToken(await readEnrolmentCookie());
  if (!payload) redirect("/login");
  const context = await resolveEnrolment(
    {
      findDbAccount: (name) => findDbOperatorCredential({ control: controlDb }, name),
      readConfirmations: readAuthenticatorConfirmationsFor,
    },
    payload
  );
  if (!context) redirect("/login");

  const t = await getT();
  const enrolment = enrolmentFor(context.account.name, context.secret);

  return (
    <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", padding: "40px 0" }}>
      <Card>
        <CardContent>
          <div style={{ ...COLUMN, gap: "var(--ant-margin-lg)" }}>
            <div style={{ ...COLUMN, gap: "var(--ant-margin-xxs)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--ant-margin-xs)" }}>
                <SafetyOutlined aria-hidden="true" style={{ fontSize: 20, color: "var(--ant-color-primary)" }} />
                <h1 style={{ margin: 0, fontSize: "var(--ant-font-size-heading-4)", fontWeight: 600 }}>
                  {t("operator.enrol.heading")}
                </h1>
              </div>
              <p style={CONSOLE_MUTED}>{t("operator.enrol.description", { name: enrolment.account })}</p>
            </div>

            <ol style={{ margin: 0, paddingInlineStart: "var(--ant-padding-lg)", lineHeight: 1.625 }}>
              <li>{t("operator.authenticator.step1")}</li>
              <li>{t("operator.authenticator.step2")}</li>
              <li>{t("operator.authenticator.step3")}</li>
            </ol>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "var(--ant-margin-lg)" }}>
              <QrCode qr={enrolment.qr} label={t("operator.authenticator.qrLabel", { name: enrolment.account })} />
              <div style={{ ...COLUMN, gap: "var(--ant-margin-xs)", flex: "1 1 200px", minWidth: 0 }}>
                <span style={CONSOLE_MUTED}>{t("operator.authenticator.manualEntry")}</span>
                <span>
                  {t("operator.authenticator.accountLabel")}: <code style={CODE}>{enrolment.account}</code>
                </span>
                <span>
                  {t("operator.accounts.credentialTotp")}: <code style={CODE}>{enrolment.secretGrouped}</code>
                </span>
                <span style={CONSOLE_MUTED}>{t("operator.authenticator.manualParams")}</span>
              </div>
            </div>

            <OperatorEnrolmentForm />

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "var(--ant-margin-xs)" }}>
              <span style={CONSOLE_MUTED}>{t("operator.enrol.expiryNote")}</span>
              <form action={enrolmentCancel}>
                <Button type="submit" variant="ghost" size="sm">
                  {t("operator.enrol.cancel")}
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
