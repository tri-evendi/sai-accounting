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

interface ContractItem {
  itemName: string;
  bags: number;
  kgPerBag: number;
  pricePerKg: number;
}

interface ContractData {
  id: number;
  contractNo: string;
  date: string;
  dueDate: string | null;
  buyer: string;
  consignee: string | null;
  packaging: string | null;
  shipment: string | null;
  top1: string | null;
  top2: string | null;
  currency: string;
  status: string;
  items: ContractItem[];
}

export default function EditContractPage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [contract, setContract] = useState<ContractData | null>(null);
  const [items, setItems] = useState<ContractItem[]>([]);
  // Not stored on the contract — re-supplied on every edit so the reposted
  // journal converts to IDR at a rate the user has confirmed.
  const [currency, setCurrency] = useState("USD");

  const isForeign = currency !== "IDR";

  useEffect(() => {
    fetch(`/api/contracts/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load contract");
        return res.json();
      })
      .then((data) => {
        setContract(data);
        setCurrency(data.currency);
        setItems(
          data.items.map((item: ContractItem & { id?: number }) => ({
            itemName: item.itemName,
            bags: Number(item.bags),
            kgPerBag: Number(item.kgPerBag),
            pricePerKg: Number(item.pricePerKg),
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
    setItems([...items, { itemName: "", bags: 0, kgPerBag: 0, pricePerKg: 0 }]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ContractItem, value: string | number) {
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
      contractNo: formData.get("contractNo"),
      date: formData.get("date"),
      dueDate: formData.get("dueDate"),
      buyer: formData.get("buyer"),
      consignee: formData.get("consignee"),
      packaging: formData.get("packaging"),
      shipment: formData.get("shipment"),
      top1: formData.get("top1"),
      top2: formData.get("top2"),
      currency: formData.get("currency"),
      rate: isForeign ? Number(formData.get("rate")) || undefined : undefined,
      status: formData.get("status"),
      items,
    };

    const res = await fetch(`/api/contracts/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || "Failed to update contract"));
      setLoading(false);
    } else {
      router.push(`/contracts/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) {
    return <PageLoader message="Loading contract..." />;
  }

  if (!contract) {
    return <div className="text-red-600">Contract not found</div>;
  }

  const dateStr = new Date(contract.date).toISOString().split("T")[0];
  // Blank when null — an unknown due date must not default to the document date.
  const dueDateStr = contract.dueDate ? new Date(contract.dueDate).toISOString().split("T")[0] : "";

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Edit Contract {contract.contractNo}
      </h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Contract Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="contractNo" name="contractNo" label="Contract Number" defaultValue={contract.contractNo} required />
              <Input id="date" name="date" type="date" label="Date" defaultValue={dateStr} required />
              <DueDateField defaultValue={dueDateStr} />
              <Input id="buyer" name="buyer" label="Buyer" defaultValue={contract.buyer} required />
              <Input id="consignee" name="consignee" label="Consignee" defaultValue={contract.consignee || ""} />
              <Input id="packaging" name="packaging" label="Packaging" defaultValue={contract.packaging || ""} />
              <Input id="shipment" name="shipment" label="Shipment" defaultValue={contract.shipment || ""} />
              <Input id="top1" name="top1" label="Terms of Payment 1" defaultValue={contract.top1 || ""} />
              <Input id="top2" name="top2" label="Terms of Payment 2" defaultValue={contract.top2 || ""} />
              <Select
                id="currency" name="currency" label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={[
                  { value: "USD", label: "USD" },
                  { value: "CNY", label: "CNY" },
                  { value: "IDR", label: "IDR (Rupiah)" },
                ]}
              />
              {isForeign && (
                <div>
                  <Input
                    id="rate"
                    name="rate"
                    type="number"
                    step="0.000001"
                    min="0"
                    className="text-right tabular-nums"
                    label={`Kurs 1 ${currency} ke IDR`}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-600">
                    Wajib diisi ulang — jurnal kontrak dibalik lalu diposting ulang memakai kurs ini.
                  </p>
                </div>
              )}
              <Select
                id="status" name="status" label="Status"
                defaultValue={contract.status}
                options={[
                  { value: "pending", label: "Pending" },
                  { value: "signed", label: "Signed" },
                  { value: "canceled", label: "Canceled" },
                ]}
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
                  <div className="w-20">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bags</label>
                    <input type="number" className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={item.bags} onChange={(e) => updateItem(i, "bags", Number(e.target.value))} />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Kg/Bag</label>
                    <input type="number" step="0.01" className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={item.kgPerBag} onChange={(e) => updateItem(i, "kgPerBag", Number(e.target.value))} />
                  </div>
                  <div className="w-28">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Price/Kg</label>
                    <input type="number" step="0.01" className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={item.pricePerKg} onChange={(e) => updateItem(i, "pricePerKg", Number(e.target.value))} />
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
