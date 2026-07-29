import { requirePagePermission } from "@/lib/page-auth";
import { getIncomeStatement } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { resolvePeriod } from "@/lib/report-catalog";
import { parseCostCenterFilter } from "@/lib/cost-centers";
import { costCenterFilterLabel, costCenterFilterOptions } from "@/lib/cost-center-options";
import { incomeStatementSummary } from "@/lib/report-summary";
import { grossMarginPct, incomeStatementLayout } from "@/lib/statement-layout";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { StatementLine } from "@/lib/reports";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { getT } from "@/lib/i18n/server";
import { Info } from "lucide-react";

export const dynamic = "force-dynamic";

function Section({
  title,
  lines,
  total,
  totalLabel,
}: {
  title: string;
  lines: StatementLine[];
  total: number;
  totalLabel: string;
}) {
  return (
    <>
      <TableRow className="bg-muted hover:bg-muted">
        <TableCell className="py-2 font-semibold text-foreground" colSpan={2}>{title}</TableCell>
      </TableRow>
      {lines.map((l) => (
        <TableRow key={l.code}>
          <TableCell className="py-2 pl-10 text-muted-foreground">
            <span className="font-mono text-muted-foreground mr-2">{l.code}</span>
            {l.name}
          </TableCell>
          <TableCell className="p-0">
            <MoneyCell className="py-2" value={l.amount} currency="IDR" />
          </TableCell>
        </TableRow>
      ))}
      {lines.length === 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell className="py-2 pl-10 text-muted-foreground" colSpan={2}>—</TableCell>
        </TableRow>
      )}
      <TableRow className="font-medium">
        <TableCell className="py-2 text-foreground">{totalLabel}</TableCell>
        <TableCell className="p-0">
          <MoneyCell className="py-2" value={total} currency="IDR" />
        </TableCell>
      </TableRow>
    </>
  );
}

/**
 * A step of the ladder: Laba Kotor, Laba Usaha. Ruled off above and set in bold
 * so the eye can find the three results (kotor → usaha → bersih) without reading
 * the account lines between them — which is the entire point of a multi-step
 * statement over a single-step one.
 *
 * `note` carries the gross margin. It is deliberately text next to the figure
 * rather than a second column: the statement is a two-column document, and a
 * percentage that only one row has does not earn a column of its own.
 */
function StepRow({ label, amount, note }: { label: string; amount: number; note?: string }) {
  return (
    <TableRow className="border-t-2 bg-muted/50 font-semibold hover:bg-muted/50">
      <TableCell className="py-3 text-foreground">
        {label}
        {note && <span className="ml-2 text-sm font-normal text-muted-foreground">({note})</span>}
      </TableCell>
      <TableCell className="p-0">
        <MoneyCell className="py-3 font-semibold" value={amount} currency="IDR" />
      </TableCell>
    </TableRow>
  );
}

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; costCenter?: string }>;
}) {
  await requirePagePermission("report.read");
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
  const profit = is.netIncome >= 0;
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
  // Which steps of the ladder this company's chart of accounts actually supports
  // — the same helper the PDF and the spreadsheet ask, so the three agree.
  const layout = incomeStatementLayout(is);
  const marginPct = grossMarginPct(is.grossProfit, is.sales.total);
  const marginNote =
    marginPct === null
      ? undefined
      : t("reports.grossMarginNote", { pct: formatNumber(Math.round(marginPct * 10) / 10) });

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
        <div className="mb-4 space-y-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <p>{t("costCenters.filterNote")}</p>
          <p className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("costCenters.filterScopeNote")}</span>
          </p>
        </div>
      )}

      <PlainSummary summary={summary} />

      <Card>
        <Table>
          {/* Bertingkat (issue #123): Penjualan − HPP = Laba Kotor, − Beban
              Operasional = Laba Usaha, ± lain-lain = Laba Bersih. Urutan inilah
              laporannya; menjumlahkan HPP dan gaji ke dalam satu "Beban"
              menghapus marjin kotor — angka pertama yang dibaca perusahaan
              dagang. Bagian yang tak berisi akun tidak dicetak (lihat
              `statement-layout.ts`). */}
          <TableBody>
            <Section
              title={t("reports.sectionRevenue")}
              totalLabel={t("reports.sectionTotal", { section: t("reports.sectionRevenue") })}
              lines={is.sales.lines}
              total={is.sales.total}
            />
            {layout.showCogs && (
              <Section
                title={t("reports.sectionCogs")}
                totalLabel={t("reports.sectionTotal", { section: t("reports.sectionCogs") })}
                lines={is.cogs.lines}
                total={is.cogs.total}
              />
            )}
            {layout.showGrossProfit && (
              <StepRow
                label={t("reports.grossProfitRow")}
                amount={is.grossProfit}
                note={marginNote}
              />
            )}
            <Section
              title={t("reports.sectionOperatingExpense")}
              totalLabel={t("reports.sectionTotal", {
                section: t("reports.sectionOperatingExpense"),
              })}
              lines={is.operatingExpense.lines}
              total={is.operatingExpense.total}
            />
            {layout.showOperatingProfit && (
              <StepRow label={t("reports.operatingProfitRow")} amount={is.operatingProfit} />
            )}
            {layout.showOtherIncome && (
              <Section
                title={t("reports.sectionOtherIncome")}
                totalLabel={t("reports.sectionTotal", { section: t("reports.sectionOtherIncome") })}
                lines={is.otherIncome.lines}
                total={is.otherIncome.total}
              />
            )}
            {layout.showOtherExpense && (
              <Section
                title={t("reports.sectionOtherExpense")}
                totalLabel={t("reports.sectionTotal", {
                  section: t("reports.sectionOtherExpense"),
                })}
                lines={is.otherExpense.lines}
                total={is.otherExpense.total}
              />
            )}
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent">
            <TableRow className="border-b-0 text-base font-bold hover:bg-transparent">
              <TableCell className="py-4 text-foreground">
                {t("reports.netIncomeRow")}
                <span className={`ml-2 text-sm font-medium ${profit ? "text-success-strong" : "text-destructive"}`}>
                  ({profit ? t("reports.profit") : t("reports.loss")})
                </span>
              </TableCell>
              {/* Laba/rugi diwarnai `text-success-strong`/`text-destructive`
                  berpasangan dengan label "(Laba)"/"(Rugi)" di sebelahnya —
                  bukan pewarnaan bawaan `Money` (hanya negatif, token
                  `text-destructive`/`text-success`), jadi sel ini tetap
                  dirender seperti semula demi paritas. */}
              <TableCell className={`py-4 text-right tabular-nums ${profit ? "text-success-strong" : "text-destructive"}`}>
                {formatCurrency(is.netIncome, "IDR")}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </div>
  );
}
