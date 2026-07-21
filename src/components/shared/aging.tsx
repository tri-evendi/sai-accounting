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
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  HelpCircle,
} from "lucide-react";
import {
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  PAYMENT_STATUS_LABELS,
  type AgingBucket,
  type PaymentStatus,
} from "@/lib/receivables";
import { formatCurrency } from "@/lib/utils";

const STATUS_STYLE: Record<
  PaymentStatus,
  { variant: "default" | "success" | "warning" | "danger"; Icon: typeof CheckCircle2 }
> = {
  paid: { variant: "success", Icon: CheckCircle2 },
  partial: { variant: "warning", Icon: CircleDashed },
  unpaid: { variant: "default", Icon: CircleSlash },
  overdue: { variant: "danger", Icon: AlertTriangle },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { variant, Icon } = STATUS_STYLE[status];
  return (
    <Badge variant={variant}>
      <Icon className="h-3.5 w-3.5 mr-1 shrink-0" aria-hidden="true" />
      {PAYMENT_STATUS_LABELS[status]}
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
export function AgeCell({ days, fromIssue }: { days: number; fromIssue: boolean }) {
  const label = fromIssue ? "sejak terbit" : days > 0 ? "lewat tempo" : "menuju tempo";
  const shown = Math.abs(days);
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="tabular-nums">{shown} hari</span>
      <span className="text-xs text-gray-500">{label}</span>
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

export function AgingSummary({ buckets, total, unresolved, caption }: AgingSummaryProps) {
  return (
    <div className="mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {AGING_BUCKETS.map((b) => (
          <Card key={b} className="p-4">
            <p className="text-sm text-gray-500">{AGING_BUCKET_LABELS[b]}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 tabular-nums">
              {formatCurrency(buckets[b], "IDR")}
            </p>
          </Card>
        ))}
        <Card className="p-4 border-blue-200 bg-blue-50">
          <p className="text-sm text-blue-900">Total Outstanding</p>
          <p className="mt-1 text-lg font-bold text-blue-900 tabular-nums">
            {formatCurrency(total, "IDR")}
          </p>
        </Card>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Nilai dalam IDR (nilai dasar buku besar). {caption}
      </p>
      {unresolved > 0 && (
        <p className="mt-1 flex items-start gap-1 text-xs text-amber-700">
          <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {unresolved} dokumen valas belum berkurs, jadi nilai IDR-nya tidak diketahui dan
            <strong> tidak ikut dijumlahkan</strong>. Isi kurs pada dokumen agar terhitung.
          </span>
        </p>
      )}
    </div>
  );
}

/** Outstanding per counterparty — the "siapa berutang berapa" view. */
export function PartyTotals({
  rows,
  title,
}: {
  rows: { name: string; outstandingBase: number; count: number }[];
  title: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="mb-6">
      <div className="px-6 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows.slice(0, 10).map((r) => (
              <tr key={r.name} className="border-b border-gray-100 last:border-0">
                <td className="px-6 py-2.5 text-gray-900">{r.name}</td>
                <td className="px-6 py-2.5 text-gray-500 text-right tabular-nums">
                  {r.count} dokumen
                </td>
                <td className="px-6 py-2.5 text-right font-medium text-gray-900 tabular-nums">
                  {formatCurrency(r.outstandingBase, "IDR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
