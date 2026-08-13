/**
 * Laba/Rugi bertingkat — halaman laporan.
 *
 * ── Bentuknya TIDAK ditentukan di sini (issue #274) ────────────────────────
 * Sampai #274 berkas ini menyusun barisnya sendiri lewat penolong `section()`
 * lokal — kembaran persis dari yang dicabut dari Neraca di #273 — sementara
 * `report-export.ts` dan `pdf/statement-pdf.ts` menyusun dua bentuk lain untuk
 * laporan yang sama, sampai ke label yang berbeda bahasa ("LABA KOTOR" huruf
 * besar mati di lembar sebar, "Laba Kotor" dari kamus di layar). Sekarang
 * barisnya datang dari `incomeStatementLayout()` di `src/lib/statement-layout.ts`,
 * dan tabelnya dari `<IncomeStatementTable>` yang memakan **payload yang sama
 * persis** dengan tombol PDF dan tombol Excel di sebelahnya.
 * `tests/income-statement-shape.test.ts` membandingkan ketiganya baris demi
 * baris.
 *
 * Yang tersisa di halaman ini hanyalah tugas halaman: izin, parameter, saringan
 * pusat biaya, membaca buku besar, ringkasan bahasa awam, dan tombol-tombolnya.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getIncomeStatement } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { IncomeStatementTable } from "@/components/reports/income-statement-table";
import { resolvePeriod } from "@/lib/report-catalog";
import { parseCostCenterFilter } from "@/lib/cost-centers";
import { costCenterFilterLabel, costCenterFilterOptions } from "@/lib/cost-center-options";
import { incomeStatementSummary } from "@/lib/report-summary";
import { formatDate } from "@/lib/utils";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { getT } from "@/lib/i18n/server";
import { InfoCircleOutlined } from "@ant-design/icons";
import { ChartCard } from "@/components/dashboard/chart-card";
import { IncomeWaterfallChart } from "@/components/shared/dashboard-charts";

/** Jarak antar-blok halaman — sama dengan `marginLG` yang dipakai laporan lain. */
const SECTION_GAP = 24;
export const dynamic = "force-dynamic";

export default async function IncomeStatementPage({
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
  // issue #91 — pilahan per pusat biaya. Laba/Rugi SAJA (bukan Neraca): tanpa
  // akun antar-unit, neraca yang disaring tak lagi seimbang.
  const costCenter = parseCostCenterFilter(sp.costCenter);
  const [costCenterOptions, costCenterName] = await Promise.all([
    costCenterFilterOptions(),
    costCenterFilterLabel(sp.costCenter),
  ]);
  const is = await getIncomeStatement(from, to, undefined, costCenter);
  // Saringan AKTIF tapi labelnya tak ditemukan (pusat biaya terhapus / id
  // salah ketik namun lolos parse): laporan tetap tersaring, jadi tandanya
  // tidak boleh hilang — tanpa nama, pusat biayanya disebut `#<id>`.
  const costCenterLabel =
    costCenter !== undefined ? costCenterName ?? `#${costCenter}` : null;
  // Dipakai dokumen cetak & ringkasan bahasa awam — keduanya masih bahasa
  // Indonesia (lib/pdf, lib/report-summary). Pusat biaya yang sedang dipilih
  // ikut TERCETAK: satu laporan yang hanya memuat sebagian angka tanpa
  // mengatakannya adalah cara termudah salah dibaca setelah dicetak.
  const periodLabel =
    `Periode ${formatDate(from)} – ${formatDate(to)}` +
    (costCenterLabel ? ` · Pusat Biaya: ${costCenterLabel}` : "");

  // One payload feeds both exports and the plain-language summary, so the PDF,
  // the Excel file, the sentence and the table below can never disagree.
  const payload: StatementPayload = {
    kind: "income-statement",
    period: periodLabel,
    sales: is.sales,
    cogs: is.cogs,
    grossProfit: is.grossProfit,
    operatingExpense: is.operatingExpense,
    operatingProfit: is.operatingProfit,
    otherIncome: is.otherIncome,
    otherExpense: is.otherExpense,
    netIncome: is.netIncome,
  };
  const summary = incomeStatementSummary(is, periodLabel, t);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.incomeStatementTitle") },
        ]}
        title={t("reports.incomeStatementTitle")}
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

      <PeriodFilter
        basePath="/reports/income-statement"
        from={fromISO}
        to={toISO}
        costCenterOptions={costCenterOptions}
        costCenter={sp.costCenter ?? ""}
      />

      {/* Dua kalimat, dan keduanya perlu (issue #98). Yang pertama menjanjikan
          rekonsiliasi: apa pun pilahannya, jumlahnya tetap total. Yang kedua
          menyebutkan APA yang belum ikut berdimensi — HPP tanpa tanda,
          penyusutan, kontrak, uang muka. Tanpa kalimat kedua, laporan cabang
          yang berisi pendapatan tanpa sebagian harga pokoknya terlihat persis
          seperti laporan yang lengkap, dan itulah pola kegagalan yang paling
          berbahaya: bukan angka yang salah, melainkan angka yang benar untuk
          pertanyaan yang berbeda dari yang dikira pembacanya. */}
      {costCenterLabel && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 16,
            padding: 12,
            borderRadius: "var(--ant-border-radius)",
            background: "var(--ant-color-fill-quaternary)",
            color: "var(--ant-color-text-secondary)",
          }}
        >
          <p style={{ margin: 0 }}>{t("costCenters.filterNote")}</p>
          <p style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: 0 }}>
            <InfoCircleOutlined aria-hidden="true" style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }} />
            <span>{t("costCenters.filterScopeNote")}</span>
          </p>
        </div>
      )}

      <PlainSummary summary={summary} />

      <Card>
        <IncomeStatementTable payload={payload} t={t} />
      </Card>

      {/*
       * Rantai bertingkatnya digambar (issue #355).
       *
       * Laporan ini SUDAH bertingkat (#123): penjualan − HPP = laba kotor,
       * − beban = laba usaha, ± lain-lain = laba bersih. Dalam bentuk tabel
       * rantai itu harus dirakit ulang di kepala pembacanya baris demi baris;
       * waterfall menggambarkannya apa adanya. Diletakkan DI BAWAH tabelnya —
       * angka tetap sumber kebenaran, grafik tetap ringkasan.
       *
       * Nilainya diambil dari `is`, objek yang SAMA yang mengisi tabel di atas,
       * jadi grafik dan tabel tidak bisa berselisih angka.
       */}
      <div style={{ marginTop: SECTION_GAP }}>
        <ChartCard
          title={t("reports.waterfallTitle")}
          description={t("reports.waterfallDesc")}
        >
          <IncomeWaterfallChart
            currency="IDR"
            steps={[
              { label: t("reports.sectionRevenue"), value: is.sales.total, kind: "delta" },
              { label: t("reports.sectionCogs"), value: -is.cogs.total, kind: "delta" },
              { label: t("reports.grossProfitRow"), value: is.grossProfit, kind: "subtotal" },
              {
                label: t("reports.sectionOperatingExpense"),
                value: -is.operatingExpense.total,
                kind: "delta",
              },
              { label: t("reports.operatingProfitRow"), value: is.operatingProfit, kind: "subtotal" },
              {
                label: t("reports.sectionOtherIncome"),
                value: is.otherIncome.total - is.otherExpense.total,
                kind: "delta",
              },
              { label: t("reports.netIncomeRow"), value: is.netIncome, kind: "subtotal" },
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}
