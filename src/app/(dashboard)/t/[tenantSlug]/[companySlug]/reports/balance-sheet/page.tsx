/**
 * Neraca — pemakai pertama `StaticTable.rowCells` (issue #233).
 *
 * ── Kenapa halaman ini yang dipindah ───────────────────────────────────────
 * Sebelumnya ia menggambar baris seksinya sendiri sebagai `<TableCell
 * colSpan={2}>` mentah di dalam `<TableBody>` — persis bentuk yang tidak bisa
 * dilakukan `StaticTable`, dan persis alasan #198 (laporan) tersendat. Sebuah
 * prop tanpa pemanggil nyata adalah API kosong, jadi prop itu dibuktikan di
 * sini, di SATU laporan; tiga laporan lain (Neraca Saldo, Laba/Rugi, Arus Kas)
 * sengaja TIDAK disentuh — itu lingkup #198.
 *
 * ── Baris seksi bukan sel data ─────────────────────────────────────────────
 * "Aset" yang membentang dua kolom sebagai `<td>` dibacakan pembaca layar
 * sebagai sel data tanpa konteks di tengah tabel, dan tak satu pun angka di
 * bawahnya terhubung kepadanya. Karena itu baris seksi memakai
 * `scope: "colgroup"` (judul kelompok baris di bawahnya) dan label subtotal
 * memakai `scope: "row"` (judul bagi angka di sebelahnya). Keduanya tetap
 * bergaya sel ISI — alasan panjangnya di kepala `table.tsx`.
 *
 * Tabel ini juga MENDAPAT judul kolom yang dulu tidak ada: `scope` baru berarti
 * sesuatu bila kolomnya punya nama, dan tabel angka tanpa baris judul kolom
 * tidak bisa dinavigasi pembaca layar sama sekali. Judulnya sama dengan judul
 * lembar sebarnya ("Keterangan" · "Jumlah (IDR)").
 *
 * (Nama tag HTML-nya sengaja tidak ditulis di komentar ini: penjaga
 * `tests/design-system-primitives.test.ts` menelusuri berkas halaman dengan
 * pencocokan teks, dan sebuah tag di dalam komentar terbaca sebagai tabel
 * mentah.)
 *
 * ── TEMUAN yang TIDAK diselesaikan di sini ─────────────────────────────────
 * Susunan seksi Neraca hidup di TIGA tempat yang saling lepas hari ini:
 *
 *   1. layar — berkas ini;
 *   2. lembar sebar — `buildBalanceSheetSheet()` di `src/lib/report-export.ts`;
 *   3. PDF — cabang `kind === "balance-sheet"` di `src/lib/pdf/statement-pdf.ts`.
 *
 * `src/lib/statement-layout.ts` — yang disebut #198 sebagai penentu bersama —
 * TIDAK memuat Neraca sama sekali; isinya hanya bentuk Laba/Rugi bertingkat dan
 * daftar kolom laporan bertipe daftar. Jadi berkas ini BUKAN salinan keempat:
 * ia menulis ulang salinan ketiga yang memang sudah ada. Menyatukan ketiganya
 * menyentuh `report-export.ts` dan `statement-pdf.ts`, keduanya di luar lingkup
 * PR ini, dan ketiganya sudah berbeda isi hari ini (baris penutup, penempatan
 * "Total Aset", dan teks bagian kosong) — dilaporkan sebagai isu tersendiri.
 */

