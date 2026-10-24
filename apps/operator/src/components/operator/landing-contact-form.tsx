"use client";

/**
 * FORMULIR DEMO & WHATSAPP (konsol `/landing`).
 *
 *   • Tautan pemesanan demo — kosong = "Jadwalkan demo" tetap menuju
 *     `/register` (halaman kontak saat pendaftaran ditutup). Diisi = tombol
 *     itu membuka tautan ini di tab baru. https saja.
 *   • Kalimat pembuka WhatsApp per bahasa — dipakai tombol WhatsApp melayang
 *     di pendaratan dan tombol WhatsApp halaman kontak. Kosong = tanpa kalimat
 *     pembuka (perilaku hari ini); bahasa Inggris/Mandarin yang kosong jatuh
 *     ke kalimat Indonesia.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";

import { Button } from "@sai/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@sai/ui/form";
import { TextInput } from "@sai/ui/input";
import { Textarea } from "@sai/ui/textarea";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { WHATSAPP_MESSAGE_MAX } from "@sai/core/landing-settings";
import { landingContactSchema, type LandingContactFormInput, type LandingActionResult } from "@op/lib/validations/landing";

const WA_FIELDS: { name: "whatsappId" | "whatsappEn" | "whatsappZh"; label: DictionaryKey }[] = [
  { name: "whatsappId", label: "operator.landing.whatsappId" },
  { name: "whatsappEn", label: "operator.landing.whatsappEn" },
  { name: "whatsappZh", label: "operator.landing.whatsappZh" },
];

export function LandingContactForm({
  initial,
  save,
}: {
  initial: LandingContactFormInput;
  save: (input: LandingContactFormInput) => Promise<LandingActionResult>;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [result, setResult] = useState<LandingActionResult | null>(null);

  const form = useForm<LandingContactFormInput>({
    resolver: zodResolver(landingContactSchema) as Resolver<LandingContactFormInput>,
    defaultValues: initial,
  });

  async function onSubmit(values: LandingContactFormInput) {
    setResult(null);
    const res = await save(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Flex vertical gap={token.marginSM}>
          {result?.ok && <Alert type="success" showIcon message={result.message} />}
          <FormField
            control={form.control}
            name="demoBookingUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.landing.demoUrlLabel")}</FormLabel>
                <FormControl>
                  <TextInput type="url" inputMode="url" autoComplete="off" {...field} />
                </FormControl>
                <FormDescription>{t("operator.landing.demoUrlHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {WA_FIELDS.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(f.label)}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={WHATSAPP_MESSAGE_MAX} {...field} />
                  </FormControl>
                  {f.name === "whatsappId" && <FormDescription>{t("operator.landing.whatsappHint")}</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          {form.formState.errors.root?.message && (
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          )}
          <Flex gap={token.marginXS}>
            <Button type="submit" variant="primary" size="sm" disabled={form.formState.isSubmitting}>
              {t("operator.landing.save")}
            </Button>
          </Flex>
        </Flex>
      </form>
    </Form>
  );
}
