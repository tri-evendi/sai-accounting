"use client";

/**
 * Daftarkan aset tetap (issue #28).
 *
 * Kategori dipilih dulu; metode, umur manfaat, dan tiga akun (aset/akumulasi/
 * beban) terisi dari kategori dan bisa di-override. Nilai penyusutan bulanan
 * ditampilkan langsung agar pengguna melihat dampaknya sebelum menyimpan.
 * Registrasi TIDAK memposting jurnal — penyusutan & pelepasan yang menjurnal.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { DEPRECIATION_METHOD_LABELS, straightLineMonthly } from "@/lib/depreciation";
import { Info, Loader2 } from "lucide-react";

export interface AccountOption {
  id: number;
  code: string;
  name: string;
}

export interface CategoryOption {
  id: number;
  name: string;
  defaultMethod: string;
  defaultUsefulLifeMonths: number;
  assetAccountId: number;
  accumulatedAccountId: number;
  expenseAccountId: number;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function AssetForm({
  categories,
  assetAccounts,
  accumulatedAccounts,
  expenseAccounts,
}: {
  categories: CategoryOption[];
  assetAccounts: AccountOption[];
  accumulatedAccounts: AccountOption[];
  expenseAccounts: AccountOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const first = categories[0];
  const [categoryId, setCategoryId] = useState(first ? String(first.id) : "");
  const [name, setName] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState(todayISO());
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [residualValue, setResidualValue] = useState("0");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(
    first ? String(first.defaultUsefulLifeMonths) : ""
  );
  const [assetAccountId, setAssetAccountId] = useState(first ? String(first.assetAccountId) : "");
  const [accumulatedAccountId, setAccumulatedAccountId] = useState(
    first ? String(first.accumulatedAccountId) : ""
  );
  const [expenseAccountId, setExpenseAccountId] = useState(
    first ? String(first.expenseAccountId) : ""
  );
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acctOptions = (opts: AccountOption[]) =>
    opts.map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` }));

  function applyCategory(id: string) {
    setCategoryId(id);
    const cat = categories.find((c) => String(c.id) === id);
    if (!cat) return;
    setUsefulLifeMonths(String(cat.defaultUsefulLifeMonths));
    setAssetAccountId(String(cat.assetAccountId));
    setAccumulatedAccountId(String(cat.accumulatedAccountId));
    setExpenseAccountId(String(cat.expenseAccountId));
  }

  const monthly = useMemo(() => {
    const cost = Number(acquisitionCost) || 0;
    const residual = Number(residualValue) || 0;
    const life = Number(usefulLifeMonths) || 0;
    if (cost <= 0 || life <= 0 || residual >= cost) return null;
    try {
      return straightLineMonthly({ cost, residualValue: residual, usefulLifeMonths: life });
    } catch {
      return null;
    }
  }, [acquisitionCost, residualValue, usefulLifeMonths]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/fixed-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId: Number(categoryId),
          acquisitionDate,
          acquisitionCost: Number(acquisitionCost),
          residualValue: Number(residualValue) || 0,
          usefulLifeMonths: Number(usefulLifeMonths),
          assetAccountId: Number(assetAccountId),
          accumulatedAccountId: Number(accumulatedAccountId),
          expenseAccountId: Number(expenseAccountId),
          location: location || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? "Gagal menyimpan aset.");
        return;
      }
      toast("Aset tersimpan.", "success");
      router.push("/fixed-assets");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="categoryId"
            label="Kategori"
            value={categoryId}
            onChange={(e) => applyCategory(e.target.value)}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            required
          />
          <Input
            id="name"
            label="Nama aset"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Truk Colt Diesel B 1234 XY"
            required
          />

          <Input
            id="acquisitionDate"
            type="date"
            label="Tanggal perolehan"
            value={acquisitionDate}
            onChange={(e) => setAcquisitionDate(e.target.value)}
            required
          />
          <Input
            id="location"
            label="Lokasi (opsional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="mis. Gudang Utama"
          />

          <Input
            id="acquisitionCost"
            type="number"
            step="0.01"
            min="0"
            className="text-right tabular-nums"
            label="Nilai perolehan (IDR)"
            value={acquisitionCost}
            onChange={(e) => setAcquisitionCost(e.target.value)}
            required
          />
          <Input
            id="residualValue"
            type="number"
            step="0.01"
            min="0"
            className="text-right tabular-nums"
            label="Nilai residu (IDR)"
            value={residualValue}
            onChange={(e) => setResidualValue(e.target.value)}
          />

          <Input
            id="usefulLifeMonths"
            type="number"
            min="1"
            step="1"
            className="text-right tabular-nums"
            label="Umur manfaat (bulan)"
            value={usefulLifeMonths}
            onChange={(e) => setUsefulLifeMonths(e.target.value)}
            required
          />
          <Select
            id="method"
            label="Metode penyusutan"
            value="straight_line"
            disabled
            onChange={() => {}}
            options={Object.entries(DEPRECIATION_METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Select
            id="assetAccountId"
            label="Akun aset"
            value={assetAccountId}
            onChange={(e) => setAssetAccountId(e.target.value)}
            options={acctOptions(assetAccounts)}
            required
          />
          <Select
            id="accumulatedAccountId"
            label="Akun akumulasi penyusutan"
            value={accumulatedAccountId}
            onChange={(e) => setAccumulatedAccountId(e.target.value)}
            options={acctOptions(accumulatedAccounts)}
            required
          />
          <Select
            id="expenseAccountId"
            label="Akun beban penyusutan"
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
            options={acctOptions(expenseAccounts)}
            required
          />
        </div>

        {monthly != null && (
          <p className="mt-4 text-sm text-gray-600 tabular-nums">
            Penyusutan per bulan (garis lurus):{" "}
            <strong className="text-gray-900">{formatCurrency(monthly, "IDR")}</strong>
          </p>
        )}

        <p className="mt-4 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Mendaftarkan aset <strong>tidak</strong> membuat jurnal — biaya perolehan biasanya
            sudah tercatat lewat pembelian/kas. Yang menjurnal adalah{" "}
            <strong>penyusutan bulanan</strong> dan <strong>pelepasan</strong> aset.
          </span>
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="cursor-pointer">
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          Simpan Aset
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => router.push("/fixed-assets")}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
