/**
 * Daftar Kontrak — dikonversi ke token Ant Design pada issue #195 (fase C3).
 *
 * **Tetap server component.** Halaman ini membaca buku besar lewat Prisma dan
 * merender tabelnya sebagai HTML; tidak ada satu baris JavaScript pun yang
 * dikirim untuk daftar itu. Konsekuensinya untuk gaya, dan ini yang menentukan
 * seluruh bentuk berkas ini: **`antd` tidak boleh diimpor di sini**
 * (`tests/rsc-boundary.test.ts`), jadi `theme.useToken()` tidak tersedia.
 *
 * Warna karena itu datang dari dua sumber saja — sama seperti `shared/aging.tsx`:
 *  • primitif yang mewarnai dirinya sendiri (`Button`, `Badge`, `StatusBadge`,
 *    `EmptyState`), yang dirender sebagai DAUN client;
 *  • variabel `--ant-…`, TAPI hanya untuk simpul yang berada di dalam sebuah
 *    komponen AntD — `ConfigProvider` memasang variabelnya pada elemen
 *    ber-kelas `css-var-root` yang digambar komponen AntD sendiri, bukan pada
 *    `:root`. Di dalam `<Card>` (AntD) variabelnya teratasi; di luar tidak.
 *
 * Tabelnya kini `StaticTable` (#189): kolom sebagai data, dirender di server.
 */

import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { statusColumn } from "@/components/ui/status-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { ChartCard } from "@/components/dashboard/chart-card";
import {
  ContractStatusChart,
  MonthlyActivityChart,
} from "@/components/shared/dashboard-charts";
import { chartPeriodStart, monthlyActivitySeries } from "@/lib/chart-data";
import { canEffective } from "@/lib/authz-effective";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { FileText } from "lucide-react";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { contractStatusLabels, statusFilterLabels } from "@/lib/i18n/labels";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

/**
 * Jarak yang tidak bisa dibaca dari token di sini — berkas ini tanpa hook dan
 * tanpa `antd`. Nilainya SAMA dengan token yang seharusnya dipakai, dan
 * disebut supaya #203 bisa menukarnya tanpa menebak: `marginLG` 24,
 * `marginXS` 8, `marginXXS` 4.
 */
const SECTION_GAP = 24;
const CONTROL_GAP = 8;
/** Lebar nyaman kotak pencarian (`max-w-md` lama = 28rem). */
const SEARCH_MAX_WIDTH = 448;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** Titik patah `lg` AntD; di bawahnya grafik menumpuk satu kolom. */
const CHART_MIN_WIDTH = 360;

/** Satu baris daftar, sudah diratakan dari Prisma supaya kolomnya bertipe. */
interface ContractRow {
  id: number;
  contractNo: string;
  date: string;
  buyer: string;
  consignee: string;
  itemCount: number;
  currency: string;
  status: string;
}

