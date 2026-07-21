"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get("name"),
      address: formData.get("address"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      pic: formData.get("pic"),
      taxExempt: formData.get("taxExempt") === "on",
    };

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create customer");
      setLoading(false);
    } else {
      router.push("/customers");
      router.refresh();
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Customer</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Customer Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <Input id="name" name="name" label="Customer Name" required />
              <Input id="address" name="address" label="Address" />
              <Input id="phone" name="phone" label="Phone" />
              <Input id="email" name="email" type="email" label="Email" />
              <Input id="pic" name="pic" label="Person In Charge (PIC)" />
              <label htmlFor="taxExempt" className="flex cursor-pointer items-start gap-2">
                <input
                  id="taxExempt"
                  name="taxExempt"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Customer"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
