"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewConsigneePage() {
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
      country: formData.get("country"),
      contact: formData.get("contact"),
      address: formData.get("address"),
      notes: formData.get("notes"),
    };

    const res = await fetch("/api/consignees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create consignee");
      setLoading(false);
    } else {
      router.push("/consignees");
      router.refresh();
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">New Consignee</h1>

      {error && (
        <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Consignee Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <Input id="name" name="name" label="Consignee Name" required />
              <Input id="country" name="country" label="Country" />
              <Input id="contact" name="contact" label="Contact / PIC" />
              <div className="space-y-1">
                <label htmlFor="address" className="block text-sm font-medium text-foreground">
                  Address
                </label>
                <textarea
                  id="address"
                  name="address"
                  rows={3}
                  className="block w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="notes" className="block text-sm font-medium text-foreground">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  className="block w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Consignee"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
