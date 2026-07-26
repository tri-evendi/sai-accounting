"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

interface AccountOption {
  id: number;
  code: string;
  name: string;
}

export function NewAccountForm() {
  const router = useRouter();
  const t = useT();
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
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AccountOption[]) => setParents(data))
      .catch(() => setParents([]));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/accounts", {
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

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("accounts.breadcrumbChart"), href: "/accounts" },
          { label: t("accounts.newTitle") },
        ]}
        title={t("accounts.newTitle")}
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
                placeholder={t("accounts.codePlaceholder")}
              />
              <Input
                id="name"
                label={t("accounts.nameField")}
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("accounts.namePlaceholder")}
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
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("accounts.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
