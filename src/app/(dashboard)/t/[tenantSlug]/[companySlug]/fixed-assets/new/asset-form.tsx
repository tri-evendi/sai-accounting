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
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { straightLineMonthly } from "@/lib/depreciation";
import { useT } from "@/lib/i18n/client";
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
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();

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
        setError(first ?? data?.error ?? t("fixedAssets.saveAssetFailed"));
        return;
      }
      toast(t("fixedAssets.assetSaved"), "success");
      router.push("/fixed-assets");
      router.refresh();
    } catch {
      setError(t("fixedAssets.networkFailed"));
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
            label={t("fixedAssets.colCategory")}
            value={categoryId}
            onChange={(e) => applyCategory(e.target.value)}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            required
          />
          <Input
            id="name"
            label={t("fixedAssets.assetNameField")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("fixedAssets.assetNamePlaceholder")}
            required
          />

          <Input
            id="acquisitionDate"
            type="date"
            label={t("fixedAssets.acquisitionDateField")}
            value={acquisitionDate}
            onChange={(e) => setAcquisitionDate(e.target.value)}
            required
          />
          <Input
            id="location"
            label={t("fixedAssets.locationField")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("fixedAssets.locationPlaceholder")}
          />

          <Input
            id="acquisitionCost"
            type="number"
            step="0.01"
            min="0"
            className="text-right tabular-nums"
            label={t("fixedAssets.costField")}
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
            label={t("fixedAssets.residualField")}
            value={residualValue}
            onChange={(e) => setResidualValue(e.target.value)}
          />

          <Input
            id="usefulLifeMonths"
            type="number"
            min="1"
            step="1"
            className="text-right tabular-nums"
            label={t("fixedAssets.lifeMonthsField")}
            value={usefulLifeMonths}
            onChange={(e) => setUsefulLifeMonths(e.target.value)}
            required
          />
          <Select
            id="method"
            label={t("fixedAssets.methodField")}
            value="straight_line"
            disabled
            onChange={() => {}}
            options={[
              { value: "straight_line", label: t("depreciationMethod.straight_line") },
            ]}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Select
            id="assetAccountId"
            label={t("fixedAssets.assetAccountField")}
            value={assetAccountId}
            onChange={(e) => setAssetAccountId(e.target.value)}
            options={acctOptions(assetAccounts)}
            required
          />
          <Select
            id="accumulatedAccountId"
            label={t("fixedAssets.accumulatedAccountField")}
            value={accumulatedAccountId}
            onChange={(e) => setAccumulatedAccountId(e.target.value)}
            options={acctOptions(accumulatedAccounts)}
            required
          />
          <Select
            id="expenseAccountId"
            label={t("fixedAssets.expenseAccountField")}
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
            options={acctOptions(expenseAccounts)}
            required
          />
        </div>

        {monthly != null && (
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">
            {t("fixedAssets.monthlyPreview")}{" "}
            <strong className="text-foreground">{formatCurrency(monthly, "IDR")}</strong>
          </p>
        )}

        <p className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {t("fixedAssets.noJournalBefore")} <strong>{t("fixedAssets.noJournalNot")}</strong>{" "}
            {t("fixedAssets.noJournalMiddle")}{" "}
            <strong>{t("fixedAssets.noJournalDepreciation")}</strong> {t("fixedAssets.noJournalAnd")}{" "}
            <strong>{t("fixedAssets.noJournalDisposal")}</strong> {t("fixedAssets.noJournalTail")}
          </span>
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">
            {error}
          </p>
        )}
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="cursor-pointer">
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {t("fixedAssets.saveAsset")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => router.push("/fixed-assets")}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
