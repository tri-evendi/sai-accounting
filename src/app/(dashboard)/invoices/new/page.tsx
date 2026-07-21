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
      setError(String(fieldMsg || data.error || "Failed to create invoice"));
      setLoading(false);
    } else {
      router.push("/invoices");
      router.refresh();
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Invoice</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Invoice Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="invoiceNo" name="invoiceNo" label="Invoice Number" required />
              <Input id="date" name="date" type="date" label="Date" required />
              <DueDateField />
              <Select
                id="status"
                name="status"
                label="Status"
                options={[
                  { value: "pending", label: "Pending" },
                  { value: "signed", label: "Signed" },
                  { value: "canceled", label: "Canceled" },
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

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Items</CardTitle>
              <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, i) => (
                <div key={i} className="flex items-end gap-3 rounded-md border border-gray-200 p-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Item Name</label>
                    <input
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={item.itemName}
                      onChange={(e) => updateItem(i, "itemName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                    <input
                      type="number"
                      step="0.01"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                    />
                  </div>
                  <div className="w-28">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={item.price}
                      onChange={(e) => updateItem(i, "price", Number(e.target.value))}
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
                    <input
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={item.unit}
                      onChange={(e) => updateItem(i, "unit", e.target.value)}
                    />
                  </div>
                  <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 pb-2">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Invoice"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
