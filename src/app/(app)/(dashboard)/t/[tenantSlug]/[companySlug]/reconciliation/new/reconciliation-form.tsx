"use client";

/**
 * Rekonsiliasi baru — periode & saldo awal/akhir rekening koran (issue #24).
 *
 * Dikonversi ke token Ant Design pada issue #197: kulitnya saja. Muatan POST
 * dan penanganan galat servernya tidak disentuh.
 */
import { useState } from "react";
import { Alert, Col, Flex, Row, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export function NewReconciliationForm() {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const body = {
      cashType: "bank",
      currency: form.get("currency"),
      periodStart: form.get("periodStart"),
      periodEnd: form.get("periodEnd"),
      openingBalance: Number(form.get("openingBalance")) || 0,
      closingBalance: Number(form.get("closingBalance")) || 0,
      note: form.get("note") || undefined,
    };

    const res = await apiFetch("/api/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail = data.details?.fieldErrors;
      const fieldMsg = detail ? Object.values(detail).flat().filter(Boolean)[0] : null;
      setError(String(fieldMsg || data.error || t("reconciliation.createFailed")));
      setLoading(false);
    } else {
      const created = await res.json();
      router.push(`/reconciliation/${created.id}`);
      router.refresh();
    }
  }

  const today = new Date().toISOString().split("T")[0];
  /** Saldo adalah nominal — rata kanan + tabular-nums, seperti kolom uang. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reconciliation.title"), href: "/reconciliation" },
          { label: t("reconciliation.newTitle") },
        ]}
        title={t("reconciliation.newTitle")}
        description={t("reconciliation.newDescription")}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <CardTitle level={2}>{t("reconciliation.accountPeriodTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row gutter={[token.margin, token.margin]}>
              <Col xs={24} sm={12}>
                <Select
                  id="currency"
                  name="currency"
                  label={t("reconciliation.currencyField")}
                  defaultValue="IDR"
                  options={[
                    { value: "IDR", label: t("reconciliation.currencyIdrOption") },
                    { value: "USD", label: "USD" },
                    { value: "CNY", label: "CNY" },
                  ]}
                />
              </Col>
              <Col xs={24} sm={12}>
                <Flex align="flex-end" style={{ height: "100%" }}>
                  <Flex align="flex-start" gap={token.marginXXS}>
                    <InfoCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSize, flexShrink: 0, marginTop: 2 }} />
                    <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      {t("reconciliation.oneAccountHint")}
                    </Typography.Text>
                  </Flex>
                </Flex>
              </Col>

              <Col xs={24} sm={12}>
                <Input
                  id="periodStart"
                  name="periodStart"
                  type="date"
                  label={t("reconciliation.periodStart")}
                  defaultValue={today}
                  required
                />
              </Col>
              <Col xs={24} sm={12}>
                <Input
                  id="periodEnd"
                  name="periodEnd"
                  type="date"
                  label={t("reconciliation.periodEnd")}
                  defaultValue={today}
                  required
                />
              </Col>

              <Col xs={24} sm={12}>
                <Input
                  id="openingBalance"
                  name="openingBalance"
                  type="number"
                  step="0.01"
                  style={numberStyle}
                  label={t("reconciliation.openingField")}
                  defaultValue="0"
                />
              </Col>
              <Col xs={24} sm={12}>
                <Input
                  id="closingBalance"
                  name="closingBalance"
                  type="number"
                  step="0.01"
                  style={numberStyle}
                  label={t("reconciliation.closingField")}
                  defaultValue="0"
                />
              </Col>

              <Col xs={24}>
                <Input id="note" name="note" label={t("common.notesOptional")} />
              </Col>
            </Row>
          </CardContent>
        </Card>

        <Flex wrap gap={token.marginSM}>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("reconciliation.submitNew")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/reconciliation")}>
            {t("common.cancel")}
          </Button>
        </Flex>
      </form>
    </div>
  );
}