import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getBalanceSheet } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StaticTable, type SummaryCell } from "@/components/ui/static-table";
import { Money } from "@/components/ui/money";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { AsOfFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { resolveAsOf } from "@/lib/report-catalog";
import { balanceSheetSummary } from "@/lib/report-summary";
import { formatDate } from "@/lib/utils";
import type { StatementLine } from "@/lib/reports";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Satu baris Neraca. Bentuknya DATAR dan bertanda `kind` karena `StaticTable`
 * menerima satu larik baris: seksi, akun, subtotal, dan penanda "bagian ini
 * kosong" semuanya harus muat di tipe yang sama.
 */
type StatementRow = {
  key: string;
  kind: "section" | "line" | "subtotal" | "none";
  label?: string;
  code?: string;
  name?: string;
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

/** Indentasi akun DI DALAM sel, bukan lewat padding sel — kerapatan sel milik primitif. */
const LINE_INDENT: React.CSSProperties = {
  paddingInlineStart: 16,
  color: "var(--ant-color-text-secondary)",
};

const CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  marginInlineEnd: 8,
  color: "var(--ant-color-text-secondary)",
};

const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

/** Baris seksi: pita bertekanan, tebal — pemisah visual antar kelompok akun. */
const SECTION_ROW: React.CSSProperties = {
  background: "var(--ant-color-fill-quaternary)",
  fontWeight: STRONG,
};

/** Baris subtotal: tebal saja, seperti subtotal di PDF & lembar sebarnya. */
const SUBTOTAL_ROW: React.CSSProperties = { fontWeight: STRONG };

export default async function BalanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { asOf, asOfISO } = resolveAsOf(sp.asOf);
  const bs = await getBalanceSheet(asOf);
  // Judul periode untuk dokumen cetak & ringkasan bahasa awam — keduanya
  // masih berbahasa Indonesia (lib/pdf, lib/report-summary).
  const asOfLabel = `Per ${formatDate(asOf)}`;

  const payload: StatementPayload = {
    kind: "balance-sheet",
    period: asOfLabel,
    assets: bs.assets,
    liabilities: bs.liabilities,
    equity: bs.equity,
    totalAssets: bs.totalAssets,
    totalLiabilities: bs.totalLiabilities,
    totalEquity: bs.totalEquity,
    netIncome: bs.netIncome,
    totalLiabilitiesEquity: bs.totalLiabilitiesEquity,
    balanced: bs.balanced,
  };
  const summary = balanceSheetSummary(bs, asOfLabel, t);

  const sectionTotal = (name: string) => t("reports.sectionTotal", { section: name });

  const rows: StatementRow[] = [
    ...section(
      "assets",
      t("reports.sectionAssets"),
      sectionTotal(t("reports.sectionAssets")),
      bs.assets,
      bs.totalAssets
    ),
    ...section(
      "liabilities",
      t("reports.sectionLiabilities"),
      sectionTotal(t("reports.sectionLiabilities")),
      bs.liabilities,
      bs.totalLiabilities
    ),
    // Akumulasi laba masuk KE DALAM seksi ekuitas, sebelum totalnya —
    // "Total Ekuitas" yang tidak memuat laba adalah angka yang berbeda dari
    // PDF/Excel/ringkasan di halaman yang sama (mereka selalu menjumlahkannya).
    // Satu label, satu angka, empat media.
    ...section(
      "equity",
      t("reports.sectionEquity"),
      sectionTotal(t("reports.sectionEquity")),
      [...bs.equity, { code: "", name: t("reports.currentNetIncome"), amount: bs.netIncome }],
      bs.totalEquity + bs.netIncome
    ),
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
   * Baris seksi & subtotal. Kolom `amount` sengaja TIDAK disebut di baris
   * subtotal: `rowCells` membiarkan kolom yang tak disebut menggambar dirinya
   * sendiri, jadi angkanya tetap datang dari `moneyColumn` — satu aturan uang,
   * bukan dua.
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
    return undefined;
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.balanceSheetTitle") },
        ]}
        title={t("reports.balanceSheetTitle")}
        description={t("reports.asOfWithCurrency", { date: formatDate(asOf) })}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <AsOfFilter basePath="/reports/balance-sheet" asOf={asOfISO} />

      <PlainSummary summary={summary} />

      <div style={{ marginBottom: "var(--ant-margin)" }}>
        {bs.balanced ? (
          <Badge variant="success">{t("reports.balanceSheetBalanced")}</Badge>
        ) : (
          <Badge variant="danger">{t("reports.balanceSheetUnbalanced")}</Badge>
        )}
      </div>

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
                : undefined
          }
          /*
           * Kaki tidak punya baris data di belakangnya, jadi angkanya ditulis
           * di sini — `Money`, bukan angka mentah, supaya aturan uang MASTER.md
           * tetap satu-satunya jalan nominal muncul di layar.
           */
          summary={[
            {
              cells: {
                item: { content: t("reports.totalAssets"), scope: "row" },
                amount: <Money value={bs.totalAssets} currency="IDR" />,
              },
            },
            {
              cells: {
                item: { content: t("reports.totalLiabilitiesEquity"), scope: "row" },
                amount: <Money value={bs.totalLiabilitiesEquity} currency="IDR" />,
              },
            },
          ]}
        />
      </Card>
    </div>
  );
}
