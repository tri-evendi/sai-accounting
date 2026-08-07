/**
 * Surat Jalan / Delivery Order — daftar (issue #14).
 *
 * Surat jalan kini dokumen tersimpan (bukan sekadar PDF): setiap baris menyebut
 * dokumen sumber (kontrak/faktur) dan consignee, membawa total kuantitas (kg),
 * dan menautkan ke detail + cetak PDF. Kuantitas rata-kanan & tabular per MASTER.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber, formatDateShort, parsePageParam } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { InfoCircleOutlined, PlusOutlined, TruckOutlined } from "@ant-design/icons";
export const dynamic = "force-dynamic";

/**
 * Berkas ini server component — tanpa `antd`, tanpa `theme.useToken()`.
 * Angka di bawah SAMA dengan tokennya (`marginLG` 24, `marginXS` 8), ditulis
 * di satu tempat supaya #203 bisa menukarnya tanpa menebak.
 */
const SECTION_GAP = 24;
const CONTROL_GAP = 8;
/** Lebar nyaman kotak pencarian (`max-w-md` lama = 28rem). */
const SEARCH_MAX_WIDTH = 448;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

/** Satu baris daftar, diratakan dari Prisma supaya kolomnya bertipe penuh. */
interface DeliveryOrderRow {
  id: number;
  no: string;
  date: string;
  consignee: string;
  source: string;
  totalBags: number;
  totalKg: number;
  canceled: boolean;
}

export default async function DeliveryOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  await requirePagePermission("delivery_order.read", params);
  const t = await getT();
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 20;

  // Pencarian menutup nomor SJ dan nama consignee — dua kolom pengenal yang
  // benar-benar tampil di daftar (pola /contracts).
  const where: Record<string, unknown> = {};
  if (filters.search) {
    where.OR = [
      { no: { contains: filters.search } },
      { consignee: { name: { contains: filters.search } } },
    ];
  }

  const [orders, totalCount] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        items: true,
        contract: { select: { contractNo: true } },
        invoice: { select: { invoiceNo: true } },
        consignee: { select: { name: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.deliveryOrder.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const rows: DeliveryOrderRow[] = orders.map((o) => ({
    id: o.id,
    no: o.no,
    date: formatDateShort(o.date),
    consignee: o.consignee?.name || "—",
    source: o.contract?.contractNo || o.invoice?.invoiceNo || "—",
    totalBags: o.items.reduce((s, i) => s + i.bags, 0),
    totalKg: o.items.reduce((s, i) => s + Number(i.quantity), 0),
    canceled: o.status === "canceled",
  }));

  /** Kolom KUANTITAS — id-ID + tabular-nums, tanpa topeng rupiah. */
  const qty = (value: number) => (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(value)}</span>
  );

  const columns: SaiColumns<DeliveryOrderRow> = [
    {
      key: "no",
      dataIndex: "no",
      title: t("deliveryOrders.colNo"),
      align: "left",
      render: (_v, row) => (
        // Tabel ini hidup di dalam `<Card>` AntD, jadi `--ant-color-link`
        // teratasi di sini (di luar pohon AntD ia tidak).
        <Link
          href={`/delivery-orders/${row.id}`}
          style={{ color: "var(--ant-color-link)", fontWeight: "var(--ant-font-weight-strong)" }}
        >
          {row.no}
        </Link>
      ),
    },
    { key: "date", dataIndex: "date", title: t("common.date"), align: "left" },
    {
      key: "consignee",
      dataIndex: "consignee",
      title: t("deliveryOrders.colConsignee"),
      align: "left",
    },
    { key: "source", dataIndex: "source", title: t("deliveryOrders.colSource"), align: "left" },
    {
      key: "totalBags",
      dataIndex: "totalBags",
      title: t("common.bags"),
      align: "right",
      render: (_v, row) => qty(row.totalBags),
    },
    {
      key: "totalKg",
      dataIndex: "totalKg",
      title: t("deliveryOrders.colTotalKg"),
      align: "right",
      render: (_v, row) => qty(row.totalKg),
    },
    {
      key: "status",
      dataIndex: "canceled",
      title: t("common.status"),
      align: "left",
      // Status lewat kata, bukan warna saja; nilai enum DB tidak tampil mentah.
      render: (_v, row) => (
        <Badge variant={row.canceled ? "danger" : "success"}>
          {row.canceled ? t("status.contract.canceled") : t("deliveryOrders.statusIssued")}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("deliveryOrders.title")}
        description={t("deliveryOrders.description")}
        actions={
          <Link href="/delivery-orders/new">
            <Button>
              {/* Jarak ikon–teks dari `iconGap` `.ant-btn`; ukurannya dari
                  primitif `Button`. */}
              <PlusOutlined aria-hidden="true" />
              {t("deliveryOrders.addNew")}
            </Button>
          </Link>
        }
      />

      {/* Catatan "surat jalan tidak memindahkan stok". Bidangnya `colorFillAlter`
          + batas `colorBorderSecondary`; keduanya variabel AntD, dan di SINI ia
          berada di luar pohon komponen AntD — karena itu warnanya sengaja tidak
          dipakai sebagai penanda: ikon + kata yang membawa maknanya, dan
          kalimatnya tetap terbaca kalau variabelnya tak teratasi. */}
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
        <small>
          {t("deliveryOrders.stockNoteA")} <strong>{t("deliveryOrders.stockNoteStrong")}</strong>{" "}
          {t("deliveryOrders.stockNoteB")}
        </small>
      </p>

      {/* Search — GET form (pola /contracts); saringan baru = kembali ke hal. 1. */}
      <form
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: CONTROL_GAP,
          marginBottom: CONTROL_GAP * 2,
        }}
      >
        <TextInput
          type="text"
          name="search"
          placeholder={t("common.search")}
          defaultValue={filters.search}
          style={{ flex: `1 1 ${SEARCH_MAX_WIDTH}px`, maxWidth: SEARCH_MAX_WIDTH }}
        />
        <Button type="submit">{t("common.search")}</Button>
      </form>

      {orders.length === 0 ? (
        <EmptyState
          icon={<TruckOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={t("deliveryOrders.emptyTitle")}
          description={t("deliveryOrders.emptyDescription")}
          actionLabel={t("deliveryOrders.addNew")}
          actionHref="/delivery-orders/new"
        />
      ) : (
        <Card>
          <StaticTable columns={columns} rows={rows} rowKey={(row) => row.id} />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/delivery-orders"
            searchParams={filters}
          />
        </Card>
      )}
    </div>
  );
}
