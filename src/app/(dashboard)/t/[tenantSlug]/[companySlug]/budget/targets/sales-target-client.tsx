"use client";

/**
 * Target Penjualan — add/edit form + list with delete (issue #29). A plan; no
 * journal, no rate/currency. Customer/item are optional planning tags.
 *
 * Dikonversi ke token Ant Design pada issue #197; daftarnya `StaticTable`
 * (#189) — tidak ada sortir/filter seketika yang dibeli dengan `DataTable`.
 *
 * ── issue #216: formulirnya kini react-hook-form + zod ─────────────────────
 * `salesTargetSchema` yang SAMA dengan yang diurai `/api/budget/targets`
 * (diimpor, bukan disalin) menolak isian kosong di client. Yang paling penting
 * di formulir ini adalah NOMINALNYA: `Number("")` adalah `0`, dan nol di sini
 * adalah target yang sah — jadi isian kosong yang lolos akan tersimpan sebagai
 * "target nol", bukan sebagai kekeliruan yang terlihat. Skema itulah yang
 * membedakan keduanya (lihat `money` di `validations/budget.ts`).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Col, Flex, Row, Spin, theme } from "antd";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
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
import type { SalesTargetListRow } from "@/lib/budget-report";
import { AimOutlined, DeleteOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";
import { applyServerFieldErrors } from "@/lib/form-server-errors";
import { salesTargetSchema, type SalesTargetInput } from "@/lib/validations/budget";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** `sm:max-w-xs` lama — isian nominal tidak perlu selebar kartunya. */
const AMOUNT_MAX_WIDTH = 320;

