/**
 * Daftar Tagihan Penjualan — dikonversi ke token Ant Design pada issue #195.
 *
 * **Tetap server component**, jadi `antd` tidak boleh diimpor di sini
 * (`tests/rsc-boundary.test.ts`). Warna datang dari primitif yang mewarnai
 * dirinya sendiri dan dari variabel `--ant-…` yang hanya dipakai di dalam
 * pohon komponen AntD (di sini: `<Card>`) — alasannya ditulis panjang di
 * kepala `contracts/page.tsx` dan `shared/aging.tsx`.
 *
 * ── Sortir kolom lewat URL (issue #265) ────────────────────────────────────
 * Halaman ini pembuktian batas bentuk itu. Nomor, tanggal, dan status adalah
 * kolom basis data, jadi ketiganya diurutkan `orderBy` — dan tautannya membawa
 * `status`, `search`, serta `page` yang sedang berlaku, sehingga menyortir
 * tidak diam-diam membuang saringan yang sudah dipasang pengguna.
 *
 * Kolom "Nilai" TIDAK bisa: nilainya dihitung di memori dari baris barang +
 * PPN (`inv.items.reduce(...)`), bukan kolom yang bisa diurutkan basis data.
 * Mengurutkan 10 baris halaman ini saja akan menghasilkan "terbesar" yang
 * berubah-ubah per halaman — lebih buruk daripada tidak ada sortir sama sekali.
 * Karena itu ia tetap tanpa `sorter`; sortir nilai baru mungkin setelah faktur
 * punya kolom total yang tersimpan (dan yang dijaga tetap sinkron).
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
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import {
  parseSort,
  sortOrderBy,
  sortableKeys,
  type SortSpec,
} from "@/lib/table-sort";
import type { Prisma } from "@/generated/prisma/client";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { FileDoneOutlined } from "@ant-design/icons";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { statusFilterLabels } from "@/lib/i18n/labels";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `marginXS` 8 — token AntD, ditulis sebagai angka karena
 *  berkas ini tak boleh memanggil `theme.useToken()`. */
const SECTION_GAP = 24;
const CONTROL_GAP = 8;
/** Lebar nyaman kotak pencarian (`max-w-md` lama = 28rem). */
const SEARCH_MAX_WIDTH = 448;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

/**
 * Kunci kolom yang bisa diurutkan → `orderBy` Prisma-nya (issue #265).
 * Ketiganya kolom NOT NULL; `id` pemutus serinya.
 */
const SORTABLE: SortSpec<Prisma.InvoiceOrderByWithRelationInput[]> = {
  invoiceNo: (dir) => [{ invoiceNo: dir }, { id: dir }],
  date: (dir) => [{ date: dir }, { id: dir }],
  status: (dir) => [{ status: dir }, { id: dir }],
};

