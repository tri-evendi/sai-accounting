"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DueDateField } from "@/components/shared/due-date-field";
import {
  InvoiceFxFields,
  invoiceFxPayload,
  type InvoiceFxValues,
} from "@/components/shared/invoice-fx-fields";
import { invoiceSubtotal } from "@/lib/validations/invoice";
import { Trash2, Plus } from "lucide-react";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";

interface InvoiceItem {
  itemName: string;
  quantity: number;
  price: number;
  unit: string;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { itemName: "", quantity: 0, price: 0, unit: "kg" },
  ]);
  // Currency drives which extra fields the accounting engine needs from the user.
  // A new domestic IDR invoice defaults to PPN 11%; choosing a foreign currency
  // or a tax-exempt customer flips it to 0% (see InvoiceFxFields).
  const [fx, setFx] = useState<InvoiceFxValues>({
    customerId: "",
    currency: "IDR",
    rate: "",
    taxable: true,
    taxRate: "11",
    pebNumber: "",
    pebDate: "",
    exportNote: "",
  });

  const subtotal = invoiceSubtotal(items);

  function addItem() {
    setItems([...items, { itemName: "", quantity: 0, price: 0, unit: "kg" }]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      invoiceNo: formData.get("invoiceNo"),
      date: formData.get("date"),
      dueDate: formData.get("dueDate"),
      status: formData.get("status"),
      ...invoiceFxPayload(fx),
      items,
    };

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      // Zod field errors (e.g. a missing rate) are more actionable than the
      // generic message, so surface the first one.
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || "Gagal menyimpan tagihan penjualan"));
      setLoading(false);
    } else {
      router.push("/invoices");
      router.refresh();
    }
  }

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <TermTooltip term="faktur">Catat Penjualan</TermTooltip>
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Buat tagihan penjualan untuk pelanggan. Setelah disimpan, sisanya masuk ke daftar
          &ldquo;Pelanggan Belum Bayar&rdquo; sampai dilunasi.
        </p>
        <LearnMore term="faktur" className="mt-1" label="Pelajari ini: apa itu tagihan penjualan" />
      </header>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6" data-tour="faktur-identitas">
          <CardHeader><CardTitle>Identitas Tagihan</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="invoiceNo" name="invoiceNo" label="Nomor Tagihan" required />
              <Input id="date" name="date" type="date" label="Tanggal" required />
              <DueDateField />
              <Select
                id="status"
                name="status"
                label="Status"
                options={[
                  { value: "pending", label: "Menunggu" },
                  { value: "signed", label: "Sah" },
                  { value: "canceled", label: "Dibatalkan" },
                ]}
              />
              <InvoiceFxFields
                value={fx}
                onChange={(patch) => setFx((prev) => ({ ...prev, ...patch }))}
                subtotal={subtotal}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6" data-tour="faktur-barang">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Barang yang Dijual</CardTitle>
              <Button type="button" variant="secondary" size="sm" className="cursor-pointer" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Tambah Barang
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, i) => (
                <div key={i} className="flex items-end gap-3 rounded-md border border-gray-200 p-3">
                  <div className="flex-1">
                    <label htmlFor={`item-name-${i}`} className="block text-xs font-medium text-gray-500 mb-1">Nama Barang</label>
                    <input
                      id={`item-name-${i}`}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={item.itemName}
                      onChange={(e) => updateItem(i, "itemName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="w-24">
                    <label htmlFor={`item-qty-${i}`} className="block text-xs font-medium text-gray-500 mb-1">Jumlah</label>
                    <input
                      id={`item-qty-${i}`}
                      type="number"
                      step="0.01"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-right tabular-nums"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                    />
                  </div>
                  <div className="w-28">
                    <label htmlFor={`item-price-${i}`} className="block text-xs font-medium text-gray-500 mb-1">Harga Satuan</label>
                    <input
                      id={`item-price-${i}`}
                      type="number"
                      step="0.01"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-right tabular-nums"
                      value={item.price}
                      onChange={(e) => updateItem(i, "price", Number(e.target.value))}
                    />
                  </div>
                  <div className="w-20">
                    <label htmlFor={`item-unit-${i}`} className="block text-xs font-medium text-gray-500 mb-1">Satuan</label>
                    <input
                      id={`item-unit-${i}`}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={item.unit}
                      onChange={(e) => updateItem(i, "unit", e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    aria-label={`Hapus baris barang ${i + 1}`}
                    className="cursor-pointer pb-2 text-red-400 transition-colors duration-150 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3" data-tour="faktur-simpan">
          <Button type="submit" className="cursor-pointer" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan Tagihan"}
          </Button>
          <Button type="button" variant="secondary" className="cursor-pointer" onClick={() => router.back()}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