/** Isian nominal — rata kanan + `tabular-nums`, seperti kolom uang. */
const NUMERIC_FIELD: React.CSSProperties = {
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

/**
 * Isian sebagaimana DIPILIH/DIKETIK — string, seperti nilai kontrol HTML. Bukan
 * skema kedua: aturannya seluruhnya milik `salesTargetSchema`, yang meng-coerce
 * string ini menjadi angka dan memperlakukan pilihan kosong sebagai `null`
 * ("berlaku untuk semua"), bukan sebagai id `0`.
 */
interface SalesTargetFormValues {
  year: string;
  month: string;
  customerId: string;
  itemId: string;
  amount: string;
}

/** Isian yang benar-benar ada di layar — sisanya naik jadi galat formulir. */
const FIELDS = ["year", "month", "customerId", "itemId", "amount"] as const;

interface NamedOption {
  id: number;
  name: string;
}

export function SalesTargetClient({
  customers,
  items,
  targets,
  defaultYear,
  defaultMonth,
}: {
  customers: NamedOption[];
  items: NamedOption[];
  targets: SalesTargetListRow[];
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const translate = useT();
  const { token } = theme.useToken();
  const months = monthNames(useDictionary());
  const period = (year: number, month: number) =>
    translate("common.monthOfYear", { month: months[month - 1], year });

  const [deleting, setDeleting] = useState<number | null>(null);

  const form = useForm<SalesTargetFormValues, unknown, SalesTargetInput>({
    // Cast HANYA menyelaraskan tipe statis; validasi runtime tetap dijalankan
    // `salesTargetSchema` apa adanya (pola yang sama dengan `payment-form.tsx`).
    resolver: zodResolver(salesTargetSchema) as unknown as Resolver<
      SalesTargetFormValues,
      unknown,
      SalesTargetInput
    >,
    defaultValues: {
      year: String(defaultYear),
      month: String(defaultMonth),
      customerId: "",
      itemId: "",
      amount: "",
    },
  });

  async function onSubmit(values: SalesTargetInput) {
    try {
      const res = await apiFetch("/api/budget/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `values` sudah berupa angka/`null` — skema yang mengubahnya, jadi yang
        // dikirim persis yang divalidasi.
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        applyServerFieldErrors(form.setError, data, FIELDS, translate("budget.saveTargetFailed"));
        return;
      }
      toast(translate("budget.targetSaved"), "success");
      // Hanya nominalnya yang dikosongkan: periode & penanda biasanya dipakai
      // ulang untuk baris target berikutnya.
      form.resetField("amount");
      router.refresh();
    } catch {
      form.setError("root", { message: translate("budget.networkFailed") });
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/budget/targets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? translate("budget.deleteTargetFailed"), "error");
        return;
      }
      toast(translate("budget.targetDeleted"), "success");
      router.refresh();
    } catch {
      toast(translate("budget.networkFailedShort"), "error");
    } finally {
      setDeleting(null);
    }
  }

  const columns: SaiColumns<SalesTargetListRow> = [
    {
      key: "period",
      dataIndex: "year",
      title: translate("budget.monthField"),
      align: "left",
      render: (_v, r) => period(r.year, r.month),
    },
    {
      key: "customerName",
      dataIndex: "customerName",
      title: translate("common.customer"),
      align: "left",
      // Tanpa pelanggan = target berlaku untuk SEMUA, bukan nilai yang hilang.
      render: (_v, r) => r.customerName ?? translate("common.all"),
    },
    {
      key: "itemName",
      dataIndex: "itemName",
      title: translate("budget.colCommodity"),
      align: "left",
      render: (_v, r) => r.itemName ?? translate("common.all"),
    },
    moneyColumn<SalesTargetListRow>({
      dataIndex: "amount",
      title: translate("budget.colTarget"),
      sorter: false,
    }),
    {
      key: "actions",
      title: translate("common.actions"),
      align: "right",
      render: (_v, r) => (
        <ConfirmDialog
          title={translate("budget.deleteTargetTitle")}
          message={translate("budget.deleteTargetMessage", {
            period: period(r.year, r.month),
            customer: r.customerName ?? translate("budget.allCustomersLower"),
            item: r.itemName ?? translate("budget.allItemsLower"),
          })}
          confirmLabel={translate("budget.deleteTargetConfirm")}
          onConfirm={() => handleDelete(r.id)}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleting === r.id}
              aria-label={translate("budget.deleteTargetAria", {
                period: period(r.year, r.month),
              })}
            >
              {deleting === r.id ? <Spin size="small" /> : <DeleteOutlined aria-hidden="true" />}
              {translate("common.delete")}
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
            {translate("budget.setTarget")}
          </h2>
          <Form {...form}>
            {/* `noValidate`: validasinya milik zod sekarang. */}
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <Row gutter={[token.margin, token.margin]}>
                <Col xs={24} sm={12}>
                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{translate("budget.yearField")}</FormLabel>
                        <FormControl>
                          <SelectField
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
                        <FormLabel required>{translate("budget.monthField")}</FormLabel>
                        <FormControl>
                          <SelectField
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
                <Col xs={24} sm={12}>
                  {/* Tanpa tanda wajib, dan memang tanpa: tak dipilih = target
                      berlaku untuk SEMUA pelanggan, sebuah nilai yang sah. */}
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{translate("budget.customerOptional")}</FormLabel>
                        <FormControl>
                          <SelectField
                            placeholder={translate("budget.allCustomers")}
                            options={[
                              { value: "", label: translate("budget.allCustomers") },
                              ...customers.map((c) => ({
                                value: String(c.id),
                                label: c.name,
                              })),
                            ]}
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
                    name="itemId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{translate("budget.itemOptional")}</FormLabel>
                        <FormControl>
                          <SelectField
                            placeholder={translate("budget.allItems")}
                            options={[
                              { value: "", label: translate("budget.allItems") },
                              ...items.map((it) => ({
                                value: String(it.id),
                                label: it.name,
                              })),
                            ]}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col xs={24}>
                  <div style={{ maxWidth: AMOUNT_MAX_WIDTH }}>
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>
                            {translate("budget.targetAmountField")}
                          </FormLabel>
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
                  </div>
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
                  <Button variant="primary" type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Spin size="small" />}
                    {translate("budget.submitTarget")}
                  </Button>
                </Col>
              </Row>
            </form>
          </Form>
        </div>
      </Card>

      {targets.length === 0 ? (
        <EmptyState
          icon={<AimOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={translate("budget.emptyTargetTitle")}
          description={translate("budget.emptyTargetDescription")}
        />
      ) : (
        <Card>
          <StaticTable<SalesTargetListRow>
            columns={columns}
            rows={targets}
            rowKey={(r) => r.id}
          />
        </Card>
      )}
    </Flex>
  );
}
