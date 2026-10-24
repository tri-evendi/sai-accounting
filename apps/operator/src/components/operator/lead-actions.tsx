"use client";

/**
 * TINDAKAN pada satu PENAWARAN MASUK (konsol `/leads/[id]`, migration platform
 * 0016): pindahkan status, tambah catatan, buka WhatsApp dengan sapaan siap
 * kirim, salin surel.
 *
 * Tombol status hanya yang SAH dari status sekarang (`LEAD_TRANSITIONS`) — dan
 * server action-nya memeriksa ulang, sebab tombol yang tampil bukan izin.
 * WhatsApp & salin surel bukan tulisan: keduanya tampil bagi siapa pun yang
 * membuka halaman ini, dan yang dicatat adalah status yang diubah sesudahnya.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex } from "antd";
import { CopyOutlined, WhatsAppOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@sai/ui/form";
import { Textarea } from "@sai/ui/textarea";
import { useT } from "@sai/core/i18n/client";
import { LEAD_LIMITS, LEAD_TRANSITIONS, isLeadStatus, type LeadStatus } from "@sai/core/lead-request";
import { LEAD_ACTION_LABEL } from "@op/lib/operator/lead-view";
import { leadNoteSchema, type LeadNoteInput } from "@op/lib/validations/operator";
import type { OperatorActionResult } from "@op/app/(operator)/tenants/[id]/actions";

export interface LeadActionsProps {
  leadId: number;
  status: string;
  canAct: boolean;
  anonymized: boolean;
  /** Tautan `wa.me` ke prospek dengan sapaan; `null` bila data sudah dianonimkan. */
  whatsappUrl: string | null;
  email: string | null;
  changeStatus: (input: { leadId: number; to: LeadStatus }) => Promise<OperatorActionResult>;
  addNote: (input: LeadNoteInput) => Promise<OperatorActionResult>;
}

export function LeadActions({
  leadId,
  status,
  canAct,
  anonymized,
  whatsappUrl,
  email,
  changeStatus,
  addNote,
}: LeadActionsProps) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OperatorActionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<LeadNoteInput>({
    resolver: zodResolver(leadNoteSchema) as Resolver<LeadNoteInput>,
    defaultValues: { leadId, text: "" },
  });

  const targets: readonly LeadStatus[] = isLeadStatus(status) ? LEAD_TRANSITIONS[status] : [];

  function pindah(to: LeadStatus) {
    startTransition(async () => {
      const r = await changeStatus({ leadId, to });
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  async function simpanCatatan(values: LeadNoteInput) {
    const r = await addNote(values);
    setResult(r);
    if (r.ok) {
      form.reset({ leadId, text: "" });
      router.refresh();
    } else {
      form.setError("root", { message: r.message });
    }
  }

  async function salinSurel() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Flex vertical gap="middle">
      {result && <Alert type={result.ok ? "success" : "error"} showIcon message={result.message} />}

      {/* Kontak — bukan tulisan, jadi tidak menuntut izin. */}
      {!anonymized && (
        <Flex gap="small" wrap>
          {whatsappUrl && (
            <Button href={whatsappUrl} target="_blank" rel="noreferrer" variant="primary">
              <WhatsAppOutlined aria-hidden="true" />
              {t("operator.leads.openWhatsapp")}
            </Button>
          )}
          {email && (
            <Button variant="outline" onClick={salinSurel} aria-live="polite">
              <CopyOutlined aria-hidden="true" />
              {copied ? t("operator.leads.emailCopied") : t("operator.leads.copyEmail")}
            </Button>
          )}
        </Flex>
      )}

      {canAct ? (
        <>
          {targets.length > 0 && (
            <Flex gap="small" wrap aria-label={t("operator.leads.statusActionsAria")} role="group">
              {targets.map((to) => (
                <Button
                  key={to}
                  variant={to === "spam" ? "ghost" : "outline"}
                  disabled={pending}
                  onClick={() => pindah(to)}
                >
                  {t(LEAD_ACTION_LABEL[to])}
                </Button>
              ))}
            </Flex>
          )}
          {!anonymized && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(simpanCatatan)} noValidate>
                <Flex vertical gap="small">
                  <FormField
                    control={form.control}
                    name="text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("operator.leads.noteLabel")}</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={2}
                            maxLength={LEAD_LIMITS.noteEntry}
                            placeholder={t("operator.leads.notePlaceholder")}
                            disabled={form.formState.isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div>
                    <Button type="submit" variant="outline" disabled={form.formState.isSubmitting}>
                      {t("operator.leads.noteSubmit")}
                    </Button>
                  </div>
                </Flex>
              </form>
            </Form>
          )}
        </>
      ) : (
        <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>{t("operator.leads.readOnly")}</p>
      )}
    </Flex>
  );
}
