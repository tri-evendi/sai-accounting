/**
 * Tabel laporan Arus Kas untuk LAYAR (issue #241).
 *
 * ── Kenapa ia komponen sendiri, bukan bagian halamannya ────────────────────
 * Karena penjaga bentuknya harus bisa MERENDERNYA. Sebelum ini bentuk layar
 * hidup di dalam `page.tsx` — sebuah server component async yang membaca Prisma,
 * sesi, dan kamus — jadi satu-satunya cara mengujinya adalah menyalin logikanya
 * ke dalam tes, dan salinan yang setuju dengan dirinya sendiri tidak menjaga
 * apa pun. Di sini ia fungsi murni atas `StatementPayload`: **payload yang sama
 * persis** yang dikirim tombol PDF dan tombol Excel. Ketiga permukaan kini
 * memakan satu masukan dan satu penentu bentuk (`cashFlowLayout()`), dan
 * `tests/cash-flow-shape.test.ts` membandingkan keluarannya baris demi baris.
 *
 * Tetap SERVER component: tidak ada `"use client"`, tidak ada impor `antd`
 * runtime. Halaman laporan tetap HTML.
 *
 * ── Yang sengaja TIDAK berubah dari #198 ───────────────────────────────────
 *  • **Arah kas tidak pernah disampaikan warna saja.** `Flow` membawa ikon
 *    panah + tanda +/− + teks tersembunyi ("masuk"/"keluar"); nol tampil "–"
 *    berlabel "Nihil", bukan "Rp 0".
 *  • **Kelompok "Belum Terkategori"** tetap berpita peringatan dengan lencana
 *    BERTEKS, bukan sekadar latar kuning.
 *  • Judul kelompok `scope="colgroup"`, label subtotal `scope="row"`.
 */
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { moneyColumn } from "@/components/ui/money-column";
import { StaticTable, type SummaryCell } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { cashFlowLayout, type CashFlowLabels, type CashFlowLayoutRow } from "@/lib/statement-layout";
import { formatCurrency } from "@/lib/utils";
import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined, WarningOutlined } from "@ant-design/icons";

export type CashFlowPayload = Extract<StatementPayload, { kind: "cash-flow" }>;

/** Penerjemah halaman, diteruskan apa adanya (server → server, tanpa serialisasi). */
export type T = (key: DictionaryKey, values?: Record<string, string | number>) => string;

const ICON_SIZE = 14;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

/** Terbaca pembaca layar, tak memakan ruang di layar. */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const LINE_INDENT: React.CSSProperties = {
  paddingInlineStart: 24,
  color: "var(--ant-color-text-secondary)",
};

const CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  marginInlineEnd: 8,
  color: "var(--ant-color-text-secondary)",
};

/** Baris kelompok biasa vs kelompok yang minta ditinjau. */
const GROUP_ROW: React.CSSProperties = {
  background: "var(--ant-color-fill-quaternary)",
  fontWeight: STRONG,
};
const GROUP_ROW_REVIEW: React.CSSProperties = {
  background: "var(--ant-color-warning-bg)",
  fontWeight: STRONG,
};
const STRONG_ROW: React.CSSProperties = { fontWeight: STRONG };

/**
 * Money with an explicit direction. Colour alone never carries the meaning — an
 * arrow icon and a +/− sign say the same thing, per the design system's
 * "jangan pernah mengandalkan warna saja".
 *
 * Sengaja BUKAN `Money`/`MoneyCell` (issue #52): pewarnaan di sini mengikuti
 * arah kas (masuk hijau / keluar merah, token uang #186) dan selalu disertai
 * ikon panah + tanda +/−, sedangkan `Money` hanya mewarnai nilai negatif. Nol
 * pun tampil sebagai ikon "–" berlabel "Nihil", bukan "Rp 0".
 */
export function Flow({ amount, t }: { amount: number; t: T }) {
  if (Math.round(amount * 100) === 0) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 4,
          fontVariantNumeric: "tabular-nums",
          color: "var(--ant-color-text-secondary)",
        }}
      >
        <MinusOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE }} />
        <span style={VISUALLY_HIDDEN}>{t("reports.flowNil")}</span>
      </span>
    );
  }
  const inflow = amount > 0;
  const Icon = inflow ? ArrowDownOutlined : ArrowUpOutlined;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 4,
        fontVariantNumeric: "tabular-nums",
        color: inflow
          ? "var(--ant-color-money-positive)"
          : "var(--ant-color-money-negative)",
      }}
    >
      <Icon aria-hidden="true" style={{ fontSize: ICON_SIZE, flexShrink: 0 }} />
      <span style={VISUALLY_HIDDEN}>{inflow ? t("reports.flowIn") : t("reports.flowOut")}</span>
      <span>
        {inflow ? "+" : "−"}
        {formatCurrency(Math.abs(amount), "IDR")}
      </span>
    </span>
  );
}

/**
 * Label baris dari kamus. Nilai Indonesia-nya SAMA PERSIS dengan
 * `CASH_FLOW_PRINT_LABELS`, dan itu yang membuat penjaga bentuk bisa
 * membandingkan layar dengan cetakan tanpa tabel padanan.
 */
