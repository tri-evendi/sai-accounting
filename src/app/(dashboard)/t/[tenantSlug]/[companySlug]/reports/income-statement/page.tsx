/**
 * Laba/Rugi bertingkat (issue #123) — dikonversi ke `StaticTable.rowCells` +
 * token AntD pada issue #198, mengikuti pola yang dibuktikan Neraca di #233.
 *
 * ── Baris seksi & subtotal bukan sel data ─────────────────────────────────
 * Susunan laporan ini berselang-seling: judul seksi ("Pendapatan") · akun ·
 * subtotal · anak tangga ("Laba Kotor") · seksi berikutnya. Semuanya kini satu
 * larik baris DATAR bertanda `kind`, dan `rowCells` yang memutuskan mana yang
 * membentang dua kolom. Judul seksi memakai `scope: "colgroup"` (judul kelompok
 * baris di bawahnya), label subtotal & anak tangga `scope: "row"` (judul bagi
 * angka di sebelahnya) — tanpa itu pembaca layar membacakan "Pendapatan"
 * sebagai sel data tanpa konteks di tengah tabel.
 *
 * Tabel ini juga MENDAPAT judul kolom yang dulu tidak ada, dengan alasan yang
 * sama seperti Neraca: `scope` baru berarti sesuatu bila kolomnya punya nama.
 *
 * ── Bentuk laporannya tetap milik `statement-layout.ts` ───────────────────
 * `incomeStatementLayout()` yang memutuskan anak tangga mana yang dicetak, dan
 * ia dipakai bersama PDF & lembar sebarnya. Berkas ini tidak menambahkan satu
 * pun aturan bentuk sendiri.
 *
 * ── Laba/rugi di kaki memakai `Money tone` ────────────────────────────────
 * Dulu selnya menulis `formatCurrency` sendiri dengan kelas warna, karena
 * pewarnaan bawaan `Money` hanya menyentuh nilai negatif — sedangkan di sini
 * arahnya ditentukan LABA vs RUGI. `tone` (#186) menyatakan arah itu secara
 * eksplisit, jadi nominalnya kembali lewat satu aturan uang. Penanda
 * non-warnanya tetap kata "(Laba)"/"(Rugi)" di sebelah labelnya.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getIncomeStatement } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { StaticTable, type SummaryCell } from "@/components/ui/static-table";
import { Money } from "@/components/ui/money";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { resolvePeriod } from "@/lib/report-catalog";
import { parseCostCenterFilter } from "@/lib/cost-centers";
import { costCenterFilterLabel, costCenterFilterOptions } from "@/lib/cost-center-options";
import { incomeStatementSummary } from "@/lib/report-summary";
import { grossMarginPct, incomeStatementLayout } from "@/lib/statement-layout";
import { formatDate, formatNumber } from "@/lib/utils";
import type { StatementLine } from "@/lib/reports";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { getT } from "@/lib/i18n/server";
import { InfoCircleOutlined } from "@ant-design/icons";
export const dynamic = "force-dynamic";

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

/** Baris seksi: pita bertekanan — pemisah visual antar kelompok akun. */
const SECTION_ROW: React.CSSProperties = {
  background: "var(--ant-color-fill-quaternary)",
  fontWeight: STRONG,
};

/** Subtotal seksi: tebal saja. */
const SUBTOTAL_ROW: React.CSSProperties = { fontWeight: STRONG };

/**
 * Anak tangga (Laba Kotor · Laba Usaha): digaris di ATAS dan ditebalkan, supaya
 * mata menemukan ketiga hasilnya tanpa membaca baris akun di antaranya — itulah
 * seluruh gunanya laporan bertingkat.
 */
const STEP_ROW: React.CSSProperties = {
  borderTop: "2px solid var(--ant-color-border)",
  fontWeight: STRONG,
};

/**
 * Satu baris laporan. Bentuknya DATAR dan bertanda `kind` karena `StaticTable`
 * menerima satu larik baris: seksi, akun, subtotal, anak tangga, dan penanda
 * "bagian ini kosong" semuanya harus muat di tipe yang sama.
 */
type StatementRow = {
  key: string;
  kind: "section" | "line" | "subtotal" | "step" | "none";
  label?: string;
  code?: string;
  name?: string;
  /** Keterangan kecil di samping label anak tangga — mis. marjin kotor. */
  note?: string;
  /** Sengaja opsional: baris seksi & penanda kosong tidak punya angka. */
  amount?: number;
};

