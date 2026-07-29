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
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

interface DirStyle {
  Icon: LucideIcon;
  word: DictionaryKey;
  value: string;
  sign: "" | "+" | "−";
}

const DIR: Record<SummaryDirection, DirStyle> = {
  in: { Icon: ArrowDownToLine, word: "moneyDirection.in", value: "text-success-strong", sign: "" },
  out: {
    Icon: ArrowUpFromLine,
    word: "moneyDirection.out",
    value: "text-destructive-strong",
    sign: "",
  },
  profit: { Icon: TrendingUp, word: "moneyDirection.profit", value: "text-success-strong", sign: "+" },
  loss: {
    Icon: TrendingDown,
    word: "moneyDirection.loss",
    value: "text-destructive-strong",
    sign: "−",
  },
  receivable: {
    Icon: ArrowDownToLine,
    word: "moneyDirection.receivable",
    value: "text-foreground",
    sign: "",
  },
  payable: {
    Icon: ArrowUpFromLine,
    word: "moneyDirection.payable",
    value: "text-foreground",
    sign: "",
  },
};

export async function PlainSummary({ summary }: { summary: ReportSummary }) {
  const t = await getT();
  return (
    <Card className="mb-6 border-primary/30 bg-primary/10">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-primary">{t("dashboard.plainTitle")}</h2>
            <p className="mt-1 text-sm leading-snug text-foreground">{summary.narrative}</p>
          </div>
        </div>

        {/* Tiga kartu adalah bentuk bakunya (Neraca, Arus Kas). Laba/Rugi
            menambah Laba Kotor saat pembukuannya memang punya HPP (issue #123),
            dan empat kartu di `sm:grid-cols-3` akan menyisakan satu yatim di
            baris kedua — jadi jumlah kartunya yang menentukan kisinya, bukan
            angka tetap. Laporan berkartu tiga tidak berubah sama sekali. */}
        <div
          className={cn(
            "grid gap-3",
            summary.cards.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
          )}
        >
          {summary.cards.map((c) => {
            const s = DIR[c.direction];
            const { Icon } = s;
            return (
              <div
                key={c.title}
                className="rounded-lg border border-primary/30 bg-card p-3"
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
