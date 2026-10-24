"use client";

/**
 * SAKELAR TAMPIL / TERSEMBUNYI satu paket di katalog publik (`plans.is_public`).
 *
 * Pola tindakan konsol (`tenant-actions.tsx`): pemicu `secondary` kecil di
 * sel tabel, formulir alasan baru terbuka saat diminta (progressive
 * disclosure), lalu `ConfirmDialog` yang menyebut AKIBATNYA — bukan "Anda
 * yakin?". Alasannya wajib karena `is_public` juga membuka/menutup jalan
 * swalayan tenant pindah ke paket ini.
 *
 * Skema yang sama dipakai di sini dan diurai ulang server action
 * (`planVisibilitySchema`).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";

import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@sai/ui/form";
import { Textarea } from "@sai/ui/textarea";
import { useT } from "@sai/core/i18n/client";
import { planVisibilitySchema, type PlanVisibilityFormInput } from "@op/lib/validations/operator";
import type { PlanVisibilityActionResult } from "@op/app/(operator)/plans/actions";

export interface PlanVisibilityToggleProps {
  planId: number;
  planName: string;
  isPublic: boolean;
  save: (input: PlanVisibilityFormInput) => Promise<PlanVisibilityActionResult>;
}

export function PlanVisibilityToggle({ planId, planName, isPublic, save }: PlanVisibilityToggleProps) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PlanVisibilityFormInput | null>(null);
  const [result, setResult] = useState<PlanVisibilityActionResult | null>(null);

  const form = useForm<PlanVisibilityFormInput>({
    resolver: zodResolver(planVisibilitySchema) as Resolver<PlanVisibilityFormInput>,
    defaultValues: { planId, isPublic: !isPublic, reason: "" },
  });

  async function run(values: PlanVisibilityFormInput) {
    setPending(null);
    const res = await save(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    setOpen(false);
    form.reset({ planId, isPublic: !values.isPublic, reason: "" });
    router.refresh();
  }

  const label = isPublic ? t("operator.plans.hideAction") : t("operator.plans.showAction");

  return (
    <Flex vertical gap={token.marginXXS} align="flex-start">
      {result?.ok && !open && <Alert type="success" showIcon message={result.message} />}
      {!open ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {label}
        </Button>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => setPending(values))} noValidate>
            <Flex vertical gap={token.marginXS} style={{ minWidth: 240 }}>
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("operator.plans.reasonLabel")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root?.message && (
                <Alert type="error" showIcon message={form.formState.errors.root.message} />
              )}
              <Flex gap={token.marginXS}>
                <Button type="submit" variant="primary" size="sm">
                  {label}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
              </Flex>
            </Flex>
            <ConfirmDialog
              open={pending !== null}
              onOpenChange={(next) => {
                if (!next) setPending(null);
              }}
              title={label}
              message={t(isPublic ? "operator.plans.hideConfirm" : "operator.plans.showConfirm", {
                name: planName,
              })}
              confirmVariant={isPublic ? "danger" : "primary"}
              confirmLabel={label}
              onConfirm={async () => {
                if (pending) await run(pending);
              }}
            />
          </form>
        </Form>
      )}
    </Flex>
  );
}