/** Seksi lengkap: judulnya, akun-akunnya, lalu subtotalnya. */
function section(
  id: string,
  title: string,
  totalLabel: string,
  lines: StatementLine[],
  total: number
): StatementRow[] {
  return [
    { key: `${id}-head`, kind: "section", label: title },
    ...(lines.length === 0
      ? [{ key: `${id}-none`, kind: "none" as const, label: "—" }]
      : lines.map((l, i) => ({
          key: `${id}-${l.code || i}`,
          kind: "line" as const,
          code: l.code,
          name: l.name,
          amount: l.amount,
        }))),
    { key: `${id}-total`, kind: "subtotal", label: totalLabel, amount: total },
  ];
}

export default async function IncomeStatementPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string; costCenter?: string }>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);
  // issue #91 — pilahan per pusat biaya. Laba/Rugi SAJA (bukan Neraca): tanpa
  // akun antar-unit, neraca yang disaring tak lagi seimbang.
  const costCenter = parseCostCenterFilter(sp.costCenter);
  const [costCenterOptions, costCenterName] = await Promise.all([
    costCenterFilterOptions(),
    costCenterFilterLabel(sp.costCenter),
  ]);
  const is = await getIncomeStatement(from, to, undefined, costCenter);
  const profit = is.netIncome >= 0;
  // Saringan AKTIF tapi labelnya tak ditemukan (pusat biaya terhapus / id
  // salah ketik namun lolos parse): laporan tetap tersaring, jadi tandanya
  // tidak boleh hilang — tanpa nama, pusat biayanya disebut `#<id>`.
  const costCenterLabel =
    costCenter !== undefined ? costCenterName ?? `#${costCenter}` : null;
  // Dipakai dokumen cetak & ringkasan bahasa awam — keduanya masih bahasa
  // Indonesia (lib/pdf, lib/report-summary). Pusat biaya yang sedang dipilih
  // ikut TERCETAK: satu laporan yang hanya memuat sebagian angka tanpa
  // mengatakannya adalah cara termudah salah dibaca setelah dicetak.
  const periodLabel =
    `Periode ${formatDate(from)} – ${formatDate(to)}` +
    (costCenterLabel ? ` · Pusat Biaya: ${costCenterLabel}` : "");

  // One payload feeds both exports and the plain-language summary, so the PDF,
  // the Excel file, the sentence and the table below can never disagree.
  const payload: StatementPayload = {
    kind: "income-statement",
    period: periodLabel,
    sales: is.sales,
    cogs: is.cogs,
    grossProfit: is.grossProfit,
    operatingExpense: is.operatingExpense,
    operatingProfit: is.operatingProfit,
    otherIncome: is.otherIncome,
    otherExpense: is.otherExpense,
    netIncome: is.netIncome,
  };
  const summary = incomeStatementSummary(is, periodLabel, t);
  // Which steps of the ladder this company's chart of accounts actually supports
  // — the same helper the PDF and the spreadsheet ask, so the three agree.
  const layout = incomeStatementLayout(is);
  const marginPct = grossMarginPct(is.grossProfit, is.sales.total);
  const marginNote =
    marginPct === null
      ? undefined
      : t("reports.grossMarginNote", { pct: formatNumber(Math.round(marginPct * 10) / 10) });

  const sectionTotal = (name: string) => t("reports.sectionTotal", { section: name });

  /*
   * Bertingkat (issue #123): Penjualan − HPP = Laba Kotor, − Beban Operasional
   * = Laba Usaha, ± lain-lain = Laba Bersih. Urutan inilah laporannya;
   * menjumlahkan HPP dan gaji ke dalam satu "Beban" menghapus marjin kotor —
   * angka pertama yang dibaca perusahaan dagang. Bagian yang tak berisi akun
   * tidak dicetak (lihat `statement-layout.ts`).
   */
  const rows: StatementRow[] = [
    ...section(
      "revenue",
      t("reports.sectionRevenue"),
      sectionTotal(t("reports.sectionRevenue")),
      is.sales.lines,
      is.sales.total
    ),
    ...(layout.showCogs
      ? section(
          "cogs",
          t("reports.sectionCogs"),
          sectionTotal(t("reports.sectionCogs")),
          is.cogs.lines,
          is.cogs.total
        )
      : []),
    ...(layout.showGrossProfit
      ? [
          {
            key: "gross-profit",
            kind: "step" as const,
            label: t("reports.grossProfitRow"),
            note: marginNote,
            amount: is.grossProfit,
          },
        ]
      : []),
    ...section(
      "opex",
      t("reports.sectionOperatingExpense"),
      sectionTotal(t("reports.sectionOperatingExpense")),
      is.operatingExpense.lines,
      is.operatingExpense.total
    ),
    ...(layout.showOperatingProfit
      ? [
          {
            key: "operating-profit",
            kind: "step" as const,
            label: t("reports.operatingProfitRow"),
            amount: is.operatingProfit,
          },
        ]
      : []),
    ...(layout.showOtherIncome
      ? section(
          "other-income",
          t("reports.sectionOtherIncome"),
          sectionTotal(t("reports.sectionOtherIncome")),
          is.otherIncome.lines,
          is.otherIncome.total
        )
      : []),
    ...(layout.showOtherExpense
      ? section(
          "other-expense",
          t("reports.sectionOtherExpense"),
          sectionTotal(t("reports.sectionOtherExpense")),
          is.otherExpense.lines,
          is.otherExpense.total
        )
      : []),
  ];

  const columns: SaiColumns<StatementRow> = [
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
    moneyColumn<StatementRow>({
      dataIndex: "amount",
      title: t("reports.colStatementAmount"),
    }),
  ];

  /*
   * Kolom `amount` sengaja TIDAK disebut di baris subtotal & anak tangga:
   * `rowCells` membiarkan kolom yang tak disebut menggambar dirinya sendiri,
   * jadi angkanya tetap datang dari `moneyColumn` — satu aturan uang, bukan
   * dua.
   */
  const rowCells = (row: StatementRow): Record<string, SummaryCell> | undefined => {
    if (row.kind === "section") {
      return { item: { content: row.label, colSpan: 2, scope: "colgroup" } };
    }
    if (row.kind === "none") {
      return { item: { content: <span style={LINE_INDENT}>{row.label}</span>, colSpan: 2 } };
    }
    if (row.kind === "subtotal") {
      return { item: { content: row.label, scope: "row" } };
    }
    if (row.kind === "step") {
      return {
        item: {
          content: (
            <>
              {row.label}
              {/* Marjin kotor sengaja teks di samping angkanya, bukan kolom
                  kedua: laporan ini dokumen dua kolom, dan persentase yang
                  hanya dimiliki SATU baris tidak layak satu kolom sendiri. */}
              {row.note && (
                <span
                  style={{
                    marginInlineStart: 8,
                    fontSize: "var(--ant-font-size-sm)",
                    fontWeight: "normal",
                    color: "var(--ant-color-text-secondary)",
                  }}
                >
                  ({row.note})
                </span>
              )}
            </>
          ),
          scope: "row",
        },
      };
    }
    return undefined;
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.incomeStatementTitle") },
        ]}
        title={t("reports.incomeStatementTitle")}
        description={t("reports.periodWithCurrency", {
          from: formatDate(from),
          to: formatDate(to),
        })}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <PeriodFilter
        basePath="/reports/income-statement"
        from={fromISO}
        to={toISO}
        costCenterOptions={costCenterOptions}
        costCenter={sp.costCenter ?? ""}
      />

      {/* Dua kalimat, dan keduanya perlu (issue #98). Yang pertama menjanjikan
          rekonsiliasi: apa pun pilahannya, jumlahnya tetap total. Yang kedua
          menyebutkan APA yang belum ikut berdimensi — HPP tanpa tanda,
          penyusutan, kontrak, uang muka. Tanpa kalimat kedua, laporan cabang
          yang berisi pendapatan tanpa sebagian harga pokoknya terlihat persis
          seperti laporan yang lengkap, dan itulah pola kegagalan yang paling
          berbahaya: bukan angka yang salah, melainkan angka yang benar untuk
          pertanyaan yang berbeda dari yang dikira pembacanya. */}
      {costCenterLabel && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 16,
            padding: 12,
            borderRadius: "var(--ant-border-radius)",
            background: "var(--ant-color-fill-quaternary)",
            color: "var(--ant-color-text-secondary)",
          }}
        >
          <p style={{ margin: 0 }}>{t("costCenters.filterNote")}</p>
          <p style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: 0 }}>
            <InfoCircleOutlined aria-hidden="true" style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }} />
            <span>{t("costCenters.filterScopeNote")}</span>
          </p>
        </div>
      )}

      <PlainSummary summary={summary} />

      <Card>
        <StaticTable<StatementRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.key}
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
          summary={[
            {
              cells: {
                item: {
                  content: (
                    <>
                      {t("reports.netIncomeRow")}
                      <span
                        style={{
                          marginInlineStart: 8,
                          fontSize: "var(--ant-font-size-sm)",
                          color: profit
                            ? "var(--ant-color-money-positive)"
                            : "var(--ant-color-money-negative)",
                        }}
                      >
                        ({profit ? t("reports.profit") : t("reports.loss")})
                      </span>
                    </>
                  ),
                  scope: "row",
                },
                amount: (
                  <Money
                    value={is.netIncome}
                    currency="IDR"
                    tone={profit ? "positive" : "negative"}
                  />
                ),
              },
            },
          ]}
        />
      </Card>
    </div>
  );
}
