/**
 * `/operator/plans` — KATALOG PAKET, hanya-baca.
 *
 * Kenapa tidak bisa disunting dari sini: lihat `plansForOperatorCatalog`.
 * Halaman ini menjawab "paket apa yang ada, berapa harganya, dan siapa yang
 * memakainya" — pertanyaan yang sampai sekarang dijawab dengan `psql`.
 */
import { Badge } from "@sai/ui/badge";
import { PageHeader } from "@sai/ui/page-header";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { ConsoleNotice, ConsolePanel, CONSOLE_MUTED, CONSOLE_PAGE } from "@/components/operator/console-ui";
import { requireOperatorPage } from "@/lib/operator/guard";
import { plansForOperatorCatalog, type OperatorCatalogPlan } from "@/lib/operator/store";
import { formatMoney, type CurrencyCode } from "@sai/core/money-format";
import { getT } from "@sai/platform/i18n/server";

export const dynamic = "force-dynamic";

const ANGKA: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export default async function OperatorPlansPage() {
  await requireOperatorPage();
  const t = await getT();
  const plans = await plansForOperatorCatalog();

  const columns: SaiColumns<OperatorCatalogPlan> = [
    {
      key: "name",
      title: t("operator.plans.colName"),
      align: "left",
      render: (_v, p) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 500 }}>
            {p.name} {p.isRecommended && <Badge variant="success">{t("operator.plans.recommended")}</Badge>}
          </span>
          <span style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>{p.key}</span>
        </div>
      ),
    },
    {
      key: "monthly",
      title: t("operator.plans.colMonthly"),
      align: "right",
      render: (_v, p) => (
        <span style={ANGKA}>
          {p.contactOnly ? t("operator.plans.contactOnly") : formatMoney(Number(p.priceMonthly), p.currency as CurrencyCode)}
        </span>
      ),
    },
    {
      key: "yearly",
      title: t("operator.plans.colYearly"),
      align: "right",
      render: (_v, p) => (
        <span style={ANGKA}>
          {p.priceYearly === null ? "—" : formatMoney(Number(p.priceYearly), p.currency as CurrencyCode)}
        </span>
      ),
    },
    {
      key: "quota",
      title: t("operator.plans.colQuota"),
      align: "left",
      render: (_v, p) => (
        <span style={{ ...ANGKA, ...CONSOLE_MUTED }}>
          {t("operator.plans.quota", { companies: p.maxCompanies, users: p.maxUsers, trial: p.trialDays })}
        </span>
      ),
    },
    {
      key: "state",
      title: t("operator.plans.colState"),
      align: "left",
      render: (_v, p) =>
        !p.isActive ? (
          <Badge variant="outline">{t("operator.plans.inactive")}</Badge>
        ) : p.isPublic ? (
          <span>{t("operator.plans.public")}</span>
        ) : (
          <span style={CONSOLE_MUTED}>{t("operator.plans.hidden")}</span>
        ),
    },
    {
      key: "subs",
      title: t("operator.plans.colSubscribers"),
      align: "right",
      render: (_v, p) => <span style={ANGKA}>{p.subscribers}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title={t("operator.plans.heading")} description={t("operator.plans.description")} />
      <div style={CONSOLE_PAGE}>
        {plans === null ? (
          <ConsoleNotice>{t("operator.plans.unavailable")}</ConsoleNotice>
        ) : (
          <ConsolePanel flush footnote={t("operator.plans.readOnly")}>
            <StaticTable columns={columns} rows={plans} rowKey={(p) => p.id} />
          </ConsolePanel>
        )}
      </div>
    </div>
  );
}
