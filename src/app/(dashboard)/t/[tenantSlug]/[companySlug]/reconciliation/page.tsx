/**
 * Rekonsiliasi Bank — daftar rekening koran (issue #24).
 *
 * Dikonversi ke token Ant Design pada issue #197; **tetap server component**,
 * jadi `antd` tidak diimpor di sini dan warna hanya datang dari primitif serta
 * dari variabel `--ant-…` di dalam `<Card>`.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StaticTable } from "@/components/ui/static-table";
import { qtyColumn, type SaiColumns } from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { Pagination } from "@/components/ui/pagination";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { LockOutlined, ReconciliationOutlined } from "@ant-design/icons";
import { LearnMore } from "@/components/ui/learn-more";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `margin` 16 · `marginXS` 8 — token AntD sebagai angka. */
const SECTION_GAP = 24;
const CONTROL_GAP = 8;
const EMPTY_ICON_SIZE = 48;

/** Satu baris daftar, diratakan supaya kolomnya bertipe penuh. */
interface StatementRow {
  id: number;
  period: string;
  account: string;
  openingBalance: number;
  closingBalance: number;
  currency: string;
  lineCount: number;
  status: string;
}

export default async function ReconciliationListPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePagePermission("reconciliation.read", params);
  const t = await getT();
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 20;

  // Saringan status memakai dua nilai yang memang ada di kolomnya; nilai lain
  // (atau kosong) berarti "semua" — URL editan tangan tidak bisa membuat 500.
  const status =
    filters.status === "locked" || filters.status === "draft" ? filters.status : undefined;
  const where = status ? { status } : {};

  const [statements, totalCount] = await Promise.all([
    prisma.bankStatement.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
      include: { _count: { select: { lines: true } } },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.bankStatement.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const statusFilters = [
    { value: undefined, label: t("common.all") },
    { value: "locked", label: t("reconciliation.statusLocked") },
    { value: "draft", label: t("reconciliation.statusDraft") },
  ] as const;

  const rows: StatementRow[] = statements.map((s) => ({
    id: s.id,
    period: `${formatDateShort(s.periodStart)} — ${formatDateShort(s.periodEnd)}`,
    account: t("reconciliation.accountBank", { currency: s.currency }),
    openingBalance: Number(s.openingBalance),
    closingBalance: Number(s.closingBalance),
    currency: s.currency,
    lineCount: s._count.lines,
    status: s.status,
  }));

  const columns: SaiColumns<StatementRow> = [
    { key: "period", dataIndex: "period", title: t("reconciliation.colPeriod"), align: "left" },
    { key: "account", dataIndex: "account", title: t("reconciliation.colAccount"), align: "left" },
    moneyColumn<StatementRow>({
      dataIndex: "openingBalance",
      title: t("reconciliation.colOpening"),
      sorter: false,
      currency: (r) => r.currency,
    }),
    moneyColumn<StatementRow>({
      dataIndex: "closingBalance",
      title: t("reconciliation.colClosing"),
      sorter: false,
      currency: (r) => r.currency,
    }),
    qtyColumn<StatementRow>({
      dataIndex: "lineCount",
      title: t("reconciliation.colStatementLines"),
      sorter: false,
    }),
    {
      key: "status",
      dataIndex: "status",
      title: t("common.status"),
      align: "left",
      // Badge selalu berteks; gemboknya penanda KEDUA, bukan penggantinya.
      render: (_v, r) =>
        r.status === "locked" ? (
          <Badge variant="success">
            <LockOutlined aria-hidden="true" />
            <span>{t("reconciliation.statusLocked")}</span>
          </Badge>
        ) : (
          <Badge variant="warning">{t("reconciliation.statusDraft")}</Badge>
        ),
    },
    {
      key: "open",
      title: "",
      align: "right",
      render: (_v, r) => (
        <Link href={`/reconciliation/${r.id}`} style={{ color: "var(--ant-color-link)" }}>
          {t("reconciliation.open")}
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={<TermTooltip term="rekonsiliasi_bank">{t("reconciliation.title")}</TermTooltip>}
        description={t("reconciliation.description")}
        actions={
          <Link href="/reconciliation/new">
            <Button>{t("reconciliation.addNew")}</Button>
          </Link>
        }
      />
      {/* issue #21 — jalan pintas ke penjelasan istilah layar ini. */}
      <div style={{ marginBottom: SECTION_GAP }}>
        <LearnMore term="rekonsiliasi_bank" />
      </div>

      {/* Saringan status — chip GET (pola /contracts); saringan baru = hal. 1. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: CONTROL_GAP,
          marginBottom: CONTROL_GAP * 2,
        }}
      >
        {statusFilters.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/reconciliation?status=${f.value}` : "/reconciliation"}
          >
            <Button variant={status === f.value ? "primary" : "secondary"} size="sm">
              {f.label}
            </Button>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ReconciliationOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={t("reconciliation.emptyTitle")}
          description={t("reconciliation.emptyDescription")}
          actionLabel={t("reconciliation.emptyAction")}
          actionHref="/reconciliation/new"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("reconciliation.listTitle", { count: totalCount })}</CardTitle>
          </CardHeader>
          <StaticTable<StatementRow> columns={columns} rows={rows} rowKey={(r) => r.id} />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/reconciliation"
            searchParams={filters}
          />
        </Card>
      )}
    </div>
  );
}
