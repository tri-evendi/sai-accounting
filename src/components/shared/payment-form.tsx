"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { DollarSign } from "lucide-react";

interface PaymentFormProps {
  entityType: "contracts" | "invoices";
  entityId: number;
  onSuccess?: () => void;
}

const BASE_CURRENCY = "IDR";

export function PaymentForm({ entityType, entityId, onSuccess }: PaymentFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // A foreign-currency payment must carry its own rate — the ledger records IDR.
  const [currency, setCurrency] = useState("USD");
  const { toast } = useToast();

  const isForeign = currency !== BASE_CURRENCY;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      date: formData.get("date"),
      amount: Number(formData.get("amount")),
      currency: formData.get("currency"),
      rate: isForeign ? Number(formData.get("rate")) || undefined : undefined,
      note: formData.get("note") || undefined,
    };

    const res = await fetch(`/api/${entityType}/${entityId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || "Failed to record payment"));
      setLoading(false);
    } else {
      toast("Payment recorded successfully");
      setOpen(false);
      setLoading(false);
      onSuccess?.();
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <DollarSign className="h-4 w-4 mr-1" /> Add Payment
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mt-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Record Payment</h4>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <Input id="pay-date" name="date" type="date" label="Date" required />
        <Input
          id="pay-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          className="text-right tabular-nums"
          label="Amount"
          required
        />
        <Select
          id="pay-currency"
          name="currency"
          label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={[
            { value: "USD", label: "USD" },
            { value: "CNY", label: "CNY" },
            { value: "IDR", label: "IDR" },
          ]}
        />
        {isForeign && (
          <div>
            <Input
              id="pay-rate"
              name="rate"
              type="number"
              step="0.000001"
              min="0"
              className="text-right tabular-nums"
              label={`Kurs 1 ${currency} ke IDR`}
              required
            />
            <p className="mt-1 text-xs text-gray-600">
              Wajib diisi — jurnal penerimaan dicatat dalam IDR memakai kurs ini.
            </p>
          </div>
        )}
        <Input id="pay-note" name="note" label="Note (optional)" />
        <div className="sm:col-span-2 flex gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Saving..." : "Save Payment"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
