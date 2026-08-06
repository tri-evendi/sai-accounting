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
 *
 * ── Setelah AntD (issue #240, fase C9) ────────────────────────────────────
 * Pemberitahuan hasil & galat kini `Alert` AntD: ikon + teks `colorText` di atas
 * latar tipis, jadi maknanya tidak bergantung warna. `Alert` MENULIS
 * `role="alert"` sendiri pada akarnya dan membuang `role` yang dioper
 * (`pickAttrs(props, {aria, data})`), jadi pembungkus `role="status"` tidak
 * menambah apa pun — alasan lengkapnya di kepala
 * `app/(auth)/forgot-password/page.tsx`.
 *
 * Kisi isiannya tetap CSS grid, bukan `Row`/`Col`: beberapa isian membentang
 * dengan `gridColumn: "1 / -1"`, dan di dalam `Col` flexbox properti itu tidak
 * berarti apa-apa (catatan yang sama di `shared/invoice-fx-fields.tsx`).
 *
 * ⚠ Konsol operator berjalan di domain terpisah (`ops.`) dan tidak boleh
 * mewarisi konteks perusahaan — berkas ini karena itu tidak mengimpor apa pun
 * yang menariknya, termasuk untuk keperluan tampilan.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";
import type { GlobalToken } from "antd";
import {
  KeyOutlined,
  MailOutlined,
  SecurityScanOutlined,
  SendOutlined,
} from "@ant-design/icons";

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
import { moneyPalette } from "@/lib/theme/antd-tokens";
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

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2`. `max(240px, (100% − gutter)/2)` menahan jumlah kolomnya di
 * dua, jadi di 1440px kisinya tidak diam-diam berkembang jadi lima.
 */
const FIELD_MIN = 240;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});

/** Isian yang mengambil seluruh lebar kisi — pengganti `sm:col-span-2`. */
const FULL_ROW: React.CSSProperties = { gridColumn: "1 / -1" };

function ResultNotice({ result }: { result: OperatorMailActionResult | null }) {
  if (!result?.ok) return null;
  return <Alert type="success" showIcon message={result.message} />;
}

function RootError({ message }: { message?: string }) {
  if (!message) return null;
  return <Alert type="error" showIcon message={message} />;
}

/** Kotak panel — `rounded-xl border bg-card p-4` sebelum migrasi. */
function panelBox(token: GlobalToken): React.CSSProperties {
  return {
    padding: token.padding,
    borderRadius: token.borderRadiusLG,
    border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
    background: token.colorBgContainer,
  };
}

/* ══ 1. Formulir pengaturan ════════════════════════════════════════════════ */

function SettingsPanel({ available, encryptionKeyAvailable, effective, settings }: MailSettingsFormProps) {
  const t = useT();
  const { token } = theme.useToken();
  /* Teks peringatan memakai anak tangga uang #186 (`colorMoneyPending`, min
     6,23:1); `colorWarning` bawaan sebagai teks 14px hanya 1,90:1. */
  const money = moneyPalette(token);
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
    <section style={panelBox(token)}>
      <Flex vertical gap={token.marginSM}>
        <Flex align="center" gap={token.marginXS}>
          <MailOutlined
            aria-hidden="true"
            style={{ fontSize: 16, color: token.colorTextSecondary }}
          />
          <h2
            style={{
              margin: 0,
              fontSize: token.fontSizeLG,
              fontWeight: token.fontWeightStrong,
              color: token.colorText,
            }}
          >
            {t("operator.mail.formHeading")}
          </h2>
        </Flex>

        <ResultNotice result={result} />

        {!encryptionKeyAvailable && (
          <Alert
            type="warning"
            showIcon
            icon={<SecurityScanOutlined aria-hidden="true" style={{ fontSize: 16 }} />}
            message={t("operator.mail.keyMissing")}
          />
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            style={twoColumnGrid(token.marginSM)}
          >
            <div style={FULL_ROW}>
              <FormField
                control={form.control}
                name="transport"
                render={({ field }) => (
                  <FormItem>
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
            </div>

            <div style={FULL_ROW}>
              <FormField
                control={form.control}
                name="fromAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("operator.mail.fromAddressLabel")}</FormLabel>
                    <FormControl>
                      <TextInput
                        autoComplete="off"
                        spellCheck={false}
                        {...field}
                        disabled={!available}
                      />
                    </FormControl>
                    <FormDescription>{t("operator.mail.fromAddressHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                          style={{ fontVariantNumeric: "tabular-nums" }}
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
                <div style={FULL_ROW}>
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
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
                </div>

                <div style={FULL_ROW}>
                  <FormItem>
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

                    <Flex wrap gap={token.marginXS} style={{ paddingTop: token.paddingXXS }}>
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
                          <KeyOutlined aria-hidden="true" style={{ fontSize: 16 }} />
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
                    </Flex>
                    {clearPassword && (
                      <p style={{ margin: 0, color: money.colorMoneyPending }}>
                        {t("operator.mail.passwordClearHint")}
                      </p>
                    )}
                  </FormItem>
                </div>
              </>
            )}

            <Flex vertical gap={token.marginXS} style={FULL_ROW}>
              <RootError message={form.formState.errors.root?.message} />
              <Button
                type="submit"
                size="sm"
                style={{ alignSelf: "flex-start" }}
                disabled={!available || form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? t("common.processing") : t("operator.mail.submit")}
              </Button>
            </Flex>
          </form>
        </Form>
      </Flex>
    </section>
  );
}

/* ══ 2. Uji kirim ══════════════════════════════════════════════════════════ */

/** Hasil uji terakhir yang tersimpan; `null` = belum pernah / belum ada baris. */
type LastTest = NonNullable<MailSettingsFormProps["settings"]>["lastTest"];

function TestPanel({ lastTest }: { lastTest: LastTest }) {
  const t = useT();
  const { token } = theme.useToken();
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
    <section style={panelBox(token)}>
      <Flex vertical gap={token.marginSM}>
        <Flex align="center" gap={token.marginXS}>
          <SendOutlined
            aria-hidden="true"
            style={{ fontSize: 16, color: token.colorTextSecondary }}
          />
          <h2
            style={{
              margin: 0,
              fontSize: token.fontSizeLG,
              fontWeight: token.fontWeightStrong,
              color: token.colorText,
            }}
          >
            {t("operator.mail.testHeading")}
          </h2>
        </Flex>
        <p style={{ margin: 0, color: token.colorTextSecondary }}>
          {t("operator.mail.testDescription")}
        </p>

        <ResultNotice result={result} />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <Flex vertical gap={token.marginSM} align="flex-start">
              <div style={{ width: "100%" }}>
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
              </div>
              {form.formState.errors.root?.message && (
                <div style={{ width: "100%" }}>
                  <RootError message={form.formState.errors.root.message} />
                </div>
              )}
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={form.formState.isSubmitting}
              >
                <SendOutlined aria-hidden="true" style={{ fontSize: 16 }} />
                {form.formState.isSubmitting
                  ? t("common.processing")
                  : t("operator.mail.testSubmit")}
              </Button>
            </Flex>
          </form>
        </Form>

        <Flex
          vertical
          gap={token.marginXXS}
          style={{
            paddingTop: token.paddingSM,
            borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
          }}
        >
          <h3
            style={{ margin: 0, fontWeight: token.fontWeightStrong, color: token.colorText }}
          >
            {t("operator.mail.lastTestHeading")}
          </h3>
          {lastTest ? (
            <Flex vertical gap={token.marginXXS}>
              <Flex wrap align="center" gap={token.marginXS}>
                {/* Hasil uji BERTEKS, bukan warna saja. */}
                <Badge variant={lastTest.ok ? "success" : "danger"}>
                  {lastTest.ok ? t("operator.mail.lastTestOk") : t("operator.mail.lastTestError")}
                </Badge>
                <span style={{ color: token.colorTextSecondary }}>{lastTest.line}</span>
              </Flex>
              {lastTest.message && (
                <p style={{ margin: 0, color: token.colorText }}>{lastTest.message}</p>
              )}
            </Flex>
          ) : (
            <p style={{ margin: 0, color: token.colorTextSecondary }}>
              {t("operator.mail.lastTestNever")}
            </p>
          )}
        </Flex>
      </Flex>
    </section>
  );
}

/* ══ Rangkaian ═════════════════════════════════════════════════════════════ */

export function MailSettingsForm(props: MailSettingsFormProps) {
  const t = useT();
  const { token } = theme.useToken();
  const money = moneyPalette(token);

  /** Baris `dt`/`dd` — label kiri, nilai kanan di layar sempit. */
  const factRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: token.marginSM,
  };

  return (
    <Flex vertical gap={token.margin}>
      {!props.available && (
        <Alert type="warning" showIcon message={t("operator.mail.unavailable")} />
      )}

      {/* Apa yang BENAR-BENAR berlaku sekarang — sebelum isian apa pun. */}
      <section
        style={{
          ...panelBox(token),
          background: token.colorFillQuaternary,
        }}
      >
        <Flex vertical gap={token.marginXS}>
          <h2
            style={{
              margin: 0,
              fontSize: token.fontSizeLG,
              fontWeight: token.fontWeightStrong,
              color: token.colorText,
            }}
          >
            {t("operator.mail.effectiveHeading")}
          </h2>
          <dl
            style={{
              ...twoColumnGrid(token.marginXXS),
              columnGap: token.marginLG,
              margin: 0,
            }}
          >
            <div style={factRow}>
              <dt style={{ color: token.colorTextSecondary }}>{t("operator.mail.sourceLabel")}</dt>
              <dd style={{ margin: 0, fontWeight: 500, color: token.colorText }}>
                {props.effective.sourceLabel}
              </dd>
            </div>
            <div style={factRow}>
              <dt style={{ color: token.colorTextSecondary }}>
                {t("operator.mail.transportLabel")}
              </dt>
              <dd style={{ margin: 0, fontWeight: 500, color: token.colorText }}>
                {props.effective.transportLabel}
              </dd>
            </div>
            <div style={{ ...factRow, ...FULL_ROW }}>
              <dt style={{ color: token.colorTextSecondary }}>{t("operator.mail.fromLabel")}</dt>
              <dd
                style={{
                  margin: 0,
                  wordBreak: "break-all",
                  fontWeight: 500,
                  color: token.colorText,
                }}
              >
                {props.effective.from}
              </dd>
            </div>
          </dl>
          {props.effective.downgraded && (
            <p style={{ margin: 0, color: money.colorMoneyPending }}>
              {t("operator.mail.nonProductionNote")}
            </p>
          )}
          <p style={{ margin: 0, color: token.colorTextSecondary }}>
            {props.settings ? props.settings.updatedByLabel : t("operator.mail.neverSaved")}
          </p>
        </Flex>
      </section>

      {/* Dua panel berdampingan selama muat, turun sendiri saat tidak —
          pengganti `lg:grid-cols-2` tanpa titik patah. */}
      <div
        style={{
          display: "grid",
          gap: token.margin,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
        }}
      >
        <SettingsPanel {...props} />
        <TestPanel lastTest={props.settings?.lastTest ?? null} />
      </div>

      <p style={{ margin: 0, color: token.colorTextSecondary }}>{t("operator.mail.auditNote")}</p>
    </Flex>
  );
}
