"use client";

import { useState } from "react";
import { DueDateField } from "@/components/shared/due-date-field";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";

const BASE_CURRENCY = "IDR";

/**
 * Records a supplier purchase or payment. Both auto-post:
 *   purchase → D: Persediaan (+ D: PPN Masukan) / K: Hutang Usaha
 *   payment  → D: Hutang Usaha / K: Kas & Bank
 */
export function SupplierTransactionForm({ supplierId }: { supplierId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState<"purchase" | "payment">("purchase");
  const [currency, setCurrency] = useState(BASE_CURRENCY);

  const isForeign = currency !== BASE_CURRENCY;
  const isPurchase = type === "purchase";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      date: formData.get("date"),
      // Only a purchase can fall due; the API ignores it for a payment anyway.
      dueDate: isPurchase ? formData.get("dueDate") : null,
      type,
      amount: Number(formData.get("amount")),
      currency,
      rate: isForeign ? Number(formData.get("rate")) || undefined : undefined,
      taxAmount: isPurchase ? Number(formData.get("taxAmount")) || 0 : 0,
      note: formData.get("note") || undefined,
    };

    const res = await fetch(`/api/suppliers/${supplierId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || "Gagal menyimpan transaksi"));
      setLoading(false);
      return;
    }

    toast("Transaksi supplier tersimpan dan sudah dijurnal");
    setOpen(false);
    setLoading(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" /> Add Transaction
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mt-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Record Supplier Transaction</h4>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Select
            id="trx-type"
            name="type"
            label="Jenis Transaksi"
            value={type}
            onChange={(e) => setType(e.target.value as "purchase" | "payment")}
            options={[
              { value: "purchase", label: "Pembelian (Purchase)" },
              { value: "payment", label: "Pembayaran (Payment)" },
            ]}
          />
          {isPurchase ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-700">
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Menambah Hutang Usaha</span>
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1 text-xs text-green-700">
              <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mengurangi Hutang Usaha & saldo kas</span>
            </p>
          )}
        </div>

        <Input
          id="trx-date"
          name="date"
          type="date"
          label="Tanggal"
          defaultValue={new Date().toISOString().split("T")[0]}
          required
        />

        {isPurchase && <DueDateField />}

        <Input
          id="trx-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          className="text-right tabular-nums"
          label={isPurchase ? "Nilai (sebelum PPN)" : "Jumlah Pembayaran"}
          required
        />

        <Select
          id="trx-currency"
          name="currency"
          label="Mata Uang"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={[
            { value: "IDR", label: "IDR (Rupiah)" },
            { value: "USD", label: "USD" },
            { value: "CNY", label: "CNY" },
          ]}
        />

        {isForeign && (
          <div>
            <Input
              id="trx-rate"
              name="rate"
              type="number"
              step="0.000001"
              min="0"
              className="text-right tabular-nums"
              label={`Kurs 1 ${currency} ke IDR`}
              required
            />
            <p className="mt-1 text-xs text-gray-600">
              Wajib diisi — buku besar mencatat nilai IDR.
            </p>
          </div>
        )}

        {isPurchase && (
          <div>
            <Input
              id="trx-tax"
              name="taxAmount"
              type="number"
              step="0.01"
              min="0"
              className="text-right tabular-nums"
              label="PPN Masukan (opsional)"
              defaultValue="0"
            />
            <p className="mt-1 text-xs text-gray-600">
              Diposting terpisah ke akun PPN Masukan.
            </p>
          </div>
        )}

        <div className="sm:col-span-2">
          <Input id="trx-note" name="note" label="Catatan (opsional)" />
        </div>

        <div className="sm:col-span-2 flex gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan Transaksi"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
