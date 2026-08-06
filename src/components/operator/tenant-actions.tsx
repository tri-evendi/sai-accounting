"use client";

/**
 * Panel TINDAKAN OPERATOR (issue #155) — empat aksi tulis konsol, satu panel
 * per aksi, karena setiap tombolnya memindahkan uang, mencabut akses, atau
 * menghancurkan data:
 *
 *   1. tandai tagihan lunas (transfer manual) — jalur PAYMENT_GATEWAY=manual;
 *   2. ganti paket — peringatan (bukan penghalang) saat kuota < pemakaian;
 *   3. tangguhkan / pulihkan — layar menyatakan gamblang: HANYA-BACA, bukan
 *      terkunci dan bukan terhapus (§7.4 — hak hukum pelanggan);
 *   4. eksekusi penghapusan — hanya lewat masa tenggang, konfirmasi KETIK
 *      ULANG slug, dan layar menyatakan apa yang TIDAK dihapus (UU KUP).
 *
 * Pola form MASTER.md: react-hook-form + zodResolver dengan SKEMA YANG SAMA
 * yang diurai ulang server action (`lib/validations/operator.ts` — satu
 * skema, dua sisi). Aksi 1–3 dikonfirmasi `ConfirmDialog`; aksi 4 memakai
 * ketik-ulang-slug sebagai konfirmasinya (lebih berat dari sekadar "Ya").
 * Semua progressive disclosure: formulir baru terbuka saat tombolnya diminta.
 *
 * ── Setelah AntD (issue #240, fase C9) ────────────────────────────────────
 * Setiap pemberitahuan hasil, peringatan, dan galat kini `Alert` AntD — ikon +
 * teks di atas latar tipis, jadi maknanya tidak bergantung warna. `Alert`
 * menulis `role="alert"` sendiri dan membuang `role` yang dioper, jadi
 * pembungkus `role="status"` yang dulu ada di sini tidak bisa dipertahankan;
 * alasan lengkapnya di kepala `app/(auth)/forgot-password/page.tsx`.
 *
 * ⚠ Konsol operator berjalan di domain terpisah (`ops.`) dan tidak boleh
 * mewarisi konteks perusahaan — berkas ini tidak mengimpor apa pun yang
 * menariknya, termasuk untuk keperluan tampilan.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";
import type { GlobalToken } from "antd";
import {
  ArrowLeftRight,
  Banknote,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TextInput } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/client";
import { formatMoney, type CurrencyCode } from "@/lib/money-format";
import {
  changePlanSchema,
  deletionExecuteSchema,
  manualPaymentSchema,
  suspensionSchema,
  type ChangePlanFormInput,
  type DeletionExecuteFormInput,
  type ManualPaymentFormInput,
  type SuspensionFormInput,
} from "@/lib/validations/operator";
import type { OperatorActionResult } from "@/app/(operator)/operator/tenants/[id]/actions";
import {
  operatorChangePlan,
  operatorExecuteDeletion,
  operatorMarkInvoicePaid,
  operatorSetSuspension,
} from "@/app/(operator)/operator/tenants/[id]/actions";

/* ── Bentuk data dari halaman server (serial, tanggal sudah terformat) ────── */

export interface TenantActionsProps {
  tenantId: number;
  tenantSlug: string;
  tenantName: string;
  /** Status tenant di basis KENDALI (salinan yang dibaca penjaga). */
  tenantStatus: string;
  /** Status langganan platform; `null` = belum ada / platform mati. */
  subscriptionStatus: string | null;
  usage: { companies: number; users: number };
  currentPlanKey: string;
  /** false = `sai_platform` tak terjangkau → aksi penagihan dimatikan. */
  billingAvailable: boolean;
  issuedInvoices: {
    number: string;
    total: string;
    currency: string;
    dueDateLabel: string;
  }[];
  plans:
    | {
        key: string;
        name: string;
        priceMonthly: string;
        currency: string;
        maxCompanies: number;
        maxUsers: number;
      }[]
    | null;
  deletionRequest: {
    id: number;
    graceEndsAtLabel: string;
    pastGrace: boolean;
    note: string | null;
  } | null;
}

