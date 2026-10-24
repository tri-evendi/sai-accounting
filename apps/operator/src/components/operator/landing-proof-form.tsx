"use client";

/**
 * PENYUNTING BUKTI SOSIAL — testimoni, logo klien, atau mitra resmi (konsol
 * `/landing/media`). Satu komponen untuk tiga daftar yang bentuk kerjanya
 * sama: tambah, sunting, hapus, urutkan, dan sakelar TAMPIL per butir.
 *
 * Seksi di halaman publik hanya muncul bila ada ≥ 1 butir yang dicentang
 * "Tampilkan"; butir yang tidak dicentang tersimpan tetapi tidak tayang
 * (draf/arsip). Gambar diunggah lewat `LandingImageField` dan dirujuk dengan
 * id — server memeriksa rujukannya saat menyimpan.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type Control, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { Checkbox } from "@sai/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@sai/ui/form";
import { TextInput } from "@sai/ui/input";
import { Textarea } from "@sai/ui/textarea";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { LANDING_LIST_MAX, type LandingImageKind, type LandingImageRef } from "@sai/core/landing-media";
import { LandingImageField } from "@op/components/operator/landing-image-field";
import {
  landingClientLogosSchema,
  landingPartnersSchema,
  landingTestimonialsSchema,
  type LandingActionResult,
  type LandingUploadResult,
} from "@op/lib/validations/landing";

export type LandingProofVariant = "testimonials" | "logos" | "partners";

interface TextField {
  name: string;
  label: DictionaryKey;
  long?: boolean;
}

interface VariantConfig {
  schema: typeof landingTestimonialsSchema | typeof landingClientLogosSchema | typeof landingPartnersSchema;
  texts: TextField[];
  image: { field: string; kind: LandingImageKind; label: DictionaryKey; required: boolean };
  empty: () => Record<string, unknown>;
  title: DictionaryKey;
  add: DictionaryKey;
}

const kunciBaru = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const CONFIG: Record<LandingProofVariant, VariantConfig> = {
  testimonials: {
    schema: landingTestimonialsSchema,
    texts: [
      { name: "quoteId", label: "operator.landingMedia.quoteId", long: true },
      { name: "quoteEn", label: "operator.landingMedia.quoteEn", long: true },
      { name: "quoteZh", label: "operator.landingMedia.quoteZh", long: true },
      { name: "name", label: "operator.landingMedia.personName" },
      { name: "role", label: "operator.landingMedia.personRole" },
    ],
    image: { field: "photoId", kind: "testimonial", label: "operator.landingMedia.photo", required: false },
    empty: () => ({ key: kunciBaru(), published: true, quoteId: "", quoteEn: "", quoteZh: "", name: "", role: "", photoId: null }),
    title: "operator.landingMedia.testimonialTitle",
    add: "operator.landingMedia.addTestimonial",
  },
  logos: {
    schema: landingClientLogosSchema,
    texts: [
      { name: "name", label: "operator.landingMedia.clientName" },
      { name: "href", label: "operator.landingMedia.link" },
    ],
    image: { field: "logoId", kind: "client_logo", label: "operator.landingMedia.logo", required: true },
    empty: () => ({ key: kunciBaru(), published: true, name: "", href: "", logoId: 0 }),
    title: "operator.landingMedia.logoTitle",
    add: "operator.landingMedia.addLogo",
  },
  partners: {
    schema: landingPartnersSchema,
    texts: [
      { name: "name", label: "operator.landingMedia.partnerName" },
      { name: "city", label: "operator.landingMedia.partnerCity" },
      { name: "href", label: "operator.landingMedia.link" },
    ],
    image: { field: "logoId", kind: "partner_logo", label: "operator.landingMedia.logo", required: false },
    empty: () => ({ key: kunciBaru(), published: true, name: "", city: "", href: "", logoId: null }),
    title: "operator.landingMedia.partnerTitle",
    add: "operator.landingMedia.addPartner",
  },
};

type Item = Record<string, unknown> & { key: string; published: boolean };
type Values = { items: Item[] };

export function LandingProofForm({
  variant,
  initial,
  refs,
  save,
  upload,
}: {
  variant: LandingProofVariant;
  initial: Item[];
  /** Rujukan gambar yang sudah dipakai, untuk pratinjau (id → rujukan). */
  refs: Record<number, LandingImageRef>;
  save: (input: Values) => Promise<LandingActionResult>;
  upload: (formData: FormData) => Promise<LandingUploadResult>;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const cfg = CONFIG[variant];
  const [result, setResult] = useState<LandingActionResult | null>(null);
  const [gambar, setGambar] = useState<Record<number, LandingImageRef>>(refs);

  const form = useForm<Values>({
    resolver: zodResolver(cfg.schema as never) as unknown as Resolver<Values>,
    defaultValues: { items: initial },
  });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "items", keyName: "rhfId" });

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
        <Flex vertical gap={token.marginSM}>
          {result?.ok && <Alert type="success" showIcon message={result.message} />}
          {fields.length === 0 && (
            <p style={{ margin: 0, color: token.colorTextSecondary }}>{t("operator.landingMedia.emptyList")}</p>
          )}
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: token.marginSM }}>
            {fields.map((item, index) => (
              <li
                key={item.rhfId}
                style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, padding: token.paddingSM }}
              >
                <Flex justify="space-between" align="center" gap={token.marginXS} wrap>
                  <strong>{t(cfg.title, { n: index + 1 })}</strong>
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
                  <PublishedToggle control={form.control} index={index} label={t("operator.landingMedia.published")} />
                  {cfg.texts.map((f) => (
                    <FormField
                      key={f.name}
                      control={form.control}
                      name={`items.${index}.${f.name}` as `items.${number}.key`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t(f.label)}</FormLabel>
                          <FormControl>
                            {f.long ? (
                              <Textarea rows={2} {...field} value={String(field.value ?? "")} />
                            ) : (
                              <TextInput autoComplete="off" {...field} value={String(field.value ?? "")} />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                  <ImageSlot
                    control={form.control}
                    index={index}
                    field={cfg.image.field}
                    kind={cfg.image.kind}
                    label={t(cfg.image.label)}
                    required={cfg.image.required}
                    gambar={gambar}
                    onRef={(ref) => setGambar((g) => ({ ...g, [ref.id]: ref }))}
                    setValue={(v) =>
                      form.setValue(`items.${index}.${cfg.image.field}` as `items.${number}.key`, v as never, { shouldDirty: true })
                    }
                    upload={upload}
                  />
                </Flex>
              </li>
            ))}
          </ol>
          {form.formState.errors.root?.message && <Alert type="error" showIcon message={form.formState.errors.root.message} />}
          {form.formState.errors.items && !form.formState.errors.root && (
            <Alert type="error" showIcon message={t("operator.landingMedia.fixErrors")} />
          )}
          <Flex gap={token.marginXS} wrap>
            <Button type="button" variant="outline" size="sm" disabled={fields.length >= LANDING_LIST_MAX} onClick={() => append(cfg.empty() as Item)}>
              <PlusOutlined aria-hidden="true" />
              {t(cfg.add)}
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={form.formState.isSubmitting}>
              {t("operator.landing.save")}
            </Button>
          </Flex>
        </Flex>
      </form>
    </Form>
  );
}

function PublishedToggle({ control, index, label }: { control: Control<Values>; index: number; label: string }) {
  return (
    <FormField
      control={control}
      name={`items.${index}.published`}
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <Checkbox checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)}>
              {label}
            </Checkbox>
          </FormControl>
        </FormItem>
      )}
    />
  );
}

function ImageSlot({
  control,
  index,
  field,
  kind,
  label,
  required,
  gambar,
  onRef,
  setValue,
  upload,
}: {
  control: Control<Values>;
  index: number;
  field: string;
  kind: LandingImageKind;
  label: string;
  required: boolean;
  gambar: Record<number, LandingImageRef>;
  onRef: (ref: LandingImageRef) => void;
  setValue: (v: number | null) => void;
  upload: (formData: FormData) => Promise<LandingUploadResult>;
}) {
  const t = useT();
  const id = useWatch({ control, name: `items.${index}.${field}` as `items.${number}.key` }) as unknown as number | null;
  const ref = typeof id === "number" && id > 0 ? (gambar[id] ?? null) : null;
  return (
    <>
      <LandingImageField
        kind={kind}
        label={label}
        value={ref}
        removable={!required}
        upload={upload}
        onChange={(next) => {
          if (next) onRef(next);
          setValue(next ? next.id : required ? 0 : null);
        }}
      />
      {required && !ref && <span role="alert">{t("operator.landingMedia.imageRequired")}</span>}
    </>
  );
}
