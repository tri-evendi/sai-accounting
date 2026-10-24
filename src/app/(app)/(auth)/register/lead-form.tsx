"use client";

/**
 * FORMULIR PERMINTAAN PENAWARAN / DEMO — layar `/register` saat pendaftaran
 * mandiri tertutup, dan `/register?quote=1` (migration platform 0016).
 *
 * Sebelum formulir ini, layar itu hanya memajang tombol WhatsApp & `mailto:`:
 * prospek yang menekan lalu urung mengirim pesan hilang tanpa jejak. Formulir
 * ini mencatat SATU baris `lead_requests` (route `/api/leads`) yang dibaca tim
 * di konsol operator; tombol WhatsApp/surel tetap ada di bawahnya sebagai
 * jalan lain — sebagian orang memang lebih suka langsung mengetik pesan.
 *
 * Pola formulir baku (MASTER.md §Konvensi Form): react-hook-form + zodResolver
 * dengan `leadFormSchema` yang SAMA dengan route-nya.
 *
 * Sesudah terkirim: ucapan terima kasih + nomor rujukan, dan tombol WhatsApp
 * yang pesannya sudah berisi nomor itu — jadi percakapan yang dibuka prospek
 * langsung tertaut ke baris yang dilihat tim.
 */

import Link from "next/link";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Col, Flex, Row, Typography, theme } from "antd";
import { SendOutlined, WhatsAppOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { Checkbox } from "@sai/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sai/ui/form";
import { TextInput } from "@sai/ui/input";
import { SelectField } from "@sai/ui/select";
import { Textarea } from "@sai/ui/textarea";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { LEAD_KINDS, LEAD_LIMITS } from "@sai/core/lead-request";
import { LEGAL_FORMS, LEGAL_FORM_LABEL_KEYS } from "@sai/core/legal-form";
import { emptyLeadForm, leadFormSchema, type LeadFormInput } from "@/lib/validations/lead";

const { Text } = Typography;

const KIND_LABEL = {
  demo: "auth.lead.kindDemo",
  quote: "auth.lead.kindQuote",
  question: "auth.lead.kindQuestion",
} as const satisfies Record<LeadFormInput["kind"], DictionaryKey>;

/**
 * Isian jebakan bot — di luar layar, bukan `display: none` (sebagian bot
 * melewati isian yang tersembunyi dengan cara itu), tak terjangkau Tab, dan
 * disembunyikan dari pembaca layar.
 */
const HONEYPOT_STYLE: React.CSSProperties = {
  position: "absolute",
  left: "-10000px",
  top: "auto",
  width: 1,
  height: 1,
  overflow: "hidden",
};

export interface LeadFormProps {
  defaultKind: LeadFormInput["kind"];
  source: string;
  /** `https://wa.me/<nomor>` tim SAI, tanpa teks; `undefined` = tidak ada kanal. */
  whatsappBaseUrl?: string;
}

export function LeadForm({ defaultKind, source, whatsappBaseUrl }: LeadFormProps) {
  const t = useT();
  const { token } = theme.useToken();
  const [reference, setReference] = useState<string | null | undefined>(undefined);

  const form = useForm<LeadFormInput>({
    resolver: zodResolver(leadFormSchema) as Resolver<LeadFormInput>,
    defaultValues: emptyLeadForm(defaultKind, source),
  });
  const submitting = form.formState.isSubmitting;

  async function onSubmit(values: LeadFormInput) {
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        /* Server tetap penjaga terakhir (aturan 7): galat per isian ke isiannya,
           selebihnya ke tingkat formulir. */
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        let ditempel = false;
        if (fieldErrors) {
          for (const [field, messages] of Object.entries(fieldErrors)) {
            const message = messages.find(Boolean);
            if (message && field in values && field !== "website" && field !== "source") {
              form.setError(field as keyof LeadFormInput, { message });
              ditempel = true;
            }
          }
        }
        if (!ditempel) form.setError("root", { message: data?.error ?? t("auth.lead.failed") });
        return;
      }
      setReference(typeof data?.reference === "string" ? data.reference : null);
    } catch {
      form.setError("root", { message: t("auth.lead.failed") });
    }
  }

  if (reference !== undefined) {
    const waUrl =
      whatsappBaseUrl && reference
        ? `${whatsappBaseUrl}?text=${encodeURIComponent(t("auth.lead.whatsappWithReference", { reference }))}`
        : null;
    return (
      <Flex vertical gap={token.marginSM} data-testid="lead-success">
        {/* `Alert` AntD sudah `role="alert"` sendiri. */}
        <Alert
          type="success"
          showIcon
          message={t("auth.lead.successTitle")}
          description={
            <>
              {t("auth.lead.successBody")}
              {reference && (
                <>
                  {" "}
                  {t("auth.lead.successReference")}{" "}
                  <strong style={{ fontFamily: "var(--ant-font-family-code)" }}>{reference}</strong>
                </>
              )}
            </>
          }
        />
        {waUrl && (
          <Button href={waUrl} target="_blank" rel="noreferrer" variant="primary">
            <WhatsAppOutlined aria-hidden="true" />
            {t("auth.lead.successWhatsapp")}
          </Button>
        )}
      </Flex>
    );
  }

  const rootError = form.formState.errors.root?.message;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label={t("auth.lead.formAria")}>
        <Flex vertical gap={token.marginXS}>
          {rootError && <Alert type="error" showIcon message={rootError} />}
          <Row gutter={[token.marginSM, 0]}>
            <Col span={24}>
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("auth.lead.kind")}</FormLabel>
                    <FormControl>
                      <SelectField
                        {...field}
                        disabled={submitting}
                        options={LEAD_KINDS.map((k) => ({ value: k, label: t(KIND_LABEL[k]) }))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>
            <Col xs={24} sm={12}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("auth.lead.name")}</FormLabel>
                    <FormControl>
                      <TextInput
                        {...field}
                        autoComplete="name"
                        maxLength={LEAD_LIMITS.name}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>
            <Col xs={24} sm={12}>
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("auth.lead.company")}</FormLabel>
                    <FormControl>
                      <TextInput
                        {...field}
                        autoComplete="organization"
                        placeholder={t("auth.lead.companyPlaceholder")}
                        maxLength={LEAD_LIMITS.company}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>
            <Col xs={24} sm={12}>
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("auth.lead.phone")}</FormLabel>
                    <FormControl>
                      <TextInput
                        {...field}
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="0812-3456-7890"
                        maxLength={LEAD_LIMITS.phoneInput}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>
            <Col xs={24} sm={12}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.lead.email")}</FormLabel>
                    <FormControl>
                      <TextInput
                        {...field}
                        type="email"
                        autoComplete="email"
                        maxLength={LEAD_LIMITS.email}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>
            <Col xs={24} sm={12}>
              <FormField
                control={form.control}
                name="legalForm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.lead.legalForm")}</FormLabel>
                    <FormControl>
                      <SelectField
                        {...field}
                        disabled={submitting}
                        options={[
                          { value: "", label: t("auth.lead.legalFormNone") },
                          ...LEGAL_FORMS.map((f) => ({ value: f, label: t(LEGAL_FORM_LABEL_KEYS[f]) })),
                        ]}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>
            <Col xs={24} sm={12}>
              <FormField
                control={form.control}
                name="companyCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.lead.companyCount")}</FormLabel>
                    <FormControl>
                      <TextInput
                        {...field}
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="3"
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>
            <Col span={24}>
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.lead.message")}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        maxLength={LEAD_LIMITS.message}
                        placeholder={t("auth.lead.messagePlaceholder")}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("auth.lead.messageHint", { max: LEAD_LIMITS.message })}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>
            <Col span={24}>
              <FormField
                control={form.control}
                name="consent"
                render={({ field }) => (
                  <FormItem>
                    <label
                      htmlFor="lead-consent"
                      style={{ display: "flex", cursor: "pointer", alignItems: "flex-start", gap: token.marginXS }}
                    >
                      <FormControl>
                        <Checkbox
                          id="lead-consent"
                          style={{ marginTop: token.marginXXS / 2 }}
                          checked={field.value === true}
                          onCheckedChange={(v) => field.onChange(v === true)}
                          onBlur={field.onBlur}
                          disabled={submitting}
                        />
                      </FormControl>
                      <span>
                        {t("auth.lead.consent")}
                        <Text
                          type="secondary"
                          style={{ display: "block", fontSize: token.fontSizeSM }}
                        >
                          {t("auth.lead.privacyNote")}{" "}
                          <Link href="/privacy" target="_blank" style={{ color: token.colorLink, fontWeight: 500 }}>
                            {t("auth.register.privacyLinkLabel")}
                          </Link>
                          .
                        </Text>
                      </span>
                    </label>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>
          </Row>

          {/* HONEYPOT — lihat `HONEYPOT_STYLE`. */}
          <div aria-hidden="true" style={HONEYPOT_STYLE}>
            <label htmlFor="lead-website">Website</label>
            <input id="lead-website" type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
          </div>

          <Button type="submit" variant="primary" size="lg" style={{ width: "100%" }} disabled={submitting}>
            <SendOutlined aria-hidden="true" />
            {submitting ? t("auth.lead.submitting") : t("auth.lead.submit")}
          </Button>
        </Flex>
      </form>
    </Form>
  );
}
