/**
 * Daftar dokumen biaya impor (issue #495 butir 1).
 *
 * Satu baris = satu tagihan bea masuk / freight / asuransi yang sudah disebar
 * ke harga pokok barangnya. Dua kolom uang yang penting berdiri terpisah dan
 * sengaja tidak dijumlahkan menjadi satu: yang MENEMPEL di persediaan dan yang
 * jatuh ke Selisih Harga Pokok menjawab dua pertanyaan berbeda, dan angka
 * gabungan mereka tidak menjawab satu pun.
 */
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { ImportOutlined, InfoCircleOutlined, PlusOutlined } from "@ant-design/icons";

export const dynamic = "force-dynamic";

/** Server component — angkanya sama dengan token (`marginLG`, `marginXS`). */
const SECTION_GAP = 24;
const CONTROL_GAP = 8;
const EMPTY_ICON_SIZE = 48;

interface LandedCostRow {
  key: string;
  number: string;
  date: string;
  supplier: string;
  amount: number;
  capitalized: number;
  expensed: number;
  items: number;
}

export default async function LandedCostsPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("landed_cost.read", params);
  const t = await getT();
  const sp = await searchParams;
  const page = parsePageParam(sp.page);
  const perPage = 20;

  const [total, documents] = await Promise.all([
    prisma.landedCostDocument.count(),
    prisma.landedCostDocument.findMany({
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        purchase: { select: { supplier: { select: { name: true } } } },
        _count: { select: { items: true } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const rows: LandedCostRow[] = documents.map((d) => ({
    key: String(d.id),
    number: d.number,
    date: formatDateShort(d.date),
    supplier: d.purchase.supplier?.name ?? "—",
    amount: Number(d.amount),
    capitalized: Number(d.capitalizedAmount),
    expensed: Number(d.expensedAmount),
    items: d._count.items,
  }));

  const columns: SaiColumns<LandedCostRow> = [
    {
      key: "number",
      dataIndex: "number",
      title: t("landedCosts.columns.number"),
      align: "left",
      render: (_v, r) => (
        <span style={{ fontWeight: "var(--ant-font-weight-strong)" }}>{r.number}</span>
      ),
    },
    { key: "date", dataIndex: "date", title: t("landedCosts.columns.date"), align: "left" },
    {
      key: "supplier",
      dataIndex: "supplier",
      title: t("landedCosts.columns.supplier"),
      align: "left",
    },
    {
      key: "amount",
      dataIndex: "amount",
      title: t("landedCosts.columns.amount"),
      align: "right",
      render: (_v, r) => <Money value={r.amount} currency="IDR" />,
    },
    {
      key: "capitalized",
      dataIndex: "capitalized",
      title: t("landedCosts.columns.capitalized"),
      align: "right",
      render: (_v, r) => <Money value={r.capitalized} currency="IDR" />,
    },
    {
      key: "expensed",
      dataIndex: "expensed",
      title: t("landedCosts.columns.expensed"),
      align: "right",
      render: (_v, r) => <Money value={r.expensed} currency="IDR" />,
    },
    {
      key: "items",
      dataIndex: "items",
      title: t("landedCosts.columns.items"),
      align: "right",
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("landedCosts.title")}
        description={t("landedCosts.description")}
        actions={
          <ButtonLink href="/landed-costs/new" variant="primary">
            <PlusOutlined aria-hidden="true" />
            {t("landedCosts.newButton")}
          </ButtonLink>
        }
      />

      {/* Kalimat yang menyebutkan batas metodenya. Ia bukan hiasan: pembagian
          ini PROPORSI tingkat barang, bukan penelusuran lot, dan pembaca yang
          tidak diberi tahu akan menganggapnya yang kedua. Di luar pohon AntD,
          jadi penandanya ikon + kata, bukan warna latar. */}
      <p
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: CONTROL_GAP,
          marginTop: 0,
          marginBottom: SECTION_GAP,
        }}
      >
        <InfoCircleOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <small>{t("landedCosts.proportionNotice")}</small>
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ImportOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={t("landedCosts.emptyTitle")}
          description={t("landedCosts.emptyDescription")}
          actionLabel={t("landedCosts.newButton")}
          actionHref="/landed-costs/new"
        />
      ) : (
        <Card>
          <StaticTable columns={columns} rows={rows} rowKey={(r) => r.key} />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/landed-costs"
            searchParams={sp}
          />
        </Card>
      )}
    </div>
  );
}
