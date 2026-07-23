"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Info } from "lucide-react";

export function NewReconciliationForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const body = {
      cashType: "bank",
      currency: form.get("currency"),
      periodStart: form.get("periodStart"),
      periodEnd: form.get("periodEnd"),
      openingBalance: Number(form.get("openingBalance")) || 0,
      closingBalance: Number(form.get("closingBalance")) || 0,
      note: form.get("note") || undefined,
    };

    const res = await fetch("/api/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail = data.details?.fieldErrors;
      const fieldMsg = detail ? Object.values(detail).flat().filter(Boolean)[0] : null;
      setError(String(fieldMsg || data.error || "Gagal membuat rekonsiliasi"));
      setLoading(false);
    } else {
      const created = await res.json();
      router.push(`/reconciliation/${created.id}`);
      router.refresh();
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: "Cocokkan Rekening Koran", href: "/reconciliation" },
          { label: "Rekonsiliasi Baru" },
        ]}
        title="Rekonsiliasi Baru"
        description="Ambil saldo awal & akhir dari rekening koran bank untuk periode yang direkonsiliasi."
      />

      {error && (
        <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Rekening & Periode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="currency"
                name="currency"
                label="Mata Uang Rekening"
                defaultValue="IDR"
                options={[
                  { value: "IDR", label: "IDR (Rupiah)" },
                  { value: "USD", label: "USD" },
                  { value: "CNY", label: "CNY" },
                ]}
              />
              <div className="flex items-end">
                <p className="flex items-start gap-1 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Satu rekening = satu mata uang. Rekonsiliasi hanya membandingkan dalam mata uang ini.</span>
                </p>
              </div>

              <Input id="periodStart" name="periodStart" type="date" label="Awal Periode" defaultValue={today} required />
              <Input id="periodEnd" name="periodEnd" type="date" label="Akhir Periode" defaultValue={today} required />

              <div>
                <Input
                  id="openingBalance"
                  name="openingBalance"
                  type="number"
                  step="0.01"
                  className="text-right tabular-nums"
                  label="Saldo Awal (koran)"
                  defaultValue="0"
                />
              </div>
              <div>
                <Input
                  id="closingBalance"
                  name="closingBalance"
                  type="number"
                  step="0.01"
                  className="text-right tabular-nums"
                  label="Saldo Akhir (koran)"
                  defaultValue="0"
                />
              </div>

              <div className="sm:col-span-2">
                <Input id="note" name="note" label="Catatan (opsional)" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : "Buat & Lanjut"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/reconciliation")}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
