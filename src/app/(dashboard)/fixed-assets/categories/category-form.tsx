"use client";

/**
 * Kategori aset tetap — buat kategori dengan default metode, umur, & akun (issue #28).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { DEPRECIATION_METHOD_LABELS } from "@/lib/depreciation";
import { Loader2 } from "lucide-react";
import type { AccountOption } from "../new/asset-form";

export function CategoryForm({
  assetAccounts,
  accumulatedAccounts,
  expenseAccounts,
  defaults,
}: {
  assetAccounts: AccountOption[];
  accumulatedAccounts: AccountOption[];
  expenseAccounts: AccountOption[];
  defaults: { assetAccountId?: number; accumulatedAccountId?: number; expenseAccountId?: number };
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [months, setMonths] = useState("");
  const [assetAccountId, setAssetAccountId] = useState(
    defaults.assetAccountId ? String(defaults.assetAccountId) : ""
  );
  const [accumulatedAccountId, setAccumulatedAccountId] = useState(
    defaults.accumulatedAccountId ? String(defaults.accumulatedAccountId) : ""
  );
  const [expenseAccountId, setExpenseAccountId] = useState(
    defaults.expenseAccountId ? String(defaults.expenseAccountId) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acctOptions = (opts: AccountOption[]) =>
    opts.map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/fixed-assets/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          defaultMethod: "straight_line",
          defaultUsefulLifeMonths: Number(months),
          assetAccountId: Number(assetAccountId),
          accumulatedAccountId: Number(accumulatedAccountId),
          expenseAccountId: Number(expenseAccountId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? "Gagal menyimpan kategori.");
        return;
      }
      toast("Kategori tersimpan.", "success");
      setName("");
      setMonths("");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Kategori baru</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="cat-name"
            label="Nama kategori"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Kendaraan"
            required
          />
          <Input
            id="cat-months"
            type="number"
            min="1"
            step="1"
            className="text-right tabular-nums"
            label="Umur manfaat default (bulan)"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            required
          />
          <Select
            id="cat-method"
            label="Metode default"
            value="straight_line"
            disabled
            onChange={() => {}}
            options={Object.entries(DEPRECIATION_METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            id="cat-asset"
            label="Akun aset"
            value={assetAccountId}
            onChange={(e) => setAssetAccountId(e.target.value)}
            options={acctOptions(assetAccounts)}
            placeholder="Pilih akun"
            required
          />
          <Select
            id="cat-accum"
            label="Akun akumulasi penyusutan"
            value={accumulatedAccountId}
            onChange={(e) => setAccumulatedAccountId(e.target.value)}
            options={acctOptions(accumulatedAccounts)}
            placeholder="Pilih akun"
            required
          />
          <Select
            id="cat-expense"
            label="Akun beban penyusutan"
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
            options={acctOptions(expenseAccounts)}
            placeholder="Pilih akun"
            required
          />
        </div>
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={saving} className="cursor-pointer">
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          Simpan Kategori
        </Button>
      </form>
    </Card>
  );
}
