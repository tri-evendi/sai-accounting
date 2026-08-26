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
 * ── BERPERIODE sejak issue #492 ─────────────────────────────────────────────
 * Halaman ini dulu hanya bisa menjawab "per hari ini": periodenya ditulis mati
 * sebagai `new Date()`. Maka pertanyaan yang paling sering ditanyakan akuntan
 * pada akhir tahun — "berapa nilai persediaan saya per 31 Desember?" — tidak
 * punya jawaban, dan angkanya berubah setiap kali tanggal berganti sehingga tak
 * ada yang bisa dilampirkan ke SPT.
 *
 * Alasan penundaannya dulu ("'per tanggal' yang jujur menuntut mesin costing
 * bertanggal") sudah tidak berlaku: mesin itu ADA dan sudah dipakai jalur
 * posting — `averageUnitCostForItem(itemId, asOf)`. Modul `stock-value-report`
 * memakai fungsi yang sama, bukan menulis aturan costing kedua.
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
import { getStockValuePeriodReport } from "@/lib/stock-report";
import { PeriodFilter } from "../report-filters";
import { resolvePeriod, columnLabels } from "@/lib/report-catalog";
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { ContainerOutlined, InfoCircleOutlined } from "@ant-design/icons";
export const dynamic = "force-dynamic";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
const ICON_SIZE = 16;

/** Satu baris laporan — bentuk yang dibaca kolom di bawah. */
type StockValueRow = Awaited<ReturnType<typeof getStockValuePeriodReport>>["rows"][number];

export default async function StockValueReportPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ cols?: string; from?: string; to?: string }>;
}) {
  // Izin PERSEDIAAN, bukan `report.read`: isinya data stok, dan sebuah laporan
  // tidak melonggarkan siapa yang boleh melihat datanya.
  await requirePagePermission("inventory.read", params);
  const t = await getT();
  const sp = await searchParams;

  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);
  const report = await getStockValuePeriodReport(from, to);
  const definition = reportById("stock-value");
  const visibleColumns = definition ? resolveColumns(definition, sp.cols) : [];

  const payload: StatementPayload = {
    kind: "stock-value",
    period: `${formatDate(from)} — ${formatDate(to)}`,
    rows: report.rows,
    /* Nilai pada AKHIR periode: angka yang dicocokkan ke neraca per tanggal itu,
       bukan penjumlahan mutasi. */
    totalValue: report.totalClosingValue,
    revaluation: report.totalRevaluation,
    uncostedCount: report.uncostedCount,
    visibleColumns,
  };

  const cols = stockValueColumns(payload);
  /* Judul kolom DITURUNKAN dari katalog (#324): pilihan kuncinya hidup di
     satu tempat, jadi tidak ada kunci kedua yang bisa menyimpang. */
  const HEADERS = columnLabels<StockValueColumnId>("stock-value", t);

  /** Satu id kolom -> satu kolom tabel. Tidak ada id yang tak punya bentuk. */
  function columnFor(id: StockValueColumnId): SaiColumns<StockValueRow>[number] {
    switch (id) {
      case "code":
        /* Kode di kolomnya sendiri (#493): dua barang boleh bernama sama, dan
           tanpa kode dua barisnya tampak identik bagi pembaca laporan. */
        return {
          ...textColumn<StockValueRow>({ dataIndex: "code", title: HEADERS.code }),
          render: (raw) => (
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{String(raw)}</span>
          ),
        };
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
      case "openingQty":
        return qtyColumn<StockValueRow>({ dataIndex: "openingQty", title: HEADERS.openingQty });
      case "inQty":
        return qtyColumn<StockValueRow>({ dataIndex: "inQty", title: HEADERS.inQty });
      case "outQty":
        return qtyColumn<StockValueRow>({ dataIndex: "outQty", title: HEADERS.outQty });
      case "closingQty":
        return qtyColumn<StockValueRow>({ dataIndex: "closingQty", title: HEADERS.closingQty });
      case "openingValue":
        return moneyColumn<StockValueRow>({
          dataIndex: "openingValue",
          title: HEADERS.openingValue,
        });
      case "inValue":
        return moneyColumn<StockValueRow>({ dataIndex: "inValue", title: HEADERS.inValue });
      case "outValue":
        return moneyColumn<StockValueRow>({ dataIndex: "outValue", title: HEADERS.outValue });
      case "closingValue":
        /* Ditebalkan: dari sebelas kolom, INI angka yang dicari orang, dan ini
           pula yang harus sama dengan persediaan di neraca per tanggal itu. */
        return {
          ...moneyColumn<StockValueRow>({
            dataIndex: "closingValue",
            title: HEADERS.closingValue,
          }),
          render: (_v, r) => (
            <Money
              value={r.closingValue}
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
    closingValue: <Money value={report.totalClosingValue} currency="IDR" />,
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
        /* Deskripsinya ikut berubah bersama isinya (#492): laporan ini bukan
           lagi potret "saat ini" melainkan sepanjang periode, beserta mutasinya. */
        description={t("inventory.periodValueTitle")}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <PeriodFilter basePath="/reports/stock-value" from={fromISO} to={toISO} />

      <Card>
        {/* `StaticTable`: laporan ini hanya MENAMPILKAN — tak ada satu pun
            kendali di dalam tabelnya, jadi tidak ada yang dibeli dengan
            memindahkan seluruh barisnya ke peramban. */}
        <StaticTable<StockValueRow>
          columns={columns}
          rows={report.rows}
            /* KODE, bukan nama (#493): nama sudah boleh kembar, dan dua baris
             berkunci sama membuat React salah memasangkan barisnya. */
          rowKey={(r) => r.code}
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
      {/* Selisih penilaian (#492): ditampakkan, bukan diratakan. Nilai akhir
          sengaja dihitung dari saldo × rata-rata supaya SAMA dengan neraca —
          konsekuensinya `awal + masuk − keluar` tidak selalu menutup, dan
          selisih itulah yang dijelaskan di sini alih-alih disembunyikan. */}
      {report.totalRevaluation !== 0 && (
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
          <span>
            {t("inventory.revaluationNote", {
              amount: formatCurrency(report.totalRevaluation, "IDR"),
            })}
          </span>
        </p>
      )}

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
