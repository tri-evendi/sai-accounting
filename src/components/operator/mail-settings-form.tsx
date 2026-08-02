"use client";

/**
 * Panel PENGATURAN SUREL (issue #169) — dua formulir di satu layar:
 *
 *   1. pengaturan server surel (transport, host, port, pengguna, pengirim,
 *      kata sandi) — kata sandi TIDAK PERNAH datang dari server: yang tampil
 *      `••••` dengan tombol "Ganti kata sandi"; menyimpan tanpa mengetiknya
 *      MEMPERTAHANKAN yang tersimpan;
 *   2. UJI KIRIM ke alamat yang diketik operator — bagian paling berharga
 *      halaman ini: konfigurasi surel yang tidak bisa diuji adalah konfigurasi
 *      yang baru ketahuan salah saat pelanggan pertama mendaftar.
 *
 * Pola form MASTER.md: react-hook-form + zodResolver dengan SKEMA YANG SAMA
 * yang diurai ulang server action (`lib/validations/operator.ts` — satu skema,
 * dua sisi). Isian SMTP muncul hanya saat transportnya SMTP (progressive
 * disclosure); warna seluruhnya dari token semantik.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Mail, Send, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { PasswordField } from "@/components/ui/password-input";
import { NativeSelect } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import {
  mailSettingsSchema,
  mailTestSchema,
  type MailSettingsFormInput,
  type MailTestFormInput,
} from "@/lib/validations/operator";
import type { OperatorMailActionResult } from "@/app/(operator)/operator/mail/actions";
import {
  operatorSaveMailSettings,
  operatorSendTestMail,
} from "@/app/(operator)/operator/mail/actions";

/* ── Bentuk data dari halaman server (serial; tanggal sudah terformat) ─────── */

export interface MailSettingsFormProps {
  /** false = `sai_platform` tak terjangkau — formulir dimatikan, kalimatnya
   *  menjelaskan bahwa surel TETAP jalan lewat environment. */
  available: boolean;
  /** false = `SETTINGS_ENCRYPTION_KEY` tidak layak; layar memperingatkan
   *  SEBELUM operator mengetik kata sandi yang akan ditolak. */
  encryptionKeyAvailable: boolean;
  effective: {
    sourceLabel: string;
    transportLabel: string;
    from: string;
    /** true = transport SMTP diminta tetapi diabaikan (bukan produksi). */
    downgraded: boolean;
  };
  settings: {
    transport: "file" | "smtp";
    host: string | null;
    port: number | null;
    username: string | null;
    fromAddress: string;
    hasPassword: boolean;
    updatedByLabel: string;
    lastTest: { ok: boolean; line: string; message: string | null } | null;
  } | null;
}

function ResultNotice({ result }: { result: OperatorMailActionResult | null }) {
  if (!result?.ok) return null;
  return (
    <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success-strong">
      {result.message}
    </p>
  );
}

function RootError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg bg-destructive-soft p-3 text-sm leading-relaxed text-destructive-strong"
    >
      {message}
    </p>
  );
}

/* ══ 1. Formulir pengaturan ════════════════════════════════════════════════ */

