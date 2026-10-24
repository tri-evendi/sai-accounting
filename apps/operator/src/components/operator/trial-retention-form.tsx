"use client";

/**
 * FORMULIR RETENSI UJI COBA BEKU (migration platform 0012, alur demo-first).
 *
 * Dua nilai: sakelar hapus otomatis (TIGA keadaan, seperti gerbang lain —
 * ikut server · nyala · mati) dan masa retensinya dalam hari. Bawaannya MATI:
 * selama mati penjadwal hanya melaporkan kandidat.
 *
 * Menyalakan menuntut kata `HAPUS` diketik (skema `trialRetentionSchema`) dan
 * konfirmasi yang menyebut AKIBATNYA: tenant dianonimkan dan PT-nya
 * dinonaktifkan, tidak bisa dibalik. Mematikan atau mengubah jumlah hari tidak
 * melewati dialog itu.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";

import { Button } from "@sai/ui/button";
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
import { useT } from "@sai/core/i18n/client";
import { trialRetentionSchema, type TrialRetentionFormInput } from "@op/lib/validations/operator";
import type { OperatorSettingsResult } from "@op/app/(operator)/settings/actions";

export interface TrialRetentionFormProps {
  initial: { autoDeletion: "env" | "on" | "off"; retentionDays: number };
  /** Nilai yang BERLAKU bila "ikut pengaturan server" — dihitung di server. */
  envValues: { autoDeletion: boolean; retentionDays: number };
  save: (input: TrialRetentionFormInput) => Promise<OperatorSettingsResult>;
}

export function TrialRetentionForm({ initial, envValues, save }: TrialRetentionFormProps) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [confirming, setConfirming] = useState<TrialRetentionFormInput | null>(null);
  const [result, setResult] = useState<OperatorSettingsResult | null>(null);

  const form = useForm<TrialRetentionFormInput>({
    resolver: zodResolver(trialRetentionSchema) as Resolver<TrialRetentionFormInput>,
    defaultValues: { ...initial, confirm: "" },
  });
  const mode = useWatch({ control: form.control, name: "autoDeletion" });

  async function run(values: TrialRetentionFormInput) {
    const res = await save(values);
    setConfirming(null);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    form.setValue("confirm", "");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          values.autoDeletion === "on" ? setConfirming(values) : run(values)
        )}
        noValidate
      >
        <Flex vertical gap={token.marginSM}>
          {result?.ok && <Alert type="success" showIcon message={result.message} />}
          <FormField
            control={form.control}
            name="autoDeletion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.retention.switchLabel")}</FormLabel>
                <FormControl>
                  <SelectField
                    options={[
                      {
                        value: "env",
                        label: t("operator.retention.optionEnv", {
                          state: envValues.autoDeletion
                            ? t("operator.retention.stateOn")
                            : t("operator.retention.stateOff"),
                        }),
                      },
                      { value: "on", label: t("operator.retention.optionOn") },
                      { value: "off", label: t("operator.retention.optionOff") },
                    ]}
                    {...field}
                  />
                </FormControl>
                <FormDescription>{t("operator.retention.switchHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="retentionDays"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.retention.daysLabel")}</FormLabel>
                <FormControl>
                  <TextInput type="number" min={0} max={3650} {...field} />
                </FormControl>
                <FormDescription>
                  {t("operator.retention.daysHint", { days: envValues.retentionDays })}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {mode === "on" && (
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.retention.confirmLabel")}</FormLabel>
                  <FormControl>
                    <TextInput autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {form.formState.errors.root?.message && (
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          )}
          <Flex gap={token.marginXS}>
            <Button type="submit" variant={mode === "on" ? "danger" : "primary"} size="sm">
              {t("operator.retention.save")}
            </Button>
          </Flex>
        </Flex>
        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
          title={t("operator.retention.confirmTitle")}
          message={
            confirming
              ? t("operator.retention.confirmBody", {
                  days: confirming.retentionDays || envValues.retentionDays,
                })
              : ""
          }
          confirmVariant="danger"
          confirmLabel={t("operator.retention.confirmSubmit")}
          onConfirm={async () => {
            if (confirming) await run(confirming);
          }}
        />
      </form>
    </Form>
  );
}
