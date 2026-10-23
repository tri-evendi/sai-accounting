/**
 * `/login/authenticator` — PEMASANGAN AUTHENTICATOR WAJIB saat masuk.
 *
 * Dibuka dengan sesi PEMASANGAN (bukan sesi konsol), yang terbit ketika MFA
 * hidup, kata sandinya benar, dan akunnya belum terkonfirmasi untuk rahasia
 * yang berlaku (`lib/operator/enrolment.ts`). Satu-satunya halaman yang bisa
 * dibuka sesi itu (`enrolment-gate.ts` di proxy; penjaga halaman lain hanya
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
import { Flex } from "antd";
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
import { EnrolmentForm } from "./enrolment-form";

export const dynamic = "force-dynamic";

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
          <Flex vertical gap="large">
            <Flex vertical gap={4}>
              <Flex align="center" gap="small">
                <SafetyOutlined aria-hidden="true" style={{ fontSize: 20, color: "var(--ant-color-primary)" }} />
                <h1 style={{ margin: 0, fontSize: "var(--ant-font-size-heading-4)", fontWeight: 600 }}>
                  {t("operator.enrol.heading")}
                </h1>
              </Flex>
              <p style={CONSOLE_MUTED}>{t("operator.enrol.description", { name: enrolment.account })}</p>
            </Flex>

            <ol style={{ margin: 0, paddingInlineStart: "var(--ant-padding-lg)", lineHeight: 1.625 }}>
              <li>{t("operator.authenticator.step1")}</li>
              <li>{t("operator.authenticator.step2")}</li>
              <li>{t("operator.authenticator.step3")}</li>
            </ol>

            <Flex gap="large" wrap align="flex-start">
              <QrCode qr={enrolment.qr} label={t("operator.authenticator.qrLabel", { name: enrolment.account })} />
              <Flex vertical gap="small" style={{ flex: "1 1 200px", minWidth: 0 }}>
                <span style={CONSOLE_MUTED}>{t("operator.authenticator.manualEntry")}</span>
                <span>
                  {t("operator.authenticator.accountLabel")}: <code style={CODE}>{enrolment.account}</code>
                </span>
                <span>
                  {t("operator.accounts.credentialTotp")}: <code style={CODE}>{enrolment.secretGrouped}</code>
                </span>
                <span style={CONSOLE_MUTED}>{t("operator.authenticator.manualParams")}</span>
              </Flex>
            </Flex>

            <EnrolmentForm />

            <Flex justify="space-between" align="center" gap="small" wrap>
              <span style={CONSOLE_MUTED}>{t("operator.enrol.expiryNote")}</span>
              <form action={enrolmentCancel}>
                <Button type="submit" variant="ghost" size="sm">
                  {t("operator.enrol.cancel")}
                </Button>
              </form>
            </Flex>
          </Flex>
        </CardContent>
      </Card>
    </div>
  );
}