function screenLabels(t: T): CashFlowLabels {
  const group: Record<string, DictionaryKey> = {
    operating: "cashFlowCategory.operating",
    investing: "cashFlowCategory.investing",
    financing: "cashFlowCategory.financing",
    uncategorised: "cashFlowCategory.uncategorised",
  };
  return {
    opening: t("reports.openingCashRow"),
    closing: t("reports.closingCashRow"),
    total: t("reports.netCashRow"),
    empty: t("reports.noCashMovement"),
    subtotal: (name) => t("reports.groupSubtotal", { group: name }),
    // Kategori tak dikenal tidak mungkin lolos `tsc`, tapi kalau kamusnya
    // suatu saat tertinggal, label cetakannya lebih baik daripada kunci mentah.
    group: (category, printLabel) =>
      group[category] ? t(group[category]) : printLabel,
  };
}

/**
 * Sel nominal layar. Tiga keadaan, dan ketiganya berbeda:
 *  • `null` — kolom ini tidak berlaku untuk baris ini (kas awal periode bukan
 *    arus masuk) → sel KOSONG;
 *  • `0` — berlaku tapi tidak bergerak → "—", bukan "Rp 0";
 *  • sisanya — nominalnya.
 */
function amountCell(value: number | null) {
  return value === null ? null : <Money value={value || undefined} currency="IDR" />;
}

export function CashFlowStatement({ payload, t }: { payload: CashFlowPayload; t: T }) {
  const rows = cashFlowLayout(payload, screenLabels(t));

  const columns: SaiColumns<CashFlowLayoutRow> = [
    {
      key: "item",
      title: t("reports.colSourceUse"),
      align: "left",
      render: (_raw, row) =>
        row.kind === "line" ? (
          <span style={LINE_INDENT}>
            {row.code ? <span style={CODE_STYLE}>{row.code}</span> : null}
            {row.name}
          </span>
        ) : (
          row.label
        ),
    },
    {
      ...moneyColumn<CashFlowLayoutRow>({ dataIndex: "inflow", title: t("reports.colCashIn") }),
      render: (_v, row) => amountCell(row.inflow),
    },
    {
      ...moneyColumn<CashFlowLayoutRow>({ dataIndex: "outflow", title: t("reports.colCashOut") }),
      render: (_v, row) => amountCell(row.outflow),
    },
    {
      key: "net",
      dataIndex: "net",
      title: t("reports.colCashNet"),
      align: "right",
      // Kas awal & akhir adalah SALDO, bukan arus — panah arah di sana akan
      // menyatakan sesuatu yang tidak benar. Sisanya arus, dan membawa arahnya.
      render: (_v, row) =>
        row.net === null ? null : row.kind === "opening" || row.kind === "closing" ? (
          <Money value={row.net} currency="IDR" />
        ) : (
          <Flow amount={row.net} t={t} />
        ),
    },
  ];

  const rowCells = (row: CashFlowLayoutRow): Record<string, SummaryCell> | undefined => {
    if (row.kind === "group") {
      const review = row.category === "uncategorised";
      return {
        item: {
          content: (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {row.label}
                {review && (
                  <Badge variant="warning">
                    <WarningOutlined aria-hidden="true" style={{ fontSize: 12, marginInlineEnd: 4 }} />
                    {t("reports.needsReview")}
                  </Badge>
                )}
              </span>
              {review && (
                <p
                  style={{
                    margin: 0,
                    marginTop: 4,
                    fontSize: "var(--ant-font-size-sm)",
                    fontWeight: "normal",
                    color: "var(--ant-color-money-pending)",
                  }}
                >
                  {t("reports.uncategorisedHint")}
                </p>
              )}
            </>
          ),
          colSpan: 4,
          scope: "colgroup",
        },
      };
    }
    if (row.kind === "empty") {
      return {
        item: { content: <span style={LINE_INDENT}>{row.label}</span>, colSpan: 4 },
      };
    }
    // Kas awal, kas akhir, dan subtotal kelompok MENAMAI barisnya; angkanya
    // tetap digambar kolomnya sendiri (lihat `spannedCells` di StaticTable).
    if (row.kind === "opening" || row.kind === "closing" || row.kind === "subtotal") {
      return { item: { content: row.label, scope: "row" } };
    }
    return undefined;
  };

  // Baris terakhir `cashFlowLayout()` selalu barisan kaki — di layar ia prop
  // `summary`, di cetakan `foot` autoTable, di lembar sebar baris terakhir.
  const total = rows[rows.length - 1];

  return (
    <StaticTable<CashFlowLayoutRow>
      columns={columns}
      rows={rows.slice(0, -1)}
      rowKey={(row) => `${row.kind}:${row.category ?? "-"}:${row.code ?? ""}`}
      rowCells={rowCells}
      rowStyle={(row) =>
        row.kind === "group"
          ? row.category === "uncategorised"
            ? GROUP_ROW_REVIEW
            : GROUP_ROW
          : row.kind === "subtotal" || row.kind === "opening" || row.kind === "closing"
            ? STRONG_ROW
            : undefined
      }
      summary={[
        {
          cells: {
            item: {
              content: (
                <>
                  {total.label}
                  {/* Rekonsiliasi: lencana di layar, tanda kurung di cetakan —
                      anotasi yang sama, bentuk yang berbeda per permukaan. */}
                  <span style={{ marginInlineStart: 8, verticalAlign: "middle" }}>
                    {payload.reconciled ? (
                      <Badge variant="success">{t("reports.matchesLedger")}</Badge>
                    ) : (
                      <Badge variant="danger">{t("reports.doesNotMatch")}</Badge>
                    )}
                  </span>
                </>
              ),
              scope: "row",
            },
            inflow: amountCell(total.inflow),
            outflow: amountCell(total.outflow),
            net: total.net === null ? null : <Flow amount={total.net} t={t} />,
          },
        },
      ]}
    />
  );
}