/* ── Bingkai panel + pesan hasil yang seragam ─────────────────────────────── */

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2`, tetap CSS grid karena beberapa isian membentang dengan
 * `gridColumn: "1 / -1"` (di dalam `Col` flexbox properti itu tak berarti apa
 * pun; catatan yang sama di `shared/invoice-fx-fields.tsx`).
 */
const FIELD_MIN = 240;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});

/** Isian yang mengambil seluruh lebar kisi — pengganti `sm:col-span-2`. */
const FULL_ROW: React.CSSProperties = { gridColumn: "1 / -1" };

/**
 * Kotak penjelas NETRAL — "apa yang sebenarnya terjadi" sebelum tombol berat.
 * Sengaja bukan `Alert`: ia bukan peringatan melainkan keterangan, dan memberi
 * ikon peringatan pada tiap keterangan membuat peringatan yang sebenarnya
 * berhenti menonjol.
 */
function noticeBox(token: GlobalToken): React.CSSProperties {
  return {
    margin: 0,
    padding: token.paddingSM,
    borderRadius: token.borderRadiusLG,
    background: token.colorFillQuaternary,
    color: token.colorText,
  };
}

function ActionPanel({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        padding: token.padding,
        borderRadius: token.borderRadiusLG,
        border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      <Flex align="center" gap={token.marginXS}>
        <span style={{ display: "inline-flex", color: token.colorTextSecondary }}>{icon}</span>
        <h3 style={{ margin: 0, fontWeight: token.fontWeightStrong, color: token.colorText }}>
          {title}
        </h3>
      </Flex>
      <p style={{ margin: 0, marginTop: token.marginXXS, color: token.colorTextSecondary }}>
        {description}
      </p>
      <div style={{ marginTop: token.marginSM }}>{children}</div>
    </div>
  );
}

function ResultNotice({ result }: { result: OperatorActionResult | null }) {
  const { token } = theme.useToken();
  if (!result || !result.ok) return null;
  return (
    <Flex vertical gap={token.marginXS}>
      <Alert type="success" showIcon message={result.message} />
      {result.warning && <Alert type="warning" showIcon message={result.warning} />}
    </Flex>
  );
}

function RootError({ message }: { message?: string }) {
  if (!message) return null;
  return <Alert type="error" showIcon message={message} />;
}

/** Field alasan — sama di keempat formulir (aturan #155: tanpa alasan, tanpa
 *  aksi). Generik longgar karena setiap form punya tipe nilainya sendiri. */
function ReasonField({
  control,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
}) {
  const t = useT();
  return (
    <FormField
      control={control}
      name="reason"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("operator.actions.reasonLabel")}</FormLabel>
          <FormControl>
            <Textarea rows={2} {...field} />
          </FormControl>
          <FormDescription>{t("operator.actions.reasonHint")}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/* ══ 1. Tandai lunas (transfer manual) ═════════════════════════════════════ */

function MarkPaidPanel({
  tenantId,
  invoices,
}: {
  tenantId: number;
  invoices: TenantActionsProps["issuedInvoices"];
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<ManualPaymentFormInput | null>(null);
  const [result, setResult] = useState<OperatorActionResult | null>(null);

  const form = useForm<ManualPaymentFormInput>({
    resolver: zodResolver(manualPaymentSchema) as Resolver<ManualPaymentFormInput>,
    defaultValues: {
      tenantId,
      invoiceNumber: "",
      amount: undefined,
      transferDate: "",
      bankRef: "",
      reason: "",
    },
  });

  const selectedNumber = useWatch({ control: form.control, name: "invoiceNumber" });
  const selected = invoices.find((inv) => inv.number === selectedNumber) ?? null;

  async function runAction(values: ManualPaymentFormInput) {
    const res = await operatorMarkInvoicePaid(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    setOpen(false);
    form.reset();
    router.refresh();
  }

  if (invoices.length === 0) {
    return (
      <Flex vertical gap={token.marginXS}>
        <ResultNotice result={result} />
        <p style={{ margin: 0, color: token.colorTextSecondary }}>
          {t("operator.actions.markPaid.empty")}
        </p>
      </Flex>
    );
  }

  if (!open) {
    return (
      <Flex vertical gap={token.marginXS}>
        <ResultNotice result={result} />
        <Button
          variant="secondary"
          size="sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setOpen(true)}
        >
          <Banknote size={16} aria-hidden="true" />
          {t("operator.actions.markPaid.submit")}
        </Button>
      </Flex>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => setConfirming(values))}
        noValidate
        style={twoColumnGrid(token.marginSM)}
      >
        <div style={FULL_ROW}>
          <FormField
            control={form.control}
            name="invoiceNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.actions.markPaid.invoiceLabel")}</FormLabel>
                <FormControl>
                  <NativeSelect
                    placeholder="—"
                    options={invoices.map((inv) => ({
                      value: inv.number,
                      label: t("operator.actions.markPaid.invoiceOption", {
                        number: inv.number,
                        date: inv.dueDateLabel,
                        total: formatMoney(Number(inv.total), inv.currency as CurrencyCode),
                      }),
                    }))}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      const inv = invoices.find((row) => row.number === e.target.value);
                      if (inv) {
                        form.setValue("amount", Math.round(Number(inv.total)), {
                          shouldValidate: false,
                        });
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("operator.actions.markPaid.amountLabel")}</FormLabel>
              <FormControl>
                <MoneyInput
                  decimals={0}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                />
              </FormControl>
              {selected && (
                <FormDescription>
                  {t("operator.actions.markPaid.amountHint", {
                    total: formatMoney(Number(selected.total), selected.currency as CurrencyCode),
                  })}
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="transferDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("operator.actions.markPaid.dateLabel")}</FormLabel>
              <FormControl>
                <TextInput type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div style={FULL_ROW}>
          <FormField
            control={form.control}
            name="bankRef"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.actions.markPaid.refLabel")}</FormLabel>
                <FormControl>
                  <TextInput autoComplete="off" spellCheck={false} {...field} />
                </FormControl>
                <FormDescription>{t("operator.actions.markPaid.refHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div style={FULL_ROW}>
          <ReasonField control={form.control} />
        </div>

        <Flex vertical gap={token.marginXS} style={FULL_ROW}>
          <RootError message={form.formState.errors.root?.message} />
          <Flex gap={token.marginXS}>
            <Button type="submit" size="sm">
              {t("operator.actions.markPaid.submit")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
          </Flex>
        </Flex>

        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
          title={t("operator.actions.markPaid.confirmTitle")}
          message={
            confirming
              ? t("operator.actions.markPaid.confirmBody", {
                  number: confirming.invoiceNumber,
                  amount: formatMoney(confirming.amount, "IDR"),
                })
              : ""
          }
          confirmVariant="primary"
          confirmLabel={t("operator.actions.markPaid.submit")}
          onConfirm={async () => {
            if (confirming) await runAction(confirming);
          }}
        />
      </form>
    </Form>
  );
}

/* ══ 2. Ganti paket ════════════════════════════════════════════════════════ */

function ChangePlanPanel({
  tenantId,
  tenantName,
  tenantStatus,
  currentPlanKey,
  usage,
  plans,
}: {
  tenantId: number;
  tenantName: string;
  tenantStatus: string;
  currentPlanKey: string;
  usage: { companies: number; users: number };
  plans: NonNullable<TenantActionsProps["plans"]>;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<ChangePlanFormInput | null>(null);
  const [result, setResult] = useState<OperatorActionResult | null>(null);

  const form = useForm<ChangePlanFormInput>({
    resolver: zodResolver(changePlanSchema) as Resolver<ChangePlanFormInput>,
    defaultValues: { tenantId, planKey: "", reason: "" },
  });

  const selectedKey = useWatch({ control: form.control, name: "planKey" });
  const selectedPlan = plans.find((plan) => plan.key === selectedKey) ?? null;
  const exceeded = selectedPlan
    ? {
        companies: usage.companies > selectedPlan.maxCompanies,
        users: usage.users > selectedPlan.maxUsers,
      }
    : { companies: false, users: false };

  async function runAction(values: ChangePlanFormInput) {
    const res = await operatorChangePlan(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    setOpen(false);
    form.reset();
    router.refresh();
  }

  if (!open) {
    return (
      <Flex vertical gap={token.marginXS}>
        <ResultNotice result={result} />
        <Button
          variant="secondary"
          size="sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setOpen(true)}
        >
          <ArrowLeftRight size={16} aria-hidden="true" />
          {t("operator.actions.plan.submit")}
        </Button>
      </Flex>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => setConfirming(values))} noValidate>
        <Flex vertical gap={token.marginSM}>
        <p style={{ margin: 0, color: token.colorTextSecondary }}>
          {t("operator.actions.plan.current", { plan: currentPlanKey })}
        </p>
        {tenantStatus === "suspended" && (
          <Alert type="warning" showIcon message={t("operator.actions.plan.suspendedNote")} />
        )}
        <FormField
          control={form.control}
          name="planKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("operator.actions.plan.planLabel")}</FormLabel>
              <FormControl>
                <NativeSelect
                  placeholder="—"
                  options={plans.map((plan) => ({
                    value: plan.key,
                    label: t("operator.actions.plan.option", {
                      name: plan.name,
                      price: formatMoney(Number(plan.priceMonthly), plan.currency as CurrencyCode),
                      companies: plan.maxCompanies,
                      users: plan.maxUsers,
                    }),
                  }))}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {(exceeded.companies || exceeded.users) && selectedPlan && (
          /* Peringatan, BUKAN penghalang: kuota di bawah pemakaian tetap boleh
             dipilih — yang tidak boleh adalah memilihnya tanpa tahu. */
          <Alert
            type="warning"
            showIcon
            icon={<ShieldAlert size={16} aria-hidden="true" />}
            message={t("operator.actions.plan.quotaWarningTitle")}
            description={
              <>
                <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
                  {exceeded.companies && (
                    <li>
                      {t("operator.actions.plan.quotaWarningCompanies", {
                        used: usage.companies,
                        max: selectedPlan.maxCompanies,
                      })}
                    </li>
                  )}
                  {exceeded.users && (
                    <li>
                      {t("operator.actions.plan.quotaWarningUsers", {
                        used: usage.users,
                        max: selectedPlan.maxUsers,
                      })}
                    </li>
                  )}
                </ul>
                <p style={{ margin: 0, marginTop: token.marginXXS }}>
                  {t("operator.actions.plan.quotaWarningNote")}
                </p>
              </>
            }
          />
        )}

        <ReasonField control={form.control} />

        <RootError message={form.formState.errors.root?.message} />
        <Flex gap={token.marginXS}>
          <Button type="submit" size="sm">
            {t("operator.actions.plan.submit")}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </Flex>
        </Flex>

        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
          title={t("operator.actions.plan.confirmTitle")}
          message={
            confirming
              ? t("operator.actions.plan.confirmBody", {
                  tenant: tenantName,
                  from: currentPlanKey,
                  to: confirming.planKey,
                })
              : ""
          }
          confirmVariant="primary"
          confirmLabel={t("operator.actions.plan.submit")}
          onConfirm={async () => {
            if (confirming) await runAction(confirming);
          }}
        />
      </form>
    </Form>
  );
}

/* ══ 3. Tangguhkan / pulihkan ══════════════════════════════════════════════ */

function SuspensionPanel({
  tenantId,
  tenantName,
  subscriptionStatus,
}: {
  tenantId: number;
  tenantName: string;
  subscriptionStatus: string | null;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<SuspensionFormInput | null>(null);
  const [result, setResult] = useState<OperatorActionResult | null>(null);

  const mode: "suspend" | "restore" = subscriptionStatus === "suspended" ? "restore" : "suspend";

  const form = useForm<SuspensionFormInput>({
    resolver: zodResolver(suspensionSchema) as Resolver<SuspensionFormInput>,
    defaultValues: { tenantId, mode, reason: "" },
  });

  async function runAction(values: SuspensionFormInput) {
    /* `mode` diambil ulang dari PROP, bukan dari nilai form: setelah suspensi
     * berhasil `router.refresh()` mengubah status tenant, tetapi
     * `defaultValues` react-hook-form tidak ikut berubah — memakai nilai form
     * berarti pemulihan berikutnya terkirim sebagai "suspend" lagi. Arahnya
     * ditentukan keadaan sekarang, bukan keadaan saat formulir dibuka. */
    const res = await operatorSetSuspension({ ...values, mode });
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    setOpen(false);
    form.reset({ tenantId, mode, reason: "" });
    router.refresh();
  }

  if (subscriptionStatus === null) {
    return (
      <p style={{ margin: 0, color: token.colorTextSecondary }}>
        {t("operator.actions.suspension.errNoSubscription")}
      </p>
    );
  }

  const submitLabel =
    mode === "suspend"
      ? t("operator.actions.suspension.suspendSubmit")
      : t("operator.actions.suspension.restoreSubmit");

  if (!open) {
    return (
      <Flex vertical gap={token.marginXS}>
        <ResultNotice result={result} />
        <Button
          variant={mode === "suspend" ? "danger" : "secondary"}
          size="sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setOpen(true)}
        >
          {mode === "suspend" ? (
            <PauseCircle size={16} aria-hidden="true" />
          ) : (
            <PlayCircle size={16} aria-hidden="true" />
          )}
          {submitLabel}
        </Button>
      </Flex>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => setConfirming(values))} noValidate>
        <Flex vertical gap={token.marginSM}>
        {/* Apa yang SEBENARNYA terjadi — gamblang, sebelum tombol apa pun. */}
        <p style={noticeBox(token)}>
          {mode === "suspend"
            ? t("operator.actions.suspension.readOnlyExplain")
            : t("operator.actions.suspension.restoreExplain")}
        </p>

        <ReasonField control={form.control} />

        <RootError message={form.formState.errors.root?.message} />
        <Flex gap={token.marginXS}>
          <Button type="submit" variant={mode === "suspend" ? "danger" : "primary"} size="sm">
            {submitLabel}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </Flex>
        </Flex>

        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
          title={
            mode === "suspend"
              ? t("operator.actions.suspension.confirmSuspendTitle")
              : t("operator.actions.suspension.confirmRestoreTitle")
          }
          message={
            mode === "suspend"
              ? t("operator.actions.suspension.confirmSuspendBody", { tenant: tenantName })
              : t("operator.actions.suspension.confirmRestoreBody", { tenant: tenantName })
          }
          confirmVariant={mode === "suspend" ? "danger" : "primary"}
          confirmLabel={submitLabel}
          onConfirm={async () => {
            if (confirming) await runAction(confirming);
          }}
        />
      </form>
    </Form>
  );
}

/* ══ 4. Eksekusi penghapusan ═══════════════════════════════════════════════ */

function DeletionPanel({
  tenantId,
  tenantSlug,
  deletionRequest,
}: {
  tenantId: number;
  tenantSlug: string;
  deletionRequest: TenantActionsProps["deletionRequest"];
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [result, setResult] = useState<OperatorActionResult | null>(null);
  const [confirming, setConfirming] = useState<DeletionExecuteFormInput | null>(null);

  const form = useForm<DeletionExecuteFormInput>({
    resolver: zodResolver(deletionExecuteSchema) as Resolver<DeletionExecuteFormInput>,
    defaultValues: { tenantId, confirmSlug: "", reason: "" },
  });
  const typedSlug = useWatch({ control: form.control, name: "confirmSlug" });

  if (!deletionRequest) {
    return (
      <p style={{ margin: 0, color: token.colorTextSecondary }}>
        {t("operator.actions.deletion.noRequest")}
      </p>
    );
  }

  if (!deletionRequest.pastGrace) {
    return (
      <Flex vertical gap={token.marginXS}>
        <Alert
          type="warning"
          showIcon
          message={t("operator.actions.deletion.graceActive", {
            id: deletionRequest.id,
            date: deletionRequest.graceEndsAtLabel,
          })}
        />
        {deletionRequest.note && (
          <p style={{ margin: 0, color: token.colorTextSecondary }}>
            {t("operator.actions.deletion.ownerNote", { note: deletionRequest.note })}
          </p>
        )}
      </Flex>
    );
  }

  async function runAction(values: DeletionExecuteFormInput) {
    const res = await operatorExecuteDeletion(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    form.reset();
    router.refresh();
  }

  if (result?.ok) {
    return <ResultNotice result={result} />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => setConfirming(values))} noValidate>
        <Flex vertical gap={token.marginSM}>
        <p style={{ margin: 0, color: token.colorText }}>
          {t("operator.actions.deletion.ready", {
            id: deletionRequest.id,
            date: deletionRequest.graceEndsAtLabel,
          })}
        </p>
        {deletionRequest.note && (
          <p style={{ margin: 0, color: token.colorTextSecondary }}>
            {t("operator.actions.deletion.ownerNote", { note: deletionRequest.note })}
          </p>
        )}

        {/* Apa yang terjadi — dan apa yang TIDAK dihapus, beserta alasannya. */}
        <div style={{ ...noticeBox(token), width: "100%" }}>
          <p style={{ margin: 0, fontWeight: token.fontWeightStrong }}>
            {t("operator.actions.deletion.willHeading")}
          </p>
          <ul style={{ margin: 0, marginTop: token.marginXXS, paddingInlineStart: token.paddingLG }}>
            <li>{t("operator.actions.deletion.willCancel")}</li>
            <li>{t("operator.actions.deletion.willAnonymize")}</li>
            <li>{t("operator.actions.deletion.willRetention")}</li>
          </ul>
          <p
            style={{
              margin: 0,
              marginTop: token.marginXS,
              fontWeight: token.fontWeightStrong,
            }}
          >
            {t("operator.actions.deletion.keptHeading")}
          </p>
          <p style={{ margin: 0, marginTop: token.marginXXS }}>
            {t("operator.actions.deletion.keptBody")}
          </p>
        </div>

        <FormField
          control={form.control}
          name="confirmSlug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("operator.actions.deletion.confirmLabel")}</FormLabel>
              <FormControl>
                <TextInput autoComplete="off" spellCheck={false} {...field} />
              </FormControl>
              <FormDescription>
                {t("operator.actions.deletion.confirmHint", { slug: tenantSlug })}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <ReasonField control={form.control} />

        <RootError message={form.formState.errors.root?.message} />
        {/* Dua gerbang berturut-turut, dan keduanya disengaja: slug harus
            SUDAH diketik ulang sebelum tombolnya hidup, lalu dialog terakhir
            menyebut lagi tenant mana yang sedang dihapus. Salah klik pada
            baris yang keliru tidak bisa berakhir sebagai penghapusan. */}
        <Button
          type="submit"
          variant="danger"
          size="sm"
          style={{ alignSelf: "flex-start" }}
          disabled={form.formState.isSubmitting || typedSlug !== tenantSlug}
        >
          <Trash2 size={16} aria-hidden="true" />
          {form.formState.isSubmitting
            ? t("common.processing")
            : t("operator.actions.deletion.submit")}
        </Button>
        </Flex>

        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
          title={t("operator.actions.deletion.confirmTitle")}
          message={t("operator.actions.deletion.confirmBody", { slug: tenantSlug })}
          confirmVariant="danger"
          confirmLabel={t("operator.actions.deletion.submit")}
          onConfirm={async () => {
            if (confirming) await runAction(confirming);
          }}
        />
      </form>
    </Form>
  );
}

/* ══ Rangkaian panel ═══════════════════════════════════════════════════════ */

export function TenantActions(props: TenantActionsProps) {
  const t = useT();
  const { token } = theme.useToken();

  return (
    <section>
      <Flex vertical gap={token.marginSM}>
      <h2
        style={{
          margin: 0,
          fontSize: token.fontSizeLG,
          fontWeight: token.fontWeightStrong,
          color: token.colorText,
        }}
      >
        {t("operator.actions.heading")}
      </h2>
      <p style={{ margin: 0, color: token.colorTextSecondary }}>{t("operator.actions.note")}</p>

      {!props.billingAvailable && (
        <Alert type="warning" showIcon message={t("operator.actions.billingDown")} />
      )}

      {/* Dua panel berdampingan selama muat, turun sendiri saat tidak —
          pengganti `lg:grid-cols-2` tanpa titik patah. */}
      <div
        style={{
          display: "grid",
          gap: token.margin,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
        }}
      >
        {props.billingAvailable && (
          <ActionPanel
            icon={<Banknote size={16} aria-hidden="true" />}
            title={t("operator.actions.markPaid.title")}
            description={t("operator.actions.markPaid.description")}
          >
            <MarkPaidPanel tenantId={props.tenantId} invoices={props.issuedInvoices} />
          </ActionPanel>
        )}

        {props.billingAvailable && props.plans && props.plans.length > 0 && (
          <ActionPanel
            icon={<ArrowLeftRight size={16} aria-hidden="true" />}
            title={t("operator.actions.plan.title")}
            description={t("operator.actions.plan.description")}
          >
            <ChangePlanPanel
              tenantId={props.tenantId}
              tenantName={props.tenantName}
              tenantStatus={props.tenantStatus}
              currentPlanKey={props.currentPlanKey}
              usage={props.usage}
              plans={props.plans}
            />
          </ActionPanel>
        )}

        {props.billingAvailable && (
          <ActionPanel
            icon={<PauseCircle size={16} aria-hidden="true" />}
            title={t("operator.actions.suspension.title")}
            description={t("operator.actions.suspension.description")}
          >
            <SuspensionPanel
              tenantId={props.tenantId}
              tenantName={props.tenantName}
              subscriptionStatus={props.subscriptionStatus}
            />
          </ActionPanel>
        )}

        <ActionPanel
          icon={<Trash2 size={16} aria-hidden="true" />}
          title={t("operator.actions.deletion.title")}
          description={t("operator.actions.deletion.keptHeading")}
        >
          <DeletionPanel
            tenantId={props.tenantId}
            tenantSlug={props.tenantSlug}
            deletionRequest={props.deletionRequest}
          />
        </ActionPanel>
      </div>
      </Flex>
    </section>
  );
}
