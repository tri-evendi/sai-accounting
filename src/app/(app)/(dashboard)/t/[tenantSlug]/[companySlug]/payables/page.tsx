/**
 * Utang (AP) — who we owe, how much is left, and how old it is (issue #12).
 *
 * The supplier mirror of /receivables. Since issue #37 a payment can name the
 * purchase(s) it settles, so most rows here are backed by recorded allocations.
 * Payments made before that — and any unallocated remainder of a newer one —
 * still have to be spread by the old FIFO assumption (oldest purchase first);
 * rows carrying any of that estimate are badged "Perkiraan" rather than being
 * shown as fact. The per-supplier total is exact either way — see
 * `allocatePayments`.
 *
 * ── Konversi ke token Ant Design (issue #197, fase C5) ─────────────────────
 * **Tetap server component**; aturan warnanya identik dengan /receivables, dan
 * kolomnya tetap disusun dari `agingColumns()` — satu penentu untuk layar, PDF,
 * dan lembar sebar. Lihat kepala berkas piutang untuk alasan panjangnya.
 *
 * Dua catatan di halaman ini (uang muka pemasok & baris berperkiraan) berdiri
 * DI LUAR `<Card>`, tempat variabel `--ant-…` tidak teratasi. Karena itu
 * keduanya memakai IKON + KATA, bukan warna — jalan yang sama yang dipilih
 * `shared/aging.tsx` di #194.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { getPayables, type PayableRow } from "@/lib/receivables";
import { getAdvances, summarizeAdvances } from "@/lib/advances";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { LearnMore } from "@/components/ui/learn-more";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LedgerFilter } from "@/components/shared/ledger-filter";
import { AgeCell, AgingSummary, PaymentStatusBadge, PartyTotals } from "@/components/shared/aging";
import { formatDateShort } from "@/lib/utils";
import { FileTextOutlined, InfoCircleOutlined, VerticalAlignTopOutlined } from "@ant-design/icons";
import { getT } from "@/lib/i18n/server";
import { agingPayload } from "@/lib/report-payload";
import { reportById, resolveColumns, columnLabels } from "@/lib/report-catalog";
import { agingColumns, type AgingColumnId } from "@/lib/statement-layout";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `margin` 16 · `marginXS` 8 · `marginXXS` 4, ditulis sebagai
 *  angka karena berkas ini tak boleh memanggil `theme.useToken()`. */
const SECTION_GAP = 24;
const BLOCK_GAP = 16;
const LINK_GAP_X = 20;
const LINK_GAP_Y = 8;
const ICON_GAP = 8;
const EMPTY_ICON_SIZE = 48;
const TERMS_MAX_WIDTH = 224;
/** `max-w-48` lama — keterangan di sisi kanan kartu uang muka. */
const HINT_MAX_WIDTH = 192;

const subtleStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-secondary)",
};

