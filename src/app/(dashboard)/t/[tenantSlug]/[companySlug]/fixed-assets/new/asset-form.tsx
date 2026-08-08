"use client";

/**
 * Daftarkan aset tetap (issue #28).
 *
 * Kategori dipilih dulu; metode, umur manfaat, dan tiga akun (aset/akumulasi/
 * beban) terisi dari kategori dan bisa di-override. Nilai penyusutan bulanan
 * ditampilkan langsung agar pengguna melihat dampaknya sebelum menyimpan.
 * Registrasi TIDAK memposting jurnal — penyusutan & pelepasan yang menjurnal.
 *
 * Dikonversi ke token Ant Design pada issue #197 — kulitnya saja; penjaga dan
 * aritmetika penyusutannya tidak disentuh.
 *
 * ── issue #216: mesinnya react-hook-form + zod ─────────────────────────────
 * Empat isian pilihan di sini (kategori + tiga akun) kehilangan `required` yang
 * divalidasi peramban saat `Select` berpindah ke AntD (#188). Penggantinya pola
 * form MASTER.md: `fixedAssetSchema` yang SAMA dengan yang diurai
 * `/api/fixed-assets` (diimpor, bukan disalin) — termasuk aturan "residu harus
 * lebih kecil dari nilai perolehan", yang kini ketahuan SEBELUM menyimpan dan
 * mendarat tepat di isian residunya.
 */
