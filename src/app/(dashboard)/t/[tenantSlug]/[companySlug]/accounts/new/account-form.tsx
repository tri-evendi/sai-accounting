"use client";

/**
 * Akun Baru — dikonversi ke token Ant Design pada issue #196.
 *
 * Kulitnya saja yang berubah; mesin formulirnya (state lokal + POST) tidak
 * disentuh. Pemilih induk sengaja tetap `Select` datar, bukan `TreeSelect`:
 * lihat catatan panjang di `journal/new/journal-form.tsx`, yang mengukur
 * pilihan itu untuk kedua permukaan sekaligus.
 */

import { useEffect, useState } from "react";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ACCOUNT_TYPES } from "@/lib/accounting";
import { useT } from "@/lib/i18n/client";
import { useDictionary } from "@/lib/i18n/client";
import { accountTypeLabels } from "@/lib/i18n/labels";
import { CURRENCIES } from "@/lib/constants";
import { apiFetch } from "@/lib/api-fetch";

interface AccountOption {
  id: number;
  code: string;
  name: string;
}

export function NewAccountForm() {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const typeLabels = accountTypeLabels(useDictionary());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parents, setParents] = useState<AccountOption[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: ACCOUNT_TYPES[0].value,
    parentId: "",
    currency: "IDR",
  });

  useEffect(() => {
    apiFetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AccountOption[]) => setParents(data))
      .catch(() => setParents([]));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await apiFetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        name: form.name,
        type: form.type,
        currency: form.currency,
        parentId: form.parentId ? Number(form.parentId) : null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("accounts.createFailed"));
      setLoading(false);
    } else {
      router.push("/accounts");
      router.refresh();
    }
  }

  /** Satu isian per kolom; `sm:grid-cols-2` lama menjadi `Col` yang membungkus. */
  const half = { xs: 24, sm: 12 } as const;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("accounts.breadcrumbChart"), href: "/accounts" },
          { label: t("accounts.newTitle") },
        ]}
        title={t("accounts.newTitle")}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <CardTitle>{t("accounts.infoTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row gutter={[token.margin, token.margin]}>
              <Col {...half}>
                <Input
                  id="code"
                  label={t("accounts.codeField")}
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder={t("accounts.codePlaceholder")}
                />
              </Col>
              <Col {...half}>
                <Input
                  id="name"
                  label={t("accounts.nameField")}
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("accounts.namePlaceholder")}
                />
              </Col>
              <Col {...half}>
                <Select
                  id="type"
                  label={t("accounts.typeField")}
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  options={ACCOUNT_TYPES.map((type) => ({ value: type.value, label: typeLabels[type.value] }))}
                />
              </Col>
              <Col {...half}>
                <Select
                  id="parentId"
                  label={t("accounts.parentField")}
                  value={form.parentId}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                  options={[
                    { value: "", label: t("accounts.noParent") },
                    ...parents.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
                  ]}
                />
              </Col>
              <Col {...half}>
                <Select
                  id="currency"
                  label={t("common.currency")}
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                />
              </Col>
            </Row>
          </CardContent>
        </Card>

        <Flex wrap gap={token.marginSM}>
          <Button type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("accounts.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </Flex>
      </form>
    </div>
  );
}
