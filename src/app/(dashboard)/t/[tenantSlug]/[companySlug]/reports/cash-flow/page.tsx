/**
 * Arus Kas — dikonversi ke `StaticTable.rowCells` + token AntD (issue #198),
 * mengikuti pola yang dibuktikan Neraca di #233.
 *
 * ── Tiga hal yang sengaja TIDAK berubah ───────────────────────────────────
 *  • **Arah kas tidak pernah disampaikan warna saja.** `Flow` tetap membawa
 *    ikon panah + tanda +/− + teks tersembunyi ("masuk"/"keluar"), dan nol
 *    tetap tampil sebagai "–" berlabel "Nihil", bukan "Rp 0".
 *  • **Kelompok "Belum Terkategori"** tetap berpita peringatan dengan lencana
 *    BERTEKS, bukan sekadar latar kuning.
 *  • **Grafik tren** tetap 6 bulan terakhir dan tetap per mata uang.
 *
 * Yang berubah: baris kelompok & subtotal kini baris `rowCells` di dalam badan
 * tabel — judul kelompok `scope="colgroup"`, label subtotal `scope="row"` —
 * bukan `<TableCell colSpan>` mentah yang dibacakan pembaca layar sebagai sel
 * data tanpa konteks. **Halaman tetap server component.**
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { canEffective } from "@/lib/authz-effective";
import { prisma } from "@/lib/prisma";
import { getCashFlow } from "@/lib/reports";
import { cashFlowSeriesByCurrency, chartPeriodStart } from "@/lib/chart-data";
import { ChartCard } from "@/components/dashboard/chart-card";
import { CashFlowChart } from "@/components/shared/dashboard-charts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StaticTable, type SummaryCell } from "@/components/ui/static-table";
import { Money } from "@/components/ui/money";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { resolvePeriod } from "@/lib/report-catalog";
import { cashFlowSummary } from "@/lib/report-summary";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, AlertTriangle, Minus } from "lucide-react";
import type { CashFlowGroup } from "@/lib/reports";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `margin` 16 — token AntD sebagai angka (berkas ini server). */
const SECTION_GAP = 24;
const CARD_GAP = 16;
const STAT_BASIS = 220;
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
const SUBTOTAL_ROW: React.CSSProperties = { fontWeight: STRONG };

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
type T = (key: DictionaryKey, values?: Record<string, string | number>) => string;

function Flow({ amount, t }: { amount: number; t: T }) {
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
        <Minus size={ICON_SIZE} aria-hidden="true" />
        <span style={VISUALLY_HIDDEN}>{t("reports.flowNil")}</span>
      </span>
    );
  }
  const inflow = amount > 0;
  const Icon = inflow ? ArrowDownLeft : ArrowUpRight;
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
      <Icon size={ICON_SIZE} style={{ flexShrink: 0 }} aria-hidden="true" />
      <span style={VISUALLY_HIDDEN}>{inflow ? t("reports.flowIn") : t("reports.flowOut")}</span>
      <span>
        {inflow ? "+" : "−"}
        {formatCurrency(Math.abs(amount), "IDR")}
      </span>
    </span>
  );
}

/**
 * Satu baris laporan arus kas. DATAR dan bertanda `kind`: judul kelompok, akun,
 * penanda kelompok kosong, dan subtotal semuanya harus muat di tipe yang sama.
 */
type FlowRow = {
  key: string;
  kind: "group" | "line" | "empty" | "subtotal";
  label?: string;
  /** Kelompok "Belum Terkategori" — berpita peringatan + lencana berteks. */
  review?: boolean;
  code?: string;
  name?: string;
  inflow?: number;
  outflow?: number;
  /** Subtotal kelompok, bertanda arah. */
  net?: number;
};

