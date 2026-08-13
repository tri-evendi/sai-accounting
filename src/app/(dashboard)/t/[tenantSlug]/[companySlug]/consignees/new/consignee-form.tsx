"use client";

/**
 * Penerima Barang baru — dikonversi ke token Ant Design pada issue #196.
 * Kulitnya saja; mesin formulirnya (`FormData` + POST) tidak disentuh.
 *
 * Label kedua `Textarea` kini `Label` primitif ber-`htmlFor`, bukan `<label>`
 * bergaya kelas — pautannya sama, tapi warnanya ikut token dan ia tidak lagi
 * menyimpan kelas Tailwind sendiri.
 */

import { useState } from "react";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export function NewConsigneeForm() {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get("name"),
      country: formData.get("country"),
      contact: formData.get("contact"),
      address: formData.get("address"),
      notes: formData.get("notes"),
    };

    const res = await apiFetch("/api/consignees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("consignees.saveFailed"));
      setLoading(false);
    } else {
      router.push("/consignees");
      router.refresh();
    }
  }

  const half = { xs: 24, sm: 12 } as const;

  /** Isian berbaris banyak: label di atas, jarak sama dengan `Input`. */
  const textareaField = (id: string, label: string, rows: number) => (
    <Flex vertical gap={token.marginXXS}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={id} rows={rows} />
    </Flex>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("consignees.breadcrumb"), href: "/consignees" },
          { label: t("consignees.newTitle") },
        ]}
        title={t("consignees.newTitle")}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader><CardTitle level={2}>{t("consignees.dataTitle")}</CardTitle></CardHeader>
          <CardContent>
            <Row gutter={[token.margin, token.margin]}>
              <Col {...half}>
                <Input id="name" name="name" label={t("consignees.nameField")} required />
              </Col>
              <Col {...half}>
                <Input id="country" name="country" label={t("consignees.colCountry")} />
              </Col>
              <Col {...half}>
                <Input id="contact" name="contact" label={t("consignees.contactPic")} />
              </Col>
              <Col {...half}>{textareaField("address", t("common.address"), 3)}</Col>
              <Col {...half}>{textareaField("notes", t("common.notes"), 2)}</Col>
            </Row>
          </CardContent>
        </Card>

        <Flex wrap gap={token.marginSM}>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </Flex>
      </form>
    </div>
  );
}
