"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { ACCOUNT_TYPES } from "@/lib/accounting";
import { CURRENCIES } from "@/lib/constants";

interface AccountOption {
  id: number;
  code: string;
  name: string;
}

interface AccountData {
  code: string;
  name: string;
  type: string;
  parentId: number | null;
  currency: string;
  isActive: boolean;
}

export default function EditAccountPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parents, setParents] = useState<AccountOption[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: ACCOUNT_TYPES[0].value,
    parentId: "",
    currency: "IDR",
    isActive: "true",
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/accounts/${id}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/accounts").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([acc, all]: [AccountData | null, AccountOption[]]) => {
        if (acc) {
          setForm({
            code: acc.code,
            name: acc.name,
            type: acc.type,
            parentId: acc.parentId ? String(acc.parentId) : "",
            currency: acc.currency,
            isActive: acc.isActive ? "true" : "false",
          });
        }
        setParents(all.filter((p) => String(p.id) !== String(id)));
        setFetching(false);
      })
      .catch(() => {
        setError("Gagal memuat akun");
        setFetching(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch(`/api/accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        name: form.name,
        type: form.type,
        currency: form.currency,
        parentId: form.parentId ? Number(form.parentId) : null,
        isActive: form.isActive === "true",
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Gagal menyimpan akun");
      setLoading(false);
    } else {
      router.push("/accounts");
      router.refresh();
    }
  }

  if (fetching) return <PageLoader message="Memuat akun..." />;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Ubah Akun</h1>

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
              />
              <Input
                id="name"
                label="Nama Akun"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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
              <Select
                id="isActive"
                label="Status"
                value={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.value })}
                options={[
                  { value: "true", label: "Aktif" },
                  { value: "false", label: "Nonaktif" },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