/** Judul kelompok, akun-akunnya, lalu subtotalnya — satu bentuk untuk semua kelompok. */
function groupRows(group: CashFlowGroup, label: string): FlowRow[] {
  const review = group.category === "uncategorised";
  return [
    { key: `${group.category}-head`, kind: "group", label, review },
    ...(group.lines.length === 0
      ? [{ key: `${group.category}-none`, kind: "empty" as const }]
      : group.lines.map((l, i) => ({
          key: `${group.category}-${l.code || i}`,
          kind: "line" as const,
          code: l.code,
          name: l.name,
          inflow: l.inflow,
          outflow: l.outflow,
        }))),
    { key: `${group.category}-total`, kind: "subtotal", label, net: group.net },
  ];
}

/** Satu baris tabel per akun kas & bank. */
type CashAccountRow = {
  code: string;
  name: string;
  opening: number;
  net: number;
  closing: number;
};

export default async function CashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);

  /*
   * Grafik tren kas (dipindah dari Beranda).
   *
   * DUA hal yang sengaja berbeda dari laporan di atasnya, dan keduanya
   * tertulis di judul/keterangan kartunya sendiri:
   *
   *  • Jendelanya TETAP 6 bulan terakhir ("6 bulan terakhir"), bukan periode
   *    saringan. Laporannya menjawab "periode ini berapa"; grafiknya memberi
   *    latar tren yang tidak ikut berubah tiap kali periodenya digeser.
   *  • Angkanya PER MATA UANG apa adanya dari buku kas (`cash_movements`),
   *    tanpa konversi — sedangkan laporan arus kas berbasis jurnal selalu
   *    IDR dasar. Menjumlahkan rupiah dengan dolar adalah bug mata-uang
   *    campur; satu mata uang = satu grafik.
   *
   * RBAC: buku kas adalah `cash.read`, izin yang BERBEDA dari `report.read`
   * penjaga halaman ini. Bawaannya bos memegang keduanya, tapi matriksnya
   * bisa di-override dari /permissions, jadi izinnya ditanyakan — kalau
   * tidak dipegang, barisnya tidak diambil sama sekali.
   */
  const canViewCashBook = await canEffective(session.user, "cash.read");
  // Satu `now` untuk batas kueri DAN pelabelan ember bulanan.
  const now = new Date();

  const [cf, cashBookRows] = await Promise.all([
    getCashFlow(from, to),
    canViewCashBook
      ? prisma.cashMovement.findMany({
          where: { date: { gte: chartPeriodStart(now) } },
          select: { date: true, debit: true, credit: true, currency: true },
        })
      : Promise.resolve([]),
  ]);
  const cashTrend = cashFlowSeriesByCurrency(cashBookRows, now);
  // Dipakai dokumen cetak & ringkasan bahasa awam — keduanya masih bahasa
  // Indonesia (lib/pdf, lib/report-summary).
  const periodLabel = `Periode ${formatDate(from)} – ${formatDate(to)}`;
  // Label kelompok arus kas untuk LAYAR; payload PDF tetap memakai `g.label`.
  const groupLabels: Record<string, string> = {
    operating: t("cashFlowCategory.operating"),
    investing: t("cashFlowCategory.investing"),
    financing: t("cashFlowCategory.financing"),
    uncategorised: t("cashFlowCategory.uncategorised"),
  };

  const payload: StatementPayload = {
    kind: "cash-flow",
    period: periodLabel,
    groups: cf.groups.map((g) => ({
      label: g.label,
      lines: g.lines.map((l) => ({
        code: l.code,
        name: l.name,
        inflow: l.inflow,
        outflow: l.outflow,
        net: l.net,
      })),
      inflow: g.inflow,
      outflow: g.outflow,
      net: g.net,
    })),
    totalInflow: cf.totalInflow,
    totalOutflow: cf.totalOutflow,
    netChange: cf.netChange,
    openingCash: cf.openingCash,
    closingCash: cf.closingCash,
    reconciled: cf.reconciled,
    suspectUnrated: cf.suspectUnrated,
  };
  const summary = cashFlowSummary(cf, periodLabel, t);

  // An empty "Belum Terkategori" section is noise; a non-empty one is the whole
  // point of the bucket, so it is always shown when it has rows.
  const rows: FlowRow[] = cf.groups
    .filter((g) => g.category !== "uncategorised" || g.lines.length > 0)
    .flatMap((g) => groupRows(g, groupLabels[g.category] ?? g.label));

  const columns: SaiColumns<FlowRow> = [
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
      // Nol tampil "—" (bukan "Rp 0"): akun yang tidak menerima kas pada
      // periode ini tidak menerima NOL rupiah, ia tidak menerima apa pun.
      ...moneyColumn<FlowRow>({ dataIndex: "inflow", title: t("reports.colCashIn") }),
      render: (_v, row) => (
        <Money value={row.inflow ? row.inflow : undefined} currency="IDR" />
      ),
    },
    {
      ...moneyColumn<FlowRow>({ dataIndex: "outflow", title: t("reports.colCashOut") }),
      render: (_v, row) => (
        <Money value={row.outflow ? row.outflow : undefined} currency="IDR" />
      ),
    },
  ];

  const rowCells = (row: FlowRow): Record<string, SummaryCell> | undefined => {
    if (row.kind === "group") {
      return {
        item: {
          content: (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {row.label}
                {row.review && (
                  <Badge variant="warning">
                    <AlertTriangle
                      size={12}
                      style={{ marginInlineEnd: 4 }}
                      aria-hidden="true"
                    />
                    {t("reports.needsReview")}
                  </Badge>
                )}
              </span>
              {row.review && (
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
          colSpan: 3,
          scope: "colgroup",
        },
      };
    }
    if (row.kind === "empty") {
      return {
        item: {
          content: <span style={LINE_INDENT}>{t("reports.noCashMovement")}</span>,
          colSpan: 3,
        },
      };
    }
    if (row.kind === "subtotal") {
      return {
        item: {
          content: t("reports.groupSubtotal", { group: row.label ?? "" }),
          scope: "row",
        },
        // Subtotal kelompok adalah SATU angka berarah, bukan sepasang
        // masuk/keluar — jadi ia membentang di atas kedua kolom nominalnya.
        inflow: { content: <Flow amount={row.net ?? 0} t={t} />, colSpan: 2, align: "right" },
      };
    }
    return undefined;
  };

  const accountColumns: SaiColumns<CashAccountRow> = [
    {
      key: "account",
      dataIndex: "name",
      title: t("common.account"),
      align: "left",
      render: (_v, r) => (
        <>
          <span style={CODE_STYLE}>{r.code}</span>
          {r.name}
        </>
      ),
    },
    moneyColumn<CashAccountRow>({ dataIndex: "opening", title: t("reports.colOpeningBalance") }),
    {
      key: "net",
      dataIndex: "net",
      title: t("reports.colChange"),
      align: "right",
      render: (_v, r) => <Flow amount={r.net} t={t} />,
    },
    moneyColumn<CashAccountRow>({ dataIndex: "closing", title: t("reports.colClosingBalance") }),
  ];

  /** Kartu angka ringkas: keterangan kecil di atas, nilainya di bawah. */
  const statCard = (label: string, value: React.ReactNode) => (
    <Card>
      <div style={{ padding: "var(--ant-padding)" }}>
        <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>{label}</p>
        <p
          style={{
            margin: 0,
            marginTop: "var(--ant-margin-xxs)",
            fontSize: "var(--ant-font-size-xl)",
            fontWeight: STRONG,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </p>
      </div>
    </Card>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.cashFlowTitle") },
        ]}
        title={t("reports.cashFlowTitle")}
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

      <PeriodFilter basePath="/reports/cash-flow" from={fromISO} to={toISO} />

      <PlainSummary summary={summary} />

      {cf.suspectUnrated > 0 && (
        <Card
          style={{
            marginBottom: CARD_GAP,
            borderColor: "var(--ant-color-warning-border)",
            background: "var(--ant-color-warning-bg)",
          }}
        >
          <div style={{ display: "flex", gap: 12, padding: "var(--ant-padding-lg)" }}>
            <AlertTriangle
              size={20}
              style={{ flexShrink: 0, marginTop: 2, color: "var(--ant-color-money-pending)" }}
              aria-hidden="true"
            />
            <p style={{ margin: 0, color: "var(--ant-color-money-pending)" }}>
              <span style={{ fontWeight: STRONG }}>
                {t("reports.unratedWarningStrong", { count: cf.suspectUnrated })}
              </span>{" "}
              {t("reports.unratedWarningRest")}
            </p>
          </div>
        </Card>
      )}

      <div
        style={{
          display: "grid",
          gap: CARD_GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${STAT_BASIS}px, 1fr))`,
          marginBottom: CARD_GAP,
        }}
      >
        {statCard(t("reports.openingCash"), formatCurrency(cf.openingCash, "IDR"))}
        {statCard(t("reports.cashChange"), <Flow amount={cf.netChange} t={t} />)}
        {statCard(t("reports.closingCash"), formatCurrency(cf.closingCash, "IDR"))}
      </div>

      <Card>
        <StaticTable<FlowRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.key}
          rowCells={rowCells}
          rowStyle={(row) =>
            row.kind === "group"
              ? row.review
                ? GROUP_ROW_REVIEW
                : GROUP_ROW
              : row.kind === "subtotal"
                ? SUBTOTAL_ROW
                : undefined
          }
          summary={[
            {
              cells: {
                item: {
                  content: (
                    <>
                      {t("reports.netCashRow")}
                      <span style={{ marginInlineStart: 8, verticalAlign: "middle" }}>
                        {cf.reconciled ? (
                          <Badge variant="success">{t("reports.matchesLedger")}</Badge>
                        ) : (
                          <Badge variant="danger">{t("reports.doesNotMatch")}</Badge>
                        )}
                      </span>
                    </>
                  ),
                  scope: "row",
                },
                inflow: <Money value={cf.totalInflow} currency="IDR" />,
                outflow: <Money value={cf.totalOutflow} currency="IDR" />,
              },
            },
            {
              cells: {
                item: { content: t("reports.netCashChange"), colSpan: 2, scope: "row" },
                outflow: <Flow amount={cf.netChange} t={t} />,
              },
            },
          ]}
        />
      </Card>

      {cf.cashAccounts.length > 0 && (
        <Card style={{ marginTop: SECTION_GAP }}>
          <div
            style={{
              padding: "var(--ant-padding-lg)",
              borderBottom: "1px solid var(--ant-color-border-secondary)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--ant-font-size)", fontWeight: STRONG }}>
              {t("reports.perCashAccountTitle")}
            </h2>
            <p
              style={{
                margin: 0,
                marginTop: "var(--ant-margin-xxs)",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              {t("reports.perCashAccountHint")}
            </p>
          </div>
          <StaticTable<CashAccountRow>
            columns={accountColumns}
            rows={cf.cashAccounts}
            rowKey={(r) => r.code}
          />
        </Card>
      )}

      {/* Tren buku kas per mata uang — latar 6 bulan di bawah laporannya,
          bukan menggantikan angka periode di atas. */}
      {cashTrend.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: SECTION_GAP,
            gridTemplateColumns:
              cashTrend.length === 1 ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))",
            marginTop: SECTION_GAP,
          }}
        >
          {cashTrend.map((series) => (
            <ChartCard
              key={series.currency}
              title={t("dashboard.cashFlowChartTitle", { currency: series.currency })}
              description={t("dashboard.cashFlowChartDesc")}
            >
              <CashFlowChart data={series.points} currency={series.currency} />
            </ChartCard>
          ))}
        </div>
      )}
    </div>
  );
}