function SettingsPanel({ available, encryptionKeyAvailable, effective, settings }: MailSettingsFormProps) {
  const t = useT();
  const router = useRouter();
  const [result, setResult] = useState<OperatorMailActionResult | null>(null);
  /* Kata sandi TERSIMPAN tidak pernah dikirim ke sini; menggantinya adalah
   * tindakan yang diminta secara sadar, bukan isian yang menunggu diisi. */
  const [changingPassword, setChangingPassword] = useState(!settings?.hasPassword);

  const form = useForm<MailSettingsFormInput>({
    resolver: zodResolver(mailSettingsSchema) as Resolver<MailSettingsFormInput>,
    defaultValues: {
      transport: settings?.transport ?? "file",
      host: settings?.host ?? "",
      port: settings?.port ?? "",
      username: settings?.username ?? "",
      fromAddress: settings?.fromAddress ?? effective.from,
      password: "",
      clearPassword: false,
    },
  });

  const transport = useWatch({ control: form.control, name: "transport" });
  const clearPassword = useWatch({ control: form.control, name: "clearPassword" });

  async function onSubmit(values: MailSettingsFormInput) {
    const res = await operatorSaveMailSettings(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    form.setValue("password", "");
    form.setValue("clearPassword", false);
    setChangingPassword(false);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">
          {t("operator.mail.formHeading")}
        </h2>
      </div>

      <ResultNotice result={result} />

      {!encryptionKeyAvailable && (
        <p className="flex gap-2 rounded-lg bg-warning-soft p-3 text-sm leading-relaxed text-warning-strong">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("operator.mail.keyMissing")}</span>
        </p>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="transport"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("operator.mail.transportFieldLabel")}</FormLabel>
                <FormControl>
                  <NativeSelect
                    options={[
                      { value: "file", label: t("operator.mail.transportFile") },
                      { value: "smtp", label: t("operator.mail.transportSmtp") },
                    ]}
                    {...field}
                    disabled={!available}
                  />
                </FormControl>
                {transport === "file" && (
                  <FormDescription>{t("operator.mail.transportFileHint")}</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fromAddress"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("operator.mail.fromAddressLabel")}</FormLabel>
                <FormControl>
                  <TextInput autoComplete="off" spellCheck={false} {...field} disabled={!available} />
                </FormControl>
                <FormDescription>{t("operator.mail.fromAddressHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Progressive disclosure: isian server hanya relevan untuk SMTP. */}
          {transport === "smtp" && (
            <>
              <FormField
                control={form.control}
                name="host"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("operator.mail.hostLabel")}</FormLabel>
                    <FormControl>
                      <TextInput
                        autoComplete="off"
                        spellCheck={false}
                        {...field}
                        value={field.value ?? ""}
                        disabled={!available}
                      />
                    </FormControl>
                    <FormDescription>{t("operator.mail.hostHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("operator.mail.portLabel")}</FormLabel>
                    <FormControl>
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        className="tabular-nums"
                        {...field}
                        value={field.value ?? ""}
                        disabled={!available}
                      />
                    </FormControl>
                    <FormDescription>{t("operator.mail.portHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("operator.mail.usernameLabel")}</FormLabel>
                    <FormControl>
                      <TextInput
                        autoComplete="off"
                        spellCheck={false}
                        {...field}
                        value={field.value ?? ""}
                        disabled={!available}
                      />
                    </FormControl>
                    <FormDescription>{t("operator.mail.usernameHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem className="sm:col-span-2">
                <FormLabel>{t("operator.mail.passwordLabel")}</FormLabel>
                {changingPassword ? (
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <>
                        <FormControl>
                          <PasswordField
                            autoComplete="new-password"
                            {...field}
                            value={field.value ?? ""}
                            disabled={!available || clearPassword === true}
                          />
                        </FormControl>
                        <FormDescription>{t("operator.mail.passwordHint")}</FormDescription>
                        <FormMessage />
                      </>
                    )}
                  />
                ) : (
                  <FormDescription>{t("operator.mail.passwordStored")}</FormDescription>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {settings?.hasPassword && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!available}
                      onClick={() => {
                        setChangingPassword((open) => !open);
                        form.setValue("password", "");
                      }}
                    >
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                      {changingPassword
                        ? t("operator.mail.passwordCancel")
                        : t("operator.mail.passwordChange")}
                    </Button>
                  )}
                  {settings?.hasPassword && (
                    <Button
                      type="button"
                      variant={clearPassword ? "danger" : "outline"}
                      size="sm"
                      disabled={!available}
                      aria-pressed={clearPassword === true}
                      onClick={() => {
                        form.setValue("clearPassword", !clearPassword);
                        form.setValue("password", "");
                      }}
                    >
                      {t("operator.mail.passwordClear")}
                    </Button>
                  )}
                </div>
                {clearPassword && (
                  <p className="text-sm text-warning-strong">
                    {t("operator.mail.passwordClearHint")}
                  </p>
                )}
              </FormItem>
            </>
          )}

          <div className="space-y-2 sm:col-span-2">
            <RootError message={form.formState.errors.root?.message} />
            <Button type="submit" size="sm" disabled={!available || form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.processing") : t("operator.mail.submit")}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}

/* ══ 2. Uji kirim ══════════════════════════════════════════════════════════ */

/** Hasil uji terakhir yang tersimpan; `null` = belum pernah / belum ada baris. */
type LastTest = NonNullable<MailSettingsFormProps["settings"]>["lastTest"];

function TestPanel({ lastTest }: { lastTest: LastTest }) {
  const t = useT();
  const router = useRouter();
  const [result, setResult] = useState<OperatorMailActionResult | null>(null);

  const form = useForm<MailTestFormInput>({
    resolver: zodResolver(mailTestSchema) as Resolver<MailTestFormInput>,
    defaultValues: { to: "" },
  });

  async function onSubmit(values: MailTestFormInput) {
    setResult(null);
    const res = await operatorSendTestMail(values);
    if (!res.ok) {
      /* Kegagalan uji kirim BUKAN galat halaman — ia jawaban yang dicari:
       * alasannya (host salah, autentikasi ditolak, port tertutup) berdiri
       * apa adanya di layar. */
      form.setError("root", { message: res.message });
      router.refresh();
      return;
    }
    setResult(res);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">{t("operator.mail.testHeading")}</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("operator.mail.testDescription")}
      </p>

      <ResultNotice result={result} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3">
          <FormField
            control={form.control}
            name="to"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.mail.testToLabel")}</FormLabel>
                <FormControl>
                  <TextInput type="email" autoComplete="off" spellCheck={false} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <RootError message={form.formState.errors.root?.message} />
          <Button type="submit" size="sm" variant="secondary" disabled={form.formState.isSubmitting}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {form.formState.isSubmitting ? t("common.processing") : t("operator.mail.testSubmit")}
          </Button>
        </form>
      </Form>

      <div className="space-y-1 border-t border-border pt-3">
        <h3 className="text-sm font-semibold text-foreground">
          {t("operator.mail.lastTestHeading")}
        </h3>
        {lastTest ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={lastTest.ok ? "success" : "danger"}>
                {lastTest.ok ? t("operator.mail.lastTestOk") : t("operator.mail.lastTestError")}
              </Badge>
              <span className="text-sm text-muted-foreground">{lastTest.line}</span>
            </div>
            {lastTest.message && (
              <p className="text-sm leading-relaxed text-foreground">{lastTest.message}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("operator.mail.lastTestNever")}</p>
        )}
      </div>
    </section>
  );
}

/* ══ Rangkaian ═════════════════════════════════════════════════════════════ */

export function MailSettingsForm(props: MailSettingsFormProps) {
  const t = useT();

  return (
    <div className="space-y-4">
      {!props.available && (
        <p className="rounded-lg bg-warning-soft p-3 text-sm leading-relaxed text-warning-strong">
          {t("operator.mail.unavailable")}
        </p>
      )}

      {/* Apa yang BENAR-BENAR berlaku sekarang — sebelum isian apa pun. */}
      <section className="space-y-2 rounded-xl border border-border bg-muted p-4">
        <h2 className="text-base font-semibold text-foreground">
          {t("operator.mail.effectiveHeading")}
        </h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3 sm:justify-start">
            <dt className="text-muted-foreground">{t("operator.mail.sourceLabel")}</dt>
            <dd className="font-medium text-foreground">{props.effective.sourceLabel}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:justify-start">
            <dt className="text-muted-foreground">{t("operator.mail.transportLabel")}</dt>
            <dd className="font-medium text-foreground">{props.effective.transportLabel}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:col-span-2 sm:justify-start">
            <dt className="text-muted-foreground">{t("operator.mail.fromLabel")}</dt>
            <dd className="break-all font-medium text-foreground">{props.effective.from}</dd>
          </div>
        </dl>
        {props.effective.downgraded && (
          <p className="text-sm leading-relaxed text-warning-strong">
            {t("operator.mail.nonProductionNote")}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {props.settings ? props.settings.updatedByLabel : t("operator.mail.neverSaved")}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsPanel {...props} />
        <TestPanel lastTest={props.settings?.lastTest ?? null} />
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{t("operator.mail.auditNote")}</p>
    </div>
  );
}
