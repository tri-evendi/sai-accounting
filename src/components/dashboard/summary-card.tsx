/**
 * Plain-language summary card for the dashboard (issue #3).
 *
 * One card answers one question an owner would ask out loud, in the words they
 * would use, and then points at the report that owns the number. The card never
 * computes anything — it is handed a figure and a link, and its whole job is to
 * make the figure legible to somebody who has never read a ledger.
 *
 * ── Colour is never the only signal (MASTER.md §Anti-Patterns) ───────────────
 * Money direction is carried three ways at once: a lucide icon, a word ("Masuk",
 * "Keluar", "Untung", "Rugi", "Belum masuk", "Belum keluar"), and — for the net
 * figure — an explicit +/− sign in front of the amount. Strip the colour out
 * entirely and the card still reads correctly, which is the actual test.
 *
 * ── The explanation is visible, not hover-only ───────────────────────────────
 * The issue asks for a one-sentence tooltip. It is rendered as permanent helper
 * text instead: the audience is precisely the user who does not know to hover,
 * and a hover tooltip is unreachable on touch and awkward for screen readers. The
 * sentence is *also* set as the heading's `title`, so the hover affordance the
 * issue asked for exists too — it is just not the only way to get the sentence.
 */
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  HandCoins,
  HelpCircle,
  Receipt,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { CurrencyBreakdownRow } from "@/lib/dashboard-summary";

/**
 * What the number means in cash terms — drives icon, word, sign and colour.
 *
 * `receivable` / `payable` are money that has *not* moved yet, so they are amber
 * ("menunggu", MASTER.md §Color Palette) rather than green or red: an unpaid
 * invoice is neither income received nor a loss, and colouring it as either would
 * tell a lay reader something untrue.
 */
export type MoneyDirection = "in" | "out" | "profit" | "loss" | "receivable" | "payable";

interface DirectionStyle {
  Icon: LucideIcon;
  /** Word shown next to the icon. Carries the meaning when colour is unavailable. */
  word: string;
  value: string;
  chip: string;
  /** Explicit sign prefixed to the amount, for figures that can go either way. */
  sign: "" | "+" | "−";
}

const DIRECTION: Record<MoneyDirection, DirectionStyle> = {
  in: {
    Icon: ArrowDownToLine,
    word: "Masuk",
    value: "text-success-strong",
    chip: "bg-success-soft text-success-strong border-success/30",
    sign: "",
  },
  out: {
    Icon: ArrowUpFromLine,
    word: "Keluar",
    value: "text-destructive-strong",
    chip: "bg-destructive-soft text-destructive-strong border-destructive/30",
    sign: "",
  },
  profit: {
    Icon: TrendingUp,
    word: "Untung",
    value: "text-success-strong",
    chip: "bg-success-soft text-success-strong border-success/30",
    sign: "+",
  },
  loss: {
    Icon: TrendingDown,
    word: "Rugi",
    value: "text-destructive-strong",
    chip: "bg-destructive-soft text-destructive-strong border-destructive/30",
    sign: "−",
  },
  receivable: {
    Icon: HandCoins,
    word: "Belum masuk",
    value: "text-foreground",
    chip: "bg-warning-soft text-warning-strong border-warning/30",
    sign: "",
  },
  payable: {
    Icon: Receipt,
    word: "Belum keluar",
    value: "text-foreground",
    chip: "bg-warning-soft text-warning-strong border-warning/30",
    sign: "",
  },
};

export interface SummaryCardProps {
  /** Plain-language question-as-title, e.g. "Uang Masuk". No jargon. */
  title: string;
  /** Amount in IDR base. Pass the absolute value for profit/loss — the sign comes from `direction`. */
  amount: number;
  direction: MoneyDirection;
  /** One sentence, in lay terms, explaining what the number is. */
  explanation: string;
  /** Period or as-of wording, e.g. "Juli 2026" or "per hari ini". */
  period: string;
  /** Where the number can be checked. Must be the report that owns it. */
  href: string;
  hrefLabel?: string;
  /** Secondary fact, e.g. "3 dokumen sudah lewat jatuh tempo". */
  note?: string;
  /** Documents excluded from `amount` for want of an exchange rate. */
  unresolved?: number;
  /** Per-document-currency split. Totals are still IDR base — see lib header. */
  breakdown?: CurrencyBreakdownRow[];
}

export function SummaryCard({
  title,
  amount,
  direction,
  explanation,
  period,
  href,
  hrefLabel = "Lihat detail",
  note,
  unresolved = 0,
  breakdown,
}: SummaryCardProps) {
  const style = DIRECTION[direction];
  const { Icon } = style;
  const showBreakdown = breakdown && breakdown.length > 1;

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground" title={explanation}>
          {title}
        </h3>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
            style.chip
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {style.word}
        </span>
      </div>

      <p className={cn("mt-2 text-2xl font-bold tabular-nums text-right", style.value)}>
        {style.sign}
        {formatCurrency(amount, "IDR")}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground text-right">{period}</p>

      <p className="mt-3 text-sm leading-snug text-muted-foreground">{explanation}</p>

      {note && <p className="mt-2 text-xs font-medium text-foreground">{note}</p>}

      {showBreakdown && (
        <ul className="mt-3 space-y-1 border-t border-border pt-2">
          {breakdown.map((b) => (
            <li key={b.currency} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {b.currency} · {b.count} dokumen
              </span>
              <span className="tabular-nums text-foreground">
                {formatCurrency(b.outstandingBase, "IDR")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {unresolved > 0 && (
        <p className="mt-2 flex items-start gap-1 text-xs text-warning-strong">
          <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {unresolved} dokumen valas belum berkurs, jadi <strong>tidak ikut dijumlahkan</strong>{" "}
            di angka ini.
          </span>
        </p>
      )}

      <Link
        href={href}
        className="mt-auto pt-4 inline-flex cursor-pointer items-center gap-1 self-start text-sm font-medium text-primary transition-colors duration-150 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {hrefLabel} <span aria-hidden="true">→</span>
      </Link>
    </Card>
  );
}
