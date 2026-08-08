/**
 * Tabel Neraca untuk LAYAR (issue #258).
 *
 * ── Kenapa ia komponen sendiri, bukan bagian halamannya ────────────────────
 * Alasan yang sama dengan `<CashFlowStatement>` di #241: penjaga bentuknya
 * harus bisa MERENDERNYA. Selama bentuk layar hidup di dalam `page.tsx` — server
 * component async yang membaca Prisma, sesi, dan kamus — satu-satunya cara
 * mengujinya adalah menyalin logikanya ke dalam tes, dan salinan yang setuju
 * dengan dirinya sendiri tidak menjaga apa pun. Di sini ia fungsi murni atas
 * `StatementPayload`: **payload yang sama persis** yang dikirim tombol PDF dan
 * tombol Excel di sebelahnya. Ketiga permukaan memakan satu masukan dan satu
 * penentu bentuk (`balanceSheetLayout()`), dan
 * `tests/balance-sheet-shape.test.ts` membandingkan keluarannya baris demi
 * baris.
 *
 * Tetap SERVER component: tidak ada `"use client"`, tidak ada impor `antd`
 * runtime. Halaman laporan tetap HTML.
 *
 * ── Yang sengaja TIDAK berubah dari #233 ───────────────────────────────────
 *  • Baris seksi memakai `scope="colgroup"` (judul kelompok baris di bawahnya)
 *    dan label subtotal `scope="row"` (judul bagi angka di sebelahnya) — "Aset"
 *    yang membentang dua kolom sebagai sel data dibacakan pembaca layar sebagai
 *    angka tanpa konteks di tengah tabel.
 *  • Indentasi akun DI DALAM sel, bukan lewat padding sel — kerapatan sel milik
 *    primitifnya.
 *
 * ── Yang BERUBAH: lencana keseimbangan pindah ke baris penutupnya ──────────
 * Dulu ia berdiri sendiri di atas tabel, jauh dari dua angka yang ia hakimi.
 * Sekarang ia menempel pada "Total Liabilitas + Ekuitas", tepat di bawah "Total
 * Aset" — sehingga kata "Seimbang" bisa DIPERIKSA, bukan hanya dipercaya. Di
 * cetakan hal yang sama disampaikan tanda kurung (`balanceSheetBalanceNote()`).
 */
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { moneyColumn } from "@/components/ui/money-column";
import { StaticTable, type SummaryCell } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import {
  balanceSheetLayout,
  splitBalanceSheetRows,
  type BalanceSheetLabels,
  type BalanceSheetLayoutRow,
} from "@/lib/statement-layout";

export type BalanceSheetPayload = Extract<StatementPayload, { kind: "balance-sheet" }>;

/** Penerjemah halaman, diteruskan apa adanya (server → server, tanpa serialisasi). */
export type T = (key: DictionaryKey, values?: Record<string, string | number>) => string;

const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

/** Indentasi akun DI DALAM sel, bukan lewat padding sel. */
const LINE_INDENT: React.CSSProperties = {
  paddingInlineStart: 16,
  color: "var(--ant-color-text-secondary)",
};

const CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  marginInlineEnd: 8,
  color: "var(--ant-color-text-secondary)",
};

/** Baris seksi: pita bertekanan, tebal — pemisah visual antar kelompok akun. */
const SECTION_ROW: React.CSSProperties = {
  background: "var(--ant-color-fill-quaternary)",
  fontWeight: STRONG,
};

/** Baris subtotal: tebal saja, seperti subtotal di PDF & lembar sebarnya. */
const SUBTOTAL_ROW: React.CSSProperties = { fontWeight: STRONG };

/**
 * Label baris dari kamus. Nilai Indonesia-nya SAMA PERSIS dengan
 * `BALANCE_SHEET_PRINT_LABELS`, dan itu yang membuat penjaga bentuk bisa
 * membandingkan layar dengan cetakan tanpa tabel padanan.
 */
function screenLabels(t: T): BalanceSheetLabels {
  return {
    assets: t("reports.sectionAssets"),
    liabilities: t("reports.sectionLiabilities"),
    equity: t("reports.sectionEquity"),
    sectionTotal: (section) => t("reports.sectionTotal", { section }),
    currentNetIncome: t("reports.currentNetIncome"),
    empty: t("reports.noAccountsInSection"),
    totalAssets: t("reports.totalAssets"),
    totalLiabilitiesEquity: t("reports.totalLiabilitiesEquity"),
  };
}

export function BalanceSheetStatement({ payload, t }: { payload: BalanceSheetPayload; t: T }) {
  const { body, foot } = splitBalanceSheetRows(balanceSheetLayout(payload, screenLabels(t)));

  const columns: SaiColumns<BalanceSheetLayoutRow> = [
    {
      key: "item",
      title: t("common.description"),
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
    moneyColumn<BalanceSheetLayoutRow>({
      dataIndex: "amount",
      title: t("reports.colStatementAmount"),
    }),
  ];

  /*
   * Baris seksi, kalimat "tidak ada akun", & subtotal. Kolom `amount` sengaja
   * TIDAK disebut di baris subtotal: `rowCells` membiarkan kolom yang tak
   * disebut menggambar dirinya sendiri, jadi angkanya tetap datang dari
   * `moneyColumn` — satu aturan uang, bukan dua.
   */
  const rowCells = (row: BalanceSheetLayoutRow): Record<string, SummaryCell> | undefined => {
    if (row.kind === "section") {
      return { item: { content: row.label, colSpan: 2, scope: "colgroup" } };
    }
    if (row.kind === "empty") {
      return { item: { content: <span style={LINE_INDENT}>{row.label}</span>, colSpan: 2 } };
    }
    if (row.kind === "subtotal") {
      return { item: { content: row.label, scope: "row" } };
    }
    return undefined;
  };

  // Baris kaki terakhir membawa klaim neraca, jadi ia yang membawa lencananya.
  const verdict = foot.length - 1;

  return (
    <StaticTable<BalanceSheetLayoutRow>
      columns={columns}
      rows={body}
      rowKey={(row) => `${row.kind}:${row.section ?? "-"}:${row.code ?? ""}`}
      rowCells={rowCells}
      rowStyle={(row) =>
        row.kind === "section" ? SECTION_ROW : row.kind === "subtotal" ? SUBTOTAL_ROW : undefined
      }
      /*
       * Kaki tidak punya baris data di belakangnya, jadi angkanya ditulis di
       * sini — `Money`, bukan angka mentah, supaya aturan uang MASTER.md tetap
       * satu-satunya jalan nominal muncul di layar.
       */
      summary={foot.map((row, i) => ({
        cells: {
          item: {
            content:
              i === verdict ? (
                <>
                  {row.label}
                  {/* Keseimbangan: lencana di layar, tanda kurung di cetakan —
                      anotasi yang sama, bentuk yang berbeda per permukaan. */}
                  <span style={{ marginInlineStart: 8, verticalAlign: "middle" }}>
                    {payload.balanced ? (
                      <Badge variant="success">{t("reports.balanceSheetBalanced")}</Badge>
                    ) : (
                      <Badge variant="danger">{t("reports.balanceSheetUnbalanced")}</Badge>
                    )}
                  </span>
                </>
              ) : (
                row.label
              ),
            scope: "row" as const,
          },
          amount: <Money value={row.amount} currency="IDR" />,
        },
      }))}
    />
  );
}
