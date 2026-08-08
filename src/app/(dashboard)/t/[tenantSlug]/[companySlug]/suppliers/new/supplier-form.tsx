"use client";

/**
 * Pemasok baru — dikonversi ke token Ant Design pada issue #196.
 * Kulitnya saja; mesin formulirnya (`FormData` + POST) tidak disentuh.
 */

import { useState } from "react";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export function NewSupplierForm() {
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
      address: formData.get("address"),
      phone: formData.get("phone"),
      email: formData.get("email"),
    };

    const res = await apiFetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("suppliers.saveFailed"));
      setLoading(false);
    } else {
      router.push("/suppliers");
      router.refresh();
    }
  }

  const half = { xs: 24, sm: 12 } as const;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("suppliers.breadcrumb"), href: "/suppliers" },
          { label: t("suppliers.newTitle") },
        ]}
        title={t("suppliers.newTitle")}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader><CardTitle>{t("suppliers.dataTitle")}</CardTitle></CardHeader>
          <CardContent>
            <Row gutter={[token.margin, token.margin]}>
              <Col {...half}>
                <Input id="name" name="name" label={t("suppliers.nameField")} required />
              </Col>
              <Col {...half}>
                <Input id="address" name="address" label={t("common.address")} />
              </Col>
              <Col {...half}>
                <Input id="phone" name="phone" label={t("common.phone")} />
              </Col>
              <Col {...half}>
                <Input id="email" name="email" type="email" label={t("common.email")} />
              </Col>
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
