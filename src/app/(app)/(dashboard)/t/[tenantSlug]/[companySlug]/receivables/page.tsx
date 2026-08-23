/**
 * Piutang (AR) — who owes us, how much is left, and how old it is (issue #12).
 *
 * Read-only: nothing here writes and nothing here posts. Balances come from the
 * source documents via `@/lib/receivables`, whose header explains why every
 * cross-document total is expressed in IDR base.
 *
 * ── Konversi ke token Ant Design (issue #197, fase C5) ─────────────────────
 * **Tetap server component**, jadi `antd` tidak boleh diimpor di sini
 * (`tests/rsc-boundary.test.ts`) dan `theme.useToken()` tidak tersedia. Warna
 * datang dari dua sumber saja: primitif yang mewarnai dirinya sendiri (`Money`,
 * `Badge`, `Card`) dan variabel `--ant-…` yang HANYA dipakai di dalam pohon
 * komponen AntD — di sini selalu di dalam `<Card>`. Alasan panjangnya ada di
 * kepala `components/shared/aging.tsx`.
 *
 * **Kolomnya tetap disusun dari `agingColumns()`.** Tabelnya kini `StaticTable`
 * (#189), yang berarti kolom menjadi DATA — dan justru karena itu godaan
 * menuliskan daftar kolom kedua di sini menjadi besar. Tidak: `columnFor()` di
 * bawah memetakan SATU id kolom ke satu kolom tabel, dan urutannya datang dari
 * penentu yang sama yang dipakai PDF dan lembar sebarnya. Pratinjau yang
 * memperlihatkan kolom berbeda dari berkasnya adalah bug yang baru ditutup.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { getReceivables, type ReceivableRow } from "@/lib/receivables";
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { lastSentByInvoice } from "@/lib/invoice-send";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { LearnMore } from "@/components/ui/learn-more";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LedgerFilter } from "@/components/shared/ledger-filter";
import { AgeCell, AgingSummary, PaymentStatusBadge, PartyTotals } from "@/components/shared/aging";
import { formatDateShort } from "@/lib/utils";
import { FileDoneOutlined } from "@ant-design/icons";
import { getT } from "@/lib/i18n/server";
import { agingPayload } from "@/lib/report-payload";
import { reportById, resolveColumns } from "@/lib/report-catalog";
import { agingColumns, type AgingColumnId } from "@/lib/statement-layout";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";

export const dynamic = "force-dynamic";

/**
 * Jarak yang tidak bisa dibaca dari token di sini — berkas ini tanpa hook dan
 * tanpa `antd`. Nilainya SAMA dengan token yang seharusnya dipakai, dan
 * disebut supaya #203 bisa menukarnya tanpa menebak: `marginLG` 24,
 * `marginXS` 8, `margin` 16.
 */
const SECTION_GAP = 24;
const LINK_GAP_X = 20;
const LINK_GAP_Y = 8;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** `max-w-56` lama: syarat pembayaran teks bebas yang dipotong, bukan dibiarkan
 *  mendorong lebar kolom dokumen. */
const TERMS_MAX_WIDTH = 224;

/** Keterangan kecil di bawah isi sel — ukuran & warna sekunder, bukan warna saja. */
const subtleStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-secondary)",
};

