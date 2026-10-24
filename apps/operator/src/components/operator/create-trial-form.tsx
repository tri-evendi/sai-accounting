"use client";

/**
 * FORMULIR "Buat tenant uji coba" — alur demo-first (keputusan pemilik 24 Okt
 * 2026). Satu formulir, satu konfirmasi, lalu pindah ke rincian tenantnya.
 *
 * Pola form MASTER.md: react-hook-form + zodResolver dengan SKEMA YANG SAMA
 * yang diurai ulang server action (`createTrialSchema`). Konfirmasi
 * menyebut AKIBATNYA (siapa menerima surel, sampai kapan, tanpa tagihan),
 * bukan "Anda yakin?".
 *
 * Pilihan mode penagihan sengaja hanya `none` / `manual`: uji coba tidak
 * pernah ditagih otomatis, dan menawarkan `auto` di sini akan menghidupkan
 * kembali jalur yang alur ini hapus.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";

import { Button } from "@sai/ui/button";
import { Checkbox } from "@sai/ui/checkbox";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sai/ui/form";
import { TextInput } from "@sai/ui/input";
import { SelectField } from "@sai/ui/select";
import { Textarea } from "@sai/ui/textarea";
import { useT } from "@sai/core/i18n/client";
import {
  createTrialSchema,
  TRIAL_DAYS_MAX,
  type CreateTrialFormInput,
} from "@op/lib/validations/operator";
import type { CreateTrialActionResult } from "@op/app/(operator)/tenants/new/actions";

export interface CreateTrialFormProps {
  plans: { key: string; name: string; maxCompanies: number; maxUsers: number }[];
  defaultPlanKey: string;
  defaultTrialDays: number;
  create: (input: CreateTrialFormInput) => Promise<CreateTrialActionResult>;
}

const GRID: React.CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
};

export function CreateTrialForm({ plans, defaultPlanKey, defaultTrialDays, create }: CreateTrialFormProps) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [confirming, setConfirming] = useState<CreateTrialFormInput | null>(null);
  const [done, setDone] = useState<CreateTrialActionResult | null>(null);

  const form = useForm<CreateTrialFormInput>({
    resolver: zodResolver(createTrialSchema) as Resolver<CreateTrialFormInput>,
    defaultValues: {
      tenantName: "",
      ownerName: "",
      ownerEmail: "",
      planKey: defaultPlanKey,
      trialDays: defaultTrialDays,
      maxCompanies: 0,
      maxUsers: 0,
      billingMode: "none",
      referredByPartner: "",
      isDemo: false,
      reason: "",
    },
  });

  const planKey = useWatch({ control: form.control, name: "planKey" });
  const isDemo = useWatch({ control: form.control, name: "isDemo" });
  const plan = plans.find((p) => p.key === planKey) ?? null;

  async function run(values: CreateTrialFormInput) {
    const res = await create(values);
    setConfirming(null);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setDone(res);
    if (res.tenantId) router.push(`/tenants/${res.tenantId}`);
  }

  if (done) {
    return (
      <Flex vertical gap={token.marginXS}>
        <Alert type="success" showIcon message={done.message} />
        {done.warning && <Alert type="warning" showIcon message={done.warning} />}
      </Flex>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => setConfirming(values))} noValidate>
        <Flex vertical gap={token.margin}>
          <p
            style={{
              margin: 0,
              padding: token.paddingSM,
              borderRadius: token.borderRadiusLG,
              background: token.colorFillQuaternary,
              color: token.colorText,
            }}
          >
            {t("operator.trial.explain")}
          </p>

          <div style={GRID}>
            <FormField
              control={form.control}
              name="tenantName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.trial.tenantName")}</FormLabel>
                  <FormControl>
                    <TextInput autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ownerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.trial.ownerName")}</FormLabel>
                  <FormControl>
                    <TextInput autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ownerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.trial.ownerEmail")}</FormLabel>
                  <FormControl>
                    <TextInput type="email" autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>{t("operator.trial.ownerEmailHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="planKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.actions.plan.planLabel")}</FormLabel>
                  <FormControl>
                    <SelectField options={plans.map((p) => ({ value: p.key, label: p.name }))} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="trialDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.trial.trialDays")}</FormLabel>
                  <FormControl>
                    <TextInput type="number" min={1} max={TRIAL_DAYS_MAX} disabled={isDemo} {...field} />
                  </FormControl>
                  <FormDescription>{t("operator.trial.trialDaysHint", { max: TRIAL_DAYS_MAX })}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billingMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.actions.billingMode.currentLabel")}</FormLabel>
                  <FormControl>
                    <SelectField
                      options={[
                        { value: "none", label: t("operator.actions.billingMode.modeNone") },
                        { value: "manual", label: t("operator.actions.billingMode.modeManual") },
                      ]}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t("operator.trial.billingModeHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxCompanies"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.trial.maxCompanies")}</FormLabel>
                  <FormControl>
                    <TextInput type="number" min={0} {...field} />
                  </FormControl>
                  <FormDescription>
                    {t("operator.trial.quotaHint", { value: plan?.maxCompanies ?? "—" })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxUsers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.trial.maxUsers")}</FormLabel>
                  <FormControl>
                    <TextInput type="number" min={0} {...field} />
                  </FormControl>
                  <FormDescription>
                    {t("operator.trial.quotaHint", { value: plan?.maxUsers ?? "—" })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="referredByPartner"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.partner.label")}</FormLabel>
                  <FormControl>
                    <TextInput autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>{t("operator.partner.hint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="isDemo"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)}>
                    {t("operator.trial.isDemo")}
                  </Checkbox>
                </FormControl>
                <FormDescription>{t("operator.trial.isDemoHint")}</FormDescription>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
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

          {form.formState.errors.root?.message && (
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          )}
          <Flex gap={token.marginXS}>
            <Button type="submit" variant="primary">
              {t("operator.trial.submit")}
            </Button>
          </Flex>
        </Flex>

        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
          title={t("operator.trial.title")}
          message={
            confirming
              ? confirming.isDemo
                ? t("operator.trial.confirmDemo", {
                    tenant: confirming.tenantName,
                    email: confirming.ownerEmail,
                    plan: confirming.planKey,
                  })
                : t("operator.trial.confirmBody", {
                    tenant: confirming.tenantName,
                    email: confirming.ownerEmail,
                    plan: confirming.planKey,
                    days: confirming.trialDays,
                  })
              : ""
          }
          confirmVariant="primary"
          confirmLabel={t("operator.trial.submit")}
          onConfirm={async () => {
            if (confirming) await run(confirming);
          }}
        />
      </form>
    </Form>
  );
}