import { useMemo } from "react";
import { Alert, Flex, Spin, theme, Typography } from "antd";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Money } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { straightLineMonthly } from "@/lib/depreciation";
import { useT } from "@/lib/i18n/client";
import { InfoCircleOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";
import { applyServerFieldErrors } from "@/lib/form-server-errors";
import { fixedAssetSchema, type FixedAssetInput } from "@/lib/validations/fixed-asset";

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

/**
 * Isian sebagaimana DIKETIK/DIPILIH — string, seperti nilai kontrol HTML. Bukan
 * skema kedua: aturannya seluruhnya milik `fixedAssetSchema`.
 */
interface AssetFormValues {
  categoryId: string;
  name: string;
  acquisitionDate: string;
  location: string;
  acquisitionCost: string;
  residualValue: string;
  usefulLifeMonths: string;
  depreciationMethod: string;
  assetAccountId: string;
  accumulatedAccountId: string;
  expenseAccountId: string;
}

/** Isian yang benar-benar ada di layar — sisanya naik jadi galat formulir. */
const FIELDS = [
  "categoryId",
  "name",
  "acquisitionDate",
  "location",
  "acquisitionCost",
  "residualValue",
  "usefulLifeMonths",
  "depreciationMethod",
  "assetAccountId",
  "accumulatedAccountId",
  "expenseAccountId",
] as const;

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

  const form = useForm<AssetFormValues, unknown, FixedAssetInput>({
    // Cast HANYA menyelaraskan tipe statis; validasi runtime tetap milik skema.
    resolver: zodResolver(fixedAssetSchema) as unknown as Resolver<
      AssetFormValues,
      unknown,
      FixedAssetInput
    >,
    defaultValues: {
      categoryId: first ? String(first.id) : "",
      name: "",
      acquisitionDate: todayISO(),
      location: "",
      acquisitionCost: "",
      residualValue: "0",
      usefulLifeMonths: first ? String(first.defaultUsefulLifeMonths) : "",
      depreciationMethod: "straight_line",
      assetAccountId: first ? String(first.assetAccountId) : "",
      accumulatedAccountId: first ? String(first.accumulatedAccountId) : "",
      expenseAccountId: first ? String(first.expenseAccountId) : "",
    },
  });

  const acctOptions = (opts: AccountOption[]) =>
    opts.map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` }));

  /** Isian angka — rata kanan + `tabular-nums`, seperti kolom uang. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  /**
   * Memilih kategori mengisi ulang umur manfaat dan ketiga akunnya — nilai yang
   * tetap boleh ditimpa pengguna sesudahnya. `shouldValidate` tidak dipasang:
   * mengisi isian untuk pengguna lalu langsung menilainya akan memerahkan
   * formulir yang belum sempat disentuh.
   */
  function applyCategory(id: string) {
    form.setValue("categoryId", id, { shouldDirty: true });
    const cat = categories.find((c) => String(c.id) === id);
    if (!cat) return;
    form.setValue("usefulLifeMonths", String(cat.defaultUsefulLifeMonths));
    form.setValue("assetAccountId", String(cat.assetAccountId));
    form.setValue("accumulatedAccountId", String(cat.accumulatedAccountId));
    form.setValue("expenseAccountId", String(cat.expenseAccountId));
  }

  /* Pratinjau penyusutan mengikuti isian saat diketik. `useWatch` (bukan
     `form.watch()`) supaya React Compiler tetap bisa memoisasi komponen ini. */
  const [acquisitionCost, residualValue, usefulLifeMonths] = useWatch({
    control: form.control,
    name: ["acquisitionCost", "residualValue", "usefulLifeMonths"],
  });

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

  async function onSubmit(values: FixedAssetInput) {
    try {
      const res = await apiFetch("/api/fixed-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `values` sudah ter-coerce oleh skema yang sama dengan yang akan
        // mengurainya di server — termasuk `residualValue` yang kosong menjadi 0.
        // Lokasi kosong tetap dikirim sebagai TIDAK ADA, bukan string kosong:
        // route menyimpan `location ?? null`, dan `""` di kolom itu berarti
        // "lokasinya diketahui, dan namanya kosong".
        body: JSON.stringify({ ...values, location: values.location || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        applyServerFieldErrors(form.setError, data, FIELDS, t("fixedAssets.saveAssetFailed"));
        return;
      }
      toast(t("fixedAssets.assetSaved"), "success");
      router.push("/fixed-assets");
      router.refresh();
    } catch {
      form.setError("root", { message: t("fixedAssets.networkFailed") });
    }
  }

  return (
    <Form {...form}>
    {/* `noValidate`: validasinya milik zod sekarang. */}
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Card style={{ marginBottom: token.marginLG }}>
        <div style={{ padding: token.paddingLG }}>
        <div style={columnGrid(2, token.margin)}>
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("fixedAssets.colCategory")}</FormLabel>
                <FormControl>
                  <NativeSelect
                    options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                    {...field}
                    // Memilih kategori ikut mengisi umur manfaat & ketiga akun,
                    // jadi `onChange` field-nya diganti, bukan ditambah.
                    onChange={(e) => applyCategory(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("fixedAssets.assetNameField")}</FormLabel>
                <FormControl>
                  <TextInput
                    placeholder={t("fixedAssets.assetNamePlaceholder")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="acquisitionDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("fixedAssets.acquisitionDateField")}</FormLabel>
                <FormControl>
                  <TextInput type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fixedAssets.locationField")}</FormLabel>
                <FormControl>
                  <TextInput
                    placeholder={t("fixedAssets.locationPlaceholder")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="acquisitionCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("fixedAssets.costField")}</FormLabel>
                <FormControl>
                  <TextInput type="number" step="0.01" min="0" style={numberStyle} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="residualValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fixedAssets.residualField")}</FormLabel>
                <FormControl>
                  <TextInput type="number" step="0.01" min="0" style={numberStyle} {...field} />
                </FormControl>
                {/* "Residu harus lebih kecil dari perolehan" (`superRefine`
                    skema) mendarat di sini — isian yang harus diubah. */}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="usefulLifeMonths"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("fixedAssets.lifeMonthsField")}</FormLabel>
                <FormControl>
                  <TextInput type="number" min="1" step="1" style={numberStyle} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Satu-satunya metode yang didukung mesin penyusutan; dikunci, jadi
              tak pernah bisa kosong dan tak perlu tanda wajib. */}
          <FormField
            control={form.control}
            name="depreciationMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fixedAssets.methodField")}</FormLabel>
                <FormControl>
                  <NativeSelect
                    disabled
                    options={[
                      { value: "straight_line", label: t("depreciationMethod.straight_line") },
                    ]}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div style={{ ...columnGrid(3, token.margin), marginTop: token.margin }}>
          <FormField
            control={form.control}
            name="assetAccountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("fixedAssets.assetAccountField")}</FormLabel>
                <FormControl>
                  <NativeSelect options={acctOptions(assetAccounts)} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="accumulatedAccountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("fixedAssets.accumulatedAccountField")}</FormLabel>
                <FormControl>
                  <NativeSelect options={acctOptions(accumulatedAccounts)} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="expenseAccountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("fixedAssets.expenseAccountField")}</FormLabel>
                <FormControl>
                  <NativeSelect options={acctOptions(expenseAccounts)} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
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

        {form.formState.errors.root && (
          <div role="alert" style={{ marginTop: token.margin }}>
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          </div>
        )}
        </div>
      </Card>

      <Flex wrap gap={token.marginXS}>
        <Button variant="primary" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spin size="small" />}
          {t("fixedAssets.saveAsset")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/fixed-assets")}>
          {t("common.cancel")}
        </Button>
      </Flex>
    </form>
    </Form>
  );
}
