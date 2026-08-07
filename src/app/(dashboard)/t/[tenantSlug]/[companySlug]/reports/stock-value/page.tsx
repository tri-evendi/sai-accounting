/**
 * Nilai Persediaan — saldo & nilai tiap komoditas (katalog: `stock-value`).
 *
 * ── Kenapa halaman sendiri, bukan `/inventory` ───────────────────────────────
 * Kartu katalog ini dulu menunjuk halaman modul persediaan. Halaman itu tempat
 * BEKERJA: berkartu ringkasan, bergrafik, dan terpaginasi sepuluh baris — dan
 * sepuluh baris pertama bukan laporan nilai persediaan. Laporan harus memuat
 * seluruh barang sekaligus, karena satu-satunya angka yang dicari orang di sini
 * adalah TOTALNYA, dan total yang hanya menjumlahkan satu halaman adalah angka
 * yang salah tanpa satu pun tanda.
 *
 * Baca-saja. Nilainya memakai biaya rata-rata tertimbang — fungsi yang sama
 * dengan mesin HPP (`weightedAverageUnitCost`), jadi neraca dan laporan ini
 * tidak bisa memakai biaya berbeda untuk barang yang sama.
 *
 * ── Konversi ke `StaticTable` + token AntD (issue #198) ────────────────────
 * **Tetap server component.** Kolomnya disusun dari daftar id `stockValueColumns()`
 * (penentu yang sama dengan PDF & lembar sebarnya), satu id → satu kolom lewat
 * `columnFor` — bukan daftar kolom kedua di sebelahnya.
 *
 * Barang tanpa dasar biaya tetap "—" dan bukan "Rp 0", dan sekarang itu datang
 * dari `moneyColumn`/`Money` yang memang menulis "—" untuk nilai tak diketahui
 * — satu aturan uang, bukan satu cabang `null` di halaman ini.
 *
 * **Saldo BUKAN uang.** `qtyColumn` (`Decimal(15,3)`): rata kanan + tabular-nums
 * + format id-ID, tanpa "Rp".
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getStockValueReport } from "@/lib/stock-report";
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import { Money } from "@/components/ui/money";
import { qtyColumn, textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { reportById, resolveColumns } from "@/lib/report-catalog";
import { stockValueColumns, type StockValueColumnId } from "@/lib/statement-layout";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { ContainerOutlined, InfoCircleOutlined } from "@ant-design/icons";
export const dynamic = "force-dynamic";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
const ICON_SIZE = 16;

/** Satu baris laporan — bentuk yang dibaca kolom di bawah. */
type StockValueRow = Awaited<ReturnType<typeof getStockValueReport>>["rows"][number];

export default async function StockValueReportPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ cols?: string }>;
}) {
  // Izin PERSEDIAAN, bukan `report.read`: isinya data stok, dan sebuah laporan
  // tidak melonggarkan siapa yang boleh melihat datanya.
  await requirePagePermission("inventory.read", params);
  const t = await getT();
  const sp = await searchParams;

  const report = await getStockValueReport();
  const definition = reportById("stock-value");
  const visibleColumns = definition ? resolveColumns(definition, sp.cols) : [];

  const payload: StatementPayload = {
    kind: "stock-value",
    // Tanpa parameter tanggal: ini POSISI SAAT INI. Biaya rata-rata tertimbang
    // dihitung dari seluruh riwayat gerakan, jadi "per tanggal" yang jujur
    // menuntut mesin costing bertanggal — bukan sekadar saringan di layar ini.
    period: `Per ${formatDate(new Date())}`,
    rows: report.rows,
    totalValue: report.totalValue,
    uncostedCount: report.uncostedCount,
    visibleColumns,
  };

  const cols = stockValueColumns(payload);
  const HEADERS: Record<StockValueColumnId, string> = {
    name: t("common.item"),
    unit: t("common.unit"),
    currentStock: t("inventory.colCurrentStock"),
    unitCost: t("inventory.colUnitCost"),
    stockValue: t("inventory.colValue"),
  };

  /** Satu id kolom -> satu kolom tabel. Tidak ada id yang tak punya bentuk. */
  function columnFor(id: StockValueColumnId): SaiColumns<StockValueRow>[number] {
    switch (id) {
      case "unit":
        return {
          ...textColumn<StockValueRow>({ dataIndex: "unit", title: HEADERS.unit }),
          // Satuan kosong ditulis "-": selnya memang tak berisi, dan itu berbeda
          // dari satuan yang belum diketahui.
          render: (raw) => (
            <span style={{ color: "var(--ant-color-text-secondary)" }}>
              {raw ? String(raw) : "-"}
            </span>
          ),
        };
      case "currentStock":
        return qtyColumn<StockValueRow>({
          dataIndex: "currentStock",
          title: HEADERS.currentStock,
        });
      case "unitCost":
        return moneyColumn<StockValueRow>({ dataIndex: "unitCost", title: HEADERS.unitCost });
      case "stockValue":
        return {
          ...moneyColumn<StockValueRow>({ dataIndex: "stockValue", title: HEADERS.stockValue }),
          render: (_v, r) => (
            <Money
              value={r.stockValue}
              currency="IDR"
              style={{ fontWeight: "var(--ant-font-weight-strong)" }}
            />
          ),
        };
      case "name":
      default:
        return {
          ...textColumn<StockValueRow>({ dataIndex: "name", title: HEADERS.name }),
          render: (raw) => (
            <span style={{ fontWeight: "var(--ant-font-weight-strong)" }}>{String(raw)}</span>
          ),
        };
    }
  }

  const columns: SaiColumns<StockValueRow> = cols.map(columnFor);

  // Baris total dipetakan per KUNCI kolom, jadi ia ikut menyusut bersama
  // pilihan kolom pengguna dan tak bisa meleset satu kolom.
  const summary: Record<string, React.ReactNode> = {
    name: t("common.total"),
    stockValue: <Money value={report.totalValue} currency="IDR" />,
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.stock_value.title") },
        ]}
        title={
          <TermTooltip term="persediaan">{t("reports.catalogReport.stock_value.title")}</TermTooltip>
        }
        description={t("inventory.stockValueTitle")}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <Card>
        {/* `StaticTable`: laporan ini hanya MENAMPILKAN — tak ada satu pun
            kendali di dalam tabelnya, jadi tidak ada yang dibeli dengan
            memindahkan seluruh barisnya ke peramban. */}
        <StaticTable<StockValueRow>
          columns={columns}
          rows={report.rows}
          rowKey={(r) => r.name}
          summary={summary}
          empty={
            <EmptyState
              icon={<ContainerOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("inventory.emptyTitle")}
              description={t("inventory.emptyDescription")}
            />
          }
        />
      </Card>

      {/* Barang bersaldo tanpa dasar biaya tidak ikut dijumlahkan; mengatakannya
          adalah yang menjaga total ini jujur, bukan membuatnya tampak lengkap. */}
      {report.uncostedCount > 0 && (
        <p
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            marginTop: 12,
            marginBottom: 0,
            color: "var(--ant-color-text-secondary)",
          }}
        >
          <InfoCircleOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, flexShrink: 0, marginTop: 2 }} />
          <span>{t("inventory.uncostedNote", { count: report.uncostedCount })}</span>
        </p>
      )}
    </div>
  );
}
