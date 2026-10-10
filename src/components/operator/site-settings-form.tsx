"use client";

/**
 * FORMULIR PENGATURAN SITUS — tiga nilai yang berhenti menuntut SSH.
 *
 * ══ YANG DIKATAKAN LAYAR INI, DAN KENAPA ═══════════════════════════════════
 * Setiap isian menyebut **dari mana nilainya sekarang berasal**: basis data
 * (disetel dari konsol) atau environment (`.env` di server). Tanpa itu,
 * operator yang melihat kotak terisi tidak bisa tahu apakah mengosongkannya
 * akan mencabut kanalnya atau "mengembalikannya ke env" — dua maksud yang
 * sangat berbeda dan, di formulir HTML, tidak bisa dibedakan dari satu kotak
 * teks. Karena itu:
 *
 *   • kotak KOSONG saat disimpan = **cabut kanalnya**;
 *   • "Kembalikan ke environment" = tombol TERSENDIRI yang menghapus barisnya.
 *
 * Keduanya dinyatakan di layar, bukan disimpan sebagai pengetahuan operator.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";

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
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/client";
import { siteSettingsSchema, type SiteSettingsFormInput } from "@/lib/validations/operator";
import type { OperatorSettingsResult } from "@/app/(app)/(operator)/operator/settings/actions";

export interface SiteSettingsFormProps {
  /** Nilai awal = yang BERLAKU sekarang (DB bila ada, kalau tidak env). */
  initial: SiteSettingsFormInput;
  /** Per medan: apakah nilainya datang dari basis data atau dari environment. */
  fromDb: { whatsapp: boolean; email: boolean; payment: boolean };
  /** Ada barisnya di basis data — menentukan perlu-tidaknya tombol kembalikan. */
  rowExists: boolean;
  save: (input: SiteSettingsFormInput) => Promise<OperatorSettingsResult>;
  reset: () => Promise<OperatorSettingsResult>;
}

export function SiteSettingsForm({
  initial,
  fromDb,
  rowExists,
  save,
  reset,
}: SiteSettingsFormProps) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [result, setResult] = useState<OperatorSettingsResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  const form = useForm<SiteSettingsFormInput>({
    resolver: zodResolver(siteSettingsSchema) as Resolver<SiteSettingsFormInput>,
    defaultValues: initial,
  });

  /** Dari mana nilai medan ini berasal — dikatakan di bawah setiap isian. */
  const sumber = (db: boolean) =>
    db ? t("operator.settings.fromDb") : t("operator.settings.fromEnv");

  const onSubmit = form.handleSubmit(async (values) => {
    setResult(null);
    const res = await save(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    /* Dibaca ULANG dari server: label "dari basis data / dari environment"
       berubah setelah simpan, dan menebaknya di client berarti dua kebenaran. */
    router.refresh();
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate>
        <Flex vertical gap={token.marginLG} style={{ maxWidth: 560 }}>
          <FormField
            control={form.control}
            name="contactWhatsapp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.settings.whatsappLabel")}</FormLabel>
                <FormControl>
                  <TextInput {...field} inputMode="numeric" placeholder="628123456789" />
                </FormControl>
                <FormDescription>
                  {t("operator.settings.whatsappHint")} · {sumber(fromDb.whatsapp)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contactEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.settings.emailLabel")}</FormLabel>
                <FormControl>
                  <TextInput {...field} inputMode="email" placeholder="sales@contoh.id" />
                </FormControl>
                <FormDescription>
                  {t("operator.settings.emailHint")} · {sumber(fromDb.email)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualPaymentInstructions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.settings.paymentLabel")}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormDescription>
                  {t("operator.settings.paymentHint")} · {sumber(fromDb.payment)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Kotak kosong = CABUT, bukan "pakai env" — dikatakan sebelum tombol
              simpan, bukan sesudah orang kehilangan kanalnya. */}
          <p style={{ margin: 0, fontSize: token.fontSize, color: token.colorTextSecondary }}>
            {t("operator.settings.emptyMeans")}
          </p>

          {result && <Alert type="success" showIcon message={result.message} />}
          {form.formState.errors.root?.message && (
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          )}

          <Flex wrap gap={token.marginXS}>
            <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
            {rowExists && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirming(true)}
              >
                {t("operator.settings.resetSubmit")}
              </Button>
            )}
          </Flex>
        </Flex>

        {/* Mengembalikan ke environment MENGHAPUS barisnya — pesannya menyebut
            akibatnya, bukan "Anda yakin?" (MASTER.md §Form). */}
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t("operator.settings.resetSubmit")}
          message={t("operator.settings.resetConfirm")}
          confirmLabel={t("operator.settings.resetSubmit")}
          onConfirm={async () => {
            const res = await reset();
            setResult(res.ok ? res : null);
            if (!res.ok) form.setError("root", { message: res.message });
            router.refresh();
          }}
        />
      </form>
    </Form>
  );
}
