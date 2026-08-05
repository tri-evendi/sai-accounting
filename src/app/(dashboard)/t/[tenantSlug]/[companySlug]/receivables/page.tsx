/**
 * Piutang (AR) — who owes us, how much is left, and how old it is (issue #12).
 *
 * Read-only: nothing here writes and nothing here posts. Balances come from the
 * source documents via `@/lib/receivables`, whose header explains why every
 * cross-document total is expressed in IDR base.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { getReceivables } from "@/lib/receivables";
import { Card } from "@/components/ui/card";
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
import { formatDateShort } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { agingPayload } from "@/lib/report-payload";
import { reportById, resolveColumns } from "@/lib/report-catalog";
import { agingColumns, type AgingColumnId } from "@/lib/statement-layout";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";

export const dynamic = "force-dynamic";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ReceivablesPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ asOf?: string; overdue?: string; cols?: string }>;
}) {
  await requirePagePermission("receivable.read", params);
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

  const { rows, aging, byParty, overdueCount } = await getReceivables({ asOf, overdueOnly });

  // Payload cetak dari baris yang SAMA dengan tabel di bawah — termasuk saringan
  // "hanya jatuh tempo" yang sedang aktif. Berkas yang memuat kumpulan dokumen
  // berbeda dari layarnya adalah cara termudah dua orang membaca satu laporan
  // dan berdebat tentang angka yang berbeda.
  const definition = reportById("receivables");
  const payload = agingPayload(
    "receivables",
    asOf,
    rows,
    aging,
    definition ? resolveColumns(definition, sp.cols) : []
  );

  // Susunan kolom layar = susunan kolom berkasnya. Satu penentu, tiga permukaan.
  const cols = agingColumns(payload);
  const HEADERS: Record<AgingColumnId, string> = {
    party: t("common.customer"),
    documentNo: t("common.document"),
    date: t("common.date"),
    dueDate: t("common.dueDate"),
    age: t("common.age"),
    status: t("common.status"),
    total: t("receivables.colDocumentValue"),
    outstanding: t("common.remainingIdr"),
  };

  return (
    <div>
      <PageHeader
        className="mb-2"
        title={<TermTooltip term="piutang">{t("receivables.title")}</TermTooltip>}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
        description={
          <>
            {t("receivables.description", { date: formatDateShort(asOf) })}
            {overdueCount > 0 && !overdueOnly && (
              <> {t("common.overdueDocs", { count: overdueCount })}</>
            )}
          </>
        }
      />
      {/* issue #21 — jalan pintas ke penjelasan istilah layar ini. */}
      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2">
        <LearnMore term="piutang" />
        <LearnMore term="umur_piutang" />
        <LearnMore term="jatuh_tempo" />
      </div>

      <LedgerFilter basePath="/receivables" asOf={asOfStr} overdueOnly={overdueOnly} />

      <AgingSummary
        buckets={aging.buckets}
        total={aging.total}
        unresolved={aging.unresolved}
        caption={t("receivables.agingCaption")}
      />

      <PartyTotals rows={byParty} title={t("receivables.partyTotalsTitle")} />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {cols.map((c) => (
                <TableHead
                  key={c}
                  className={c === "total" || c === "outstanding" ? "text-right" : undefined}
                >
                  {HEADERS[c]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.kind}-${r.id}`}>
                {cols.map((c) => {
                  switch (c) {
                    case "party":
                      return (
                        <TableCell key={c} className="text-foreground">
                          {r.partyName}
                        </TableCell>
                      );
                    case "documentNo":
                      return (
                        <TableCell key={c}>
                          <Link
                            href={r.href}
                            className="text-primary hover:underline cursor-pointer transition-colors"
                          >
                            {r.documentNo}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {r.kind === "invoice"
                              ? t("receivables.docTypeInvoice")
                              : t("receivables.docTypeContract")}
                          </span>
                          {/* Free text, straight from top1/top2 — informational only. */}
                          {r.terms && (
                            <span
                              className="block text-xs text-muted-foreground max-w-56 truncate"
                              title={r.terms}
                            >
                              {r.terms}
                            </span>
                          )}
                        </TableCell>
                      );
                    case "date":
                      return (
                        <TableCell key={c} className="text-foreground tabular-nums">
                          {formatDateShort(r.date)}
                        </TableCell>
                      );
                    case "dueDate":
                      return (
                        <TableCell key={c} className="text-foreground tabular-nums">
                          {r.dueDate ? (
                            formatDateShort(r.dueDate)
                          ) : (
                            <span className="text-muted-foreground">{t("common.notFilledIn")}</span>
                          )}
                        </TableCell>
                      );
                    case "age":
                      return (
                        <TableCell key={c} className="text-foreground">
                          <AgeCell days={r.ageDays} fromIssue={r.ageFromIssue} />
                        </TableCell>
                      );
                    case "status":
                      return (
                        <TableCell key={c}>
                          <PaymentStatusBadge status={r.status} />
                        </TableCell>
                      );
                    case "total":
                      return (
                        <TableCell key={c} className="text-right text-foreground tabular-nums">
                          <Money value={r.total} currency={r.currency} />
                          {r.currency !== "IDR" && (
                            <span className="block text-xs text-muted-foreground">{r.currency}</span>
                          )}
                        </TableCell>
                      );
                    case "outstanding":
                      return (
                        <TableCell
                          key={c}
                          className="text-right font-medium text-foreground tabular-nums"
                        >
                          {r.outstandingBase == null ? (
                            <span className="text-warning-strong">{t("common.rateMissing")}</span>
                          ) : (
                            <Money value={r.outstandingBase} currency="IDR" />
                          )}
                          {/* Only shown when every payment shared the document's currency —
                              otherwise there is no single-currency remainder to state. */}
                          {r.outstanding != null && r.currency !== "IDR" && (
                            <span className="block text-xs text-muted-foreground">
                              <Money value={r.outstanding} currency={r.currency} />
                            </span>
                          )}
                        </TableCell>
                      );
                  }
                })}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {overdueOnly ? t("receivables.emptyOverdue") : t("receivables.emptyAll")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
