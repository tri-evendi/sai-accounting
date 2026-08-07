/**
 * Arus Kas — dikonversi ke `StaticTable.rowCells` + token AntD (issue #198),
 * mengikuti pola yang dibuktikan Neraca di #233.
 *
 * ── Bentuk tabelnya TIDAK lagi ditentukan di sini (issue #241) ─────────────
 * Laporan ini pernah digambar tiga kali dengan tiga bentuk berbeda — halaman,
 * lembar sebar, dan PDF masing-masing memutuskan kolomnya dan nasib kelompok
 * kosongnya sendiri. Sekarang tabelnya `<CashFlowStatement>`, yang memakan
 * `payload` yang SAMA dengan tombol PDF dan tombol Excel di sebelahnya, dan
 * bentuknya datang dari `cashFlowLayout()`. Halaman ini tinggal menyusun
 * halamannya: penyaring periode, ringkasan bahasa awam, kartu ringkas, tabel,
 * rincian per akun kas, dan grafik tren.
 *
 * ── Yang sengaja TIDAK berubah ────────────────────────────────────────────
 *  • **Grafik tren** tetap 6 bulan terakhir dan tetap per mata uang.
 *  • **Kartu ringkas** kas awal / perubahan / kas akhir tetap di atas tabel.
 *    Sejak #241 ketiga angka itu juga menjadi BARIS di dalam tabel — di ketiga
 *    permukaan — jadi kartunya mengulang baris yang ada, bukan menjadi bentuk
 *    keempat yang hanya hidup di layar.
 *
 * **Halaman tetap server component.**
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { canEffective } from "@/lib/authz-effective";
import { prisma } from "@/lib/prisma";
import { getCashFlow } from "@/lib/reports";
import { cashFlowSeriesByCurrency, chartPeriodStart } from "@/lib/chart-data";
import { ChartCard } from "@/components/dashboard/chart-card";
import { CashFlowChart } from "@/components/shared/dashboard-charts";
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import {
  CashFlowStatement,
  Flow,
  type CashFlowPayload,
} from "@/components/reports/cash-flow-statement";
import { resolvePeriod } from "@/lib/report-catalog";
import { cashFlowSummary } from "@/lib/report-summary";
import { formatCurrency, formatDate } from "@/lib/utils";
import { WarningOutlined } from "@ant-design/icons";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `margin` 16 — token AntD sebagai angka (berkas ini server). */
const SECTION_GAP = 24;
const CARD_GAP = 16;
const STAT_BASIS = 220;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

const CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  marginInlineEnd: 8,
  color: "var(--ant-color-text-secondary)",
};

/** Satu baris tabel per akun kas & bank. */
type CashAccountRow = {
  code: string;
  name: string;
  opening: number;
  net: number;
  closing: number;
};

