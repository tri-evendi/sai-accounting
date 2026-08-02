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
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ResultNotice({ result }: { result: OperatorActionResult | null }) {
  if (!result || !result.ok) return null;
  return (
    <div className="space-y-2">
      <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success-strong">
        {result.message}
      </p>
      {result.warning && (
        <p role="status" className="rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">
          {result.warning}
        </p>
      )}
    </div>
  );
}

function RootError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive-strong">
      {message}
    </p>
  );
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
      <div className="space-y-2">
        <ResultNotice result={result} />
        <p className="text-sm text-muted-foreground">{t("operator.actions.markPaid.empty")}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <ResultNotice result={result} />
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Banknote className="h-4 w-4" aria-hidden="true" />
          {t("operator.actions.markPaid.submit")}
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => setConfirming(values))}
        noValidate
        className="grid gap-3 sm:grid-cols-2"
      >
        <FormField
          control={form.control}
          name="invoiceNumber"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
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
        <FormField
          control={form.control}
          name="bankRef"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>{t("operator.actions.markPaid.refLabel")}</FormLabel>
              <FormControl>
                <TextInput autoComplete="off" spellCheck={false} {...field} />
              </FormControl>
              <FormDescription>{t("operator.actions.markPaid.refHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="sm:col-span-2">
          <ReasonField control={form.control} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <RootError message={form.formState.errors.root?.message} />
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              {t("operator.actions.markPaid.submit")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>

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
      <div className="space-y-2">
        <ResultNotice result={result} />
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
          {t("operator.actions.plan.submit")}
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => setConfirming(values))}
        noValidate
        className="space-y-3"
      >
        <p className="text-sm text-muted-foreground">
          {t("operator.actions.plan.current", { plan: currentPlanKey })}
        </p>
        {tenantStatus === "suspended" && (
          <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">
            {t("operator.actions.plan.suspendedNote")}
          </p>
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
          <div
            role="status"
            className="space-y-1 rounded-lg bg-warning-soft p-3 text-sm text-warning-strong"
          >
            <p className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("operator.actions.plan.quotaWarningTitle")}
            </p>
            <ul className="list-disc pl-5">
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
            <p>{t("operator.actions.plan.quotaWarningNote")}</p>
          </div>
        )}

        <ReasonField control={form.control} />

        <RootError message={form.formState.errors.root?.message} />
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            {t("operator.actions.plan.submit")}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>

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
      <p className="text-sm text-muted-foreground">
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
      <div className="space-y-2">
        <ResultNotice result={result} />
        <Button
          variant={mode === "suspend" ? "danger" : "secondary"}
          size="sm"
          onClick={() => setOpen(true)}
        >
          {mode === "suspend" ? (
            <PauseCircle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
          )}
          {submitLabel}
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => setConfirming(values))}
        noValidate
        className="space-y-3"
      >
        {/* Apa yang SEBENARNYA terjadi — gamblang, sebelum tombol apa pun. */}
        <p className="rounded-lg bg-muted p-3 text-sm leading-relaxed text-foreground">
          {mode === "suspend"
            ? t("operator.actions.suspension.readOnlyExplain")
            : t("operator.actions.suspension.restoreExplain")}
        </p>

        <ReasonField control={form.control} />

        <RootError message={form.formState.errors.root?.message} />
        <div className="flex gap-2">
          <Button type="submit" variant={mode === "suspend" ? "danger" : "primary"} size="sm">
            {submitLabel}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>

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
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("operator.actions.deletion.noRequest")}
      </p>
    );
  }

  if (!deletionRequest.pastGrace) {
    return (
      <div className="space-y-2">
        <p className="rounded-lg bg-warning-soft p-3 text-sm leading-relaxed text-warning-strong">
          {t("operator.actions.deletion.graceActive", {
            id: deletionRequest.id,
            date: deletionRequest.graceEndsAtLabel,
          })}
        </p>
        {deletionRequest.note && (
          <p className="text-sm text-muted-foreground">
            {t("operator.actions.deletion.ownerNote", { note: deletionRequest.note })}
          </p>
        )}
      </div>
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
      <form
        onSubmit={form.handleSubmit((values) => setConfirming(values))}
        noValidate
        className="space-y-3"
      >
        <p className="text-sm text-foreground">
          {t("operator.actions.deletion.ready", {
            id: deletionRequest.id,
            date: deletionRequest.graceEndsAtLabel,
          })}
        </p>
        {deletionRequest.note && (
          <p className="text-sm text-muted-foreground">
            {t("operator.actions.deletion.ownerNote", { note: deletionRequest.note })}
          </p>
        )}

        {/* Apa yang terjadi — dan apa yang TIDAK dihapus, beserta alasannya. */}
        <div className="rounded-lg bg-muted p-3 text-sm leading-relaxed text-foreground">
          <p className="font-semibold">{t("operator.actions.deletion.willHeading")}</p>
          <ul className="mt-1 list-disc pl-5">
            <li>{t("operator.actions.deletion.willCancel")}</li>
            <li>{t("operator.actions.deletion.willAnonymize")}</li>
            <li>{t("operator.actions.deletion.willRetention")}</li>
          </ul>
          <p className="mt-2 font-semibold">{t("operator.actions.deletion.keptHeading")}</p>
          <p className="mt-1">{t("operator.actions.deletion.keptBody")}</p>
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
          disabled={form.formState.isSubmitting || typedSlug !== tenantSlug}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {form.formState.isSubmitting
            ? t("common.processing")
            : t("operator.actions.deletion.submit")}
        </Button>

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

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">
        {t("operator.actions.heading")}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("operator.actions.note")}
      </p>

      {!props.billingAvailable && (
        <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">
          {t("operator.actions.billingDown")}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {props.billingAvailable && (
          <ActionPanel
            icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
            title={t("operator.actions.markPaid.title")}
            description={t("operator.actions.markPaid.description")}
          >
            <MarkPaidPanel tenantId={props.tenantId} invoices={props.issuedInvoices} />
          </ActionPanel>
        )}

        {props.billingAvailable && props.plans && props.plans.length > 0 && (
          <ActionPanel
            icon={<ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}
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
            icon={<PauseCircle className="h-4 w-4" aria-hidden="true" />}
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
          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
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
    </section>
  );
}
