/**
 * Jurnal Umum — daftar, dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**, jadi tanpa `antd` dan tanpa `theme.useToken()`
 * (`tests/rsc-boundary.test.ts`). Warna: primitif yang mewarnai dirinya sendiri
 * (`Badge`, `Money`) + variabel `--ant-…` yang HANYA dipakai di dalam `<Card>`.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { BookText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Link } from "@/components/ui/app-link";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** Lebar maksimum kolom keterangan (`max-w-xs` lama = 20rem). */
const NOTE_MAX_WIDTH = 320;

/** Satu baris daftar, diratakan dari Prisma supaya kolomnya bertipe penuh. */
interface JournalRow {
  id: number;
  number: string;
  date: string;
  /** Label bahasa tugas — nilai enum DB tidak pernah tampil mentah. */
  type: string;
  /**
   * Jenis MENTAH, dipakai kolom Status untuk membedakan jurnal PEMBALIK dari
   * jurnal biasa. Membacanya dari label yang sudah diterjemahkan akan berhenti
   * bekerja begitu bahasanya berganti.
   */
  rawType: string;
  note: string;
  total: number;
  isReversed: boolean;
}

export default async function JournalPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("journal.read", params);
  const t = await getT();
  const typeLabels: Record<string, string> = {
    general: t("journal.type.general"),
    sales: t("journal.type.sales"),
    purchase: t("journal.type.purchase"),
    cash: t("journal.type.cash"),
    adjustment: t("journal.type.adjustment"),
    reversal: t("journal.type.reversal"),
  };

  // Paginated with a real count — the old hard `take: 100` made journal #101
  // unreachable from any UI surface and froze the heading at "(100)" forever.
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 25;
  const [journals, totalCount] = await Promise.all([
    prisma.journal.findMany({
      orderBy: [{ date: "desc" }, { id: "desc" }],
      include: { lines: true },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.journal.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const rows: JournalRow[] = journals.map((j) => ({
    id: j.id,
    number: j.number,
    date: formatDateShort(j.date),
    type: typeLabels[j.type] ?? j.type,
    rawType: j.type,
    note: j.note ?? "—",
    total: j.lines.reduce((s, l) => s + Number(l.baseDebit), 0),
    isReversed: j.isReversed,
  }));

  const columns: SaiColumns<JournalRow> = [
    {
      key: "number",
      dataIndex: "number",
      title: t("journal.colNumber"),
      align: "left",
      render: (_v, row) => (
        <Link
          href={`/journal/${row.id}`}
          style={{
            fontFamily: "var(--ant-font-family-code)",
            color: "var(--ant-color-link)",
          }}
        >
          {row.number}
        </Link>
      ),
    },
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            color: "var(--ant-color-text-secondary)",
          }}
        >
          {row.date}
        </span>
      ),
    },
    {
      key: "type",
      dataIndex: "type",
      title: t("journal.colType"),
      align: "left",
      render: (_v, row) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{row.type}</span>
      ),
    },
    {
      key: "note",
      dataIndex: "note",
      title: t("common.description"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            display: "block",
            maxWidth: NOTE_MAX_WIDTH,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--ant-color-text-secondary)",
          }}
          title={row.note}
        >
          {row.note}
        </span>
      ),
    },
    moneyColumn<JournalRow>({
      dataIndex: "total",
      title: t("journal.colTotalIdr"),
      sorter: false,
      hideCurrency: true,
    }),
    {
      key: "status",
      title: t("common.status"),
      align: "left",
      render: (_v, row) =>
        row.isReversed ? (
          <Badge variant="warning">{t("journal.statusReversed")}</Badge>
        ) : row.rawType === "reversal" ? (
          <Badge variant="default">{t("journal.statusReversal")}</Badge>
        ) : (
          <Badge variant="success">{t("common.active")}</Badge>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("journal.title", { count: totalCount })}
        actions={
          <Link href="/journal/new">
            <Button>{t("journal.addNew")}</Button>
          </Link>
        }
      />

      <Card>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<BookText size={EMPTY_ICON_SIZE} />}
              title={t("journal.emptyTitle")}
              description={t("journal.emptyDescription")}
              actionLabel={t("journal.emptyAction")}
              actionHref="/journal/new"
            />
          }
        />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/journal" searchParams={filters} />
      </Card>
    </div>
  );
}
