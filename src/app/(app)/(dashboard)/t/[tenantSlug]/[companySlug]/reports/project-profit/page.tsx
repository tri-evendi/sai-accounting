/**
 * LABA RUGI PER PROYEK (issue #495, butir 2 — job costing untuk jasa).
 *
 * Laba SATU proyek sudah bisa dibaca sejak #98 lewat penyaring pusat biaya di
 * halaman Laba Rugi. Yang tidak bisa dijawab halaman itu adalah pertanyaan yang
 * paling sering ditanyakan pemilik: *proyek mana yang menghasilkan, dan mana
 * yang merugi.* Menjawabnya hari ini berarti membuka laporan yang sama
 * berkali-kali lalu membandingkannya di kepala sendiri.
 *
 * ── Angkanya tidak dihitung DI SINI ────────────────────────────────────────
 * Seluruhnya dari `getProjectProfit` — satu `groupBy`, dilipat aturan
 * penggolongan yang SAMA dengan laba rugi perusahaan. Halaman ini hanya
 * merender. Lihat kepala `lib/project-profit-report.ts` untuk sebabnya.
 *
 * ── Baris "tanpa proyek" bukan hiasan ──────────────────────────────────────
 * Ia yang membuat daftar ini berjumlah sama dengan Laba Rugi. Tanpanya
 * pembacanya tidak punya cara membedakan "proyek ini tidak punya biaya" dari
 * "biayanya ada tapi lupa diberi proyek" — dua keadaan yang menuntut tindakan
 * berlawanan.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getProjectProfit, type ProjectProfitRow } from "@/lib/project-profit-report";
import { Card } from "@/components/ui/card";
import { StaticTable, type SummaryRow } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import { Money } from "@/components/ui/money";
import type { SaiColumns } from "@/components/ui/table-columns";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { reportById, resolvePeriod } from "@/lib/report-catalog";
import { formatDate, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { ProjectOutlined } from "@ant-design/icons";

export const dynamic = "force-dynamic";

/** Ikon keadaan kosong — sama dengan laporan tetangganya. */
const EMPTY_ICON_SIZE = 48;

/**
 * Margin 0–1 → persen satu desimal.
 *
 * Dibulatkan SEBELUM diformat, bukan dengan `maximumFractionDigits`: dua
 * permukaan yang membulatkan di tempat berbeda menghasilkan "19,4%" di satu
 * baris dan "19,45%" di baris totalnya.
 */
const satuDesimal = (share: number) => Math.round(share * 1000) / 10;

type ColumnId =
  | "project"
  | "revenue"
  | "cogs"
  | "grossProfit"
  | "operatingExpense"
  | "profit"
  | "margin";

export default async function ProjectProfitReportPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);

  const report = await getProjectProfit(from, to);

  /* Katalog adalah sumber daftar kolomnya — entri yang hilang berarti
     kontraknya hilang, dan `notFound()` lebih jujur daripada merender laporan
     tanpa bentuk yang disepakati. */
  const definition = reportById("project-profit");
  if (!definition) notFound();

  /*
   * Judul kolom langsung dari KAMUS, bukan dari katalog — lihat catatan pada
   * entri katalognya. Lima dari tujuh memakai kunci yang SUDAH dipakai halaman
   * Laba Rugi, dan itu disengaja: dua laporan yang menyebut hal yang sama harus
   * menyebutnya dengan kata yang sama, kalau tidak pembacanya mengira keduanya
   * mengukur hal yang berbeda.
   */
  const HEADERS: Record<ColumnId, string> = {
    project: t("reports.colProject"),
    revenue: t("reports.sectionRevenue"),
    cogs: t("reports.sectionCogs"),
    grossProfit: t("reports.grossProfitRow"),
    operatingExpense: t("reports.sectionOperatingExpense"),
    profit: t("reports.netIncomeRow"),
    margin: t("reports.colMargin"),
  };

  const money = (id: ColumnId) =>
    moneyColumn<ProjectProfitRow>({
      dataIndex: id as Extract<keyof ProjectProfitRow, string>,
      title: HEADERS[id],
      currency: () => "IDR",
    });

  const columns: SaiColumns<ProjectProfitRow> = [
    {
      key: "project",
      title: HEADERS.project,
      align: "left",
      card: "title",
      render: (_v, r) =>
        r.costCenterId === null ? (
          /* Dibedakan dengan KATA, bukan hanya dengan warna atau posisi: baris
             ini bukan proyek, dan pembacanya harus tahu itu tanpa menghitung
             ke bawah. */
          <span style={{ color: "var(--ant-color-text-secondary)", fontStyle: "italic" }}>
            {t("reports.unassignedProject")}
          </span>
        ) : (
          <>
            <span
              style={{
                marginInlineEnd: 8,
                fontFamily: "var(--ant-font-family-code)",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              {r.code}
            </span>
            {r.name}
          </>
        ),
    },
    money("revenue"),
    money("cogs"),
    money("grossProfit"),
    money("operatingExpense"),
    money("profit"),
    {
      key: "margin",
      title: HEADERS.margin,
      align: "right",
      render: (_v, r) =>
        /* Pendapatan nol → tanda pisah, BUKAN "0%": nol persen terbaca sebagai
           impas, yaitu kebalikan dari proyek yang menyerap biaya tanpa satu
           rupiah pendapatan. */
        r.margin === null ? (
          <span style={{ color: "var(--ant-color-text-tertiary)" }}>—</span>
        ) : (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatNumber(satuDesimal(r.margin))}%
          </span>
        ),
    },
  ];

  /* Baris total ADA, dan itu inti halaman ini: ia yang bisa dibandingkan mata
     dengan Laba / Rugi Bersih di Laba Rugi untuk periode yang sama. */
  const summary: SummaryRow[] = [
    {
      cells: {
        project: { content: t("common.total"), scope: "row" },
        revenue: <Money value={report.total.revenue} currency="IDR" />,
        cogs: <Money value={report.total.cogs} currency="IDR" />,
        grossProfit: <Money value={report.total.grossProfit} currency="IDR" />,
        operatingExpense: <Money value={report.total.operatingExpense} currency="IDR" />,
        profit: <Money value={report.total.profit} currency="IDR" />,
        margin:
          report.total.margin === null
            ? "—"
            : `${formatNumber(satuDesimal(report.total.margin))}%`,
      },
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.project_profit.title") },
        ]}
        title={t("reports.catalogReport.project_profit.title")}
        description={t("reports.periodWithCurrency", {
          from: formatDate(from),
          to: formatDate(to),
        })}
      />

      <PeriodFilter basePath="/reports/project-profit" from={fromISO} to={toISO} />

      <Card>
        <StaticTable<ProjectProfitRow>
          cards
          columns={columns}
          rows={report.rows}
          rowKey={(r) => String(r.costCenterId ?? "unassigned")}
          summary={summary}
          empty={
            <EmptyState
              icon={<ProjectOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("reports.catalogReport.project_profit.title")}
              description={t("reports.projectProfitReconcileNote")}
            />
          }
        />
      </Card>
    </div>
  );
}
