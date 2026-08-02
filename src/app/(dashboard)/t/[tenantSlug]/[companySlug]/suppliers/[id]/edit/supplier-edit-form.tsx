"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("suppliers.breadcrumb"), href: "/suppliers" },
          { label: t("suppliers.editTitle") },
        ]}
        title={t("suppliers.editTitle")}
      />

      {error && <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>{t("suppliers.dataTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="name" label={t("suppliers.nameField")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input id="address" label={t("common.address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <Input id="phone" label={t("common.phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input id="email" type="email" label={t("common.email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              {/* Nonaktif lewat DELETE sudah lama ada; tanpa toggle ini tidak
                  ada layar yang bisa MENGAKTIFKAN kembali (audit 2026-07). */}
              <label htmlFor="isActive" className="flex cursor-pointer items-start gap-2">
                <Checkbox
                  id="isActive"
                  className="mt-0.5"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v === true })}
                />
                <span className="text-sm text-foreground">
                  {t("common.active")}
                  <span className="block text-xs text-muted-foreground">
                    {t("suppliers.activeHint")}
                  </span>
                </span>
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>{loading ? t("common.saving") : t("common.save")}</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>{t("common.cancel")}</Button>
        </div>
      </form>
    </div>
  );
}
