/**
 * Tabel Laba/Rugi bertingkat untuk LAYAR (issue #274).
 *
 * ── Kenapa ia komponen sendiri, bukan bagian halamannya ────────────────────
 * Alasan yang sama dengan `<CashFlowStatement>` (#241), `<BalanceSheetStatement>`
 * (#258) dan `<TrialBalanceStatement>` (#275): penjaga bentuknya harus bisa
 * MERENDERNYA. Selama bentuk layar hidup di dalam `page.tsx` — server component
 * async yang membaca Prisma, sesi, dan kamus — satu-satunya cara mengujinya
 * adalah menyalin logikanya ke dalam tes, dan salinan yang setuju dengan dirinya
 * sendiri tidak menjaga apa pun. Di sini ia fungsi murni atas `StatementPayload`:
 * **payload yang sama persis** yang dikirim tombol PDF dan tombol Excel di
 * sebelahnya. Ketiga permukaan memakan satu masukan dan satu penentu bentuk
 * (`incomeStatementLayout()`), dan `tests/income-statement-shape.test.ts`
 * membandingkan keluarannya baris demi baris.
 *
 * Halaman ini sampai #274 punya penolong `section()` LOKALNYA sendiri — kembaran
 * persis dari yang dicabut dari Neraca di #273. Ia ikut mati di sini.
 *
 * Tetap SERVER component: tidak ada `"use client"`, tidak ada impor `antd`
 * runtime. Halaman laporan tetap HTML.
 *
 * ── Yang sengaja TIDAK berubah dari #198 ───────────────────────────────────
 *  • Judul band memakai `scope="colgroup"` (judul kelompok baris di bawahnya),
 *    label subtotal & anak tangga `scope="row"` (judul bagi angka di
 *    sebelahnya) — tanpa itu pembaca layar membacakan "Pendapatan" sebagai sel
 *    data tanpa konteks di tengah tabel.
 *  • Anak tangga (Laba Kotor · Laba Usaha) digaris di ATAS dan ditebalkan,
 *    supaya mata menemukan ketiga hasilnya tanpa membaca baris akun di
 *    antaranya — itulah seluruh gunanya laporan bertingkat.
 *  • Nominal baris penutup memakai `Money tone`: arahnya ditentukan LABA vs
 *    RUGI, bukan tandanya, dan penanda non-warnanya adalah anotasi
 *    "(Laba)"/"(Rugi)" di sebelah labelnya — anotasi yang kini juga tercetak.
 */
import { Money } from "@/components/ui/money";
import { moneyColumn } from "@/components/ui/money-column";
import { StaticTable, type SummaryCell } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import {
  incomeStatementLayout,
  splitIncomeStatementRows,
  type IncomeStatementLabels,
  type IncomeStatementLayoutRow,
} from "@/lib/statement-layout";
import { formatNumber } from "@/lib/utils";

export type IncomeStatementPayload = Extract<StatementPayload, { kind: "income-statement" }>;

/** Penerjemah halaman, diteruskan apa adanya (server → server, tanpa serialisasi). */
export type T = (key: DictionaryKey, values?: Record<string, string | number>) => string;

const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

/** Indentasi akun DI DALAM sel — kerapatan sel milik primitif. */
const LINE_INDENT: React.CSSProperties = {
  paddingInlineStart: 24,
  color: "var(--ant-color-text-secondary)",
};

const CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  marginInlineEnd: 8,
  color: "var(--ant-color-text-secondary)",
};

/** Baris band: pita bertekanan — pemisah visual antar kelompok akun. */
const SECTION_ROW: React.CSSProperties = {
  background: "var(--ant-color-fill-quaternary)",
  fontWeight: STRONG,
};

/** Subtotal band: tebal saja. */
const SUBTOTAL_ROW: React.CSSProperties = { fontWeight: STRONG };

/** Anak tangga: digaris di atas dan ditebalkan — lihat kepala berkas. */
const STEP_ROW: React.CSSProperties = {
  borderTop: "2px solid var(--ant-color-border)",
  fontWeight: STRONG,
};

/**
 * Label baris dari kamus. Nilai Indonesia-nya SAMA PERSIS dengan
 * `INCOME_STATEMENT_PRINT_LABELS`, dan itu yang membuat penjaga bentuk bisa
 * membandingkan layar dengan cetakan tanpa tabel padanan.
 *
 * Inilah perbaikan i18n issue #274: lembar sebar dan PDF dulu menuliskan "LABA
 * KOTOR"/"LABA USAHA"/"LABA BERSIH" sebagai string mati, jadi pengguna berbahasa
 * Inggris atau Mandarin mendapat laporan yang setengahnya Indonesia. Sekarang
 * ketiganya membaca dari satu penentu, dan layar memasok terjemahannya.
 */
