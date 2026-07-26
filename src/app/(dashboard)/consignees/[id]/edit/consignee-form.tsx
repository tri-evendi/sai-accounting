"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/client";

export function EditConsigneeForm() {
  const router = useRouter();
  const params = useParams();
  const t = useT();
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
    fetch(`/api/consignees/${params.id}`)
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

    const res = await fetch(`/api/consignees/${params.id}`, {
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

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("consignees.breadcrumb"), href: "/consignees" },
          { label: t("consignees.editTitle") },
        ]}
        title={t("consignees.editTitle")}
      />

      {error && <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("consignees.dataTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="name" label={t("consignees.nameField")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input id="country" label={t("consignees.colCountry")} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              <Input id="contact" label={t("consignees.contactPic")} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              <div className="space-y-1">
                <label htmlFor="address" className="block text-sm font-medium text-foreground">
                  {t("common.address")}
                </label>
                <Textarea
                  id="address"
                  rows={3}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="notes" className="block text-sm font-medium text-foreground">
                  {t("common.notes")}
                </label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
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
                    {t("consignees.activeHint")}
                  </span>
                </span>
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
