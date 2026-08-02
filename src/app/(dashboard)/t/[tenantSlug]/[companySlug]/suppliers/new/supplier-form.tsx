"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/client";

export function NewSupplierForm() {
  const router = useAppRouter();
  const t = useT();
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

    const res = await fetch("/api/suppliers", {
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

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("suppliers.breadcrumb"), href: "/suppliers" },
          { label: t("suppliers.newTitle") },
        ]}
        title={t("suppliers.newTitle")}
      />

      {error && (
        <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>{t("suppliers.dataTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="name" name="name" label={t("suppliers.nameField")} required />
              <Input id="address" name="address" label={t("common.address")} />
              <Input id="phone" name="phone" label={t("common.phone")} />
              <Input id="email" name="email" type="email" label={t("common.email")} />
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
