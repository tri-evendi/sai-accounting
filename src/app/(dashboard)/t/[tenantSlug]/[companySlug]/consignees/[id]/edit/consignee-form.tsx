"use client";

/**
 * Ubah Penerima Barang — dikonversi ke token Ant Design pada issue #196.
 * Kulitnya saja; mesin formulirnya (state lokal + PUT) tidak disentuh.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export function EditConsigneeForm() {
  const router = useAppRouter();
  const params = useParams();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    country: "",
    contact: "",
    address: "",
    notes: "",
    isActive: true,
  });

  useEffect(() => {
    apiFetch(`/api/consignees/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error(t("consignees.loadFailed"));
        return res.json();
      })
      .then((data) => {
        setForm({
          name: data.name || "",
          country: data.country || "",
          contact: data.contact || "",
          address: data.address || "",
          notes: data.notes || "",
          isActive: Boolean(data.isActive),
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

    const res = await apiFetch(`/api/consignees/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("consignees.updateFailed"));
      setLoading(false);
    } else {
      router.push(`/consignees/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message={t("consignees.loading")} />;

  const half = { xs: 24, sm: 12 } as const;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("consignees.breadcrumb"), href: "/consignees" },
          { label: t("consignees.editTitle") },
        ]}
        title={t("consignees.editTitle")}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <CardTitle>{t("consignees.dataTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row gutter={[token.margin, token.margin]}>
              <Col {...half}>
                <Input id="name" label={t("consignees.nameField")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Col>
              <Col {...half}>
                <Input id="country" label={t("consignees.colCountry")} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </Col>
              <Col {...half}>
                <Input id="contact" label={t("consignees.contactPic")} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </Col>
              <Col {...half}>
                <Flex vertical gap={token.marginXXS}>
                  <Label htmlFor="address">{t("common.address")}</Label>
                  <Textarea
                    id="address"
                    rows={3}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Flex>
              </Col>
              <Col {...half}>
                <Flex vertical gap={token.marginXXS}>
                  <Label htmlFor="notes">{t("common.notes")}</Label>
                  <Textarea
                    id="notes"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </Flex>
              </Col>
              {/* Penerima DINONAKTIFKAN, bukan dihapus — sakelar ini satu-satunya
                  jalan mengaktifkannya kembali. */}
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
                      {t("consignees.activeHint")}
                    </span>
                  </span>
                </label>
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
