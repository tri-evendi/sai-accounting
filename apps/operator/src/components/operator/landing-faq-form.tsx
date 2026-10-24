"use client";

/**
 * PENYUNTING DAFTAR TANYA-JAWAB (konsol `/landing`).
 *
 * Selama belum ada daftar tersimpan, halaman publik memakai daftar BAWAAN dari
 * kamus (sebelas pertanyaan, jawabannya menyebut lama uji coba, tarif PPN, dan
 * alamat surel yang berlaku). Begitu daftar ini disimpan, DAFTAR INI yang
 * tampil — utuh dan berurutan seperti di sini — dan data terstruktur
 * `FAQPage` mengikutinya (dibangkitkan dari larik yang sama). "Kembalikan ke
 * daftar bawaan" membuang daftar tersimpan.
 *
 * Bahasa Indonesia wajib per butir; Inggris/Mandarin yang kosong jatuh ke
 * Indonesia untuk pembaca bahasa itu.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@sai/ui/form";
import { TextInput } from "@sai/ui/input";
import { Textarea } from "@sai/ui/textarea";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { FAQ_ANSWER_MAX, FAQ_ITEMS_MAX, FAQ_QUESTION_MAX } from "@sai/core/landing-settings";
import {
  landingFaqSchema,
  type LandingFaqFormInput,
  type LandingFaqItemFormInput,
  type LandingActionResult,
} from "@op/lib/validations/landing";

type ItemField = Exclude<keyof LandingFaqItemFormInput, "key">;

const FIELDS: { name: ItemField; label: DictionaryKey; long: boolean }[] = [
  { name: "questionId", label: "operator.landing.faqQuestionId", long: false },
  { name: "answerId", label: "operator.landing.faqAnswerId", long: true },
  { name: "questionEn", label: "operator.landing.faqQuestionEn", long: false },
  { name: "answerEn", label: "operator.landing.faqAnswerEn", long: true },
  { name: "questionZh", label: "operator.landing.faqQuestionZh", long: false },
  { name: "answerZh", label: "operator.landing.faqAnswerZh", long: true },
];

/** Kunci butir baru — sah menurut `FAQ_KEY_PATTERN`, stabil saat diurutkan. */
function kunciBaru(): string {
  return `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const butirKosong = (): LandingFaqItemFormInput => ({
  key: kunciBaru(),
  questionId: "",
  questionEn: "",
  questionZh: "",
  answerId: "",
  answerEn: "",
  answerZh: "",
});

export function LandingFaqForm({
  custom,
  initial,
  save,
  reset,
}: {
  /** Ada daftar tersimpan? `false` = halaman memakai daftar bawaan kamus. */
  custom: boolean;
  initial: LandingFaqItemFormInput[];
  save: (input: LandingFaqFormInput) => Promise<LandingActionResult>;
  reset: () => Promise<LandingActionResult>;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [result, setResult] = useState<LandingActionResult | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const form = useForm<LandingFaqFormInput>({
    resolver: zodResolver(landingFaqSchema) as Resolver<LandingFaqFormInput>,
    defaultValues: { items: initial.length > 0 ? initial : [butirKosong()] },
  });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "items", keyName: "rhfId" });

  async function selesai(res: LandingActionResult) {
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setResult(null);
          await selesai(await save(values));
        })}
        noValidate
      >
        <Flex vertical gap={token.marginSM}>
          <Alert
            type={custom ? "info" : "warning"}
            showIcon
            message={custom ? t("operator.landing.faqUsingCustom") : t("operator.landing.faqUsingDefault")}
          />
          {result?.ok && <Alert type="success" showIcon message={result.message} />}
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: token.marginSM }}>
            {fields.map((item, index) => (
              <li
                key={item.rhfId}
                style={{
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: token.borderRadiusLG,
                  padding: token.paddingSM,
                }}
              >
                <Flex justify="space-between" align="center" gap={token.marginXS} wrap>
                  <strong>{t("operator.landing.faqItemTitle", { n: index + 1 })}</strong>
                  <Flex gap={token.marginXXS}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("operator.landing.faqMoveUp")}
                      title={t("operator.landing.faqMoveUp")}
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUpOutlined aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("operator.landing.faqMoveDown")}
                      title={t("operator.landing.faqMoveDown")}
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDownOutlined aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("operator.landing.faqRemove")}
                      title={t("operator.landing.faqRemove")}
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <DeleteOutlined aria-hidden="true" />
                    </Button>
                  </Flex>
                </Flex>
                <Flex vertical gap={token.marginXS} style={{ marginTop: token.marginXS }}>
                  {FIELDS.map((f) => (
                    <FormField
                      key={f.name}
                      control={form.control}
                      name={`items.${index}.${f.name}` as const}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t(f.label)}</FormLabel>
                          <FormControl>
                            {f.long ? (
                              <Textarea rows={3} maxLength={FAQ_ANSWER_MAX} {...field} />
                            ) : (
                              <TextInput maxLength={FAQ_QUESTION_MAX} autoComplete="off" {...field} />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </Flex>
              </li>
            ))}
          </ol>
          {form.formState.errors.root?.message && (
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          )}
          <Flex gap={token.marginXS} wrap>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fields.length >= FAQ_ITEMS_MAX}
              onClick={() => append(butirKosong())}
            >
              <PlusOutlined aria-hidden="true" />
              {t("operator.landing.faqAdd")}
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={form.formState.isSubmitting}>
              {t("operator.landing.faqSave")}
            </Button>
            {custom && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
                {t("operator.landing.faqReset")}
              </Button>
            )}
          </Flex>
        </Flex>
        <ConfirmDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title={t("operator.landing.faqResetTitle")}
          message={t("operator.landing.faqResetBody")}
          confirmVariant="danger"
          confirmLabel={t("operator.landing.faqReset")}
          onConfirm={async () => {
            setConfirmReset(false);
            setResult(null);
            await selesai(await reset());
            form.reset({ items: [butirKosong()] });
          }}
        />
      </form>
    </Form>
  );
}
