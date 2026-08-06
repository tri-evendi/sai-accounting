"use client";

/**
 * Daftarkan aset tetap (issue #28).
 *
 * Kategori dipilih dulu; metode, umur manfaat, dan tiga akun (aset/akumulasi/
 * beban) terisi dari kategori dan bisa di-override. Nilai penyusutan bulanan
 * ditampilkan langsung agar pengguna melihat dampaknya sebelum menyimpan.
 * Registrasi TIDAK memposting jurnal — penyusutan & pelepasan yang menjurnal.
 *
 * Dikonversi ke token Ant Design pada issue #197 — kulitnya saja; state,
 * penjaga, dan aritmetika penyusutannya tidak disentuh.
 */
import { useMemo, useState } from "react";
import { Alert, Flex, Spin, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Money } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { straightLineMonthly } from "@/lib/depreciation";
import { useT } from "@/lib/i18n/client";
import { InfoCircleOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Kisi isian yang runtuh sendiri — pengganti `sm:grid-cols-2`/`sm:grid-cols-3`.
 * `max(minimum, (100% − gutter)/n)` menahan jumlah kolomnya di `n`.
 */
const FIELD_MIN = 240;
const columnGrid = (columns: number, gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${
    gap * (columns - 1)
  }px) / ${columns})), 1fr))`,
});

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
  const { token } = theme.useToken();

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

  /** Isian angka — rata kanan + `tabular-nums`, seperti kolom uang. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

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
      const res = await apiFetch("/api/fixed-assets", {
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
    <form onSubmit={handleSubmit}>
      <Card style={{ marginBottom: token.marginLG }}>
        <div style={{ padding: token.paddingLG }}>
        <div style={columnGrid(2, token.margin)}>
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
            style={numberStyle}
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
            style={numberStyle}
            label={t("fixedAssets.residualField")}
            value={residualValue}
            onChange={(e) => setResidualValue(e.target.value)}
          />

          <Input
            id="usefulLifeMonths"
            type="number"
            min="1"
            step="1"
            style={numberStyle}
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

        <div style={{ ...columnGrid(3, token.margin), marginTop: token.margin }}>
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

        {/* Penyusutan bulanan lewat `Money` (#186): nilai yang belum bisa
            dihitung tidak dirender sebagai Rp 0 — barisnya memang tak muncul. */}
        {monthly != null && (
          <Typography.Paragraph style={{ marginTop: token.margin, marginBottom: 0 }}>
            <Typography.Text type="secondary">{t("fixedAssets.monthlyPreview")} </Typography.Text>
            <Money
              value={monthly}
              currency="IDR"
              style={{ fontWeight: token.fontWeightStrong }}
            />
          </Typography.Paragraph>
        )}

        {/* Catatan "registrasi tidak menjurnal": ikon + kata, bukan warna. */}
        <Flex
          align="flex-start"
          gap={token.marginXS}
          style={{
            marginTop: token.margin,
            padding: token.paddingXS,
            borderRadius: token.borderRadius,
            border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
            background: token.colorFillQuaternary,
          }}
        >
          <InfoCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSize, flexShrink: 0, marginTop: 2 }} />
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {t("fixedAssets.noJournalBefore")} <strong>{t("fixedAssets.noJournalNot")}</strong>{" "}
            {t("fixedAssets.noJournalMiddle")}{" "}
            <strong>{t("fixedAssets.noJournalDepreciation")}</strong> {t("fixedAssets.noJournalAnd")}{" "}
            <strong>{t("fixedAssets.noJournalDisposal")}</strong> {t("fixedAssets.noJournalTail")}
          </Typography.Text>
        </Flex>

        {error && (
          <div role="alert" style={{ marginTop: token.margin }}>
            <Alert type="error" showIcon message={error} />
          </div>
        )}
        </div>
      </Card>

      <Flex wrap gap={token.marginXS}>
        <Button type="submit" disabled={saving}>
          {saving && <Spin size="small" />}
          {t("fixedAssets.saveAsset")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/fixed-assets")}>
          {t("common.cancel")}
        </Button>
      </Flex>
    </form>
  );
}
