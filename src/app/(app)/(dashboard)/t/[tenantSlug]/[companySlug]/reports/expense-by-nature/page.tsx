/**
 * Beban menurut Sifat — bahan CALK PSAK 118 (issue #446).
 *
 * ── Berdampingan dengan Laba Rugi, bukan menggantikannya ────────────────────
 * PSAK 118 meminta beban disajikan menurut SIFATNYA di Catatan atas Laporan
 * Keuangan bila Laba Rugi disajikan menurut fungsi. Mengubah seksi Laba Rugi
 * itu sendiri masih diblokir di #443 — ia satu-satunya perubahan yang menggeser
 * angka yang sudah dilihat orang, termasuk realisasi anggaran.
 *
 * ── Angkanya BUKAN hitungan kedua ───────────────────────────────────────────
 * `getExpenseByNature()` mengambil baris beban milik `getIncomeStatement()` lalu
 * mengelompokkannya ulang. Totalnya karena itu tidak bisa berbeda dari total
 * beban di Laba Rugi — bukan karena dicocokkan, melainkan karena ia angka yang
 * sama.
 *
 * Baca-saja. Server component: tak ada satu pun kendali di dalam tabelnya, jadi
 * `StaticTable` (dirender server, tanpa JS) adalah bentuk yang benar.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getExpenseByNature } from "@/lib/expense-nature-report";
import { resolvePeriod } from "@/lib/report-catalog";
import { parseCostCenterFilter } from "@/lib/cost-centers";
import { costCenterFilterLabel, costCenterFilterOptions } from "@/lib/cost-center-options";
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import { Money } from "@/components/ui/money";
import { textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodFilter } from "../report-filters";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { InfoCircleOutlined, ProfileOutlined } from "@ant-design/icons";

export const dynamic = "force-dynamic";

const EMPTY_ICON_SIZE = 48;
const ICON_SIZE = 16;
const SECTION_GAP = 24;

type Row = Awaited<ReturnType<typeof getExpenseByNature>>["rows"][number];

export default async function ExpenseByNaturePage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string; costCenter?: string }>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);

  /* Pusat biaya disaring dengan cara yang SAMA dengan Laba Rugi — kalau tidak,
     dua laporan yang mengaku menjumlah beban yang sama akan menyebut angka
     berbeda begitu saringannya dipakai. */
  const costCenter = parseCostCenterFilter(sp.costCenter);
  const [costCenterOptions, costCenterName] = await Promise.all([
    costCenterFilterOptions(),
    costCenterFilterLabel(sp.costCenter),
  ]);
  const report = await getExpenseByNature(from, to, undefined, costCenter);

  const costCenterLabel =
    costCenter !== undefined ? (costCenterName ?? `#${costCenter}`) : null;

  const columns: SaiColumns<Row> = [
    {
      ...textColumn<Row>({ dataIndex: "label", title: t("reports.colExpenseNature") }),
      render: (raw, row) => (
        /* Baris "Belum ditetapkan" ditulis dengan warna sekunder: ia BUKAN
           sifat, melainkan pengakuan bahwa sifatnya belum diketahui. */
        <span
          style={{
            fontWeight: row.nature == null ? undefined : "var(--ant-font-weight-strong)",
            color: row.nature == null ? "var(--ant-color-text-secondary)" : undefined,
          }}
        >
          {row.nature == null ? t("reports.expenseNatureUnassigned") : String(raw)}
        </span>
      ),
    },
    {
      ...textColumn<Row>({ dataIndex: "accountCount", title: t("reports.colAccountCount") }),
      align: "right",
      render: (raw) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{String(raw)}</span>
      ),
    },
    moneyColumn<Row>({ dataIndex: "amount", title: t("reports.colAmount") }),
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.expense_by_nature.title") },
        ]}
        title={t("reports.catalogReport.expense_by_nature.title")}
        description={t("reports.catalogReport.expense_by_nature.description")}
      />

      <PeriodFilter
        basePath="/reports/expense-by-nature"
        from={fromISO}
        to={toISO}
        costCenterOptions={costCenterOptions}
        costCenter={sp.costCenter}
      />

      <p style={{ marginTop: 0, marginBottom: SECTION_GAP, color: "var(--ant-color-text-secondary)" }}>
        {t("reports.expenseNaturePeriod", {
          period: `${formatDate(from)} – ${formatDate(to)}`,
        })}
        {costCenterLabel ? ` · ${costCenterLabel}` : ""}
      </p>

      <Card>
        <StaticTable<Row>
          columns={columns}
          rows={report.rows}
          /* `nature` bisa `null` untuk TEPAT SATU baris, jadi ia kunci yang
             sah — dan lebih jujur daripada indeks, yang berpindah begitu
             sebuah sifat berhenti dipakai. */
          rowKey={(r) => r.nature ?? "__unassigned__"}
          summary={{
            label: t("common.total"),
            amount: <Money value={report.total} currency="IDR" />,
          }}
          empty={
            <EmptyState
              icon={<ProfileOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("reports.expenseNatureEmptyTitle")}
              description={t("reports.expenseNatureEmptyDescription")}
            />
          }
        />
      </Card>

      {/*
        Beban yang belum ditandai sifatnya DIKATAKAN, bukan disembunyikan.
        Justru angka inilah yang memberi tahu seberapa bisa dipercaya sisanya —
        laporan yang menyembunyikannya terlihat rapi sambil menyembunyikan bahwa
        separuh bebannya tak terklasifikasi.
      */}
      {report.unassignedAmount > 0 && (
        <p
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            marginTop: 12,
            marginBottom: 0,
            color: "var(--ant-color-text-secondary)",
          }}
        >
          <InfoCircleOutlined
            aria-hidden="true"
            style={{ fontSize: ICON_SIZE, flexShrink: 0, marginTop: 2 }}
          />
          <span>{t("reports.expenseNatureUnassignedNote")}</span>
        </p>
      )}
    </div>
  );
}