/** Satu baris daftar, diratakan dari Prisma supaya kolomnya bertipe penuh. */
interface InvoiceRow {
  id: number;
  invoiceNo: string;
  date: string;
  itemCount: number;
  paymentCount: number;
  total: number;
  currency: string;
  status: string;
}

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  await requirePagePermission("invoice.read", params);
  const t = await getT();
  const statusLabels = statusFilterLabels(await getDictionary(await getLocale()));
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 10;
  const where: Record<string, unknown> = {};

  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }

  if (filters.search) {
    where.invoiceNo = { contains: filters.search };
  }

  // Tanpa `?sort=` urutannya persis seperti sebelum #265.
  const sort = parseSort(filters, SORTABLE);

  const [invoices, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: sortOrderBy(sort, SORTABLE, [{ date: "desc" }]),
      include: {
        items: true,
        payments: true,
        // Kompensasi uang muka ikut melunasi faktur (issue #26) — kolom
        // "Pembayaran" menghitungnya juga, supaya faktur yang lunas lewat
        // uang muka tidak tampak "0 pembayaran".
        _count: { select: { advanceApplications: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.invoice.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const rows: InvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    date: formatDateShort(inv.date),
    itemCount: inv.items.length,
    paymentCount: inv.payments.length + inv._count.advanceApplications,
    // Nilai faktur di mata uangnya sendiri: subtotal baris + PPN. Sama seperti
    // `invoiceSubtotal` di lib/receivables — dihitung dari sumber, bukan kolom
    // denormal, agar tak bisa basi.
    total:
      inv.items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0) +
      Number(inv.taxAmount ?? 0),
    currency: inv.currency || "IDR",
    status: inv.status,
  }));

  /** Pencacah baris/pembayaran — kuantitas, jadi tanpa topeng rupiah. */
  const count = (value: number) => (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        color: "var(--ant-color-text-secondary)",
      }}
    >
      {value}
    </span>
  );

  const columns: SaiColumns<InvoiceRow> = [
    {
      key: "invoiceNo",
      dataIndex: "invoiceNo",
      title: t("invoices.colNo"),
      align: "left",
      sorter: true,
      render: (_v, row) => (
        <Link
          href={`/invoices/${row.id}`}
          style={{ color: "var(--ant-color-link)", fontWeight: "var(--ant-font-weight-strong)" }}
        >
          {row.invoiceNo}
        </Link>
      ),
    },
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      align: "left",
      sorter: true,
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
      key: "itemCount",
      dataIndex: "itemCount",
      title: t("invoices.colItemCount"),
      align: "right",
      render: (_v, row) => count(row.itemCount),
    },
    {
      key: "paymentCount",
      dataIndex: "paymentCount",
      title: t("invoices.colPayments"),
      align: "right",
      render: (_v, row) => count(row.paymentCount),
    },
    // Tanpa `sorter`: `total` dihitung di memori, bukan kolom basis data —
    // lihat kepala berkas.
    moneyColumn<InvoiceRow>({
      dataIndex: "total",
      title: t("invoices.colValue"),
      currency: (row) => row.currency,
    }),
    statusColumn<InvoiceRow>({
      dataIndex: "status",
      title: t("common.status"),
      sorter: true,
    }),
  ];

  return (
    <div>
      {/* Tombol aksi tetap `<Link><Button/></Link>` (bukan `<Button href>`):
          `href` merender `<a href>` AntD, yaitu pemuatan halaman PENUH. */}
      <PageHeader
        title={<TermTooltip term="faktur">{t("invoices.title", { count: totalCount })}</TermTooltip>}
        actions={
          <>
            {/* Alur terpandu = tombol utama (ramah amatir); formulir polos tetap
                tersedia untuk yang sudah hafal alurnya (issue #5). */}
            <Link href="/sales/new">
              <Button>{t("invoices.recordSaleGuided")}</Button>
            </Link>
            <Link href="/invoices/new">
              <Button variant="secondary">{t("invoices.addNew")}</Button>
            </Link>
          </>
        }
      />
      <div style={{ marginBottom: SECTION_GAP }}>
        <LearnMore term="faktur" label={t("invoices.learnMore")} />
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
            <Link key={status} href={`/invoices${qs ? `?${qs}` : ""}`}>
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
          placeholder={t("searchableSelect.searchPlaceholder")}
          defaultValue={filters.search}
          style={{ flex: `1 1 ${SEARCH_MAX_WIDTH}px`, maxWidth: SEARCH_MAX_WIDTH }}
        />
        <Button type="submit">{t("common.search")}</Button>
      </form>

      <Card>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          sort={{
            basePath: "/invoices",
            // `status`, `search`, dan `page` yang sedang berlaku ikut — sortir
            // tidak boleh membuang saringan yang sudah dipasang pengguna.
            params: filters,
            keys: sortableKeys(SORTABLE),
            active: sort,
          }}
          empty={
            <EmptyState
              icon={<FileDoneOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("invoices.emptyTitle")}
              description={t("invoices.emptyDescription")}
              actionLabel={t("invoices.recordSaleGuided")}
              actionHref="/sales/new"
            />
          }
        />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/invoices" searchParams={filters} />
      </Card>
    </div>
  );
}
