"use client";

/**
 * FORMULIR TANGKAPAN LAYAR & GAMBAR PRATINJAU TAUTAN (konsol `/landing/media`).
 *
 *   • Gambar utama hero — menggantikan purwarupa yang digambar kode.
 *   • Galeri (≤ 6) — menggantikan tiga purwarupa di seksi modul.
 *   • Gambar pratinjau tautan (OG) — untuk `/` dan `/pricing`; PNG ±1,91:1.
 *
 * Kosong = purwarupa kode / kartu OG bawaan tetap dipakai. Teks alternatif
 * bahasa Indonesia wajib untuk setiap tangkapan layar.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@sai/ui/form";
import { TextInput } from "@sai/ui/input";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { GALLERY_MAX, type LandingImageRef } from "@sai/core/landing-media";
import { LandingImageField } from "@op/components/operator/landing-image-field";
import {
  landingScreensSchema,
  type LandingActionResult,
  type LandingScreensFormInput,
  type LandingUploadResult,
} from "@op/lib/validations/landing";

const ALT: { name: "altId" | "altEn" | "altZh"; label: DictionaryKey }[] = [
  { name: "altId", label: "operator.landingMedia.altId" },
  { name: "altEn", label: "operator.landingMedia.altEn" },
  { name: "altZh", label: "operator.landingMedia.altZh" },
];

export function LandingScreensForm({
  initial,
  refs,
  save,
  upload,
}: {
  initial: LandingScreensFormInput;
  refs: Record<number, LandingImageRef>;
  save: (input: LandingScreensFormInput) => Promise<LandingActionResult>;
  upload: (formData: FormData) => Promise<LandingUploadResult>;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [result, setResult] = useState<LandingActionResult | null>(null);
  const [gambar, setGambar] = useState<Record<number, LandingImageRef>>(refs);
  const ingat = (ref: LandingImageRef) => setGambar((g) => ({ ...g, [ref.id]: ref }));

  const form = useForm<LandingScreensFormInput>({
    resolver: zodResolver(landingScreensSchema) as Resolver<LandingScreensFormInput>,
    defaultValues: initial,
  });
  const hero = useWatch({ control: form.control, name: "hero" });
  const ogImageId = useWatch({ control: form.control, name: "ogImageId" });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "gallery", keyName: "rhfId" });

  const altFields = (prefix: "hero" | `gallery.${number}`) =>
    ALT.map((f) => (
      <FormField
        key={f.name}
        control={form.control}
        name={`${prefix}.${f.name}` as "hero.altId"}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t(f.label)}</FormLabel>
            <FormControl>
              <TextInput autoComplete="off" {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    ));

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setResult(null);
          const res = await save(values);
          if (!res.ok) {
            form.setError("root", { message: res.message });
            return;
          }
          setResult(res);
          router.refresh();
        })}
        noValidate
      >
        <Flex vertical gap={token.marginLG}>
          {result?.ok && <Alert type="success" showIcon message={result.message} />}

          <Flex vertical gap={token.marginXS}>
            <LandingImageField
              kind="hero"
              label={t("operator.landingMedia.heroImage")}
              value={hero ? (gambar[hero.imageId] ?? null) : null}
              upload={upload}
              onChange={(next) => {
                if (next) {
                  ingat(next);
                  form.setValue("hero", { imageId: next.id, altId: hero?.altId ?? "", altEn: hero?.altEn ?? "", altZh: hero?.altZh ?? "" }, { shouldDirty: true });
                } else {
                  form.setValue("hero", null, { shouldDirty: true });
                }
              }}
            />
            {hero && altFields("hero")}
          </Flex>

          <Flex vertical gap={token.marginXS}>
            <strong>{t("operator.landingMedia.galleryHeading")}</strong>
            {fields.map((item, index) => (
              <div key={item.rhfId} style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, padding: token.paddingSM }}>
                <Flex justify="space-between" align="center" wrap gap={token.marginXS}>
                  <LandingImageField
                    kind="gallery"
                    label={t("operator.landingMedia.galleryItem", { n: index + 1 })}
                    value={gambar[item.imageId] ?? null}
                    removable={false}
                    upload={upload}
                    onChange={(next) => {
                      if (!next) return;
                      ingat(next);
                      form.setValue(`gallery.${index}.imageId`, next.id, { shouldDirty: true });
                    }}
                  />
                  <Flex gap={token.marginXXS}>
                    <Button type="button" variant="ghost" size="icon" aria-label={t("operator.landing.faqMoveUp")} title={t("operator.landing.faqMoveUp")} disabled={index === 0} onClick={() => move(index, index - 1)}>
                      <ArrowUpOutlined aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={t("operator.landing.faqMoveDown")} title={t("operator.landing.faqMoveDown")} disabled={index === fields.length - 1} onClick={() => move(index, index + 1)}>
                      <ArrowDownOutlined aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={t("operator.landingMedia.removeItem")} title={t("operator.landingMedia.removeItem")} onClick={() => remove(index)}>
                      <DeleteOutlined aria-hidden="true" />
                    </Button>
                  </Flex>
                </Flex>
                <Flex vertical gap={token.marginXS} style={{ marginTop: token.marginXS }}>
                  {altFields(`gallery.${index}`)}
                </Flex>
              </div>
            ))}
            {fields.length < GALLERY_MAX && (
              <LandingImageField
                kind="gallery"
                label={t("operator.landingMedia.galleryAdd")}
                value={null}
                upload={upload}
                onChange={(next) => {
                  if (!next) return;
                  ingat(next);
                  append({ imageId: next.id, altId: "", altEn: "", altZh: "" });
                }}
              />
            )}
          </Flex>

          <LandingImageField
            kind="og"
            label={t("operator.landingMedia.ogImage")}
            value={ogImageId ? (gambar[ogImageId] ?? null) : null}
            upload={upload}
            onChange={(next) => {
              if (next) ingat(next);
              form.setValue("ogImageId", next ? next.id : null, { shouldDirty: true });
            }}
          />

          {form.formState.errors.root?.message && <Alert type="error" showIcon message={form.formState.errors.root.message} />}
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
