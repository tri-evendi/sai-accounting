"use client";

/**
 * FORMULIR SEKSI HALAMAN DEPAN — centang = tampil (konsol `/landing`).
 *
 * Yang DISIMPAN adalah daftar yang DISEMBUNYIKAN, bukan yang tampil: seksi
 * baru yang ditambahkan kode kelak langsung tampil tanpa ada yang perlu
 * mencentangnya. Pahlawan dan ajakan penutup tidak ada di daftar — keduanya
 * selalu tampil; harga diatur di pengaturan situs.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";

import { Button } from "@sai/ui/button";
import { Checkbox } from "@sai/ui/checkbox";
import { Form } from "@sai/ui/form";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { LANDING_SECTIONS, type LandingSectionKey } from "@sai/core/landing-settings";
import { landingSectionsSchema, type LandingSectionsFormInput, type LandingActionResult } from "@op/lib/validations/landing";

/** Peta statis seksi → label (penjaga kunci yatim membaca teks, bukan templat). */
const LABEL: Record<LandingSectionKey, DictionaryKey> = {
  features: "operator.landing.sectionFeatures",
  modules: "operator.landing.sectionModules",
  audience: "operator.landing.sectionAudience",
  integrations: "operator.landing.sectionIntegrations",
  trust: "operator.landing.sectionTrust",
  faq: "operator.landing.sectionFaq",
};

export function LandingSectionsForm({
  initial,
  save,
}: {
  initial: LandingSectionsFormInput;
  save: (input: LandingSectionsFormInput) => Promise<LandingActionResult>;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [result, setResult] = useState<LandingActionResult | null>(null);

  const form = useForm<LandingSectionsFormInput>({
    resolver: zodResolver(landingSectionsSchema) as Resolver<LandingSectionsFormInput>,
    defaultValues: initial,
  });
  const hidden = useWatch({ control: form.control, name: "hidden" }) ?? [];

  async function onSubmit(values: LandingSectionsFormInput) {
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
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontWeight: token.fontWeightStrong, marginBottom: token.marginXS }}>
              {t("operator.landing.sectionsLegend")}
            </legend>
            <Flex vertical gap={token.marginXS}>
              {LANDING_SECTIONS.map((seksi) => (
                <Checkbox
                  key={seksi}
                  checked={!hidden.includes(seksi)}
                  onCheckedChange={(tampil) => {
                    const lain = hidden.filter((h) => h !== seksi);
                    form.setValue("hidden", tampil ? lain : [...lain, seksi], { shouldDirty: true });
                  }}
                >
                  {t(LABEL[seksi])}
                </Checkbox>
              ))}
            </Flex>
          </fieldset>
          <p style={{ margin: 0, color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
            {t("operator.landing.sectionsAlwaysOn")}
          </p>
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
