"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewTransactionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const debitVal = Number(formData.get("debit")) || 0;
    const creditVal = Number(formData.get("credit")) || 0;

    if (debitVal === 0 && creditVal === 0) {
      setError("Either debit or credit must be greater than 0");
      setLoading(false);
      return;
    }

    const body = {
      type: formData.get("type"),
      date: formData.get("date"),
      description: formData.get("description"),
      currency: formData.get("currency"),
      debit: debitVal,
      credit: creditVal,
      note: formData.get("note") || undefined,
    };

    const res = await fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const detail = data.details?.fieldErrors;
      const fieldMsg = detail
        ? Object.values(detail).flat().filter(Boolean)[0]
        : null;
      setError(fieldMsg || data.error || "Failed to create transaction");
      setLoading(false);
    } else {
      router.push("/finance");
      router.refresh();
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Transaction</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Transaction Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="type" name="type" label="Account Type"
                options={[
                  { value: "bank", label: "Bank" },
                  { value: "kas_besar", label: "Kas Besar (Large Cash)" },
                  { value: "kas_kecil", label: "Kas Kecil (Small Cash)" },
                ]}
              />
              <Input
                id="date"
                name="date"
                type="date"
                label="Date"
                defaultValue={new Date().toISOString().split("T")[0]}
                required
              />
              <div className="sm:col-span-2">
                <Input id="description" name="description" label="Description" required />
              </div>
              <Select
                id="currency" name="currency" label="Currency"
                options={[
                  { value: "IDR", label: "IDR (Rupiah)" },
                  { value: "USD", label: "USD" },
                  { value: "CNY", label: "CNY" },
                ]}
              />
              <div />
              <Input id="debit" name="debit" type="number" step="0.01" label="Debit (In)" defaultValue="0" />
              <Input id="credit" name="credit" type="number" step="0.01" label="Credit (Out)" defaultValue="0" />
              <div className="sm:col-span-2">
                <Input id="note" name="note" label="Note (optional)" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Create Transaction"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/finance")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
