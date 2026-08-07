"use client";

/**
 * Ubah Pelanggan — dikonversi ke token Ant Design pada issue #196.
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

export function EditCustomerForm() {
  const router = useAppRouter();
  const params = useParams();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    pic: "",
    npwp: "",
    taxExempt: false,
    isActive: true,
  });

  useEffect(() => {
    apiFetch(`/api/customers/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error(t("customers.loadFailed"));
        return res.json();
      })
      .then((data) => {
        setForm({
          name: data.name || "",
          address: data.address || "",
          phone: data.phone || "",
          email: data.email || "",
          pic: data.pic || "",
          npwp: data.npwp || "",
          taxExempt: Boolean(data.taxExempt),
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

    const res = await apiFetch(`/api/customers/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("customers.updateFailed"));
      setLoading(false);
    } else {
      router.push(`/customers/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message={t("customers.loading")} />;

  const half = { xs: 24, sm: 12 } as const;

  /** Sakelar boolean berlabel + keterangan — dua di formulir ini. */
  const toggle = (
    id: string,
    checked: boolean,
    onChange: (value: boolean) => void,
    label: string,
    hint: string
  ) => (
    <label
      htmlFor={id}
      style={{
        display: "flex",
        cursor: "pointer",
        alignItems: "flex-start",
        gap: token.marginXS,
      }}
    >
      <Checkbox
        id={id}
        style={{ marginTop: token.marginXXS / 2 }}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>
        {label}
        <span
          style={{
            display: "block",
            fontSize: token.fontSizeSM,
            color: token.colorTextSecondary,
          }}
        >
          {hint}
        </span>
      </span>
    </label>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("customers.breadcrumb"), href: "/customers" }, { label: t("customers.editTitle") }]}
        title={t("customers.editTitle")}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader><CardTitle>{t("customers.dataTitle")}</CardTitle></CardHeader>
          <CardContent>
            <Row gutter={[token.margin, token.margin]}>
              <Col {...half}>
                <Input id="name" label={t("customers.nameField")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
              <Col {...half}>
                <Input id="pic" label={t("customers.pic")} value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} />
              </Col>
              <Col {...half}>
                <Input id="npwp" label={t("customers.npwp")} value={form.npwp} onChange={(e) => setForm({ ...form, npwp: e.target.value })} />
              </Col>
              <Col {...half}>
                {toggle(
                  "taxExempt",
                  form.taxExempt,
                  (v) => setForm({ ...form, taxExempt: v }),
                  t("customers.taxExemptLabel"),
                  t("customers.taxExemptHint")
                )}
              </Col>
              {/* Nonaktif lewat DELETE sudah lama ada; tanpa toggle ini tidak
                  ada layar yang bisa MENGAKTIFKAN kembali (audit 2026-07). */}
              <Col {...half}>
                {toggle(
                  "isActive",
                  form.isActive,
                  (v) => setForm({ ...form, isActive: v }),
                  t("common.active"),
                  t("customers.activeHint")
                )}
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
