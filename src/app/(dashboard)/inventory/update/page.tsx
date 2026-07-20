"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

interface ItemOption {
  id: number;
  name: string;
  unit: string | null;
}

export default function StockUpdatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [items, setItems] = useState<ItemOption[]>([]);
  // Cost is captured on the way in; on the way out it is derived (weighted
  // average) and posted as HPP, so the field only applies to `in`.
  const [movementType, setMovementType] = useState<"in" | "out">("in");

  // New item form
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("kg");

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      const res = await fetch("/api/inventory");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setItems(
        data.map((i: { id: number; name: string; unit: string | null }) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
        }))
      );
    }

    void loadItems();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_item", name: newItemName, unit: newItemUnit }),
    });

    if (res.ok) {
      setNewItemName("");
      setNewItemUnit("kg");
      setShowNewItem(false);
      const listRes = await fetch("/api/inventory");
      if (listRes.ok) {
        const data = await listRes.json();
        setItems(
          data.map((i: { id: number; name: string; unit: string | null }) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
          }))
        );
      }
      setSuccess("Item created successfully");
      setTimeout(() => setSuccess(""), 3000);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create item");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      itemId: Number(formData.get("itemId")),
      quantity: Number(formData.get("quantity")),
      type: formData.get("type"),
      date: formData.get("date"),
      unitCost:
        movementType === "in" ? Number(formData.get("unitCost")) || undefined : undefined,
      note: formData.get("note"),
    };

    if (!body.itemId) {
      setError("Please select an item");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/inventory", {
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
      setError(fieldMsg || data.error || "Failed to update stock");
      setLoading(false);
    } else {
      setSuccess("Stock updated successfully");
      setLoading(false);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(""), 3000);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Update Stock</h1>
        <Button variant="secondary" size="sm" onClick={() => setShowNewItem(!showNewItem)}>
          {showNewItem ? "Cancel" : "+ New Item"}
        </Button>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {/* New Item Form */}
      {showNewItem && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Create New Item</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateItem} className="flex gap-3 items-end">
              <div className="flex-1">
                <Input id="newItemName" label="Item Name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} required />
              </div>
              <div className="w-28">
                <Input id="newItemUnit" label="Unit" value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} />
              </div>
              <Button type="submit" size="sm">Create</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Stock Update Form */}
      <Card>
        <CardHeader><CardTitle>Record Stock Movement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              id="itemId"
              name="itemId"
              label="Item"
              placeholder="-- Select Item --"
              options={items.map((item) => ({
                value: String(item.id),
                label: `${item.name}${item.unit ? ` (${item.unit})` : ""}`,
              }))}
              required
            />
            <Select
              id="type"
              name="type"
              label="Movement Type"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as "in" | "out")}
              options={[
                { value: "in", label: "Stock In (Receive)" },
                { value: "out", label: "Stock Out (Ship)" },
              ]}
            />
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="0.01"
              min="0"
              className="text-right tabular-nums"
              label="Quantity"
              required
            />
            {movementType === "in" ? (
              <div>
                <Input
                  id="unitCost"
                  name="unitCost"
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-right tabular-nums"
                  label="Harga Pokok per Unit (IDR)"
                  required
                />
                <p className="mt-1 text-xs text-gray-600">
                  Wajib diisi. Dipakai menghitung HPP (rata-rata tertimbang) saat barang keluar —
                  tanpa ini, laba akan tercatat terlalu tinggi.
                </p>
              </div>
            ) : (
              <p className="flex items-start gap-1.5 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  HPP dihitung otomatis dari rata-rata harga pokok barang masuk, lalu diposting
                  ke jurnal (D: Beban Pokok Penjualan / K: Persediaan).
                </span>
              </p>
            )}
            <Input
              id="date"
              name="date"
              type="date"
              label="Date"
              defaultValue={new Date().toISOString().split("T")[0]}
              required
            />
            <Input id="note" name="note" label="Note (optional)" />

            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Update Stock"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push("/inventory")}>
                Back to Inventory
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
