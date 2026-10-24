/**
 * PENAWARAN MASUK — daftar kerja dari formulir halaman publik (`lead_requests`,
 * migration platform 0016).
 *
 * Prospek yang menekan "Minta penawaran" / "Jadwalkan demo" mengisi formulir
 * singkat di `/register`; barisnya mendarat di sini. Tab status di atas `?tab=`
 * (`ConsoleTabs`): Baru · Dihubungi · Selesai · Spam · Semua — bawaannya
 * "Baru", sebab yang dibuka orang di sini adalah "siapa yang belum dihubungi".
 * Pencarian lewat form GET biasa (URL bisa disalin), mencakup nomor rujukan
 * yang dibacakan prospek (`SAI-7K3M9Q`).
 *
 * Membaca terbuka bagi setiap operator (seperti seluruh konsol); MENGUBAH
 * status dan menambah catatan menuntut `tenant.billing` — di halaman rincian.
 *
 * `StaticTable`, bukan `DataTable` (aturan #189): saringan & pencarian sudah
 * di server.
 */

import Link from "next/link";
import { InboxOutlined } from "@ant-design/icons";

import { Badge } from "@sai/ui/badge";
import { Button } from "@sai/ui/button";
import { EmptyState } from "@sai/ui/empty-state";
import { Input } from "@sai/ui/input";
import { PageHeader } from "@sai/ui/page-header";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { ConsoleNotice, ConsolePanel, CONSOLE_MUTED, CONSOLE_PAGE } from "@op/components/operator/console-ui";
import { ConsoleTabs } from "@op/components/operator/console-tabs";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { leadStatusCounts, listLeadsForOperator, type OperatorLeadRow } from "@op/lib/operator/leads";
import {
  LEAD_KIND_LABEL,
  LEAD_STATUS_LABEL,
  formatLeadPhone,
  leadStatusVariant,
} from "@op/lib/operator/lead-view";
import { getT } from "@sai/platform/i18n/server";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { LEAD_STATUSES, isLeadKind, isLeadStatus, type LeadStatus } from "@sai/core/lead-request";
import { formatDateTime } from "@sai/core/utils";

export const dynamic = "force-dynamic";

const TABS = [...LEAD_STATUSES, "all"] as const;
type Tab = (typeof TABS)[number];

export default async function OperatorLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  await requireOperatorPage();
  const t = await getT();
  const params = await searchParams;

  const q = params.q?.trim().slice(0, 100) ?? "";
  const tab: Tab = params.tab === "all" ? "all" : isLeadStatus(params.tab) ? params.tab : "baru";
  const status: LeadStatus | undefined = tab === "all" ? undefined : tab;

  const [counts, rows] = await Promise.all([
    leadStatusCounts({ q }),
    listLeadsForOperator({ status, q }),
  ]);
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const tabLabel = (id: Tab) =>
    t(id === "all" ? "operator.leads.tabAll" : LEAD_STATUS_LABEL[id]);

  const columns: SaiColumns<OperatorLeadRow> = [
    {
      key: "received",
      title: t("operator.leads.colReceived"),
      align: "left",
      render: (_v, r) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Link
            href={`/leads/${r.id}`}
            style={{ color: "var(--ant-color-link)", fontWeight: 500, fontFamily: "var(--ant-font-family-code)" }}
          >
            {r.reference}
          </Link>
          <span style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>{formatDateTime(r.createdAt)}</span>
        </div>
      ),
    },
    {
      key: "prospect",
      title: t("operator.leads.colProspect"),
      align: "left",
      render: (_v, r) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 500 }}>{r.company}</span>
          <span style={CONSOLE_MUTED}>{r.name}</span>
        </div>
      ),
    },
    {
      key: "kind",
      title: t("operator.leads.colKind"),
      align: "left",
      render: (_v, r) => (isLeadKind(r.kind) ? t(LEAD_KIND_LABEL[r.kind]) : r.kind),
    },
    {
      key: "contact",
      title: t("operator.leads.colContact"),
      align: "left",
      render: (_v, r) =>
        r.anonymizedAt ? (
          <span style={CONSOLE_MUTED}>{t("operator.leads.anonymized")}</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatLeadPhone(r.phone)}</span>
            {r.email && <span style={CONSOLE_MUTED}>{r.email}</span>}
          </div>
        ),
    },
    {
      key: "source",
      title: t("operator.leads.colSource"),
      align: "left",
      render: (_v, r) => <span style={CONSOLE_MUTED}>{r.source}</span>,
    },
    {
      key: "status",
      title: t("operator.leads.colStatus"),
      align: "left",
      render: (_v, r) => (
        <Badge variant={leadStatusVariant(r.status)}>
          {isLeadStatus(r.status) ? t(LEAD_STATUS_LABEL[r.status]) : r.status}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={`${t("operator.leads.heading")} (${total})`}
        description={t("operator.leads.description")}
      />
      <div style={CONSOLE_PAGE}>
        <ConsoleTabs
          label={t("operator.leads.tabsAria")}
          basePath="/leads"
          active={tab}
          defaultId="baru"
          keep={{ q: q || undefined }}
          tabs={TABS.map((id) => ({
            id,
            label: tabLabel(id),
            count: counts ? (id === "all" ? total : counts[id]) : undefined,
            attention: id === "baru",
          }))}
        />
        {rows === null || counts === null ? (
          <ConsoleNotice>{t("operator.leads.unavailable")}</ConsoleNotice>
        ) : (
          <ConsolePanel flush>
            <form
              method="get"
              action="/leads"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                gap: "var(--ant-margin-sm)",
                padding: "var(--ant-padding-lg)",
                paddingBottom: "var(--ant-padding)",
              }}
            >
              {tab !== "baru" && <input type="hidden" name="tab" value={tab} />}
              <div style={{ width: "100%", maxWidth: 360 }}>
                <Input
                  name="q"
                  label={t("operator.leads.searchLabel")}
                  placeholder={t("operator.leads.searchPlaceholder")}
                  defaultValue={q}
                />
              </div>
              <Button type="submit" variant="outline">
                {t("operator.tenants.filter")}
              </Button>
            </form>
            <StaticTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              empty={
                <EmptyState
                  icon={<InboxOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
                  title={t(
                    (q ? "operator.leads.emptySearch" : "operator.leads.empty") satisfies DictionaryKey
                  )}
                />
              }
            />
          </ConsolePanel>
        )}
      </div>
    </div>
  );
}
