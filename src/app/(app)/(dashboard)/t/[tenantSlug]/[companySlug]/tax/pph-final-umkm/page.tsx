/**
 * PERKIRAAN PPh FINAL UMKM (PP 55/2022) — bentuk usaha, PR B (24 Okt 2026).
 *
 * Alat bantu laporan: 0,5% × peredaran bruto per bulan, pembebasan Rp 500 juta
 * untuk orang pribadi (usaha perorangan), dan pengingat batas waktu menurut
 * bentuk usaha. TIDAK memposting jurnal. Angka & aturannya dari
 * `lib/pph-final-umkm.ts`, selalu ditampilkan bersama bunyi aturannya dan
 * catatan "periksa ketentuan terbaru".
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@sai/core/tenant-routes";
import { PageHeader } from "@sai/ui/page-header";
import { Card } from "@sai/ui/card";
import { StaticTable, type SummaryRow } from "@sai/ui/static-table";
import { moneyColumn } from "@sai/ui/money-column";
import { Money } from "@sai/ui/money";
import type { SaiColumns } from "@sai/ui/table-columns";
import { Link } from "@sai/ui/app-link";
import { getT } from "@sai/platform/i18n/server";
import { getCompanyLegalForm } from "@/lib/legal-form-server";
import { monthlyGrossRevenue, readPphFinalSetting } from "@/lib/pph-final-umkm-report";
import {
  estimatePphFinal,
  PPH_FINAL_TIME_LIMITS,
  pphFinalGroupFor,
  pphFinalTimeLimit,
  type PphFinalMonth,
} from "@/lib/pph-final-umkm";
import { businessParts } from "@sai/core/business-date";
import { monthNames } from "@/lib/i18n/labels";
import { getRequestI18n } from "@sai/platform/i18n/server";

export const dynamic = "force-dynamic";

/** Kotak catatan — halaman ini server component, jadi tanpa `Alert` AntD. */
function Note({ tone, children }: { tone: "info" | "warning" | "error"; children: React.ReactNode }) {
  const color = { info: "var(--ant-color-info)", warning: "var(--ant-color-warning)", error: "var(--ant-color-error)" }[tone];
  return (
    <div
      role={tone === "info" ? "note" : "alert"}
      style={{
        borderInlineStart: `4px solid ${color}`,
        background: "var(--ant-color-fill-quaternary)",
        padding: "var(--ant-padding-xs) var(--ant-padding-sm)",
        borderRadius: "var(--ant-border-radius)",
      }}
    >
      {children}
    </div>
  );
}

export default async function PphFinalUmkmPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ year?: string }>;
}) {
  await requirePagePermission("tax.read", params);
  const t = await getT();
  const { dictionary } = await getRequestI18n();
  const sp = await searchParams;
  const thisYear = businessParts(new Date()).year;
  const parsedYear = Number(sp.year);
  const year = Number.isInteger(parsedYear) && parsedYear >= 2018 && parsedYear <= thisYear + 1 ? parsedYear : thisYear;

  const [legalForm, setting, gross] = await Promise.all([
    getCompanyLegalForm(),
    readPphFinalSetting(),
    monthlyGrossRevenue(year),
  ]);
  const estimate = estimatePphFinal(legalForm, gross);
  const group = pphFinalGroupFor(legalForm);
  const limit = pphFinalTimeLimit(legalForm, setting?.pphFinalUmkmStartYear ?? null, year);
  const bulan = monthNames(dictionary);

  type Row = PphFinalMonth & { key: number; label: string };
  const rows: Row[] = estimate.months.map((m) => ({ ...m, key: m.month, label: bulan[m.month - 1] ?? String(m.month) }));
  const money = (id: "gross" | "cumulative" | "taxable" | "tax", title: string) =>
    moneyColumn<Row>({ dataIndex: id, title, currency: () => "IDR" });
  const columns: SaiColumns<Row> = [
    { key: "month", title: t("pphFinal.colMonth"), align: "left", card: "title", render: (_v, r) => r.label },
    money("gross", t("pphFinal.colGross")),
    money("cumulative", t("pphFinal.colCumulative")),
    money("taxable", t("pphFinal.colTaxable")),
    money("tax", t("pphFinal.colTax")),
  ];
  const summary: SummaryRow[] = [
    {
      cells: {
        month: { content: t("common.total"), scope: "row" },
        gross: <Money value={estimate.totalGross} currency="IDR" />,
        cumulative: "",
        taxable: <Money value={estimate.totalTaxable} currency="IDR" />,
        tax: <Money value={estimate.totalTax} currency="IDR" />,
      },
    },
  ];

  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.pph_final_umkm.title") },
        ]}
        title={t("reports.catalogReport.pph_final_umkm.title")}
        description={t("pphFinal.subtitle", { year })}
      />

      <p style={{ display: "flex", gap: "var(--ant-margin-xs)", flexWrap: "wrap", margin: "0 0 var(--ant-margin)" }}>
        {years.map((y) => (
          <Link key={y} href={`/tax/pph-final-umkm?year=${y}`} aria-current={y === year ? "page" : undefined}>
            {y === year ? <strong>{y}</strong> : y}
          </Link>
        ))}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin)", marginBottom: "var(--ant-margin)" }}>
        <Note tone="info">{t("pphFinal.notPosting")}</Note>
        {!setting?.pphFinalUmkm && (
          <Note tone="warning">
            {t("pphFinal.disabled")} <Link href="/settings#business-profile">{t("pphFinal.openSettings")}</Link>
          </Note>
        )}
        {setting?.pphFinalUmkm && limit.status === "expired" && (
          <Note tone="error">{t("pphFinal.expired", { year: limit.lastYear ?? "" })}</Note>
        )}
        {setting?.pphFinalUmkm && limit.status === "last_year" && (
          <Note tone="warning">{t("pphFinal.lastYear", { year: limit.lastYear ?? "" })}</Note>
        )}
        {setting?.pphFinalUmkm && limit.status === "not_started" && (
          <Note tone="info">{t("pphFinal.notStarted", { year: setting.pphFinalUmkmStartYear ?? "" })}</Note>
        )}
        {estimate.overGrossLimit && <Note tone="warning">{t("pphFinal.overLimit")}</Note>}
        {estimate.personalExemption && <Note tone="info">{t("pphFinal.personalExemption")}</Note>}
      </div>

      <Card>
        <StaticTable<Row> cards columns={columns} rows={rows} rowKey={(r) => r.key} summary={summary} />
      </Card>

      <div style={{ marginTop: "var(--ant-margin)", color: "var(--ant-color-text-secondary)" }}>
        <p style={{ margin: "0 0 var(--ant-margin-xs)" }}>{t("pphFinal.grossNote")}</p>
        <p style={{ margin: "0 0 var(--ant-margin-xs)" }}>
          {(group ? [PPH_FINAL_TIME_LIMITS[group]] : Object.values(PPH_FINAL_TIME_LIMITS)).map((r) => r.rule).join(" ")}
        </p>
        <p style={{ margin: 0 }}>{t("pphFinal.checkLatest")}</p>
      </div>
    </div>
  );
}
