/**
 * Kas & Bank — daftar gerakan kas + saldo per jenis/mata uang (issue #4).
 *
 * ── Konversi ke token Ant Design (issue #197, fase C5) ─────────────────────
 * **Tetap server component**: saringan periodenya adalah `<form method="get">`
 * yang memuat ulang di server, jadi tak ada satu pun kendali di sini yang butuh
 * JavaScript. Tabelnya `StaticTable` (#189) dengan alasan yang sama — daftarnya
 * dipaginasi SERVER, dan `DataTable` hanya akan menyalin sepuluh baris yang
 * sama ke peramban lalu menghidrasi rc-table di atasnya.
 *
 * Warna kartu saldo dulu `text-success` / `text-destructive` pada angka besar.
 * Ia kini token uang lewat variabel CSS — teratasi karena angkanya dirender DI
 * DALAM `<Card>` (lihat kepala `shared/aging.tsx`). Arahnya tetap tidak
 * bergantung warna: baris "Masuk"/"Keluar" di bawahnya menyebutkannya.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort, parsePageParam } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import type { CashType } from "@/lib/constants";
import { FinancePageActions } from "./finance-actions";
import { bankReconciliationStatus } from "@/lib/bank-statements";
import { CheckCircleOutlined, WalletOutlined } from "@ant-design/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { cashTypeLabels, monthNames } from "@/lib/i18n/labels";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";

export const dynamic = "force-dynamic";

/** `marginXL` 32 · `marginLG` 24 · `margin` 16 · `marginSM` 12 — token AntD
 *  sebagai angka, karena berkas ini tak boleh memanggil `theme.useToken()`. */
const SECTION_GAP = 24;
const BALANCE_SECTION_GAP = 32;
const CARD_GAP = 16;
const CONTROL_GAP = 12;
const EMPTY_ICON_SIZE = 48;
/** Lebar dasar satu kartu saldo: tiga berjajar di 1440px, satu di 375px. */
const BALANCE_BASIS = 260;

/** Satu baris daftar, diratakan dari Prisma supaya kolomnya bertipe penuh. */
interface CashRow {
  id: number;
  date: string;
  type: string;
  typeLabel: string;
  description: string;
  currency: string;
  debit: number;
  credit: number;
  reconciled: boolean;
}

