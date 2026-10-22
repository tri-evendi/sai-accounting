"use client";

/**
 * Layar REGISTER LISENSI ON-PREMISE di konsol (`/licences`).
 *
 * Satu formulir → satu draf, lalu draf ditandatangani lewat salah satu dari
 * dua jalur (keputusan pemilik 22 Okt 2026):
 *
 *   • DI KONSOL — owner mengetik frasa sandi kunci penanda; server membuka
 *     kunci tersegel, menandatangani, memverifikasi, mencatat terbit, dan
 *     memulangkan berkasnya untuk diunduh;
 *   • LURING — perintah `licence:issue` disalin ke laptop, berkas hasilnya
 *     diunggah balik.
 *
 * Perpanjangan mengisi formulir dari penerbitan sebelumnya, jadi yang diketik
 * ulang hanya yang berubah.
 *
 * Tidak ada apa pun di sini yang menyentuh kunci privat. Frasa sandi hidup di
 * state sampai dikirim ke server action, lalu dikosongkan. Perintahnya dirakit
 * di SERVER (`buildIssueCommand`) dan turun sebagai teks; berkas yang diunggah
 * diverifikasi di server dengan kunci publik tertanam. Selisih isi ditampilkan
 * sebagai kalimat "di draf … / di berkas …", bukan kode galat.
 *
 * Unduhan ulang disusun peramban dari isi berkas yang dipulangkan server
 * action (berkasnya < 1 KB teks) — lihat `operatorDownloadLicence`.
 */
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, Typography, theme } from "antd";
import { SafetyCertificateOutlined, UploadOutlined } from "@ant-design/icons";

import { Badge, type BadgeProps } from "@sai/ui/badge";
import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sai/ui/form";
import { Input, TextInput } from "@sai/ui/input";
import { Label } from "@sai/ui/label";
import { PasswordField } from "@sai/ui/password-input";
import { Textarea } from "@sai/ui/textarea";
import { ConsolePanel, CONSOLE_MUTED, CONSOLE_TABULAR } from "@op/components/operator/console-ui";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import type { LicenceEntryStatus } from "@sai/core/licence-register";
import { formatDate, formatDateTime } from "@sai/core/utils";
import { licenceDraftSchema, type LicenceDraftFormInput } from "@op/lib/validations/operator";
import type {
  LicenceActionResult,
  LicenceDownloadResult,
  LicenceSignResult,
} from "@op/app/(operator)/licences/actions";

const { Text, Paragraph } = Typography;

