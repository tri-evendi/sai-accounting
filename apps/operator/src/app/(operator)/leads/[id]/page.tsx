/**
 * RINCIAN satu PENAWARAN MASUK (`lead_requests`, migration platform 0016).
 *
 * Semua yang dikirim prospek, plus jejak penanganannya (status, oleh siapa,
 * kapan, catatan). Tindakannya di `LeadActions`: pindah status (izin
 * `tenant.billing`), tambah catatan, buka WhatsApp dengan sapaan dalam BAHASA
 * PROSPEK (bahasa layar saat ia mengirim — `locale`), salin surel.
 */

import { notFound } from "next/navigation";

import { Badge } from "@sai/ui/badge";
import { PageHeader } from "@sai/ui/page-header";
import { ConsoleNotice, ConsolePanel, CONSOLE_MUTED, CONSOLE_PAGE } from "@op/components/operator/console-ui";
import { LeadActions } from "@op/components/operator/lead-actions";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { leadForOperator } from "@op/lib/operator/leads";
import {
  LEAD_KIND_LABEL,
  LEAD_STATUS_LABEL,
  formatLeadPhone,
  leadStatusVariant,
  leadWhatsappUrl,
} from "@op/lib/operator/lead-view";
import { operatorCan } from "@op/lib/operator/roles";
import { getT } from "@sai/platform/i18n/server";
import { DEFAULT_LOCALE, isLocale } from "@sai/core/i18n/config";
import { translate } from "@sai/core/i18n/dictionary";
import { loadDictionary } from "@sai/core/i18n/load";
import { isLeadKind, isLeadStatus } from "@sai/core/lead-request";
import { LEGAL_FORM_LABEL_KEYS, isLegalForm } from "@sai/core/legal-form";
import { formatDateTime } from "@sai/core/utils";

import { operatorAddLeadNote, operatorChangeLeadStatus } from "../actions";

export const dynamic = "force-dynamic";

const DT: React.CSSProperties = { ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)", margin: 0 };
const DD: React.CSSProperties = { margin: 0, overflowWrap: "anywhere" };

export default async function OperatorLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const lead = await leadForOperator(id);
  if (lead === null) notFound();

  if (lead === "unreachable") {
    return (
      <div>
        <PageHeader
          breadcrumbs={[{ label: t("operator.leads.heading"), href: "/leads" }, { label: `#${id}` }]}
          title={t("operator.leads.heading")}
        />
        <div style={CONSOLE_PAGE}>
          <ConsoleNotice>{t("operator.leads.unavailable")}</ConsoleNotice>
        </div>
      </div>
    );
  }

  const anonymized = lead.anonymizedAt !== null;
  const kindLabel = isLeadKind(lead.kind) ? t(LEAD_KIND_LABEL[lead.kind]) : lead.kind;
  /* Sapaan dalam bahasa PROSPEK, bukan bahasa operator. */
  const prospectLocale = isLocale(lead.locale) ? lead.locale : DEFAULT_LOCALE;
  const prospectDict = await loadDictionary(prospectLocale);
  const greeting = translate(prospectDict, "operator.leads.whatsappGreeting", {
    name: lead.name,
    operator: operator.name,
    reference: lead.reference,
  });

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: t("operator.leads.colKind"), value: kindLabel },
    { label: t("auth.lead.name"), value: lead.name },
    { label: t("auth.lead.company"), value: lead.company },
    { label: t("auth.lead.phone"), value: anonymized ? "—" : formatLeadPhone(lead.phone) },
    { label: t("operator.leads.email"), value: lead.email ?? "—" },
    {
      label: t("legalForm.label"),
      value: lead.legalForm && isLegalForm(lead.legalForm) ? t(LEGAL_FORM_LABEL_KEYS[lead.legalForm]) : "—",
    },
    { label: t("operator.leads.companyCount"), value: lead.companyCount ?? "—" },
    { label: t("operator.leads.colSource"), value: lead.source },
    { label: t("operator.leads.colReceived"), value: formatDateTime(lead.createdAt) },
    { label: t("operator.leads.consentAt"), value: formatDateTime(lead.consentAt) },
    {
      label: t("operator.leads.handled"),
      value: lead.handledAt ? `${lead.handledBy ?? "—"} · ${formatDateTime(lead.handledAt)}` : "—",
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("operator.leads.heading"), href: "/leads" }, { label: lead.reference }]}
        title={`${lead.reference} · ${lead.company}`}
        description={anonymized ? t("operator.leads.anonymizedNotice") : undefined}
      />
      <div style={CONSOLE_PAGE}>
        <ConsolePanel
          title={t("operator.leads.actionsHeading")}
          actions={
            <Badge variant={leadStatusVariant(lead.status)}>
              {isLeadStatus(lead.status) ? t(LEAD_STATUS_LABEL[lead.status]) : lead.status}
            </Badge>
          }
        >
          <LeadActions
            leadId={lead.id}
            status={lead.status}
            canAct={operatorCan(operator.role, "tenant.billing")}
            anonymized={anonymized}
            whatsappUrl={anonymized ? null : leadWhatsappUrl(lead.phone, greeting)}
            email={anonymized ? null : lead.email}
            changeStatus={operatorChangeLeadStatus}
            addNote={operatorAddLeadNote}
          />
        </ConsolePanel>

        <ConsolePanel title={t("operator.leads.detailHeading")}>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "var(--ant-margin) var(--ant-margin-lg)",
              margin: 0,
            }}
          >
            {fields.map((f) => (
              <div key={f.label}>
                <dt style={DT}>{f.label}</dt>
                <dd style={DD}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </ConsolePanel>

        <ConsolePanel title={t("operator.leads.messageHeading")}>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {lead.message ?? <span style={CONSOLE_MUTED}>{t("operator.leads.noMessage")}</span>}
          </p>
        </ConsolePanel>

        <ConsolePanel title={t("operator.leads.notesHeading")}>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "var(--ant-font-size-sm)" }}>
            {lead.notes ?? <span style={CONSOLE_MUTED}>{t("operator.leads.noNotes")}</span>}
          </p>
        </ConsolePanel>
      </div>
    </div>
  );
}