const numericStyle: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ReceivablesPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ asOf?: string; overdue?: string; cols?: string }>;
}) {
  await requirePagePermission("receivable.read", params);
  const t = await getT();
  const sp = await searchParams;
  // `asOf` sampah dari URL yang diedit tangan menghasilkan Invalid Date, yang
  // membuat `ageInDays` NaN dan MENJATUHKAN semua baris ke ember ">90 hari"
  // tanpa satu pun galat (audit 2026-07) — validasi dulu, mundur ke hari ini.
  const asOfRaw = sp.asOf ?? todayISO();
  const asOfStr = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) && !Number.isNaN(new Date(`${asOfRaw}T00:00:00`).getTime())
    ? asOfRaw
    : todayISO();
  const asOf = new Date(`${asOfStr}T23:59:59.999`);
  const overdueOnly = sp.overdue === "1";

  const { rows, aging, byParty, overdueCount } = await getReceivables({ asOf, overdueOnly });

  // Payload cetak dari baris yang SAMA dengan tabel di bawah — termasuk saringan
  // "hanya jatuh tempo" yang sedang aktif. Berkas yang memuat kumpulan dokumen
  // berbeda dari layarnya adalah cara termudah dua orang membaca satu laporan
  // dan berdebat tentang angka yang berbeda.
  const definition = reportById("receivables");
  const payload = agingPayload(
    "receivables",
    asOf,
    rows,
    aging,
    definition ? resolveColumns(definition, sp.cols) : []
  );

  /*
   * Faktur tertunggak yang TIDAK PERNAH DIKIRIM (issue #465).
   *
   * Penanda, bukan kolom baru: susunan kolom halaman ini juga menyusun kolom
   * BERKAS EKSPOR-nya (`agingColumns`), jadi kolom ke-sembilan di sini akan
   * mengubah bentuk berkas yang sudah dipakai orang. Yang ditambahkan karena
   * itu satu kata di dalam sel nomor dokumen.
   *
   * Dan itu memang kalimat yang paling berguna di halaman ini: sebuah piutang
   * yang fakturnya belum pernah sampai ke pelanggan bukan pelanggan yang
   * menunggak — itu pekerjaan kita sendiri yang belum selesai, dan ia terbaca
   * sama saja dengan tunggakan sungguhan sampai ada yang menuliskannya.
   */
  const invoiceIds = rows.filter((r) => r.kind === "invoice").map((r) => r.id);
  const sentInvoices = await lastSentByInvoice(invoiceIds);

  // Susunan kolom layar = susunan kolom berkasnya. Satu penentu, tiga permukaan.
  const cols = agingColumns(payload);
  const HEADERS: Record<AgingColumnId, string> = {
    party: t("common.customer"),
    documentNo: t("common.document"),
    date: t("common.date"),
    dueDate: t("common.dueDate"),
    age: t("common.age"),
    status: t("common.status"),
    total: t("receivables.colDocumentValue"),
    outstanding: t("common.remainingIdr"),
  };

  /** Satu id kolom -> satu kolom tabel; tidak ada daftar kolom kedua. */
  function columnFor(id: AgingColumnId): SaiColumns<ReceivableRow>[number] {
    switch (id) {
      case "documentNo":
        return {
          key: id,
          dataIndex: "documentNo",
          title: HEADERS[id],
          align: "left",
          render: (_v, r) => (
            <>
              <Link href={r.href} style={{ color: "var(--ant-color-link)" }}>
                {r.documentNo}
              </Link>
              <span style={subtleStyle}>
                {r.kind === "invoice"
                  ? t("receivables.docTypeInvoice")
                  : t("receivables.docTypeContract")}
              </span>
              {r.kind === "invoice" && !sentInvoices.has(r.id) && (
                <span style={subtleStyle}>{t("invoiceSend.neverSent")}</span>
              )}
              {/* Free text, straight from top1/top2 — informational only. */}
              {r.terms && (
                <span
                  style={{
                    ...subtleStyle,
                    maxWidth: TERMS_MAX_WIDTH,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={r.terms}
                >
                  {r.terms}
                </span>
              )}
            </>
          ),
        };
      case "date":
        return {
          key: id,
          dataIndex: "date",
          title: HEADERS[id],
          align: "left",
          render: (_v, r) => <span style={numericStyle}>{formatDateShort(r.date)}</span>,
        };
      case "dueDate":
        return {
          key: id,
          dataIndex: "dueDate",
          title: HEADERS[id],
          align: "left",
          render: (_v, r) =>
            r.dueDate ? (
              <span style={numericStyle}>{formatDateShort(r.dueDate)}</span>
            ) : (
              // Tanpa jatuh tempo bukan "0 hari lagi" — dikatakan sebagai kata.
              <span style={{ color: "var(--ant-color-text-secondary)" }}>
                {t("common.notFilledIn")}
              </span>
            ),
        };
      case "age":
        return {
          key: id,
          dataIndex: "ageDays",
          title: HEADERS[id],
          align: "left",
          // `AgeCell` menandai umur SEJAK APA ia dihitung di setiap baris —
          // "30 hari sejak diterbitkan" dan "30 hari lewat jatuh tempo" adalah
          // dua pernyataan berbeda yang tak boleh berbagi satu angka telanjang.
          render: (_v, r) => <AgeCell days={r.ageDays} fromIssue={r.ageFromIssue} />,
        };
      case "status":
        return {
          key: id,
          dataIndex: "status",
          title: HEADERS[id],
          align: "left",
          render: (_v, r) => <PaymentStatusBadge status={r.status} />,
        };
      case "total":
        return {
          key: id,
          dataIndex: "total",
          title: HEADERS[id],
          align: "right",
          render: (_v, r) => (
            <>
              <Money value={r.total} currency={r.currency} />
              {r.currency !== "IDR" && <span style={subtleStyle}>{r.currency}</span>}
            </>
          ),
        };
      case "outstanding":
        return {
          key: id,
          dataIndex: "outstandingBase",
          title: HEADERS[id],
          align: "right",
          render: (_v, r) => (
            <>
              {/* Dokumen valas tanpa kurs TIDAK punya nilai IDR. Ia disebut
                  dengan kata — menuliskannya 0 menyusutkan total tanpa suara. */}
              {r.outstandingBase == null ? (
                <span style={{ color: "var(--ant-color-money-pending)" }}>
                  {t("common.rateMissing")}
                </span>
              ) : (
                <Money
                  value={r.outstandingBase}
                  currency="IDR"
                  style={{ fontWeight: "var(--ant-font-weight-strong)" }}
                />
              )}
              {/* Only shown when every payment shared the document's currency —
                  otherwise there is no single-currency remainder to state. */}
              {r.outstanding != null && r.currency !== "IDR" && (
                <span style={subtleStyle}>
                  <Money value={r.outstanding} currency={r.currency} />
                </span>
              )}
            </>
          ),
        };
      case "party":
      default:
        return {
          key: "party",
          dataIndex: "partyName",
          title: HEADERS.party,
          align: "left",
        };
    }
  }

  const columns: SaiColumns<ReceivableRow> = cols.map(columnFor);

  return (
    <div>
      <PageHeader
        title={<TermTooltip term="piutang">{t("receivables.title")}</TermTooltip>}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
        description={
          <>
            {t("receivables.description", { date: formatDateShort(asOf) })}
            {overdueCount > 0 && !overdueOnly && (
              <> {t("common.overdueDocs", { count: overdueCount })}</>
            )}
          </>
        }
      />
      {/* issue #21 — jalan pintas ke penjelasan istilah layar ini. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          columnGap: LINK_GAP_X,
          rowGap: LINK_GAP_Y,
          marginBottom: SECTION_GAP,
        }}
      >
        <LearnMore term="piutang" />
        <LearnMore term="umur_piutang" />
        <LearnMore term="jatuh_tempo" />
      </div>

      <LedgerFilter basePath="/receivables" asOf={asOfStr} overdueOnly={overdueOnly} />

      <AgingSummary
        buckets={aging.buckets}
        total={aging.total}
        unresolved={aging.unresolved}
        caption={t("receivables.agingCaption")}
      />

      <PartyTotals rows={byParty} title={t("receivables.partyTotalsTitle")} />

      <Card>
        <StaticTable<ReceivableRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.kind}-${r.id}`}
          empty={
            <EmptyState
              icon={<FileDoneOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={overdueOnly ? t("receivables.emptyOverdue") : t("receivables.emptyAll")}
            />
          }
        />
      </Card>
    </div>
  );
}
