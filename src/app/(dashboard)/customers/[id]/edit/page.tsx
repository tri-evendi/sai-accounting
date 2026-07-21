"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    pic: "",
    taxExempt: false,
  });

  useEffect(() => {
    fetch(`/api/customers/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load customer");
        return res.json();
      })
      .then((data) => {
        setForm({
          name: data.name || "",
          address: data.address || "",
          phone: data.phone || "",
          email: data.email || "",
          pic: data.pic || "",
          taxExempt: Boolean(data.taxExempt),
        });
        setFetching(false);
      })
      .catch((err) => {
        setError(err.message);
        setFetching(false);
      });
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch(`/api/customers/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update customer");
      setLoading(false);
    } else {
      router.push(`/customers/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message="Loading customer..." />;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Customer</h1>

      {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Customer Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <Input id="name" label="Customer Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input id="address" label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <Input id="phone" label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input id="email" type="email" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input id="pic" label="Person In Charge (PIC)" value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} />
              <label htmlFor="taxExempt" className="flex cursor-pointer items-start gap-2">
                <input
                  id="taxExempt"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={form.taxExempt}
                  onChange={(e) => setForm({ ...form, taxExempt: e.target.checked })}
                />
                <span className="text-sm text-gray-700">
                  Bebas PPN (ekspor / non-PKP)
                  <span className="block text-xs text-gray-500">
                    Faktur untuk pelanggan ini otomatis default tanpa PPN (0%) — tetap bisa diubah.
                  </span>
                </span>
              </label>
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
