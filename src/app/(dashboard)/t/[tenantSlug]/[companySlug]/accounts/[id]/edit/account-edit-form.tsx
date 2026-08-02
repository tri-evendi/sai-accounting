"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/loading";
import { ACCOUNT_TYPES } from "@/lib/accounting";
import { useDictionary, useT } from "@/lib/i18n/client";
import { accountTypeLabels } from "@/lib/i18n/labels";
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
  isActive: boolean;
}

export function EditAccountForm() {
  const router = useAppRouter();
  const params = useParams<{ id: string }>();
  const t = useT();
  const typeLabels = accountTypeLabels(useDictionary());
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

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("accounts.breadcrumbChart"), href: "/accounts" },
          { label: t("accounts.editTitle") },
        ]}
        title={t("accounts.editTitle")}
      />

      {error && (
        <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("accounts.infoTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="code"
                label={t("accounts.codeField")}
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              <Input
                id="name"
                label={t("accounts.nameField")}
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Select
                id="type"
                label={t("accounts.typeField")}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                options={ACCOUNT_TYPES.map((type) => ({ value: type.value, label: typeLabels[type.value] }))}
              />
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
              <Select
                id="currency"
                label={t("common.currency")}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
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
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("common.saveChanges")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
