/**
 * Presentation pieces shared by /receivables and /payables (issue #12).
 *
 * Kept together so an AR row and an AP row cannot drift into looking different:
 * the two screens answer the same question pointed in opposite directions, and a
 * user reading both should not have to relearn the badges or the bucket order.
 *
 * Every status carries an icon *and* a word — per the design system, colour is
 * never the only signal (MASTER.md §Anti-Patterns).
 */
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  HelpCircle,
} from "lucide-react";
import { AGING_BUCKETS, type AgingBucket, type PaymentStatus } from "@/lib/receivables";
import { formatCurrency } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

/*
 * Kedua peta label di bawah TIDAK pindah ke `lib/i18n/labels.ts`: sumbernya
 * `lib/receivables.ts` yang mengimpor Prisma, dan `labels.ts` ikut ke bundel
 * peramban. Semua pemakainya komponen server, jadi teksnya dibaca `getT()`
 * di sini — bentuknya tetap `Record<...>` bertipe penuh, jadi status/ember
 * baru tetap ditolak `tsc`.
 */

const STATUS_STYLE: Record<
  PaymentStatus,
  { variant: "default" | "success" | "warning" | "danger"; Icon: typeof CheckCircle2 }
> = {
  paid: { variant: "success", Icon: CheckCircle2 },
  partial: { variant: "warning", Icon: CircleDashed },
  unpaid: { variant: "default", Icon: CircleSlash },
  overdue: { variant: "danger", Icon: AlertTriangle },
};

export async function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = await getT();
  const labels: Record<PaymentStatus, string> = {
    paid: t("paymentStatus.paid"),
    partial: t("paymentStatus.partial"),
    unpaid: t("paymentStatus.unpaid"),
    overdue: t("paymentStatus.overdue"),
  };
  const { variant, Icon } = STATUS_STYLE[status];
  return (
    <Badge variant={variant}>
      <Icon className="h-3.5 w-3.5 mr-1 shrink-0" aria-hidden="true" />
      {labels[status]}
    </Badge>
  );
}

/**
 * Age of a document in days, labelled by what it is actually counting.
 *
 * A row with a due date shows days past that date; a row without one shows days
 * since it was issued. Both are "age", but only the first means *overdue*, and
 * conflating them is the failure mode this whole feature has to avoid — so the
 * distinction is spelled out on every single row, not in a footnote.
 */
export async function AgeCell({ days, fromIssue }: { days: number; fromIssue: boolean }) {
  const t = await getT();
  const label = fromIssue
    ? t("aging.sinceIssue")
    : days > 0
      ? t("aging.pastDue")
      : t("aging.towardsDue");
  const shown = Math.abs(days);
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="tabular-nums">{t("aging.ageDays", { days: shown })}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

export interface AgingSummaryProps {
  buckets: Record<AgingBucket, number>;
  total: number;
  /** Documents with no usable exchange rate, therefore missing from the totals. */
  unresolved: number;
  /** What the buckets are measuring, e.g. "umur sejak jatuh tempo". */
  caption: string;
}

export async function AgingSummary({ buckets, total, unresolved, caption }: AgingSummaryProps) {
  const t = await getT();
  const bucketLabels: Record<AgingBucket, string> = {
    b0_30: t("agingBucket.b0_30"),
    b31_60: t("agingBucket.b31_60"),
    b61_90: t("agingBucket.b61_90"),
    b90_plus: t("agingBucket.b90_plus"),
  };
  return (
    <div className="mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {AGING_BUCKETS.map((b) => (
          <Card key={b} className="p-4">
            <p className="text-sm text-muted-foreground">{bucketLabels[b]}</p>
            <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">
              {formatCurrency(buckets[b], "IDR")}
            </p>
          </Card>
        ))}
        <Card className="p-4 border-primary/30 bg-primary/10">
          <p className="text-sm text-primary">{t("aging.totalOutstanding")}</p>
          <p className="mt-1 text-lg font-bold text-primary tabular-nums">
            {formatCurrency(total, "IDR")}
          </p>
        </Card>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("aging.baseNote")} {caption}
      </p>
      {unresolved > 0 && (
        <p className="mt-1 flex items-start gap-1 text-xs text-warning-strong">
          <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {t("aging.unresolvedBefore", { count: unresolved })}
            <strong> {t("aging.unresolvedStrong")}</strong>
            {t("aging.unresolvedAfter")}
          </span>
        </p>
      )}
    </div>
  );
}

/** Outstanding per counterparty — the "siapa berutang berapa" view. */
export async function PartyTotals({
  rows,
  title,
}: {
  rows: { name: string; outstandingBase: number; count: number }[];
  title: string;
}) {
  if (rows.length === 0) return null;
  const t = await getT();
  return (
    <Card className="mb-6">
      <div className="px-6 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <Table>
        <TableBody>
          {rows.slice(0, 10).map((r) => (
            <TableRow key={r.name}>
              <TableCell className="py-2.5 text-foreground">{r.name}</TableCell>
              <TableCell className="py-2.5 text-muted-foreground text-right tabular-nums">
                {t("aging.docCount", { count: r.count })}
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell
                  className="py-2.5 font-medium text-foreground"
                  value={r.outstandingBase}
                  currency="IDR"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
