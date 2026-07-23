"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";

export default function EditSupplierPage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", address: "", phone: "", email: "" });

  useEffect(() => {
    fetch(`/api/suppliers/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Gagal memuat data pemasok");
        return res.json();
      })
      .then((data) => {
        setForm({
          name: data.name || "",
          address: data.address || "",
          phone: data.phone || "",
          email: data.email || "",
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

    const res = await fetch(`/api/suppliers/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Gagal menyimpan perubahan pemasok");
      setLoading(false);
    } else {
      router.push(`/suppliers/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message="Memuat data pemasok..." />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[{ label: "Pemasok", href: "/suppliers" }, { label: "Ubah Pemasok" }]}
        title="Ubah Pemasok"
      />

      {error && <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Data Pemasok</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <Input id="name" label="Nama Pemasok" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input id="address" label="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <Input id="phone" label="Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input id="email" type="email" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>{loading ? "Menyimpan..." : "Simpan"}</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>Batal</Button>
        </div>
      </form>
    </div>
  );
}
