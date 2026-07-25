import { requirePagePermission } from "@/lib/page-auth";
import { getCashFlow } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { resolvePeriod } from "@/lib/report-catalog";
import { cashFlowSummary } from "@/lib/report-summary";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, AlertTriangle, Minus } from "lucide-react";
import type { CashFlowGroup } from "@/lib/reports";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

/**
 * Money with an explicit direction. Colour alone never carries the meaning — an
 * arrow icon and a +/− sign say the same thing, per the design system's
 * "jangan pernah mengandalkan warna saja".
 *
 * Sengaja BUKAN `Money`/`MoneyCell` (issue #52): pewarnaan di sini mengikuti
 * arah kas (masuk hijau / keluar merah, pasangan `*-strong`) dan selalu
 * disertai ikon panah + tanda +/−, sedangkan `Money` hanya mewarnai nilai
 * negatif. Nol pun tampil sebagai ikon "–" berlabel "Nihil", bukan "Rp 0".
 */
type T = (key: DictionaryKey, values?: Record<string, string | number>) => string;

function Flow({ amount, t }: { amount: number; t: T }) {
  if (Math.round(amount * 100) === 0) {
    return (
      <span className="inline-flex items-center justify-end gap-1 text-muted-foreground tabular-nums">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{t("reports.flowNil")}</span>
      </span>
    );
  }
  const inflow = amount > 0;
  const Icon = inflow ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center justify-end gap-1 tabular-nums ${
        inflow ? "text-success-strong" : "text-destructive-strong"
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{inflow ? t("reports.flowIn") : t("reports.flowOut")}</span>
      <span>
        {inflow ? "+" : "−"}
        {formatCurrency(Math.abs(amount), "IDR")}
      </span>
    </span>
  );
}

function Section({ group, label, t }: { group: CashFlowGroup; label: string; t: T }) {
  const unknown = group.category === "uncategorised";
  return (
    <>
      <TableRow
        className={unknown ? "bg-warning-soft hover:bg-warning-soft" : "bg-muted hover:bg-muted"}
      >
        <TableCell className="py-2 font-semibold text-foreground" colSpan={3}>
          <span className="inline-flex items-center gap-2">
            {label}
            {unknown && (
              <Badge variant="warning">
                <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                {t("reports.needsReview")}
              </Badge>
            )}
          </span>
          {unknown && (
            <p className="mt-1 text-xs font-normal text-warning-strong">
              {t("reports.uncategorisedHint")}
            </p>
          )}
        </TableCell>
      </TableRow>

      {group.lines.map((l) => (
        <TableRow key={l.code}>
          <TableCell className="py-2 pl-10 text-muted-foreground">
            <span className="mr-2 font-mono text-muted-foreground">{l.code}</span>
            {l.name}
          </TableCell>
          {/* Nol tampil "—" (bukan "Rp 0"), jadi selnya tetap dirender sendiri
              dengan `Money` di dalamnya. */}
          <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
            {l.inflow > 0 ? <Money value={l.inflow} currency="IDR" /> : "—"}
          </TableCell>
          <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
            {l.outflow > 0 ? <Money value={l.outflow} currency="IDR" /> : "—"}
          </TableCell>
        </TableRow>
      ))}

      {group.lines.length === 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell className="py-2 pl-10 text-muted-foreground" colSpan={3}>
            {t("reports.noCashMovement")}
          </TableCell>
        </TableRow>
      )}

      <TableRow className="font-medium">
        <TableCell className="py-2 text-foreground">
          {t("reports.groupSubtotal", { group: label })}
        </TableCell>
        <TableCell className="py-2 text-right" colSpan={2}>
          <Flow amount={group.net} t={t} />
        </TableCell>
      </TableRow>
    </>
  );
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePagePermission("report.read");
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);
  const cf = await getCashFlow(from, to);
  // Dipakai dokumen cetak & ringkasan bahasa awam — keduanya masih bahasa
  // Indonesia (lib/pdf, lib/report-summary).
  const periodLabel = `Periode ${formatDate(from)} – ${formatDate(to)}`;
  // Label kelompok arus kas untuk LAYAR; payload PDF tetap memakai `g.label`.
  const groupLabels: Record<string, string> = {
    operating: t("cashFlowCategory.operating"),
    investing: t("cashFlowCategory.investing"),
    financing: t("cashFlowCategory.financing"),
    uncategorised: t("cashFlowCategory.uncategorised"),
  };

  const payload: StatementPayload = {
    kind: "cash-flow",
    period: periodLabel,
    groups: cf.groups.map((g) => ({
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
  const summary = cashFlowSummary(cf, periodLabel);

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
        <Card className="mb-4 border-warning/30 bg-warning-soft">
          <div className="flex gap-3 px-6 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm text-warning-strong">
              <span className="font-medium">
                {t("reports.unratedWarningStrong", { count: cf.suspectUnrated })}
              </span>{" "}
              {t("reports.unratedWarningRest")}
            </p>
          </div>
        </Card>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground">{t("reports.openingCash")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(cf.openingCash, "IDR")}
            </p>
          </div>
        </Card>
        <Card>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground">{t("reports.cashChange")}</p>
            <p className="mt-1 text-xl font-semibold">
              <Flow amount={cf.netChange} t={t} />
            </p>
          </div>
        </Card>
        <Card>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground">{t("reports.closingCash")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(cf.closingCash, "IDR")}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("reports.colSourceUse")}</TableHead>
              <TableHead className="text-right">{t("reports.colCashIn")}</TableHead>
              <TableHead className="text-right">{t("reports.colCashOut")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* An empty "Belum Terkategori" section is noise; a non-empty one is the
                whole point of the bucket, so it is always shown when it has rows. */}
            {cf.groups
              .filter((g) => g.category !== "uncategorised" || g.lines.length > 0)
              .map((g) => (
                <Section key={g.category} group={g} label={groupLabels[g.category] ?? g.label} t={t} />
              ))}
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent">
            <TableRow className="text-base font-bold hover:bg-transparent">
              <TableCell className="py-4 text-foreground">
                {t("reports.netCashRow")}
                <span className="ml-2 align-middle">
                  {cf.reconciled ? (
                    <Badge variant="success">{t("reports.matchesLedger")}</Badge>
                  ) : (
                    <Badge variant="danger">{t("reports.doesNotMatch")}</Badge>
                  )}
                </span>
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell className="py-4 text-foreground" value={cf.totalInflow} currency="IDR" />
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell className="py-4 text-foreground" value={cf.totalOutflow} currency="IDR" />
              </TableCell>
            </TableRow>
            <TableRow className="border-b-0 text-base font-bold hover:bg-transparent">
              <TableCell className="text-foreground" colSpan={2}>
                {t("reports.netCashChange")}
              </TableCell>
              <TableCell className="text-right">
                <Flow amount={cf.netChange} t={t} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {cf.cashAccounts.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">{t("reports.perCashAccountTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("reports.perCashAccountHint")}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("common.account")}</TableHead>
                <TableHead className="text-right">{t("reports.colOpeningBalance")}</TableHead>
                <TableHead className="text-right">{t("reports.colChange")}</TableHead>
                <TableHead className="text-right">{t("reports.colClosingBalance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cf.cashAccounts.map((a) => (
                <TableRow key={a.code}>
                  <TableCell className="py-2.5">
                    <span className="mr-2 font-mono text-muted-foreground">{a.code}</span>
                    {a.name}
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="py-2.5" value={a.opening} currency="IDR" />
                  </TableCell>
                  <TableCell className="py-2.5 text-right">
                    <Flow amount={a.net} t={t} />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell className="py-2.5" value={a.closing} currency="IDR" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
