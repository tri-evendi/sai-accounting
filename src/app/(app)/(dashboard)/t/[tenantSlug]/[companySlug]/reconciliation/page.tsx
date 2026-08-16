/**
 * Rekonsiliasi Bank — daftar rekening koran (issue #24).
 *
 * Dikonversi ke token Ant Design pada issue #197; **tetap server component**,
 * jadi `antd` tidak diimpor di sini dan warna hanya datang dari primitif serta
 * dari variabel `--ant-…` di dalam `<Card>`.
 *
 * ── Sortir kolom lewat URL (issue #265) ────────────────────────────────────
 * Halaman ini adalah pembuktian bentuk baru itu untuk kolom UANG: `opening_
 * balance` dan `closing_balance` adalah `Decimal(15,2)` di basis data, jadi
 * `orderBy` mengurutkannya sebagai ANGKA. Diurutkan sebagai teks hasil format,
 * "Rp 1.000" akan mendarat sebelum "Rp 9" dan daftar saldo terbesar jadi salah
 * tanpa satu pun tanda di layar.
 *
 * Yang TIDAK ditawarkan sortirnya, dan itu disengaja: kolom "Baris koran"
 * (`_count.lines`) dan kolom status. Yang pertama bisa saja diurutkan Prisma
 * lewat `{ lines: { _count: dir } }`, tapi belum ada yang memintanya; yang
 * kedua urutan abjad nilai enum-nya (`draft`, `locked`) tidak berarti apa-apa
 * bagi pengguna — saringan status di atas tabel yang menjawab kebutuhan itu.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StaticTable } from "@/components/ui/static-table";
import { qtyColumn, type SaiColumns } from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { Pagination } from "@/components/ui/pagination";
import {
  parseSort,
  sortOrderBy,
  sortableKeys,
  type SortSpec,
} from "@/lib/table-sort";
import type { Prisma } from "@/generated/prisma/client";
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

/**
 * Kunci kolom yang bisa diurutkan → `orderBy` Prisma-nya (issue #265).
 *
 * Semuanya kolom NOT NULL — syarat `lib/table-sort.ts`: MySQL tidak bisa
 * menaruh NULL di belakang pada KEDUA arah, jadi kolom yang nilainya bisa
 * belum diketahui (`locked_at`, `note`) tidak ditawarkan sortirnya sama sekali.
 *
 * `id` sebagai pemutus seri ikut membalik arah: tanpa urutan total, baris bisa
 * berpindah halaman antar permintaan dan paginasi tampak "loncat" — alasan yang
 * sama dengan urutan bawaan di bawah.
 */
const SORTABLE: SortSpec<Prisma.BankStatementOrderByWithRelationInput[]> = {
  period: (dir) => [{ periodEnd: dir }, { id: dir }],
  opening: (dir) => [{ openingBalance: dir }, { id: dir }],
  closing: (dir) => [{ closingBalance: dir }, { id: dir }],
};

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
  searchParams: Promise<{ status?: string; page?: string; sort?: string; dir?: string }>;
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

  // Tanpa `?sort=` urutannya persis seperti sebelum #265 — memasang sortir
  // tidak boleh mengubah tampilan bawaan halaman mana pun.
  const sort = parseSort(filters, SORTABLE);

  const [statements, totalCount] = await Promise.all([
    prisma.bankStatement.findMany({
      where,
      orderBy: sortOrderBy(sort, SORTABLE, [{ periodEnd: "desc" }, { id: "desc" }]),
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
    {
      key: "period",
      dataIndex: "period",
      title: t("reconciliation.colPeriod"),
      align: "left",
      sorter: true,
    },
    { key: "account", dataIndex: "account", title: t("reconciliation.colAccount"), align: "left" },
    moneyColumn<StatementRow>({
      dataIndex: "openingBalance",
      key: "opening",
      title: t("reconciliation.colOpening"),
      sorter: true,
      currency: (r) => r.currency,
    }),
    moneyColumn<StatementRow>({
      dataIndex: "closingBalance",
      key: "closing",
      title: t("reconciliation.colClosing"),
      sorter: true,
      currency: (r) => r.currency,
    }),
    qtyColumn<StatementRow>({
      dataIndex: "lineCount",
      title: t("reconciliation.colStatementLines"),
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
          /* Aksi utama layar ini (#267). CTA keadaan-kosong menunjuk tempat
             yang sama dan sengaja `secondary` — lihat `ui/empty-state.tsx`. */
          <ButtonLink href="/reconciliation/new" variant="primary">
            {t("reconciliation.addNew")}
          </ButtonLink>
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
          /* Chip saringan: aktif `secondary` (berbingkai), sisanya `ghost`.
             Menyaring tidak mengikat (§Aksi utama per layar); isian penuh di
             sini bersaing dengan CTA kepala halaman. `key` pindah ke elemen
             terluar yang tersisa — dan sekarang hanya ada SATU elemen. */
          <ButtonLink
            key={f.label}
            href={f.value ? `/reconciliation?status=${f.value}` : "/reconciliation"}
            variant={status === f.value ? "secondary" : "ghost"}
            size="sm"
          >
            {f.label}
          </ButtonLink>
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
            <CardTitle level={2}>{t("reconciliation.listTitle", { count: totalCount })}</CardTitle>
          </CardHeader>
          <StaticTable<StatementRow>
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            sort={{
              basePath: "/reconciliation",
              // Seluruh query yang sedang berlaku ikut — saringan status dan
              // nomor halaman tidak boleh hilang karena pengguna menyortir.
              params: filters,
              keys: sortableKeys(SORTABLE),
              active: sort,
            }}
          />
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
