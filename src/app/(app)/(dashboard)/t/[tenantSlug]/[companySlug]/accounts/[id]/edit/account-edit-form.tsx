"use client";

/**
 * Ubah Akun — dikonversi ke token Ant Design pada issue #196.
 *
 * Kulitnya saja yang berubah; mesin formulirnya (state lokal + PUT) tidak
 * disentuh. Isian "Status" tetap ada dan tetap `Aktif`/`Nonaktif`: akun yang
 * pernah disebut baris jurnal TIDAK dihapus, ia dinonaktifkan — dan layar ini
 * satu-satunya tempat yang bisa MENGAKTIFKANNYA kembali.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/loading";
import { ACCOUNT_TYPES, EXPENSE_NATURES, acceptsExpenseNature } from "@/lib/accounting";
import { useDictionary, useT } from "@/lib/i18n/client";
import { accountTypeLabels, expenseNatureLabels } from "@/lib/i18n/labels";
import { CURRENCIES } from "@/lib/constants";
import { apiFetch } from "@/lib/api-fetch";

interface AccountOption {
  id: number;
  code: string;
  name: string;
}

interface AccountData {
  code: string;
  name: string;
  type: string;
  parentId: number | null;
  currency: string;
  expenseNature: string | null;
  isActive: boolean;
}

export function EditAccountForm() {
  const router = useAppRouter();
  const params = useParams<{ id: string }>();
  const t = useT();
  const { token } = theme.useToken();
  const typeLabels = accountTypeLabels(useDictionary());
  const natureLabels = expenseNatureLabels(useDictionary());
  const id = params.id;

  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parents, setParents] = useState<AccountOption[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: ACCOUNT_TYPES[0].value,
    parentId: "",
    currency: "IDR",
    expenseNature: "",
    isActive: "true",
  });

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/accounts/${id}`).then((r) => (r.ok ? r.json() : null)),
      apiFetch("/api/accounts").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([acc, all]: [AccountData | null, AccountOption[]]) => {
        if (acc) {
          setForm({
            code: acc.code,
            name: acc.name,
            type: acc.type,
            parentId: acc.parentId ? String(acc.parentId) : "",
            currency: acc.currency,
            expenseNature: acc.expenseNature ?? "",
            isActive: acc.isActive ? "true" : "false",
          });
        }
        setParents(all.filter((p) => String(p.id) !== String(id)));
        setFetching(false);
      })
      .catch(() => {
        setError(t("accounts.loadFailed"));
        setFetching(false);
      });
  }, [id, t]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await apiFetch(`/api/accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        name: form.name,
        type: form.type,
        currency: form.currency,
        parentId: form.parentId ? Number(form.parentId) : null,
        // "" berarti belum ditetapkan — dikirim null, bukan string kosong.
        expenseNature: form.expenseNature || null,
        isActive: form.isActive === "true",
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("accounts.updateFailed"));
      setLoading(false);
    } else {
      router.push("/accounts");
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message={t("accounts.loading")} />;

  /** Satu isian per kolom; `sm:grid-cols-2` lama menjadi `Col` yang membungkus. */
  const half = { xs: 24, sm: 12 } as const;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("accounts.breadcrumbChart"), href: "/accounts" },
          { label: t("accounts.editTitle") },
        ]}
        title={t("accounts.editTitle")}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <CardTitle level={2}>{t("accounts.infoTitle")}</CardTitle>
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
                />
              </Col>
              <Col {...half}>
                <Input
                  id="name"
                  label={t("accounts.nameField")}
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
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
              {acceptsExpenseNature(form.type) && (
                <Col {...half}>
                  {/* Hanya untuk akun BERKATEGORI beban (issue #445). Mengubah
                      tipe akun menjadi bukan-beban membuang sifatnya di server
                      (`resolveExpenseNature`), jadi tak ada sifat yatim yang
                      tertinggal menempel dan ikut terjumlah ke rincian CALK. */}
                  <Select
                    id="expenseNature"
                    label={t("accounts.expenseNatureField")}
                    value={form.expenseNature}
                    onChange={(e) => setForm({ ...form, expenseNature: e.target.value })}
                    options={[
                      { value: "", label: t("accounts.expenseNatureNone") },
                      ...EXPENSE_NATURES.map((n) => ({
                        value: n.value,
                        label: natureLabels[n.value],
                      })),
                    ]}
                  />
                  <small style={{ color: token.colorTextSecondary }}>
                    {t("accounts.expenseNatureHint")}
                  </small>
                </Col>
              )}
              <Col {...half}>
                {/* Nonaktif, BUKAN hapus — akun yang pernah dijurnal harus tetap
                    terbaca namanya selamanya. */}
                <Select
                  id="isActive"
                  label={t("common.status")}
                  value={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.value })}
                  options={[
                    { value: "true", label: t("common.active") },
                    { value: "false", label: t("common.inactive") },
                  ]}
                />
              </Col>
            </Row>
          </CardContent>
        </Card>

        <Flex wrap gap={token.marginSM}>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("common.saveChanges")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </Flex>
      </form>
    </div>
  );
}
