"use client";

/**
 * Anggaran Akun — add/edit form + list with delete (issue #29). Posts a plan;
 * no journal is involved, so there is no rate/currency and no posting-error path.
 *
 * Dikonversi ke token Ant Design pada issue #197. Daftarnya kini `StaticTable`
 * (#189) meski berada di dalam komponen client: perendernya dipilih menurut
 * kebutuhan INTERAKTIVITAS, dan daftar ini tidak disortir maupun disaring —
 * `DataTable` hanya akan menambah rc-table ke rute ini tanpa imbalan.
 *
 * ── issue #216: formulirnya kini react-hook-form + zod ─────────────────────
 * Sampai #188 keempat isian ini dijaga `required` peramban. `Select` AntD bukan
 * `<select>` native, jadi atribut itu berhenti divalidasi dan akun/bulan/tahun
 * yang kosong berangkat ke server. Yang menggantikannya bukan tambalan
 * `required` melainkan pola form MASTER.md yang memang sudah wajib sejak #53:
 * `budgetSchema` yang SAMA dengan yang diurai `/api/budget` (diimpor, bukan
 * disalin) menolak isian kosong di client, dengan pesan inline berbahasa
 * pengguna.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Col, Flex, Row, Spin, theme } from "antd";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { useToast } from "@/components/ui/toast";
import { useDictionary, useT } from "@/lib/i18n/client";
import { monthNames } from "@/lib/i18n/labels";
import type { BudgetListRow } from "@/lib/budget-report";
import { DeleteOutlined, OrderedListOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";
import { applyServerFieldErrors } from "@/lib/form-server-errors";
import { budgetSchema, type BudgetInput } from "@/lib/validations/budget";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

/** Isian nominal — rata kanan + `tabular-nums`, seperti kolom uang. */
const NUMERIC_FIELD: React.CSSProperties = {
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

/**
 * Isian sebagaimana DIKETIK atau DIPILIH: semuanya string, karena itulah yang
 * dibawa kontrol HTML. Ini BUKAN skema kedua — tidak ada satu pun aturan
 * validasi di sini. Aturannya hanya ada di `budgetSchema`, yang mengubah
 * string-string ini menjadi angka (`z.coerce`) dan menolak yang kosong;
 * generik ketiga `useForm` menyatakan bentuk HASILNYA, sehingga `onSubmit`
 * menerima muatan yang sudah tervalidasi dan bertipe.
 */
interface BudgetFormValues {
  accountId: string;
  year: string;
  month: string;
  amount: string;
}

/** Isian yang benar-benar ada di layar — sisanya naik jadi galat formulir. */
const FIELDS = ["accountId", "year", "month", "amount"] as const;

interface AccountOption {
  id: number;
  code: string;
  name: string;
}

export function BudgetAccountsClient({
  accounts,
  budgets,
  defaultYear,
  defaultMonth,
}: {
  accounts: AccountOption[];
  budgets: BudgetListRow[];
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();
  const months = monthNames(useDictionary());
  const period = (year: number, month: number) =>
    t("common.monthOfYear", { month: months[month - 1], year });

  const [deleting, setDeleting] = useState<number | null>(null);

  const form = useForm<BudgetFormValues, unknown, BudgetInput>({
    /*
     * Cast HANYA menyelaraskan tipe statis: nilai isian di sini string,
     * sedangkan tipe MASUKAN `budgetSchema` longgar karena `z.coerce`. Validasi
     * runtime tetap dijalankan skema itu apa adanya — pola yang sama dengan
     * `customers/new` dan `payment-form.tsx`.
     */
    resolver: zodResolver(budgetSchema) as unknown as Resolver<
      BudgetFormValues,
      unknown,
      BudgetInput
    >,
    defaultValues: {
      accountId: "",
      year: String(defaultYear),
      month: String(defaultMonth),
      amount: "",
    },
  });

  async function onSubmit(values: BudgetInput) {
    try {
      const res = await apiFetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `values` sudah berupa angka — `budgetSchema` yang mengubahnya, jadi
        // yang dikirim persis yang divalidasi.
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        applyServerFieldErrors(form.setError, data, FIELDS, t("budget.saveBudgetFailed"));
        return;
      }
      toast(t("budget.budgetSaved"), "success");
      // Periodenya dipertahankan: biasanya beberapa akun diisi berurutan untuk
      // bulan yang sama.
      form.reset({
        accountId: "",
        year: String(values.year),
        month: String(values.month),
        amount: "",
      });
      router.refresh();
    } catch {
      form.setError("root", { message: t("budget.networkFailed") });
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/budget/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? t("budget.deleteBudgetFailed"), "error");
        return;
      }
      toast(t("budget.budgetDeleted"), "success");
      router.refresh();
    } catch {
      toast(t("budget.networkFailedShort"), "error");
    } finally {
      setDeleting(null);
    }
  }

  const columns: SaiColumns<BudgetListRow> = [
    {
      key: "period",
      dataIndex: "year",
      title: t("budget.monthField"),
      align: "left",
      render: (_v, b) => period(b.year, b.month),
    },
    {
      key: "account",
      dataIndex: "accountName",
      title: t("common.account"),
      align: "left",
      render: (_v, b) => (
        <>
          <span
            style={{
              marginInlineEnd: token.marginXS,
              fontFamily: token.fontFamilyCode,
              color: token.colorTextSecondary,
            }}
          >
            {b.accountCode}
          </span>
          {b.accountName}
        </>
      ),
    },
    moneyColumn<BudgetListRow>({
      dataIndex: "amount",
      title: t("budget.colBudget"),
      sorter: false,
    }),
    {
      key: "actions",
      title: t("common.actions"),
      align: "right",
      render: (_v, b) => (
        // Menghapus anggaran mengubah angka "Realisasi vs Anggaran" yang mungkin
        // sudah dibaca orang lain, jadi dikonfirmasi dulu (issue #6).
        <ConfirmDialog
          title={t("budget.deleteBudgetTitle")}
          message={t("budget.deleteBudgetMessage", {
            code: b.accountCode,
            name: b.accountName,
            period: period(b.year, b.month),
          })}
          confirmLabel={t("budget.deleteBudgetConfirm")}
          onConfirm={() => handleDelete(b.id)}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleting === b.id}
              aria-label={t("budget.deleteBudgetAria", {
                code: b.accountCode,
                period: period(b.year, b.month),
              })}
            >
              {deleting === b.id ? <Spin size="small" /> : <DeleteOutlined aria-hidden="true" />}
              {t("common.delete")}
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <Flex vertical gap={token.marginLG}>
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
            {t("budget.setBudget")}
          </h2>
          <Form {...form}>
            {/* `noValidate`: validasinya milik zod sekarang, dan gelembung
                peramban di samping pesan inline adalah dua bahasa galat di satu
                layar. */}
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <Row gutter={[token.margin, token.margin]}>
                <Col xs={24} sm={12}>
                  <FormField
                    control={form.control}
                    name="accountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("common.account")}</FormLabel>
                        <FormControl>
                          <NativeSelect
                            options={accounts.map((a) => ({
                              value: String(a.id),
                              label: `${a.code} · ${a.name}`,
                            }))}
                            placeholder={t("budget.pickAccountPlaceholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("budget.amountField")}</FormLabel>
                        <FormControl>
                          <TextInput
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            style={NUMERIC_FIELD}
                            placeholder="0"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("budget.yearField")}</FormLabel>
                        <FormControl>
                          <NativeSelect
                            options={Array.from(
                              { length: 6 },
                              (_, i) => defaultYear + 1 - i
                            ).map((y) => ({ value: String(y), label: String(y) }))}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FormField
                    control={form.control}
                    name="month"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("budget.monthField")}</FormLabel>
                        <FormControl>
                          <NativeSelect
                            options={months.map((name, i) => ({
                              value: String(i + 1),
                              label: name,
                            }))}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                {form.formState.errors.root && (
                  <Col xs={24}>
                    <div role="alert">
                      <Alert
                        type="error"
                        showIcon
                        message={form.formState.errors.root.message}
                      />
                    </div>
                  </Col>
                )}
                <Col xs={24}>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Spin size="small" />}
                    {t("budget.submitBudget")}
                  </Button>
                </Col>
              </Row>
            </form>
          </Form>
        </div>
      </Card>

      {budgets.length === 0 ? (
        <EmptyState
          icon={<OrderedListOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={t("budget.emptyBudgetTitle")}
          description={t("budget.emptyBudgetDescription")}
        />
      ) : (
        <Card>
          <StaticTable<BudgetListRow> columns={columns} rows={budgets} rowKey={(b) => b.id} />
        </Card>
      )}
    </Flex>
  );
}
