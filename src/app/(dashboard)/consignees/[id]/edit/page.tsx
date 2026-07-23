"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";

export default function EditConsigneePage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    country: "",
    contact: "",
    address: "",
    notes: "",
    isActive: true,
  });

  useEffect(() => {
    fetch(`/api/consignees/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Gagal memuat data penerima barang");
        return res.json();
      })
      .then((data) => {
        setForm({
          name: data.name || "",
          country: data.country || "",
          contact: data.contact || "",
          address: data.address || "",
          notes: data.notes || "",
          isActive: Boolean(data.isActive),
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

    const res = await fetch(`/api/consignees/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Gagal menyimpan perubahan penerima barang");
      setLoading(false);
    } else {
      router.push(`/consignees/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message="Memuat data penerima barang..." />;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Ubah Penerima Barang</h1>

      {error && <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Data Penerima Barang</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <Input id="name" label="Nama Penerima Barang" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input id="country" label="Negara" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              <Input id="contact" label="Kontak / PIC" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              <div className="space-y-1">
                <label htmlFor="address" className="block text-sm font-medium text-foreground">Alamat</label>
                <textarea
                  id="address"
                  rows={3}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="block w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="notes" className="block text-sm font-medium text-foreground">Catatan</label>
                <textarea
                  id="notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="block w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <label htmlFor="isActive" className="flex cursor-pointer items-start gap-2">
                <input
                  id="isActive"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-ring"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span className="text-sm text-foreground">
                  Aktif
                  <span className="block text-xs text-muted-foreground">
                    Penerima barang nonaktif tidak muncul di pilihan Kontrak, tetapi kontrak lama tetap tertaut.
                  </span>
                </span>
              </label>
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
