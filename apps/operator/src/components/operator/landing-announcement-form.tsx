"use client";

/**
 * FORMULIR BILAH PENGUMUMAN (konsol `/landing`).
 *
 * Bilah tampil di puncak `/` dan `/pricing` HANYA bila dinyalakan dan waktu
 * sekarang di dalam jendela mulai–akhir (keduanya opsional, dalam WIB).
 * Pengunjung bisa menutupnya; pengumuman yang teks/tautan/jendelanya diubah
 * tampil lagi bagi yang sudah menutup versi lama.
 *
 * "Hapus pengumuman" berbeda dari mematikan: mematikan menyimpan teksnya untuk
 * dinyalakan lagi, menghapus membuang barisnya.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";

import { Button } from "@sai/ui/button";
import { Checkbox } from "@sai/ui/checkbox";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@sai/ui/form";
import { TextInput } from "@sai/ui/input";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { ANNOUNCEMENT_TEXT_MAX } from "@sai/core/landing-settings";
import { landingAnnouncementSchema, type LandingAnnouncementFormInput, type LandingActionResult } from "@op/lib/validations/landing";

const TEXT_FIELDS: { name: "textId" | "textEn" | "textZh"; label: DictionaryKey }[] = [
  { name: "textId", label: "operator.landing.announcementTextId" },
  { name: "textEn", label: "operator.landing.announcementTextEn" },
  { name: "textZh", label: "operator.landing.announcementTextZh" },
];

export function LandingAnnouncementForm({
  initial,
  exists,
  save,
  clear,
}: {
  initial: LandingAnnouncementFormInput;
  /** Ada pengumuman tersimpan (nyala atau mati) — tombol hapus hanya untuknya. */
  exists: boolean;
  save: (input: LandingAnnouncementFormInput) => Promise<LandingActionResult>;
  clear: () => Promise<LandingActionResult>;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [result, setResult] = useState<LandingActionResult | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const form = useForm<LandingAnnouncementFormInput>({
    resolver: zodResolver(landingAnnouncementSchema) as Resolver<LandingAnnouncementFormInput>,
    defaultValues: initial,
  });

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
          {result?.ok && <Alert type="success" showIcon message={result.message} />}
          <FormField
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)}>
                    {t("operator.landing.announcementEnabled")}
                  </Checkbox>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {TEXT_FIELDS.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(f.label)}</FormLabel>
                  <FormControl>
                    <TextInput maxLength={ANNOUNCEMENT_TEXT_MAX} autoComplete="off" {...field} />
                  </FormControl>
                  {f.name === "textId" && (
                    <FormDescription>
                      {t("operator.landing.announcementTextHint", { max: ANNOUNCEMENT_TEXT_MAX })}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <FormField
            control={form.control}
            name="href"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.landing.announcementHref")}</FormLabel>
                <FormControl>
                  <TextInput autoComplete="off" {...field} />
                </FormControl>
                <FormDescription>{t("operator.landing.announcementHrefHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Flex gap={token.marginSM} wrap>
            <FormField
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.landing.announcementStartsAt")}</FormLabel>
                  <FormControl>
                    <TextInput type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.landing.announcementEndsAt")}</FormLabel>
                  <FormControl>
                    <TextInput type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Flex>
          <p style={{ margin: 0, color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
            {t("operator.landing.announcementWindowHint")}
          </p>
          {form.formState.errors.root?.message && (
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          )}
          <Flex gap={token.marginXS} wrap>
            <Button type="submit" variant="primary" size="sm" disabled={form.formState.isSubmitting}>
              {t("operator.landing.save")}
            </Button>
            {exists && (
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
                {t("operator.landing.announcementClear")}
              </Button>
            )}
          </Flex>
        </Flex>
        <ConfirmDialog
          open={confirmClear}
          onOpenChange={setConfirmClear}
          title={t("operator.landing.announcementClearTitle")}
          message={t("operator.landing.announcementClearBody")}
          confirmVariant="danger"
          confirmLabel={t("operator.landing.announcementClear")}
          onConfirm={async () => {
            setConfirmClear(false);
            setResult(null);
            await selesai(await clear());
            form.reset({ enabled: false, textId: "", textEn: "", textZh: "", href: "", startsAt: "", endsAt: "" });
          }}
        />
      </form>
    </Form>
  );
}