function screenLabels(t: T): IncomeStatementLabels {
  return {
    sales: t("reports.sectionRevenue"),
    cogs: t("reports.sectionCogs"),
    operatingExpense: t("reports.sectionOperatingExpense"),
    otherIncome: t("reports.sectionOtherIncome"),
    otherExpense: t("reports.sectionOtherExpense"),
    sectionTotal: (section) => t("reports.sectionTotal", { section }),
    grossProfit: t("reports.grossProfitRow"),
    operatingProfit: t("reports.operatingProfitRow"),
    netIncome: t("reports.netIncomeRow"),
    empty: t("reports.noAccountsInSection"),
    grossMargin: (pct) => t("reports.grossMarginNote", { pct: formatNumber(pct) }),
    result: (profit) => (profit ? t("reports.profit") : t("reports.loss")),
  };
}

/**
 * Anotasi di samping label — marjin kotor, arah hasil. Kecil, berbobot biasa,
 * dalam tanda kurung; di cetakan bentuknya tanda kurung yang sama tanpa gaya.
 */
function Note({ text, color }: { text: string; color?: string }) {
  return (
    <span
      style={{
        marginInlineStart: 8,
        fontSize: "var(--ant-font-size-sm)",
        fontWeight: "normal",
        color: color ?? "var(--ant-color-text-secondary)",
      }}
    >
      ({text})
    </span>
  );
}

export function IncomeStatementTable({ payload, t }: { payload: IncomeStatementPayload; t: T }) {
  const { body, foot } = splitIncomeStatementRows(
    incomeStatementLayout(payload, screenLabels(t))
  );
  const profit = payload.netIncome >= 0;

  const columns: SaiColumns<IncomeStatementLayoutRow> = [
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
    moneyColumn<IncomeStatementLayoutRow>({
      dataIndex: "amount",
      title: t("reports.colStatementAmount"),
    }),
  ];

  /*
   * Kolom `amount` sengaja TIDAK disebut di baris subtotal & anak tangga:
   * `rowCells` membiarkan kolom yang tak disebut menggambar dirinya sendiri,
   * jadi angkanya tetap datang dari `moneyColumn` — satu aturan uang, bukan dua.
   */
  const rowCells = (row: IncomeStatementLayoutRow): Record<string, SummaryCell> | undefined => {
    if (row.kind === "section") {
      return { item: { content: row.label, colSpan: 2, scope: "colgroup" } };
    }
    if (row.kind === "empty") {
      return { item: { content: <span style={LINE_INDENT}>{row.label}</span>, colSpan: 2 } };
    }
    if (row.kind === "subtotal" || row.kind === "step") {
      return {
        item: {
          content: (
            <>
              {row.label}
              {/* Marjin kotor sengaja teks di samping angkanya, bukan kolom
                  kedua: laporan ini dokumen dua kolom, dan persentase yang
                  hanya dimiliki SATU baris tidak layak satu kolom sendiri. */}
              {row.note === undefined ? null : <Note text={row.note} />}
            </>
          ),
          scope: "row",
        },
      };
    }
    return undefined;
  };

  return (
    <StaticTable<IncomeStatementLayoutRow>
      columns={columns}
      rows={body}
      rowKey={(row) => `${row.kind}:${row.section ?? row.step ?? "-"}:${row.code ?? ""}`}
      rowCells={rowCells}
      rowStyle={(row) =>
        row.kind === "section"
          ? SECTION_ROW
          : row.kind === "subtotal"
            ? SUBTOTAL_ROW
            : row.kind === "step"
              ? STEP_ROW
              : undefined
      }
      /*
       * Kaki tidak punya baris data di belakangnya, jadi angkanya ditulis di
       * sini — `Money`, bukan angka mentah, supaya aturan uang MASTER.md tetap
       * satu-satunya jalan nominal muncul di layar.
       */
      summary={foot.map((row) => ({
        cells: {
          item: {
            content: (
              <>
                {row.label}
                {row.note === undefined ? null : (
                  <Note
                    text={row.note}
                    color={
                      profit
                        ? "var(--ant-color-money-positive)"
                        : "var(--ant-color-money-negative)"
                    }
                  />
                )}
              </>
            ),
            scope: "row" as const,
          },
          amount: (
            <Money value={row.amount} currency="IDR" tone={profit ? "positive" : "negative"} />
          ),
        },
      }))}
    />
  );
}
