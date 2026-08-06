"use client";

/**
 * Kategori aset tetap — buat kategori dengan default metode, umur, & akun (issue #28).
 *
 * Dikonversi ke token Ant Design pada issue #197: yang berubah hanya kulitnya —
 * kisi isian, jarak, dan galat formulir. Mesin formulirnya (state + `apiFetch`)
 * tidak disentuh.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, Spin, theme } from "antd";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { AccountOption } from "../new/asset-form";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Kisi isian yang runtuh sendiri: `max(minimum, (100% − gutter)/n)` menahan
 * jumlah kolomnya di `n`, sehingga di 1440px ia tidak diam-diam berkembang.
 * Pengganti `sm:grid-cols-2` / `sm:grid-cols-3`.
 */
const FIELD_MIN = 240;
const columnGrid = (columns: number, gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${
    gap * (columns - 1)
  }px) / ${columns})), 1fr))`,
});

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
  const t = useT();
  const { token } = theme.useToken();

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

  /** Umur manfaat adalah hitungan bulan — rata kanan + tabular-nums, tanpa Rp. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch("/api/fixed-assets/categories", {
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
        setError(first ?? data?.error ?? t("fixedAssets.saveCategoryFailed"));
        return;
      }
      toast(t("fixedAssets.categorySaved"), "success");
      setName("");
      setMonths("");
      router.refresh();
    } catch {
      setError(t("fixedAssets.networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div style={{ padding: token.paddingLG }}>
        <h2
          style={{
            margin: 0,
            marginBottom: token.margin,
            fontSize: token.fontSizeLG,
            fontWeight: token.fontWeightStrong,
          }}
        >
          {t("fixedAssets.newCategory")}
        </h2>
        <form onSubmit={handleSubmit}>
          <Flex vertical gap={token.margin}>
            <div style={columnGrid(2, token.margin)}>
              <Input
                id="cat-name"
                label={t("fixedAssets.categoryNameField")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("fixedAssets.categoryNamePlaceholder")}
                required
              />
              <Input
                id="cat-months"
                type="number"
                min="1"
                step="1"
                style={numberStyle}
                label={t("fixedAssets.defaultLifeField")}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                required
              />
              <Select
                id="cat-method"
                label={t("fixedAssets.defaultMethodField")}
                value="straight_line"
                disabled
                onChange={() => {}}
                options={[
                  { value: "straight_line", label: t("depreciationMethod.straight_line") },
                ]}
              />
            </div>
            <div style={columnGrid(3, token.margin)}>
              <Select
                id="cat-asset"
                label={t("fixedAssets.assetAccountField")}
                value={assetAccountId}
                onChange={(e) => setAssetAccountId(e.target.value)}
                options={acctOptions(assetAccounts)}
                placeholder={t("fixedAssets.pickAccount")}
                required
              />
              <Select
                id="cat-accum"
                label={t("fixedAssets.accumulatedAccountField")}
                value={accumulatedAccountId}
                onChange={(e) => setAccumulatedAccountId(e.target.value)}
                options={acctOptions(accumulatedAccounts)}
                placeholder={t("fixedAssets.pickAccount")}
                required
              />
              <Select
                id="cat-expense"
                label={t("fixedAssets.expenseAccountField")}
                value={expenseAccountId}
                onChange={(e) => setExpenseAccountId(e.target.value)}
                options={acctOptions(expenseAccounts)}
                placeholder={t("fixedAssets.pickAccount")}
                required
              />
            </div>
            {error && (
              /* `Alert` AntD: ikon + teks `colorText` di atas `colorErrorBg`,
                 jadi maknanya tidak bergantung warna. `role="alert"` tetap
                 milik kita — AntD tidak memasangnya. */
              <div role="alert">
                <Alert type="error" showIcon message={error} />
              </div>
            )}
            <div>
              <Button type="submit" disabled={saving}>
                {/* `Spin` menghormati `prefers-reduced-motion` lewat token gerak
                    AntD; `Loader2 animate-spin` tidak. */}
                {saving && <Spin size="small" />}
                {t("fixedAssets.saveCategory")}
              </Button>
            </div>
          </Flex>
        </form>
      </div>
    </Card>
  );
}
