"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export function NewConsigneeForm() {
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
      setError(data.error || "Gagal menyimpan penerima barang");
      setLoading(false);
    } else {
      router.push("/consignees");
      router.refresh();
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: "Penerima Barang", href: "/consignees" },
          { label: "Penerima Barang Baru" },
        ]}
        title="Penerima Barang Baru"
      />

      {error && (
        <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Data Penerima Barang</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="name" name="name" label="Nama Penerima Barang" required />
              <Input id="country" name="country" label="Negara" />
              <Input id="contact" name="contact" label="Kontak / PIC" />
              <div className="space-y-1">
                <label htmlFor="address" className="block text-sm font-medium text-foreground">
                  Alamat
                </label>
                <Textarea id="address" name="address" rows={3} />
              </div>
              <div className="space-y-1">
                <label htmlFor="notes" className="block text-sm font-medium text-foreground">
                  Catatan
                </label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