export default async function ContractsPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const session = await requirePagePermission("contract.read", params);
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const statusLabels = statusFilterLabels(dictionary);
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 10;
  const where: Record<string, unknown> = {};

  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }

  if (filters.search) {
    where.OR = [
      { contractNo: { contains: filters.search } },
      { buyer: { contains: filters.search } },
      { consignee: { contains: filters.search } },
      { consigneeRef: { name: { contains: filters.search } } },
    ];
  }

  /*
   * Grafik (dipindah dari Beranda).
   *
   * "Aktivitas bulanan" menghitung kontrak DAN tagihan, dua izin yang berbeda.
   * Halaman ini hanya menjamin `contract.read`, jadi barisnya tidak diambil
   * dan grafiknya tidak dirender untuk pengguna yang tak boleh membaca
   * tagihan — bukan diambil lalu hasilnya dibuang. Matriks efektif yang
   * ditanya (`canEffective`), bukan asumsi "core pasti boleh".
   */
  const canViewInvoices = await canEffective(session.user, "invoice.read");
  // Satu `now` untuk batas kueri DAN pelabelan ember, supaya keduanya tidak
  // bisa jatuh di sisi tengah malam yang berbeda.
  const now = new Date();
  const chartFrom = chartPeriodStart(now);

  const [contracts, totalCount, statusCounts, recentContracts, recentInvoices] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { date: "desc" },
      include: { items: true, payments: true, consigneeRef: true },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.contract.count({ where }),
    // Donat status menghitung SELURUH kontrak, bukan halaman/saringan yang
    // sedang aktif: menyaring `status=pending` lalu menggambar donatnya
    // hanya akan menghasilkan satu irisan 100%.
    prisma.contract.groupBy({ by: ["status"], _count: { _all: true } }),
    // Deret kontrak ikut TIDAK diambil kalau grafiknya memang tidak dirender.
    canViewInvoices
      ? prisma.contract.findMany({
          where: { createdAt: { gte: chartFrom } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
    canViewInvoices
      ? prisma.invoice.findMany({
          where: { createdAt: { gte: chartFrom } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count._all]));
  const contractStatusLabel = contractStatusLabels(dictionary);
  // Urutan sah → menunggu → dibatalkan MENENTUKAN warna irisannya
  // (hijau/kuning/merah dipasangkan per POSISI di `ContractStatusChart`).
  const contractStatusData = [
    { name: contractStatusLabel.signed, value: countByStatus.get("signed") ?? 0 },
    { name: contractStatusLabel.pending, value: countByStatus.get("pending") ?? 0 },
    { name: contractStatusLabel.canceled, value: countByStatus.get("canceled") ?? 0 },
  ];
  const monthlyData = monthlyActivitySeries(recentContracts, recentInvoices, now);

  const rows: ContractRow[] = contracts.map((contract) => ({
    id: contract.id,
    contractNo: contract.contractNo,
    date: formatDateShort(contract.date),
    buyer: contract.buyer,
    consignee: contract.consigneeRef?.name || contract.consignee || "-",
    itemCount: contract.items.length,
    currency: contract.currency,
    status: contract.status,
  }));

  const columns: SaiColumns<ContractRow> = [
    {
      key: "contractNo",
      dataIndex: "contractNo",
      title: t("contracts.colNo"),
      align: "left",
      render: (_value, row) => (
        // Warna tautan datang dari `--ant-color-link` (= `colorBrandText`,
        // 5,65:1) — variabelnya teratasi karena tabel ini hidup di dalam
        // `<Card>` AntD.
        <Link
          href={`/contracts/${row.id}`}
          style={{ color: "var(--ant-color-link)", fontWeight: "var(--ant-font-weight-strong)" }}
        >
          {row.contractNo}
        </Link>
      ),
    },
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      align: "left",
      render: (_value, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.date}</span>
      ),
    },
    { key: "buyer", dataIndex: "buyer", title: t("contracts.colBuyer"), align: "left" },
    {
      key: "consignee",
      dataIndex: "consignee",
      title: (
        <TermTooltip term="penerima_barang">{t("contracts.colConsignee")}</TermTooltip>
      ),
      align: "left",
    },
    {
      key: "itemCount",
      dataIndex: "itemCount",
      title: t("contracts.colItemCount"),
      align: "right",
      // Jumlah baris barang — KUANTITAS, bukan uang: tidak boleh memakai
      // topeng rupiah.
      render: (_value, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.itemCount}</span>
      ),
    },
    { key: "currency", dataIndex: "currency", title: t("common.currency"), align: "left" },
    statusColumn<ContractRow>({ dataIndex: "status", title: t("common.status") }),
  ];

  return (
    <div>
      {/*
       * Tombol aksi tetap `<Link><Button/></Link>`, BUKAN `Button asChild`.
       * Keduanya menghapus `className` yang jadi sasaran issue ini, tetapi
       * `asChild` merender `<a href>` milik AntD — pemuatan halaman PENUH
       * (lihat catatan `asChild` di `ui/button.tsx`). Untuk perpindahan di
       * dalam modul yang sama, itu menukar satu kelas Tailwind dengan satu
       * regresi kecepatan yang terasa. Sarang anchor–tombol yang tersisa
       * adalah utang lama di 46 tempat, bukan sesuatu yang ditambah di sini.
       */}
      <PageHeader
        title={<TermTooltip term="kontrak">{t("contracts.title", { count: totalCount })}</TermTooltip>}
        actions={
          <Link href="/contracts/new">
            <Button>{t("contracts.addNew")}</Button>
          </Link>
        }
      />
      <div style={{ marginBottom: SECTION_GAP }}>
        <LearnMore term="kontrak" label={t("contracts.learnMoreList")} />
      </div>

      {/* Filters — hrefs membawa `search` yang sedang aktif agar berganti tab
          tidak diam-diam membuang kata kunci pencarian. `page` sengaja TIDAK
          dibawa: saringan baru = kembali ke halaman 1. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: CONTROL_GAP,
          marginBottom: CONTROL_GAP * 2,
        }}
      >
        {["all", "signed", "pending", "canceled"].map((status) => {
          const query = new URLSearchParams();
          if (status !== "all") query.set("status", status);
          if (filters.search) query.set("search", filters.search);
          const qs = query.toString();
          return (
            <Link key={status} href={`/contracts${qs ? `?${qs}` : ""}`}>
              <Button
                variant={
                  filters.status === status || (!filters.status && status === "all")
                    ? "primary"
                    : "secondary"
                }
                size="sm"
              >
                {statusLabels[status] ?? status}
              </Button>
            </Link>
          );
        })}
      </div>

      {/* Search — GET form; `status` ikut sebagai hidden input supaya mencari
          tidak mereset tab status yang sedang aktif. */}
      <form
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: CONTROL_GAP,
          marginBottom: CONTROL_GAP * 2,
        }}
      >
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        <TextInput
          type="text"
          name="search"
          placeholder={t("contracts.searchPlaceholder")}
          defaultValue={filters.search}
          style={{ flex: `1 1 ${SEARCH_MAX_WIDTH}px`, maxWidth: SEARCH_MAX_WIDTH }}
        />
        <Button type="submit">{t("common.search")}</Button>
      </form>

      {/* Grafik: sebaran status + tren bulanan, di bawah saringan & sebelum
          daftarnya — konteks dulu, baru barisnya. Kedua kartu tumbuh membagi
          baris dan turun sendiri saat tak muat; menggantikan
          `lg:grid-cols-2` yang harus tahu lebih dulu berapa kartunya. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: SECTION_GAP,
          marginBottom: SECTION_GAP,
        }}
      >
        <div style={{ flex: `1 1 ${CHART_MIN_WIDTH}px`, minWidth: 0 }}>
          <ChartCard
            title={t("dashboard.chartContractStatusTitle")}
            description={t("dashboard.chartContractStatusDesc")}
          >
            <ContractStatusChart data={contractStatusData} />
          </ChartCard>
        </div>
        {canViewInvoices && (
          <div style={{ flex: `1 1 ${CHART_MIN_WIDTH}px`, minWidth: 0 }}>
            <ChartCard
              title={t("dashboard.chartMonthlyTitle")}
              description={t("dashboard.chartMonthlyDesc")}
            >
              <MonthlyActivityChart data={monthlyData} />
            </ChartCard>
          </div>
        )}
      </div>

      {/* Table */}
      <Card>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<FileText size={EMPTY_ICON_SIZE} />}
              title={t("contracts.emptyTitle")}
              description={t("contracts.emptyDescription")}
              actionLabel={t("contracts.addNew")}
              actionHref="/contracts/new"
            />
          }
        />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/contracts" searchParams={filters} />
      </Card>
    </div>
  );
}
