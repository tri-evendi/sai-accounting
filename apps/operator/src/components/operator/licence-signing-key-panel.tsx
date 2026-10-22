"use client";

/**
 * Panel KUNCI PENANDA LISENSI di `/licences` (migration platform 0007;
 * keputusan pemilik 22 Okt 2026).
 *
 * Tiga keadaan, masing-masing dengan SATU hal yang harus dilakukan:
 *
 *   • belum ada kunci → buat (frasa sandi diketik dua kali, owner saja);
 *   • kunci ada, belum ditanam → tempel PEM publik ke `LICENCE_PUBLIC_KEY_PEM`
 *     lalu rilis — tanpa itu pemasangan customer tidak menerima apa pun, dan
 *     konsol menolak menandatangani;
 *   • kunci ada & cocok dengan kunci tertanam → siap; tanda tangan dilakukan
 *     dari baris draf di register.
 *
 * Yang turun ke peramban hanya kunci PUBLIK dan sidiknya. Frasa sandi hidup di
 * state formulir sampai dikirim, lalu dikosongkan.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, Typography, theme } from "antd";

import { Badge } from "@sai/ui/badge";
import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@sai/ui/form";
import { PasswordField } from "@sai/ui/password-input";
import { ConsoleNotice, ConsolePanel } from "@op/components/operator/console-ui";
import { useT } from "@sai/core/i18n/client";
import { formatDateTime } from "@sai/core/utils";
import { licenceKeyCreateSchema, type LicenceKeyCreateInput } from "@op/lib/validations/operator";
import type { LicenceKeyCreateResult } from "@op/app/(operator)/licences/actions";

const { Text, Paragraph } = Typography;

export type CompiledKeyRelationItem = "not_set" | "matches" | "differs";

export interface SigningKeyItem {
  fingerprint: string;
  publicKeyPem: string;
  createdBy: string;
  createdAt: string;
}

export interface LicenceSigningKeyPanelProps {
  signingKey: SigningKeyItem | null;
  compiled: CompiledKeyRelationItem;
  compiledFingerprint: string | null;
  canSign: boolean;
  createKey: (input: LicenceKeyCreateInput) => Promise<LicenceKeyCreateResult>;
}

/** Sidik dalam kelompok 4 karakter — dibacakan dan dicocokkan oleh manusia. */
function groupFingerprint(fp: string): string {
  return fp.match(/.{1,4}/g)?.join(" ") ?? fp;
}

function CodeBlock({ text, copyLabel, copiedLabel }: { text: string; copyLabel: string; copiedLabel: string }) {
  const { token } = theme.useToken();
  return (
    <Paragraph
      copyable={{ text, tooltips: [copyLabel, copiedLabel] }}
      style={{
        margin: 0,
        fontFamily: token.fontFamilyCode,
        fontSize: token.fontSizeSM,
        background: token.colorFillQuaternary,
        border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        padding: token.paddingSM,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {text}
    </Paragraph>
  );
}

export function LicenceSigningKeyPanel({
  signingKey,
  compiled,
  compiledFingerprint,
  canSign,
  createKey,
}: LicenceSigningKeyPanelProps) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [created, setCreated] = useState<{ message: string } | null>(null);

  const form = useForm<LicenceKeyCreateInput>({
    resolver: zodResolver(licenceKeyCreateSchema) as Resolver<LicenceKeyCreateInput>,
    defaultValues: { passphrase: "", confirm: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    /* Frasa dikosongkan dari state SEBELUM jawaban datang — ia tidak perlu
       hidup di peramban lebih lama dari satu permintaan. */
    form.reset({ passphrase: "", confirm: "" });
    const res = await createKey(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setCreated({ message: res.message });
    router.refresh();
  });

  const copy = t("operator.licences.key.copy");
  const copied = t("operator.licences.copied");

  return (
    <ConsolePanel
      title={t("operator.licences.key.title")}
      description={t("operator.licences.key.description")}
      footnote={t("operator.licences.key.riskNote")}
    >
      <Flex vertical gap={token.margin}>
        {created && <Alert type="success" showIcon message={created.message} />}

        {signingKey ? (
          <>
            <Flex wrap align="center" gap={token.marginSM}>
              {compiled === "matches" && (
                <Badge variant="success">{t("operator.licences.key.state.matches")}</Badge>
              )}
              {compiled === "not_set" && (
                <Badge variant="warning">{t("operator.licences.key.state.notSet")}</Badge>
              )}
              {compiled === "differs" && (
                <Badge variant="danger">{t("operator.licences.key.state.differs")}</Badge>
              )}
              <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {t("operator.licences.key.meta", {
                  by: signingKey.createdBy,
                  at: formatDateTime(signingKey.createdAt),
                })}
              </Text>
            </Flex>

            <Flex vertical gap={token.marginXXS}>
              <Text>{t("operator.licences.key.fingerprint")}</Text>
              <Text style={{ fontFamily: token.fontFamilyCode, fontVariantNumeric: "tabular-nums" }}>
                {groupFingerprint(signingKey.fingerprint)}
              </Text>
            </Flex>

            {compiled === "not_set" && (
              <Alert type="warning" showIcon message={t("operator.licences.key.pasteInstruction")} />
            )}
            {compiled === "differs" && (
              <Alert
                type="error"
                showIcon
                message={t("operator.licences.key.differsInstruction", {
                  fingerprint: compiledFingerprint ? groupFingerprint(compiledFingerprint) : "—",
                })}
              />
            )}

            <Flex vertical gap={token.marginXS}>
              <Text>{t("operator.licences.key.publicKeyLabel")}</Text>
              <CodeBlock text={signingKey.publicKeyPem.trimEnd()} copyLabel={copy} copiedLabel={copied} />
            </Flex>
          </>
        ) : compiled !== "not_set" ? (
          <ConsoleNotice>{t("operator.licences.key.offlineInUse")}</ConsoleNotice>
        ) : !canSign ? (
          <ConsoleNotice>{t("operator.licences.key.noneReadOnly")}</ConsoleNotice>
        ) : (
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()} noValidate>
              <Flex vertical gap={token.margin} style={{ maxWidth: 560 }}>
                <Alert type="info" showIcon message={t("operator.licences.key.createIntro")} />
                <FormField
                  control={form.control}
                  name="passphrase"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("operator.licences.key.passphrase")}</FormLabel>
                      <FormControl>
                        <PasswordField {...field} autoComplete="new-password" />
                      </FormControl>
                      <FormDescription>{t("operator.licences.key.passphraseHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("operator.licences.key.confirm")}</FormLabel>
                      <FormControl>
                        <PasswordField {...field} autoComplete="new-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.formState.errors.root?.message && (
                  <Alert type="error" showIcon message={form.formState.errors.root.message} />
                )}
                <div>
                  <ConfirmDialog
                    title={t("operator.licences.key.confirmTitle")}
                    message={t("operator.licences.key.confirmBody")}
                    confirmLabel={t("operator.licences.key.submit")}
                    confirmVariant="primary"
                    onConfirm={() => submit()}
                    trigger={
                      <Button variant="primary" disabled={form.formState.isSubmitting}>
                        {t("operator.licences.key.submit")}
                      </Button>
                    }
                  />
                </div>
              </Flex>
            </form>
          </Form>
        )}
      </Flex>
    </ConsolePanel>
  );
}
