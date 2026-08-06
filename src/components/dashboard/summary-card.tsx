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
 *
 * ── Server component, tanpa satu kelas Tailwind (issue #240, fase C9) ────────
 * Kartu ini dirender beranda, yang membaca buku besar lewat Prisma dan HARUS
 * tetap server component — jadi berkas ini **tidak boleh mengimpor `antd`**
 * (dijaga `tests/rsc-boundary.test.ts`) dan `theme.useToken()` tidak tersedia.
 * Warnanya karena itu `var(--ant-…)`, yang sejak #227 teratasi di mana pun.
 *
 * Pasangan warna chip mengikuti aturan `Tag` (#187): latar TIPIS (`color*Bg`)
 * dengan teks anak tangga uang (#186) — bukan `colorSuccess` pekat sebagai
 * warna teks, yang pada 12px hanya 2,21:1.
 */
import { Link } from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
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
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

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
  word: DictionaryKey;
  /** Colour of the headline figure. */
  value: string;
  /** Background/border/text of the direction chip. */
  chip: React.CSSProperties;
  /** Explicit sign prefixed to the amount, for figures that can go either way. */
  sign: "" | "+" | "−";
}

const CHIP_POSITIVE: React.CSSProperties = {
  background: "var(--ant-color-success-bg)",
  borderColor: "var(--ant-color-success-border)",
  color: "var(--ant-color-money-positive)",
};
const CHIP_NEGATIVE: React.CSSProperties = {
  background: "var(--ant-color-error-bg)",
  borderColor: "var(--ant-color-error-border)",
  color: "var(--ant-color-money-negative)",
};
const CHIP_PENDING: React.CSSProperties = {
  background: "var(--ant-color-warning-bg)",
  borderColor: "var(--ant-color-warning-border)",
  color: "var(--ant-color-money-pending)",
};

const DIRECTION: Record<MoneyDirection, DirectionStyle> = {
  in: {
    Icon: ArrowDownToLine,
    word: "moneyDirection.in",
    value: "var(--ant-color-money-positive)",
    chip: CHIP_POSITIVE,
    sign: "",
  },
  out: {
    Icon: ArrowUpFromLine,
    word: "moneyDirection.out",
    value: "var(--ant-color-money-negative)",
    chip: CHIP_NEGATIVE,
    sign: "",
  },
  profit: {
    Icon: TrendingUp,
    word: "moneyDirection.profit",
    value: "var(--ant-color-money-positive)",
    chip: CHIP_POSITIVE,
    sign: "+",
  },
  loss: {
    Icon: TrendingDown,
    word: "moneyDirection.loss",
    value: "var(--ant-color-money-negative)",
    chip: CHIP_NEGATIVE,
    sign: "−",
  },
  receivable: {
    Icon: HandCoins,
    word: "moneyDirection.receivable",
    value: "var(--ant-color-text)",
    chip: CHIP_PENDING,
    sign: "",
  },
  payable: {
    Icon: Receipt,
    word: "moneyDirection.payable",
    value: "var(--ant-color-text)",
    chip: CHIP_PENDING,
    sign: "",
  },
};

/** Kartu adalah wadah tata letaknya sendiri — badan `Card` `display:contents`. */
const CARD: React.CSSProperties = {
  display: "flex",
  height: "100%",
  flexDirection: "column",
  padding: "var(--ant-padding-md)",
};

const HEAD_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--ant-margin-xs)",
};

const HEADING: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  fontWeight: 500,
  color: "var(--ant-color-text-secondary)",
};

/** Lencana arah uang — ikon + KATA, tak pernah warna saja. */
const CHIP_BASE: React.CSSProperties = {
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  borderRadius: 9999,
  borderWidth: "var(--ant-line-width)",
  borderStyle: "solid",
  paddingInline: "var(--ant-padding-xs)",
  paddingBlock: 2,
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: 500,
};

const AMOUNT: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-heading-3)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
};

const PERIOD: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-secondary)",
  textAlign: "right",
};

const EXPLANATION: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-sm)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.375,
  color: "var(--ant-color-text-secondary)",
};

const NOTE: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: 500,
  color: "var(--ant-color-text)",
};

const BREAKDOWN: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-sm)",
  padding: 0,
  paddingTop: "var(--ant-padding-xs)",
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xxs)",
  borderTop: "var(--ant-line-width) solid var(--ant-color-border-secondary)",
};

const BREAKDOWN_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-sm)",
};

const UNRESOLVED: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xs)",
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-money-pending)",
};

/*
 * `--ant-color-link` (= `colorBrandText`, 5,65:1) — bukan `--ant-color-primary`,
 * yang sebagai teks hanya 4,10:1. `marginTop: auto` mendorong tautan ke dasar
 * kartu supaya keempat kartu dalam satu baris sejajar garis bawahnya; itu
 * bekerja karena badan `Card` `display: contents` (lihat kepala `ui/card.tsx`).
 */
const LINK: React.CSSProperties = {
  marginTop: "auto",
  paddingTop: "var(--ant-padding)",
  display: "inline-flex",
  alignSelf: "flex-start",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  fontWeight: 500,
  color: "var(--ant-color-link)",
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

export async function SummaryCard({
  title,
  amount,
  direction,
  explanation,
  period,
  href,
  hrefLabel,
  note,
  unresolved = 0,
  breakdown,
}: SummaryCardProps) {
  const t = await getT();
  const linkLabel = hrefLabel ?? t("dashboard.seeDetail");
  const style = DIRECTION[direction];
  const { Icon } = style;
  const showBreakdown = breakdown && breakdown.length > 1;

  return (
    <Card style={CARD}>
      <div style={HEAD_ROW}>
        <h3 style={HEADING} title={explanation}>
          {title}
        </h3>
        <span style={{ ...CHIP_BASE, ...style.chip }}>
          <Icon size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
          {t(style.word)}
        </span>
      </div>

      <p style={{ ...AMOUNT, color: style.value }}>
        {style.sign}
        {formatCurrency(amount, "IDR")}
      </p>
      <p style={PERIOD}>{period}</p>

      <p style={EXPLANATION}>{explanation}</p>

      {note && <p style={NOTE}>{note}</p>}

      {showBreakdown && (
        <ul style={BREAKDOWN}>
          {breakdown.map((b) => (
            <li key={b.currency} style={BREAKDOWN_ROW}>
              <span style={{ color: "var(--ant-color-text-secondary)" }}>
                {t("dashboard.breakdownDocs", { currency: b.currency, count: b.count })}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ant-color-text)" }}>
                {formatCurrency(b.outstandingBase, "IDR")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {unresolved > 0 && (
        <p style={UNRESOLVED}>
          <HelpCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
          <span>
            {t("dashboard.unresolvedBefore", { count: unresolved })}{" "}
            <strong>{t("dashboard.unresolvedStrong")}</strong>{" "}
            {t("dashboard.unresolvedAfter")}
          </span>
        </p>
      )}

      <Link href={href} style={LINK}>
        {linkLabel} <span aria-hidden="true">→</span>
      </Link>
    </Card>
  );
}
