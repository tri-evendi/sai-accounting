"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";
import { PageLoader } from "@/components/ui/loading";
import { DueDateField } from "@/components/shared/due-date-field";
import {
  InvoiceFxFields,
  invoiceFxPayload,
  type InvoiceFxValues,
} from "@/components/shared/invoice-fx-fields";
import { invoiceSubtotal } from "@/lib/validations/invoice";

interface InvoiceItem {
  itemName: string;
  quantity: number;
  price: number;
  unit: string;
}

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [fx, setFx] = useState<InvoiceFxValues>({
    customerId: "",
    currency: "IDR",
    rate: "",
    taxable: false,
    taxRate: "11",
  });

  const subtotal = invoiceSubtotal(items);

  useEffect(() => {
    fetch(`/api/invoices/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load invoice");
        return res.json();
      })
      .then((data) => {
        setInvoiceNo(data.invoiceNo);
        setDate(new Date(data.date).toISOString().split("T")[0]);
        // Blank stays blank: a null due date is "unknown", not "today".
        setDueDate(data.dueDate ? new Date(data.dueDate).toISOString().split("T")[0] : "");
        setStatus(data.status);
        // A legacy taxed row (taxable false but tax_amount > 0) is shown as taxed,
        // with the rate inferred from amount ÷ DPP so the user sees a sensible
        // percentage rather than a blank. A stored tax_rate always wins.
        const legacyTaxed = !data.taxable && Number(data.taxAmount) > 0;
        const subtotal = (data.items ?? []).reduce(
          (s: number, i: { quantity: number; price: number }) =>
            s + Number(i.quantity) * Number(i.price),
          0
        );
        const inferredRate =
          data.taxRate != null
            ? Number(data.taxRate)
            : legacyTaxed && subtotal > 0
              ? Math.round((Number(data.taxAmount) / subtotal) * 10000) / 100
              : 11;
        setFx({
          customerId: data.customerId ? String(data.customerId) : "",
          // Legacy rows may predate the column; treat a missing value as IDR,
          // which is how they have been posted all along.
          currency: data.currency || "IDR",
          rate: data.rate != null ? String(Number(data.rate)) : "",
          taxable: Boolean(data.taxable) || legacyTaxed,
          taxRate: String(inferredRate),
        });
        setItems(
          data.items.map((item: InvoiceItem & { id?: number }) => ({
            itemName: item.itemName,
            quantity: Number(item.quantity),
            price: Number(item.price),
            unit: item.unit || "kg",
          }))
        );
        setFetching(false);
      })
      .catch((err) => {
        setError(err.message);
        setFetching(false);
      });
  }, [params.id]);

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

    const body = { invoiceNo, date, dueDate, status, ...invoiceFxPayload(fx), items };

    const res = await fetch(`/api/invoices/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || "Failed to update invoice"));
      setLoading(false);
    } else {
      router.push(`/invoices/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message="Loading invoice..." />;
  if (!invoiceNo && !fetching) return <div className="text-red-600">Invoice not found</div>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Invoice {invoiceNo}</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Invoice Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="invoiceNo" label="Invoice Number" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required />
              <Input id="date" type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
              <DueDateField value={dueDate} onChange={setDueDate} />
              <Select
                id="status" label="Status" value={status}
                onChange={(e) => setStatus(e.target.value)}
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
                    <input className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={item.itemName} onChange={(e) => updateItem(i, "itemName", e.target.value)} required />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                    <input type="number" step="0.01" className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={item.quantity} onChange={(e) => updateItem(i, "quantity", Number(e.target.value))} />
                  </div>
                  <div className="w-28">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
                    <input type="number" step="0.01" className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={item.price} onChange={(e) => updateItem(i, "price", Number(e.target.value))} />
                  </div>
                  <div className="w-20">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
                    <input className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={item.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} />
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
          <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
