"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNT_TYPES } from "@/lib/accounting";
import { CURRENCIES } from "@/lib/constants";

interface AccountOption {
  id: number;
  code: string;
  name: string;
}

export default function NewAccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parents, setParents] = useState<AccountOption[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: ACCOUNT_TYPES[0].value,
    parentId: "",
    currency: "IDR",
  });

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AccountOption[]) => setParents(data))
      .catch(() => setParents([]));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        name: form.name,
        type: form.type,
        currency: form.currency,
        parentId: form.parentId ? Number(form.parentId) : null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Gagal membuat akun");
      setLoading(false);
    } else {
      router.push("/accounts");
      router.refresh();
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Akun Baru</h1>

      {error && (
        <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Informasi Akun</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <Input
                id="code"
                label="Kode Perkiraan"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="mis. 1101"
              />
              <Input
                id="name"
                label="Nama Akun"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="mis. Kas & Setara Kas"
              />
              <Select
                id="type"
                label="Tipe Akun"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                options={ACCOUNT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
              <Select
                id="parentId"
                label="Induk Akun (opsional)"
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                options={[
                  { value: "", label: "— Tanpa induk —" },
                  ...parents.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
                ]}
              />
              <Select
                id="currency"
                label="Mata Uang"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan Akun"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