export interface LicenceEntryItem {
  id: number;
  version: number;
  status: LicenceEntryStatus;
  licenceId: string;
  customer: string;
  maxCompanies: number;
  maxUsers: number;
  modules: string;
  supportEndsOn: string | null;
  maxVersion: string | null;
  notes: string | null;
  /** Hanya untuk draf — perintah `licence:issue` yang sudah dikutip. */
  command: string | null;
  fileSha256: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface LicenceCustomerItem {
  id: number;
  name: string;
  contact: string | null;
  sourceTenantId: number | null;
  /** Terbaru dulu. */
  entries: LicenceEntryItem[];
}

export interface LicenceRegisterPanelProps {
  customers: LicenceCustomerItem[];
  canEdit: boolean;
  /** Kunci publik tertanam? Tanpa itu unggahan tidak bisa diverifikasi. */
  keyInstalled: boolean;
  /** Izin `licence.sign` (owner). */
  canSign: boolean;
  /** Kunci konsol ada DAN sidiknya = kunci tertanam — tanda tangan konsol bisa dipakai. */
  signReady: boolean;
  sign: (input: { entryId: number; passphrase: string }) => Promise<LicenceSignResult>;
  createDraft: (input: LicenceDraftFormInput) => Promise<LicenceActionResult>;
  upload: (input: { entryId: number; fileText: string }) => Promise<LicenceActionResult>;
  download: (input: { entryId: number }) => Promise<LicenceDownloadResult>;
  revoke: (input: { entryId: number; reason: string }) => Promise<LicenceActionResult>;
  discard: (input: { entryId: number }) => Promise<LicenceActionResult>;
}

const STATUS_LABEL: Record<LicenceEntryStatus, DictionaryKey> = {
  draft: "operator.licences.status.draft",
  issued: "operator.licences.status.issued",
  superseded: "operator.licences.status.superseded",
  revoked: "operator.licences.status.revoked",
};
const STATUS_BADGE: Record<LicenceEntryStatus, BadgeProps["variant"]> = {
  draft: "warning",
  issued: "success",
  superseded: "outline",
  revoked: "danger",
};

const KOSONG: LicenceDraftFormInput = {
  customerId: "",
  customer: "",
  maxCompanies: "1",
  maxUsers: "5",
  modules: "all",
  supportEndsOn: "",
  maxVersion: "",
  contact: "",
  notes: "",
  sourceTenantId: "",
};

/** Nilai formulir untuk VERSI BARU — diisi dari penerbitan sebelumnya. */
function renewalValues(c: LicenceCustomerItem): LicenceDraftFormInput {
  const dasar = c.entries.find((e) => e.status === "issued") ?? c.entries[0];
  return {
    ...KOSONG,
    customerId: String(c.id),
    customer: dasar?.customer ?? c.name,
    maxCompanies: String(dasar?.maxCompanies ?? 1),
    maxUsers: String(dasar?.maxUsers ?? 5),
    modules: dasar?.modules ?? "all",
    supportEndsOn: dasar?.supportEndsOn ?? "",
    maxVersion: dasar?.maxVersion ?? "",
    contact: c.contact ?? "",
  };
}

export function LicenceRegisterPanel(props: LicenceRegisterPanelProps) {
  const { customers, canEdit, createDraft } = props;
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<LicenceActionResult | null>(null);
  const [renewing, setRenewing] = useState<LicenceCustomerItem | null>(null);

  const form = useForm<LicenceDraftFormInput>({
    resolver: zodResolver(licenceDraftSchema) as Resolver<LicenceDraftFormInput>,
    defaultValues: KOSONG,
  });

  const startRenewal = (c: LicenceCustomerItem) => {
    setRenewing(c);
    setResult(null);
    form.reset(renewalValues(c));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelRenewal = () => {
    setRenewing(null);
    form.reset(KOSONG);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setResult(null);
    const res = await createDraft(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    setRenewing(null);
    form.reset(KOSONG);
    router.refresh();
  });

  const field = (
    name: keyof LicenceDraftFormInput,
    label: DictionaryKey,
    opts: { hint?: DictionaryKey; type?: string; inputMode?: "numeric"; placeholder?: string } = {}
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field: f }) => (
        <FormItem style={{ flex: "1 1 200px", minWidth: 0 }}>
          <FormLabel>{t(label)}</FormLabel>
          <FormControl>
            <TextInput {...f} type={opts.type} inputMode={opts.inputMode} placeholder={opts.placeholder} />
          </FormControl>
          {opts.hint && <FormDescription>{t(opts.hint)}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Flex vertical gap={token.marginLG}>
      {result && <ResultAlert result={result} />}

      {canEdit && (
        <div ref={formRef}>
          <ConsolePanel
            title={
              renewing
                ? t("operator.licences.form.renewTitle", { name: renewing.name })
                : t("operator.licences.form.newTitle")
            }
            description={renewing ? t("operator.licences.form.renewHint") : t("operator.licences.form.newHint")}
          >
            <Form {...form}>
              <form onSubmit={onSubmit} noValidate>
                <Flex vertical gap={token.margin}>
                  {field("customer", "operator.licences.field.customer", {
                    hint: "operator.licences.form.customerHint",
                    placeholder: "PT Maju Jaya",
                  })}
                  <Flex wrap gap={token.margin}>
                    {field("maxCompanies", "operator.licences.field.maxCompanies", { inputMode: "numeric" })}
                    {field("maxUsers", "operator.licences.field.maxUsers", { inputMode: "numeric" })}
                  </Flex>
                  {field("modules", "operator.licences.field.modules", {
                    hint: "operator.licences.form.modulesHint",
                  })}
                  <Flex wrap gap={token.margin}>
                    {field("supportEndsOn", "operator.licences.field.supportEndsOn", {
                      type: "date",
                      hint: "operator.licences.form.supportHint",
                    })}
                    {field("maxVersion", "operator.licences.field.maxVersion", {
                      hint: "operator.licences.form.versionHint",
                      placeholder: "1.4",
                    })}
                  </Flex>

                  <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {t("operator.licences.form.optional")}
                  </Text>
                  <Flex wrap gap={token.margin}>
                    {field("contact", "operator.licences.field.contact")}
                    {!renewing &&
                      field("sourceTenantId", "operator.licences.field.sourceTenantId", {
                        inputMode: "numeric",
                        hint: "operator.licences.form.sourceTenantHint",
                      })}
                  </Flex>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>{t("operator.licences.field.notes")}</FormLabel>
                        <FormControl>
                          <Textarea {...f} rows={2} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.formState.errors.root?.message && (
                    <Alert type="error" showIcon message={form.formState.errors.root.message} />
                  )}
                  <Flex wrap gap={token.marginSM}>
                    <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
                      {t("operator.licences.form.submit")}
                    </Button>
                    {renewing && (
                      <Button variant="secondary" onClick={cancelRenewal}>
                        {t("operator.licences.form.cancelRenewal")}
                      </Button>
                    )}
                  </Flex>
                </Flex>
              </form>
            </Form>
          </ConsolePanel>
        </div>
      )}

      {customers.length === 0 ? (
        <ConsolePanel>
          <p style={CONSOLE_MUTED}>{t("operator.licences.empty")}</p>
        </ConsolePanel>
      ) : (
        customers.map((c) => (
          <ConsolePanel
            key={c.id}
            title={c.name}
            description={[
              c.contact,
              c.sourceTenantId !== null ? t("operator.licences.fromTenant", { id: c.sourceTenantId }) : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined}
            actions={
              canEdit ? (
                <Button variant="secondary" size="sm" onClick={() => startRenewal(c)}>
                  {t("operator.licences.renew")}
                </Button>
              ) : undefined
            }
          >
            {c.entries.map((e) => (
              <EntryRow key={e.id} entry={e} {...props} onResult={setResult} />
            ))}
          </ConsolePanel>
        ))
      )}

      {!canEdit && <Text type="secondary">{t("operator.licences.readOnly")}</Text>}
    </Flex>
  );
}

function ResultAlert({ result }: { result: LicenceActionResult }) {
  const t = useT();
  return (
    <Alert
      type={result.ok ? "success" : "error"}
      showIcon
      message={result.message}
      description={
        result.mismatches && result.mismatches.length > 0 ? (
          <ul style={{ margin: 0, paddingInlineStart: "var(--ant-padding-lg)" }}>
            {result.mismatches.map((m) => (
              <li key={m.label}>
                {t("operator.licences.mismatchLine", { field: m.label, expected: m.expected, actual: m.actual })}
              </li>
            ))}
          </ul>
        ) : undefined
      }
    />
  );
}

/** Peramban menyusun unduhan dari isi berkas (< 1 KB teks). */
function saveTextFile(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function EntryRow({
  entry: e,
  canEdit,
  keyInstalled,
  canSign,
  signReady,
  sign,
  upload,
  download,
  revoke,
  discard,
  onResult,
}: LicenceRegisterPanelProps & { entry: LicenceEntryItem; onResult: (r: LicenceActionResult) => void }) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const inputId = useId();
  const passphraseId = useId();
  const [pending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState("");
  const [signing, setSigning] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const onSign = () => {
    const typed = passphrase;
    /* Dikosongkan SEBELUM permintaan berangkat: gagal atau berhasil, frasa
       tidak tinggal di state komponen. */
    setPassphrase("");
    startTransition(async () => {
      const r = await sign({ entryId: e.id, passphrase: typed });
      onResult({ ok: r.ok, message: r.message, mismatches: r.ok ? undefined : r.mismatches });
      if (r.ok) {
        saveTextFile(r.fileName, r.content);
        setSigning(false);
        router.refresh();
      }
    });
  };

  const run = (p: () => Promise<LicenceActionResult>) =>
    startTransition(async () => {
      const r = await p();
      onResult(r);
      if (r.ok) {
        setRevoking(false);
        setReason("");
        router.refresh();
      }
    });

  const onFile = (f: File | null) => {
    if (!f) return;
    run(async () => upload({ entryId: e.id, fileText: await f.text() }));
  };

  const onDownload = () =>
    startTransition(async () => {
      const r = await download({ entryId: e.id });
      if (!r.ok) {
        onResult(r);
        return;
      }
      saveTextFile(r.fileName, r.content);
    });

  const ringkas = [
    t("operator.licences.summary.limits", { companies: e.maxCompanies, users: e.maxUsers }),
    t("operator.licences.summary.modules", { modules: e.modules }),
    e.supportEndsOn
      ? t("operator.licences.summary.supportUntil", { date: formatDate(e.supportEndsOn) })
      : t("operator.licences.summary.supportForever"),
    e.maxVersion ? t("operator.licences.summary.maxVersion", { version: e.maxVersion }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Flex
      vertical
      gap={token.marginSM}
      style={{
        paddingBlock: token.paddingSM,
        borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Flex wrap align="center" gap={token.marginSM}>
        <Text strong style={CONSOLE_TABULAR}>
          {t("operator.licences.versionLabel", { n: e.version })}
        </Text>
        <Badge variant={STATUS_BADGE[e.status]}>{t(STATUS_LABEL[e.status])}</Badge>
        <Text style={CONSOLE_TABULAR}>{ringkas}</Text>
      </Flex>
      <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {t("operator.licences.meta.created", { by: e.createdBy, at: formatDateTime(e.createdAt) })}
        {e.uploadedAt &&
          ` · ${t("operator.licences.meta.uploaded", { by: e.uploadedBy ?? "—", at: formatDateTime(e.uploadedAt) })}`}
        {e.fileSha256 && ` · SHA-256 ${e.fileSha256.slice(0, 16)}…`}
        {` · ${e.licenceId}`}
      </Text>
      {e.notes && <Text type="secondary">{e.notes}</Text>}
      {e.status === "revoked" && (
        <Text type="secondary">
          {t("operator.licences.meta.revoked", {
            by: e.revokedBy ?? "—",
            at: e.revokedAt ? formatDateTime(e.revokedAt) : "—",
            reason: e.revokeReason ?? "—",
          })}
        </Text>
      )}

      {e.status === "draft" && canSign && signReady && (
        <Flex vertical gap={token.marginSM} style={{ maxWidth: 560 }}>
          {!signing ? (
            <div>
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => setSigning(true)}
              >
                <SafetyCertificateOutlined aria-hidden="true" style={{ fontSize: 16 }} />
                {t("operator.licences.sign.start")}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                if (passphrase.length > 0) onSign();
              }}
              noValidate
            >
              <Flex vertical gap={token.marginSM}>
                <Text>{t("operator.licences.sign.intro")}</Text>
                <Label htmlFor={passphraseId}>{t("operator.licences.sign.passphrase")}</Label>
                <PasswordField
                  id={passphraseId}
                  value={passphrase}
                  autoComplete="off"
                  autoFocus
                  onChange={(ev) => setPassphrase(ev.target.value)}
                />
                <Flex wrap gap={token.marginSM}>
                  <Button type="submit" variant="primary" size="sm" disabled={pending || passphrase.length === 0}>
                    {t("operator.licences.sign.submit")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setPassphrase("");
                      setSigning(false);
                    }}
                  >
                    {t("operator.licences.cancel")}
                  </Button>
                </Flex>
              </Flex>
            </form>
          )}
        </Flex>
      )}

      {e.status === "draft" && e.command && (
        <Flex vertical gap={token.marginXS}>
          <Text>
            {canSign && signReady ? t("operator.licences.commandLabelOffline") : t("operator.licences.commandLabel")}
          </Text>
          <Paragraph
            copyable={{ text: e.command, tooltips: [t("operator.licences.copy"), t("operator.licences.copied")] }}
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
            {e.command}
          </Paragraph>
        </Flex>
      )}

      {canEdit && (
        <Flex wrap gap={token.marginSM} align="center">
          {e.status === "draft" && (
            <>
              <label
                htmlFor={inputId}
                data-disabled={pending || !keyInstalled || undefined}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: token.marginXS,
                  cursor: keyInstalled ? "pointer" : "not-allowed",
                  opacity: keyInstalled ? 1 : 0.5,
                  borderRadius: token.borderRadius,
                  border: `${token.lineWidth}px dashed ${token.colorBorder}`,
                  paddingInline: token.padding,
                  paddingBlock: token.paddingXS,
                }}
              >
                <UploadOutlined aria-hidden="true" style={{ fontSize: 16 }} />
                <span>{t("operator.licences.uploadLabel")}</span>
                <input
                  id={inputId}
                  type="file"
                  accept=".sai,text/plain"
                  disabled={pending || !keyInstalled}
                  data-sr-only
                  onChange={(ev) => {
                    onFile(ev.target.files?.[0] ?? null);
                    ev.target.value = "";
                  }}
                />
              </label>
              {!keyInstalled && (
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {t("operator.licences.uploadDisabled")}
                </Text>
              )}
              <ConfirmDialog
                title={t("operator.licences.discardTitle")}
                message={t("operator.licences.discardDescription")}
                confirmLabel={t("operator.licences.discard")}
                confirmVariant="danger"
                onConfirm={() => run(() => discard({ entryId: e.id }))}
                trigger={
                  <Button variant="secondary" size="sm" disabled={pending}>
                    {t("operator.licences.discard")}
                  </Button>
                }
              />
            </>
          )}
          {e.status !== "draft" && (
            <Button variant="secondary" size="sm" disabled={pending} onClick={onDownload}>
              {t("operator.licences.download")}
            </Button>
          )}
          {(e.status === "issued" || e.status === "superseded") && !revoking && (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => setRevoking(true)}>
              {t("operator.licences.revoke")}
            </Button>
          )}
        </Flex>
      )}

      {revoking && (
        <Flex vertical gap={token.marginSM} style={{ maxWidth: 560 }}>
          <Alert type="info" showIcon message={t("operator.licences.revokeNote")} />
          <Input
            label={t("operator.licences.revokeReason")}
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
          />
          <Flex wrap gap={token.marginSM}>
            <ConfirmDialog
              title={t("operator.licences.revokeConfirm")}
              message={t("operator.licences.revokeNote")}
              confirmLabel={t("operator.licences.revokeConfirm")}
              confirmVariant="danger"
              onConfirm={() => run(() => revoke({ entryId: e.id, reason }))}
              trigger={
                <Button variant="danger" size="sm" disabled={pending || reason.trim().length < 5}>
                  {t("operator.licences.revokeConfirm")}
                </Button>
              }
            />
            <Button variant="secondary" size="sm" onClick={() => setRevoking(false)}>
              {t("operator.licences.cancel")}
            </Button>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
