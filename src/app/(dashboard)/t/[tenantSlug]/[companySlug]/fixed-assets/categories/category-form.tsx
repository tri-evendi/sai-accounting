"use client";

/**
 * Kategori aset tetap — buat kategori dengan default metode, umur, & akun (issue #28).
 *
 * Dikonversi ke token Ant Design pada issue #197: yang berubah hanya kulitnya —
 * kisi isian, jarak, dan galat formulir.
 *
 * ── issue #216: mesinnya react-hook-form + zod ─────────────────────────────
 * Ketiga akun default dipilih lewat `Select` AntD, yang sejak #188 tidak lagi
 * memvalidasi `required` (bukan `<select>` native). Penggantinya bukan tambalan
 * melainkan pola form MASTER.md: `fixedAssetCategorySchema` yang SAMA dengan
 * yang diurai `/api/fixed-assets/categories` (diimpor, bukan disalin) menolak
 * isian kosong di client, dengan pesan inline berbahasa pengguna.
 */
import { useRouter } from "next/navigation";
import { Alert, Flex, Spin, theme } from "antd";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useToast } from "@/components/ui/toast";
import type { AccountOption } from "../new/asset-form";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import { applyServerFieldErrors } from "@/lib/form-server-errors";
import {
  fixedAssetCategorySchema,
  type FixedAssetCategoryInput,
} from "@/lib/validations/fixed-asset";

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

/**
 * Isian sebagaimana DIKETIK/DIPILIH — string, seperti nilai kontrol HTML. Bukan
 * skema kedua: aturannya seluruhnya milik `fixedAssetCategorySchema`.
 */
interface CategoryFormValues {
  name: string;
  defaultUsefulLifeMonths: string;
  defaultMethod: string;
  assetAccountId: string;
  accumulatedAccountId: string;
  expenseAccountId: string;
}

/** Isian yang benar-benar ada di layar — sisanya naik jadi galat formulir. */
const FIELDS = [
  "name",
  "defaultUsefulLifeMonths",
  "defaultMethod",
  "assetAccountId",
  "accumulatedAccountId",
  "expenseAccountId",
] as const;

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

  const form = useForm<CategoryFormValues, unknown, FixedAssetCategoryInput>({
    // Cast HANYA menyelaraskan tipe statis; validasi runtime tetap milik skema.
    resolver: zodResolver(fixedAssetCategorySchema) as unknown as Resolver<
      CategoryFormValues,
      unknown,
      FixedAssetCategoryInput
    >,
    defaultValues: {
      name: "",
      defaultUsefulLifeMonths: "",
      defaultMethod: "straight_line",
      assetAccountId: defaults.assetAccountId ? String(defaults.assetAccountId) : "",
      accumulatedAccountId: defaults.accumulatedAccountId
        ? String(defaults.accumulatedAccountId)
        : "",
      expenseAccountId: defaults.expenseAccountId ? String(defaults.expenseAccountId) : "",
    },
  });

  const acctOptions = (opts: AccountOption[]) =>
    opts.map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` }));

  /** Umur manfaat adalah hitungan bulan — rata kanan + tabular-nums, tanpa Rp. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  async function onSubmit(values: FixedAssetCategoryInput) {
    try {
      const res = await apiFetch("/api/fixed-assets/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `values` sudah bertipe & ter-coerce oleh skema yang sama dengan yang
        // akan mengurainya di server.
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        applyServerFieldErrors(form.setError, data, FIELDS, t("fixedAssets.saveCategoryFailed"));
        return;
      }
      toast(t("fixedAssets.categorySaved"), "success");
      // Akun defaultnya dipertahankan: kategori berikutnya hampir selalu memakai
      // ketiga akun yang sama.
      form.resetField("name");
      form.resetField("defaultUsefulLifeMonths");
      router.refresh();
    } catch {
      form.setError("root", { message: t("fixedAssets.networkFailed") });
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
        <Form {...form}>
          {/* `noValidate`: validasinya milik zod sekarang. */}
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <Flex vertical gap={token.margin}>
              <div style={columnGrid(2, token.margin)}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("fixedAssets.categoryNameField")}</FormLabel>
                      <FormControl>
                        <TextInput
                          placeholder={t("fixedAssets.categoryNamePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultUsefulLifeMonths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("fixedAssets.defaultLifeField")}</FormLabel>
                      <FormControl>
                        <TextInput
                          type="number"
                          min="1"
                          step="1"
                          style={numberStyle}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Satu-satunya metode yang didukung mesin penyusutan; dikunci,
                    jadi tak pernah bisa kosong dan tak perlu tanda wajib. */}
                <FormField
                  control={form.control}
                  name="defaultMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fixedAssets.defaultMethodField")}</FormLabel>
                      <FormControl>
                        <NativeSelect
                          disabled
                          options={[
                            {
                              value: "straight_line",
                              label: t("depreciationMethod.straight_line"),
                            },
                          ]}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div style={columnGrid(3, token.margin)}>
                <FormField
                  control={form.control}
                  name="assetAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("fixedAssets.assetAccountField")}</FormLabel>
                      <FormControl>
                        <NativeSelect
                          options={acctOptions(assetAccounts)}
                          placeholder={t("fixedAssets.pickAccount")}
                          {...field}
                        />
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
                      <FormLabel required>
                        {t("fixedAssets.accumulatedAccountField")}
                      </FormLabel>
                      <FormControl>
                        <NativeSelect
                          options={acctOptions(accumulatedAccounts)}
                          placeholder={t("fixedAssets.pickAccount")}
                          {...field}
                        />
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
                        <NativeSelect
                          options={acctOptions(expenseAccounts)}
                          placeholder={t("fixedAssets.pickAccount")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {form.formState.errors.root && (
                /* `Alert` AntD: ikon + teks `colorText` di atas `colorErrorBg`,
                   jadi maknanya tidak bergantung warna. `role="alert"` tetap
                   milik kita — AntD tidak memasangnya. */
                <div role="alert">
                  <Alert type="error" showIcon message={form.formState.errors.root.message} />
                </div>
              )}
              <div>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {/* `Spin` menghormati `prefers-reduced-motion` lewat token gerak
                      AntD; `Loader2 animate-spin` tidak. */}
                  {form.formState.isSubmitting && <Spin size="small" />}
                  {t("fixedAssets.saveCategory")}
                </Button>
              </div>
            </Flex>
          </form>
        </Form>
      </div>
    </Card>
  );
}
