"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";

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
      setSuccess("Barang baru tersimpan");
      setTimeout(() => setSuccess(""), 3000);
    } else {
      const data = await res.json();
      setError(data.error || "Gagal menambah barang");
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
      setError(fieldMsg || data.error || "Gagal menyimpan pergerakan stok");
      setLoading(false);
    } else {
      setSuccess("Pergerakan stok tersimpan");
      setLoading(false);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(""), 3000);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <TermTooltip term="persediaan">Tambah / Kurangi Stok</TermTooltip>
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Catat barang yang masuk ke gudang atau keluar dari gudang.
          </p>
          <LearnMore term="hpp" className="mt-1" label="Pelajari ini: modal barang yang terjual" />
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 cursor-pointer"
          onClick={() => setShowNewItem(!showNewItem)}
        >
          {showNewItem ? "Batal" : "+ Barang Baru"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700" role="status">
          {success}
        </div>
      )}

      {/* New Item Form */}
      {showNewItem && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Tambah Barang Baru</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateItem} className="flex gap-3 items-end">
              <div className="flex-1">
                <Input id="newItemName" label="Nama Barang" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} required />
              </div>
              <div className="w-28">
                <Input id="newItemUnit" label="Satuan" value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} />
              </div>
              <Button type="submit" size="sm" className="cursor-pointer">Simpan</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Stock Update Form */}
      <Card>
        <CardHeader><CardTitle>Catat Pergerakan Stok</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              id="itemId"
              name="itemId"
              label="Barang"
              placeholder="-- Pilih Barang --"
              options={items.map((item) => ({
                value: String(item.id),
                label: `${item.name}${item.unit ? ` (${item.unit})` : ""}`,
              }))}
              required
            />
            <Select
              id="type"
              name="type"
              label="Jenis Pergerakan"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as "in" | "out")}
              options={[
                { value: "in", label: "Barang Masuk (diterima)" },
                { value: "out", label: "Barang Keluar (dikirim)" },
              ]}
            />
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="0.01"
              min="0"
              className="text-right tabular-nums"
              label="Jumlah"
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
              label="Tanggal"
              defaultValue={new Date().toISOString().split("T")[0]}
              required
            />
            <Input id="note" name="note" label="Catatan (opsional)" />

            <div className="flex gap-3">
              <Button type="submit" className="cursor-pointer" disabled={loading}>
                {loading ? "Menyimpan..." : "Simpan Pergerakan Stok"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="cursor-pointer"
                onClick={() => router.push("/inventory")}
              >
                Kembali ke Stok Barang
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
