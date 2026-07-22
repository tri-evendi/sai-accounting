"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewSupplierPage() {
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
    };

    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create supplier");
      setLoading(false);
    } else {
      router.push("/suppliers");
      router.refresh();
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">New Supplier</h1>

      {error && (
        <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Supplier Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <Input id="name" name="name" label="Supplier Name" required />
              <Input id="address" name="address" label="Address" />
              <Input id="phone" name="phone" label="Phone" />
              <Input id="email" name="email" type="email" label="Email" />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Supplier"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