export default async function CashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);

  /*
   * Grafik tren kas (dipindah dari Beranda).
   *
   * DUA hal yang sengaja berbeda dari laporan di atasnya, dan keduanya
   * tertulis di judul/keterangan kartunya sendiri:
   *
   *  • Jendelanya TETAP 6 bulan terakhir ("6 bulan terakhir"), bukan periode
   *    saringan. Laporannya menjawab "periode ini berapa"; grafiknya memberi
   *    latar tren yang tidak ikut berubah tiap kali periodenya digeser.
   *  • Angkanya PER MATA UANG apa adanya dari buku kas (`cash_movements`),
   *    tanpa konversi — sedangkan laporan arus kas berbasis jurnal selalu
   *    IDR dasar. Menjumlahkan rupiah dengan dolar adalah bug mata-uang
   *    campur; satu mata uang = satu grafik.
   *
   * RBAC: buku kas adalah `cash.read`, izin yang BERBEDA dari `report.read`
   * penjaga halaman ini. Bawaannya bos memegang keduanya, tapi matriksnya
   * bisa di-override dari /permissions, jadi izinnya ditanyakan — kalau
   * tidak dipegang, barisnya tidak diambil sama sekali.
   */
  const canViewCashBook = await canEffective(session.user, "cash.read");
  // Satu `now` untuk batas kueri DAN pelabelan ember bulanan.
  const now = new Date();

  const [cf, cashBookRows] = await Promise.all([
    getCashFlow(from, to),
    canViewCashBook
      ? prisma.cashMovement.findMany({
          where: { date: { gte: chartPeriodStart(now) } },
          select: { date: true, debit: true, credit: true, currency: true },
        })
      : Promise.resolve([]),
  ]);
  const cashTrend = cashFlowSeriesByCurrency(cashBookRows, now);
  // Dipakai dokumen cetak & ringkasan bahasa awam — keduanya masih bahasa
  // Indonesia (lib/pdf, lib/report-summary).
  const periodLabel = `Periode ${formatDate(from)} – ${formatDate(to)}`;

  /*
   * SATU payload untuk tiga permukaan (issue #241): tabel di layar, tombol
   * PDF, dan tombol Excel semuanya memakan objek ini. `category` ikut sejak
   * #241 — bentuk laporan bergantung padanya (lihat `cashFlowLayout()`), dan
   * `label` yang sudah diterjemahkan tidak bisa menggantikannya.
   */
  const payload: CashFlowPayload = {
    kind: "cash-flow",
    period: periodLabel,
    groups: cf.groups.map((g) => ({
      category: g.category,
      label: g.label,
      lines: g.lines.map((l) => ({
        code: l.code,
        name: l.name,
        inflow: l.inflow,
        outflow: l.outflow,
        net: l.net,
      })),
      inflow: g.inflow,
      outflow: g.outflow,
      net: g.net,
    })),
    totalInflow: cf.totalInflow,
    totalOutflow: cf.totalOutflow,
    netChange: cf.netChange,
    openingCash: cf.openingCash,
    closingCash: cf.closingCash,
    reconciled: cf.reconciled,
    suspectUnrated: cf.suspectUnrated,
  };
  const summary = cashFlowSummary(cf, periodLabel, t);

  const accountColumns: SaiColumns<CashAccountRow> = [
    {
      key: "account",
      dataIndex: "name",
      title: t("common.account"),
      align: "left",
      render: (_v, r) => (
        <>
          <span style={CODE_STYLE}>{r.code}</span>
          {r.name}
        </>
      ),
    },
    moneyColumn<CashAccountRow>({ dataIndex: "opening", title: t("reports.colOpeningBalance") }),
    {
      key: "net",
      dataIndex: "net",
      title: t("reports.colChange"),
      align: "right",
      render: (_v, r) => <Flow amount={r.net} t={t} />,
    },
    moneyColumn<CashAccountRow>({ dataIndex: "closing", title: t("reports.colClosingBalance") }),
  ];

  /** Kartu angka ringkas: keterangan kecil di atas, nilainya di bawah. */
  const statCard = (label: string, value: React.ReactNode) => (
    <Card>
      <div style={{ padding: "var(--ant-padding)" }}>
        <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>{label}</p>
        <p
          style={{
            margin: 0,
            marginTop: "var(--ant-margin-xxs)",
            fontSize: "var(--ant-font-size-xl)",
            fontWeight: STRONG,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </p>
      </div>
    </Card>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.cashFlowTitle") },
        ]}
        title={t("reports.cashFlowTitle")}
        description={t("reports.periodWithCurrency", {
          from: formatDate(from),
          to: formatDate(to),
        })}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <PeriodFilter basePath="/reports/cash-flow" from={fromISO} to={toISO} />

      <PlainSummary summary={summary} />

      {cf.suspectUnrated > 0 && (
        <Card
          style={{
            marginBottom: CARD_GAP,
            borderColor: "var(--ant-color-warning-border)",
            background: "var(--ant-color-warning-bg)",
          }}
        >
          <div style={{ display: "flex", gap: 12, padding: "var(--ant-padding-lg)" }}>
            <WarningOutlined aria-hidden="true" style={{ fontSize: 20, flexShrink: 0, marginTop: 2, color: "var(--ant-color-money-pending)" }} />
            <p style={{ margin: 0, color: "var(--ant-color-money-pending)" }}>
              <span style={{ fontWeight: STRONG }}>
                {t("reports.unratedWarningStrong", { count: cf.suspectUnrated })}
              </span>{" "}
              {t("reports.unratedWarningRest")}
            </p>
          </div>
        </Card>
      )}

      <div
        style={{
          display: "grid",
          gap: CARD_GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${STAT_BASIS}px, 1fr))`,
          marginBottom: CARD_GAP,
        }}
      >
        {statCard(t("reports.openingCash"), formatCurrency(cf.openingCash, "IDR"))}
        {statCard(t("reports.cashChange"), <Flow amount={cf.netChange} t={t} />)}
        {statCard(t("reports.closingCash"), formatCurrency(cf.closingCash, "IDR"))}
      </div>

      <Card>
        <CashFlowStatement payload={payload} t={t} />
      </Card>

      {cf.cashAccounts.length > 0 && (
        <Card style={{ marginTop: SECTION_GAP }}>
          <div
            style={{
              padding: "var(--ant-padding-lg)",
              borderBottom: "1px solid var(--ant-color-border-secondary)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--ant-font-size)", fontWeight: STRONG }}>
              {t("reports.perCashAccountTitle")}
            </h2>
            <p
              style={{
                margin: 0,
                marginTop: "var(--ant-margin-xxs)",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              {t("reports.perCashAccountHint")}
            </p>
          </div>
          <StaticTable<CashAccountRow>
            columns={accountColumns}
            rows={cf.cashAccounts}
            rowKey={(r) => r.code}
          />
        </Card>
      )}

      {/* Tren buku kas per mata uang — latar 6 bulan di bawah laporannya,
          bukan menggantikan angka periode di atas. */}
      {cashTrend.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: SECTION_GAP,
            gridTemplateColumns:
              cashTrend.length === 1 ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))",
            marginTop: SECTION_GAP,
          }}
        >
          {cashTrend.map((series) => (
            <ChartCard
              key={series.currency}
              title={t("dashboard.cashFlowChartTitle", { currency: series.currency })}
              description={t("dashboard.cashFlowChartDesc")}
            >
              <CashFlowChart data={series.points} currency={series.currency} />
            </ChartCard>
          ))}
        </div>
      )}
    </div>
  );
}