const numericStyle: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** Catatan kaki di LUAR kartu: ikon + kata, tanpa warna (lihat kepala berkas). */
const noteStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: SECTION_GAP,
  display: "flex",
  alignItems: "flex-start",
  gap: ICON_GAP,
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function PayablesPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ asOf?: string; overdue?: string; cols?: string }>;
}) {
  await requirePagePermission("payable.read", params);
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

  const [{ rows, aging, byParty, overdueCount }, purchaseAdvances] = await Promise.all([
    getPayables({ asOf, overdueOnly }),
    // Uang muka pembelian still on account (issue #41). A RELATED balance, shown
    // beside the payable and never inside it: this money has already left the
    // bank and sits in an asset account, so netting it off the utang total would
    // understate what is still owed. It reduces a payable only when it is
    // compensated into a purchase — at which point `getPayables` already counts
    // it, via `advanceApplications`.
    getAdvances({ type: "purchase", openOnly: true }),
  ]);
  const advanceSummary = summarizeAdvances(purchaseAdvances);

  // Rows whose split leans on the FIFO fallback rather than a recorded allocation
  // (issue #37). Disclosed per row and in the banner — never presented as fact.
  const estimatedCount = rows.filter((r) => r.allocationEstimated).length;

  // Payload cetak dari baris yang SAMA dengan tabel di bawah — termasuk saringan
  // "hanya jatuh tempo" yang sedang aktif. Berkas yang memuat kumpulan dokumen
  // berbeda dari layarnya adalah cara termudah dua orang membaca satu laporan
  // dan berdebat tentang angka yang berbeda.
  const definition = reportById("payables");
  const payload = agingPayload(
    "payables",
    asOf,
    rows,
    aging,
    definition ? resolveColumns(definition, sp.cols) : []
  );

  // Susunan kolom layar = susunan kolom berkasnya. Satu penentu, tiga permukaan.
  const cols = agingColumns(payload);
  /* Judul kolom DITURUNKAN dari katalog (#324): pilihan kuncinya hidup di
     satu tempat, jadi tidak ada kunci kedua yang bisa menyimpang. */
  const HEADERS = columnLabels<AgingColumnId>("payables", t);

  /** Satu id kolom -> satu kolom tabel; tidak ada daftar kolom kedua. */
  function columnFor(id: AgingColumnId): SaiColumns<PayableRow>[number] {
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
              <span style={subtleStyle}>{t("payables.docTypePurchase")}</span>
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
          // Umur dari tanggal dokumen ditandai per baris — lihat `AgeCell`.
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
              {/* Pembelian valas tanpa kurs tidak punya nilai IDR — dikatakan
                  dengan kata, tidak pernah ditulis 0. */}
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
              {r.allocationEstimated && (
                <span style={{ display: "block", marginTop: 4 }}>
                  <span title={t("payables.estimateTitle")}>
                    <Badge variant="warning">{t("payables.estimateBadge")}</Badge>
                  </span>
                  {/* The fix, offered where the problem is noticed (issue #38):
                      this opens the allocation editor on the payment responsible,
                      so the guess can be replaced with fact without deleting and
                      re-posting the payment. */}
                  <Link
                    href={`${r.href}?alokasi=1`}
                    style={{
                      display: "block",
                      marginTop: 4,
                      fontSize: "var(--ant-font-size-sm)",
                      color: "var(--ant-color-link)",
                    }}
                  >
                    {t("payables.fixAllocation")}
                  </Link>
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

  const columns: SaiColumns<PayableRow> = cols.map(columnFor);

  return (
    <div>
      <PageHeader
        title={<TermTooltip term="utang">{t("payables.title")}</TermTooltip>}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
        description={
          <>
            {t("payables.description", { date: formatDateShort(asOf) })}
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
        <LearnMore term="utang" />
        <LearnMore term="uang_muka" />
        <LearnMore term="jatuh_tempo" />
      </div>

      <LedgerFilter basePath="/payables" asOf={asOfStr} overdueOnly={overdueOnly} />

      <AgingSummary
        buckets={aging.buckets}
        total={aging.total}
        unresolved={aging.unresolved}
        caption={t("payables.agingCaption")}
      />

      {/* Related balance: uang muka already paid to suppliers (issue #41). */}
      {advanceSummary.count > 0 && (
        <Card style={{ marginBottom: SECTION_GAP }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: BLOCK_GAP,
              padding: "var(--ant-padding)",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {/* Direction is stated in words and by the icon — not by colour. */}
                <VerticalAlignTopOutlined aria-hidden="true" />
                {t("payables.advanceLabel")}
              </p>
              <p
                style={{
                  margin: 0,
                  marginTop: 4,
                  fontSize: "var(--ant-font-size-heading-3)",
                  fontWeight: "var(--ant-font-weight-strong)",
                }}
              >
                <Money value={advanceSummary.outstandingBase} currency="IDR" />
              </p>
              <p style={{ margin: 0, marginTop: 4, maxWidth: "72ch" }}>
                <small style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("payables.advanceFrom", { count: advanceSummary.count })}{" "}
                  <strong>{t("payables.advanceNot")}</strong> {t("payables.advanceHintA")}{" "}
                  <em>{t("payables.advanceAsset")}</em>
                  {t("payables.advanceHintB")}{" "}
                  <strong>{t("payables.advanceCompensated")}</strong>{" "}
                  {t("payables.advanceHintC")}{" "}
                  <strong>{t("payables.advancePanel")}</strong> {t("payables.advanceHintD")}
                </small>
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0 }}>
                <small style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("payables.unratedLabel")}
                </small>
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--ant-font-size-heading-4)",
                  fontWeight: "var(--ant-font-weight-strong)",
                  ...numericStyle,
                }}
              >
                {advanceSummary.unresolvedCount}
              </p>
              <p style={{ margin: 0, marginTop: 2, maxWidth: HINT_MAX_WIDTH }}>
                <small style={{ color: "var(--ant-color-text-secondary)" }}>
                  {t("payables.unratedHint")}
                </small>
              </p>
            </div>
          </div>
          <p style={{ margin: 0, padding: "0 var(--ant-padding) var(--ant-padding)" }}>
            <Link
              href="/advances?type=purchase"
              style={{ fontSize: "var(--ant-font-size-sm)", color: "var(--ant-color-link)" }}
            >
              {t("payables.viewAllAdvances")}
            </Link>
          </p>
        </Card>
      )}

      {estimatedCount > 0 ? (
        <p style={noteStyle}>
          <InfoCircleOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <small>
            <strong>{t("payables.estRows", { count: estimatedCount })}</strong>{" "}
            {t("payables.estMarked")}{" "}
            <Badge variant="warning">{t("payables.estimateBadge")}</Badge>{" "}
            {t("payables.estHintA")} <strong>{t("payables.estOldestFirst")}</strong>
            {t("payables.estHintB")} <strong>{t("payables.fixAllocation")}</strong>{" "}
            {t("payables.estHintC")} <strong>{t("payables.estNoJournalChange")}</strong>
            {t("common.fullStop")}
          </small>
        </p>
      ) : (
        <p style={noteStyle}>
          <InfoCircleOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <small>{t("payables.noEstimateNote")}</small>
        </p>
      )}

      <PartyTotals rows={byParty} title={t("payables.partyTotalsTitle")} />

      <Card>
        <StaticTable<PayableRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={<FileTextOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={overdueOnly ? t("payables.emptyOverdue") : t("payables.emptyAll")}
            />
          }
        />
      </Card>
    </div>
  );
}