export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ type?: string; currency?: string; month?: string; year?: string; page?: string }>;
}) {
  await requirePagePermission("cash.read", params);
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const cashLabels = cashTypeLabels(dictionary);
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 10;

  // Build filters
  const where: Record<string, unknown> = {};
  if (filters.type) where.type = filters.type;
  if (filters.currency) where.currency = filters.currency;

  // Sanitized: hand-edited URLs must not put NaN into the query. A month
  // chosen with year "Semua tahun" cannot mean "Maret every year" in one
  // range — it defaults to the current year, and the Year select below shows
  // that, so the filter applied is always the filter displayed.
  const yearNum = filters.year ? Number.parseInt(filters.year, 10) : NaN;
  const monthNum = filters.month ? Number.parseInt(filters.month, 10) : NaN;
  const monthValid = Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12;
  const effectiveYear = Number.isFinite(yearNum)
    ? yearNum
    : monthValid
      ? new Date().getFullYear()
      : null;
  if (effectiveYear != null) {
    const startDate = monthValid
      ? new Date(effectiveYear, monthNum - 1, 1)
      : new Date(effectiveYear, 0, 1);
    const endDate = monthValid
      ? new Date(effectiveYear, monthNum, 1)
      : new Date(effectiveYear + 1, 0, 1);
    where.date = { gte: startDate, lt: endDate };
  }

  // All transactions for balance calculation, paginated for table
  const [allTransactions, transactions, totalCount] = await Promise.all([
    prisma.cashMovement.findMany({
      where,
      orderBy: { date: "desc" },
    }),
    prisma.cashMovement.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.cashMovement.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  // Reconciliation status per bank currency, for the Kas & Bank report (issue #24).
  const reconStatus = await bankReconciliationStatus();
  const reconByCurrency = new Map(reconStatus.map((r) => [r.currency, r]));

  // Calculate balances per type & currency (from ALL filtered transactions)
  const balanceMap = new Map<string, { type: string; currency: string; debit: number; credit: number }>();

  for (const tx of allTransactions) {
    const key = `${tx.type}_${tx.currency}`;
    const existing = balanceMap.get(key) || { type: tx.type, currency: tx.currency, debit: 0, credit: 0 };
    existing.debit += Number(tx.debit);
    existing.credit += Number(tx.credit);
    balanceMap.set(key, existing);
  }

  const balances = Array.from(balanceMap.values());
  const financeBalances: FinanceBalanceRow[] = balances.map((b) => ({
    ...b,
    balance: b.debit - b.credit,
  }));
  const financeTransactions: FinanceReportRow[] = allTransactions.map((tx) => ({
    date: tx.date.toISOString(),
    type: tx.type,
    description: tx.description,
    currency: tx.currency,
    debit: Number(tx.debit),
    credit: Number(tx.credit),
  }));

  // Generate filter options
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = monthNames(dictionary);

  const rows: CashRow[] = transactions.map((tx) => ({
    id: tx.id,
    date: formatDateShort(tx.date),
    type: tx.type,
    typeLabel: cashLabels[tx.type as CashType] || tx.type,
    description: tx.description,
    currency: tx.currency,
    debit: Number(tx.debit),
    credit: Number(tx.credit),
    reconciled: tx.reconciled,
  }));

  const secondary: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };

  const columns: SaiColumns<CashRow> = [
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      align: "left",
      render: (_v, r) => (
        <span style={{ ...secondary, fontVariantNumeric: "tabular-nums" }}>{r.date}</span>
      ),
    },
    { key: "type", dataIndex: "typeLabel", title: t("finance.filterType"), align: "left" },
    {
      key: "description",
      dataIndex: "description",
      title: t("common.description"),
      align: "left",
    },
    {
      key: "currency",
      dataIndex: "currency",
      title: t("common.currency"),
      align: "left",
      render: (_v, r) => <span style={secondary}>{r.currency}</span>,
    },
    {
      key: "debit",
      dataIndex: "debit",
      title: <TermTooltip term="debit">{t("finance.colMoneyIn")}</TermTooltip>,
      align: "right",
      // Uang masuk hijau / uang keluar merah (semantik warna uang MASTER.md);
      // label kolomnya sendiri sudah membedakan keduanya, jadi warna bukan
      // satu-satunya penanda. Sisi yang tidak terpakai TIDAK ditulis Rp 0 —
      // baris kas hanya punya satu arah, dan nol di sisi lain adalah bukan-nilai.
      render: (_v, r) =>
        r.debit > 0 ? (
          <Money value={r.debit} currency={r.currency} tone="positive" />
        ) : (
          <span style={secondary}>—</span>
        ),
    },
    {
      key: "credit",
      dataIndex: "credit",
      title: <TermTooltip term="kredit">{t("finance.colMoneyOut")}</TermTooltip>,
      align: "right",
      render: (_v, r) =>
        r.credit > 0 ? (
          <Money value={r.credit} currency={r.currency} tone="negative" />
        ) : (
          <span style={secondary}>—</span>
        ),
    },
    {
      key: "reconciled",
      dataIndex: "reconciled",
      title: t("finance.colReconciliation"),
      align: "left",
      // Hanya rekening BANK yang direkonsiliasi; kas besar/kecil tidak punya
      // rekening koran, jadi kolomnya "—" dan bukan "belum cocok".
      render: (_v, r) =>
        r.type !== "bank" ? (
          <span style={secondary}>—</span>
        ) : r.reconciled ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <CheckCircleOutlined aria-hidden="true" />
            <small>{t("finance.reconMatched")}</small>
          </span>
        ) : (
          <small style={secondary}>{t("finance.reconNot")}</small>
        ),
    },
  ];

  /** Satu isian saringan: label kecil di atas kendalinya. */
  const filterField = (id: string, label: string, control: React.ReactNode) => (
    <div>
      <Label htmlFor={id} style={{ display: "block", marginBottom: 4 }}>
        <small>{label}</small>
      </Label>
      {control}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={<TermTooltip term="kas_bank">{t("finance.title")}</TermTooltip>}
        actions={
          <>
            <FinancePageActions balances={financeBalances} transactions={financeTransactions} />
            <Link href="/finance/new">
              {/* Aksi utama layar ini (#267): mencatat transaksi kas/bank adalah
                  satu-satunya hal yang MENGIKAT; ekspor & saringan membaca. */}
              <Button variant="primary">{t("finance.addNew")}</Button>
            </Link>
          </>
        }
      />
      <div style={{ marginBottom: SECTION_GAP }}>
        <LearnMore term="kas_bank" label={t("finance.learnMore")} />
      </div>

      {/* Saringan — `<form method="get">`, tanpa satu baris JavaScript. */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardContent>
          <form
            method="get"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: CONTROL_GAP,
            }}
          >
            {filterField(
              "filter-type",
              t("finance.filterType"),
              <NativeSelect
                id="filter-type"
                name="type"
                defaultValue={filters.type || ""}
                options={[
                  { value: "", label: t("finance.allTypes") },
                  { value: "bank", label: cashLabels.bank },
                  { value: "kas_besar", label: cashLabels.kas_besar },
                  { value: "kas_kecil", label: cashLabels.kas_kecil },
                ]}
              />
            )}
            {filterField(
              "filter-currency",
              t("common.currency"),
              <NativeSelect
                id="filter-currency"
                name="currency"
                defaultValue={filters.currency || ""}
                options={[
                  { value: "", label: t("common.all") },
                  { value: "IDR", label: "IDR" },
                  { value: "USD", label: "USD" },
                  { value: "CNY", label: "CNY" },
                ]}
              />
            )}
            {filterField(
              "filter-year",
              t("finance.yearField"),
              <NativeSelect
                id="filter-year"
                name="year"
                defaultValue={effectiveYear != null ? String(effectiveYear) : ""}
                options={[
                  { value: "", label: t("finance.allYears") },
                  ...years.map((y) => ({ value: String(y), label: String(y) })),
                ]}
              />
            )}
            {filterField(
              "filter-month",
              t("finance.monthField"),
              <NativeSelect
                id="filter-month"
                name="month"
                defaultValue={monthValid ? String(monthNum) : ""}
                options={[
                  { value: "", label: t("finance.allMonths") },
                  ...months.map((m, i) => ({ value: String(i + 1), label: m })),
                ]}
              />
            )}

            {/* Kirim yang hanya MENYARING — `outline` (#267), preseden "Saring"
                di `/operator` dan `shared/ledger-filter.tsx`. */}
            <Button type="submit" variant="outline" size="sm">
              {t("finance.filterSubmit")}
            </Button>
            <Link href="/finance">
              <Button type="button" variant="ghost" size="sm">
                {t("finance.filterClear")}
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>

      {/* Kartu saldo per jenis kas & mata uang. */}
      <div
        style={{
          display: "grid",
          gap: CARD_GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${BALANCE_BASIS}px, 1fr))`,
          marginBottom: BALANCE_SECTION_GAP,
        }}
      >
        {balances.length === 0 ? (
          <Card>
            <CardContent style={{ textAlign: "center", color: "var(--ant-color-text-secondary)" }}>
              {effectiveYear != null ? t("finance.noCashRecordsPeriod") : t("finance.noCashRecords")}
            </CardContent>
          </Card>
        ) : (
          balances.map((b) => {
            const balance = b.debit - b.credit;
            const recon = b.type === "bank" ? reconByCurrency.get(b.currency) : undefined;
            return (
              <Card key={`${b.type}_${b.currency}`}>
                <CardHeader>
                  <CardTitle>
                    <span style={{ color: "var(--ant-color-text-secondary)" }}>
                      {cashLabels[b.type as CashType] || b.type} ({b.currency})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--ant-font-size-heading-3)",
                      fontWeight: "var(--ant-font-weight-strong)",
                    }}
                  >
                    {/* Saldo negatif = rekening minus; `Money` mewarnainya merah
                        DAN memberi tanda minus, jadi warna bukan penanda tunggal. */}
                    <Money value={balance} currency={b.currency} />
                  </p>
                  <div
                    style={{
                      marginTop: "var(--ant-margin-xs)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: CARD_GAP,
                      color: "var(--ant-color-text-secondary)",
                    }}
                  >
                    <small style={{ fontVariantNumeric: "tabular-nums" }}>
                      {t("finance.inLabel", { amount: formatCurrency(b.debit, b.currency) })}
                    </small>
                    <small style={{ fontVariantNumeric: "tabular-nums" }}>
                      {t("finance.outLabel", { amount: formatCurrency(b.credit, b.currency) })}
                    </small>
                  </div>
                  {recon && (
                    <div
                      style={{
                        marginTop: "var(--ant-margin-xs)",
                        paddingTop: "var(--ant-margin-xs)",
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--ant-margin-xs)",
                        borderTop: "1px solid var(--ant-color-border-secondary)",
                        color: "var(--ant-color-text-secondary)",
                      }}
                    >
                      <small>
                        {t("finance.reconLabel", {
                          matched: recon.reconciledCount,
                          total: recon.totalCount,
                        })}
                      </small>
                      {recon.latestStatus === "locked" && (
                        <Badge variant="success">{t("finance.locked")}</Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("finance.txListTitle", { count: totalCount })}</CardTitle>
        </CardHeader>
        <StaticTable<CashRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={<WalletOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("finance.emptyTitle")}
              description={t("finance.emptyDescription")}
              actionLabel={t("finance.addNew")}
              actionHref="/finance/new"
            />
          }
        />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/finance" searchParams={filters} />
      </Card>
    </div>
  );
}
