/**
 * Plain-language summary banner for a report page (issue #19).
 *
 * Renders a `ReportSummary` (built by `@/lib/report-summary` straight from the
 * report's own totals) as one lay sentence plus a compact row of the headline
 * figures. It computes nothing — every number is handed in, so it cannot disagree
 * with the table beneath it. This is the report-page counterpart to the dashboard
 * `SummaryCard` from issue #3, sharing its money-direction vocabulary: colour is
 * never the only signal — each figure also carries an icon, a word and, where it
 * can go either way, an explicit +/− sign.
 */
import { Card } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  TrendingDown,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ReportSummary, SummaryDirection } from "@/lib/report-summary";

interface DirStyle {
  Icon: LucideIcon;
  word: string;
  value: string;
  sign: "" | "+" | "−";
}

const DIR: Record<SummaryDirection, DirStyle> = {
  in: { Icon: ArrowDownToLine, word: "Masuk", value: "text-success-strong", sign: "" },
  out: { Icon: ArrowUpFromLine, word: "Keluar", value: "text-destructive-strong", sign: "" },
  profit: { Icon: TrendingUp, word: "Untung", value: "text-success-strong", sign: "+" },
  loss: { Icon: TrendingDown, word: "Rugi", value: "text-destructive-strong", sign: "−" },
  receivable: { Icon: ArrowDownToLine, word: "Belum masuk", value: "text-foreground", sign: "" },
  payable: { Icon: ArrowUpFromLine, word: "Belum keluar", value: "text-foreground", sign: "" },
};

export function PlainSummary({ summary }: { summary: ReportSummary }) {
  return (
    <Card className="mb-6 border-primary/30 bg-primary/10">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-primary">Ringkasan Bahasa Sehari-hari</h2>
            <p className="mt-1 text-sm leading-snug text-foreground">{summary.narrative}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {summary.cards.map((c) => {
            const s = DIR[c.direction];
            const { Icon } = s;
            return (
              <div
                key={c.title}
                className="rounded-lg border border-primary/30 bg-white p-3"
                title={c.explanation}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{c.title}</span>
                </div>
                <p className={cn("mt-1 text-lg font-bold tabular-nums text-right", s.value)}>
                  {s.sign}
                  {formatCurrency(c.amount, "IDR")}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
