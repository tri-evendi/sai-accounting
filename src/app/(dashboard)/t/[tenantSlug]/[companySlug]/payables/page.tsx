/**
 * Utang (AP) — who we owe, how much is left, and how old it is (issue #12).
 *
 * The supplier mirror of /receivables. Since issue #37 a payment can name the
 * purchase(s) it settles, so most rows here are backed by recorded allocations.
 * Payments made before that — and any unallocated remainder of a newer one —
 * still have to be spread by the old FIFO assumption (oldest purchase first);
 * rows carrying any of that estimate are badged "Perkiraan" rather than being
 * shown as fact. The per-supplier total is exact either way — see
 * `allocatePayments`.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { getPayables } from "@/lib/receivables";
import { getAdvances, summarizeAdvances } from "@/lib/advances";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { LearnMore } from "@/components/ui/learn-more";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LedgerFilter } from "@/components/shared/ledger-filter";
import { AgeCell, AgingSummary, PaymentStatusBadge, PartyTotals } from "@/components/shared/aging";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { ArrowUpFromLine, Info } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { agingPayload } from "@/lib/report-payload";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";

export const dynamic = "force-dynamic";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function PayablesPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ asOf?: string; overdue?: string }>;
}) {
  await requirePagePermission("payable.read", params);
  const t = await getT();
  const sp = await searchParams;
  // `asOf` sampah dari URL yang diedit tangan menghasilkan Invalid Date, yang
  // membuat `ageInDays` NaN dan MENJATUHKAN semua baris ke ember ">90 hari"
  // tanpa satu pun galat (audit 2026-07) — validasi dulu, mundur ke hari ini.
  const asOfRaw = sp.asOf ?? todayISO();
  const asOfStr = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) && !Number.isNaN(new Date(`${asOfRaw}T00:00:00`).getTime())
    ? asOfRaw
    : todayISO();
  const asOf = new Date(`${asOfStr}T23:59:59.999`);
  const overdueOnly = sp.overdue === "1";

  const [{ rows, aging, byParty, overdueCount }, purchaseAdvances] = await Promise.all([
    getPayables({ asOf, overdueOnly }),
    // Uang muka pembelian still on account (issue #41). A RELATED balance, shown
    // beside the payable and never inside it: this money has already left the
    // bank and sits in an asset account, so netting it off the utang total would
    // understate what is still owed. It reduces a payable only when it is
    // compensated into a purchase — at which point `getPayables` already counts
    // it, via `advanceApplications`.
    getAdvances({ type: "purchase", openOnly: true }),
  ]);
  const advanceSummary = summarizeAdvances(purchaseAdvances);

  // Rows whose split leans on the FIFO fallback rather than a recorded allocation
  // (issue #37). Disclosed per row and in the banner — never presented as fact.
  const estimatedCount = rows.filter((r) => r.allocationEstimated).length;

  // Payload cetak dari baris yang SAMA dengan tabel di bawah — termasuk saringan
  // "hanya jatuh tempo" yang sedang aktif. Berkas yang memuat kumpulan dokumen
  // berbeda dari layarnya adalah cara termudah dua orang membaca satu laporan
  // dan berdebat tentang angka yang berbeda.
  const payload = agingPayload("payables", asOf, rows, aging);

  return (
    <div>
      <PageHeader
        className="mb-2"
        title={<TermTooltip term="utang">{t("payables.title")}</TermTooltip>}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
        description={
          <>
            {t("payables.description", { date: formatDateShort(asOf) })}
            {overdueCount > 0 && !overdueOnly && (
              <> {t("common.overdueDocs", { count: overdueCount })}</>
            )}
          </>
        }
      />
      {/* issue #21 — jalan pintas ke penjelasan istilah layar ini. */}
      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2">
        <LearnMore term="utang" />
        <LearnMore term="uang_muka" />
        <LearnMore term="jatuh_tempo" />
      </div>

      <LedgerFilter basePath="/payables" asOf={asOfStr} overdueOnly={overdueOnly} />

      <AgingSummary
        buckets={aging.buckets}
        total={aging.total}
        unresolved={aging.unresolved}
        caption={t("payables.agingCaption")}
      />

      {/* Related balance: uang muka already paid to suppliers (issue #41). */}
      {advanceSummary.count > 0 && (
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {/* Direction is stated in words and by the icon — not by colour. */}
                <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t("payables.advanceLabel")}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                {formatCurrency(advanceSummary.outstandingBase, "IDR")}
              </p>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                {t("payables.advanceFrom", { count: advanceSummary.count })}{" "}
                <strong>{t("payables.advanceNot")}</strong> {t("payables.advanceHintA")}{" "}
                <em>{t("payables.advanceAsset")}</em>
                {t("payables.advanceHintB")}{" "}
                <strong>{t("payables.advanceCompensated")}</strong>{" "}
                {t("payables.advanceHintC")}{" "}
                <strong>{t("payables.advancePanel")}</strong> {t("payables.advanceHintD")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t("payables.unratedLabel")}</p>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {advanceSummary.unresolvedCount}
              </p>
              <p className="mt-0.5 max-w-48 text-xs text-muted-foreground">
                {t("payables.unratedHint")}
              </p>
            </div>
          </div>
          <p className="mt-3">
            <Link
              href="/advances?type=purchase"
              className="cursor-pointer text-xs text-primary transition-colors hover:underline"
            >
              {t("payables.viewAllAdvances")}
            </Link>
          </p>
        </Card>
      )}

      {estimatedCount > 0 ? (
        <p className="mb-6 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning-strong">
          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>{t("payables.estRows", { count: estimatedCount })}</strong>{" "}
            {t("payables.estMarked")}{" "}
            <Badge variant="warning">{t("payables.estimateBadge")}</Badge>{" "}
            {t("payables.estHintA")} <strong>{t("payables.estOldestFirst")}</strong>
            {t("payables.estHintB")} <strong>{t("payables.fixAllocation")}</strong>{" "}
            {t("payables.estHintC")} <strong>{t("payables.estNoJournalChange")}</strong>
            {t("common.fullStop")}
          </span>
        </p>
      ) : (
        <p className="mb-6 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {t("payables.noEstimateNote")}
          </span>
        </p>
      )}

      <PartyTotals rows={byParty} title={t("payables.partyTotalsTitle")} />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("payables.colSupplier")}</TableHead>
              <TableHead>{t("common.document")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("common.dueDate")}</TableHead>
              <TableHead>{t("common.age")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("payables.colPurchaseValue")}</TableHead>
              <TableHead className="text-right">{t("common.remainingIdr")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-foreground">{r.partyName}</TableCell>
                <TableCell>
                  <Link
                    href={r.href}
                    className="text-primary hover:underline cursor-pointer transition-colors"
                  >
                    {r.documentNo}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{t("payables.docTypePurchase")}</span>
                  {r.terms && (
                    <span className="block text-xs text-muted-foreground max-w-56 truncate" title={r.terms}>
                      {r.terms}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-foreground tabular-nums">{formatDateShort(r.date)}</TableCell>
                <TableCell className="text-foreground tabular-nums">
                  {r.dueDate ? (
                    formatDateShort(r.dueDate)
                  ) : (
                    <span className="text-muted-foreground">{t("common.notFilledIn")}</span>
                  )}
                </TableCell>
                <TableCell className="text-foreground">
                  <AgeCell days={r.ageDays} fromIssue={r.ageFromIssue} />
                </TableCell>
                <TableCell>
                  <PaymentStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-right text-foreground tabular-nums">
                  <Money value={r.total} currency={r.currency} />
                  {r.currency !== "IDR" && (
                    <span className="block text-xs text-muted-foreground">{r.currency}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium text-foreground tabular-nums">
                  {r.outstandingBase == null ? (
                    <span className="text-warning-strong">{t("common.rateMissing")}</span>
                  ) : (
                    <Money value={r.outstandingBase} currency="IDR" />
                  )}
                  {r.allocationEstimated && (
                    <span className="mt-1 block">
                      <span
                        title={t("payables.estimateTitle")}
                      >
                        <Badge variant="warning">{t("payables.estimateBadge")}</Badge>
                      </span>
                      {/* The fix, offered where the problem is noticed (issue
                          #38): this opens the allocation editor on the payment
                          responsible, so the guess can be replaced with fact
                          without deleting and re-posting the payment. */}
                      <Link
                        href={`${r.href}?alokasi=1`}
                        className="mt-1 block cursor-pointer text-xs text-primary transition-colors hover:underline"
                      >
                        {t("payables.fixAllocation")}
                      </Link>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {overdueOnly ? t("payables.emptyOverdue") : t("payables.emptyAll")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
