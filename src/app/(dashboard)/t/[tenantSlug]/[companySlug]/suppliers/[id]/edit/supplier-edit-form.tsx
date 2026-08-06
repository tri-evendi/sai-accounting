"use client";

/**
 * Ubah Pemasok — dikonversi ke token Ant Design pada issue #196.
 * Kulitnya saja; mesin formulirnya (state lokal + PUT) tidak disentuh.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export function EditSupplierForm() {
  const router = useAppRouter();
  const params = useParams();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", address: "", phone: "", email: "", isActive: true });

  useEffect(() => {
    apiFetch(`/api/suppliers/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error(t("suppliers.loadFailed"));
        return res.json();
      })
      .then((data) => {
        setForm({
          name: data.name || "",
          address: data.address || "",
          phone: data.phone || "",
          email: data.email || "",
          isActive: data.isActive !== false,
        });
        setFetching(false);
      })
      .catch((err) => {
        setError(err.message);
        setFetching(false);
      });
  }, [params.id, t]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await apiFetch(`/api/suppliers/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("suppliers.updateFailed"));
      setLoading(false);
    } else {
      router.push(`/suppliers/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message={t("suppliers.loading")} />;

  const half = { xs: 24, sm: 12 } as const;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("suppliers.breadcrumb"), href: "/suppliers" },
          { label: t("suppliers.editTitle") },
        ]}
        title={t("suppliers.editTitle")}
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
                <Input id="name" label={t("suppliers.nameField")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Col>
              <Col {...half}>
                <Input id="address" label={t("common.address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Col>
              <Col {...half}>
                <Input id="phone" label={t("common.phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Col>
              <Col {...half}>
                <Input id="email" type="email" label={t("common.email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Col>
              {/* Nonaktif lewat DELETE sudah lama ada; tanpa toggle ini tidak
                  ada layar yang bisa MENGAKTIFKAN kembali (audit 2026-07). */}
              <Col {...half}>
                <label
                  htmlFor="isActive"
                  style={{
                    display: "flex",
                    cursor: "pointer",
                    alignItems: "flex-start",
                    gap: token.marginXS,
                  }}
                >
                  <Checkbox
                    id="isActive"
                    style={{ marginTop: token.marginXXS / 2 }}
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm({ ...form, isActive: v === true })}
                  />
                  <span>
                    {t("common.active")}
                    <span
                      style={{
                        display: "block",
                        fontSize: token.fontSizeSM,
                        color: token.colorTextSecondary,
                      }}
                    >
                      {t("suppliers.activeHint")}
                    </span>
                  </span>
                </label>
              </Col>
            </Row>
          </CardContent>
        </Card>

        <Flex wrap gap={token.marginSM}>
          <Button type="submit" disabled={loading}>{loading ? t("common.saving") : t("common.save")}</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>{t("common.cancel")}</Button>
        </Flex>
      </form>
    </div>
  );
}
