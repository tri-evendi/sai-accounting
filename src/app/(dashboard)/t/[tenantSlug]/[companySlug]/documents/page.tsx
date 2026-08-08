import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { type DocumentType } from "@/lib/constants";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FileTextOutlined } from "@ant-design/icons";
import {
  parseSort,
  sortOrderBy,
  sortableKeys,
  type SortSpec,
} from "@/lib/table-sort";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, parsePageParam } from "@/lib/utils";
import { DocumentPreviewButton } from "./document-preview-button";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { documentTypeLabels } from "@/lib/i18n/labels";

export const dynamic = "force-dynamic";

/**
 * Daftar Dokumen — dikonversi ke `StaticTable` + token AntD (issue #198).
 * **Tetap server component**; pratinjau berkasnya (`DocumentPreviewButton`)
 * yang menjadi pulau client, seperti sebelumnya.
 *
 * ── Sortir kolom lewat URL (issue #265) ────────────────────────────────────
 * Halaman ini pembuktian sisi NULL-nya. `documents.type` adalah `String?` —
 * dokumen tanpa jenis memang ada, dan tabelnya menuliskannya "-". Kolom itu
 * SENGAJA tidak ditawarkan sortirnya: MySQL menganggap NULL nilai terkecil dan
 * tidak punya `NULLS LAST` sama sekali (opsi `nulls` Prisma hanya ada di
 * compiler PostgreSQL/CockroachDB), jadi mengurutkannya menaik akan menaikkan
 * blok baris "-" ke puncak — persis yang dilarang butir 4 Prinsip Inti
 * MASTER.md. Alasan panjangnya di kepala `lib/table-sort.ts`.
 *
 * Yang ditawarkan hanya kolom NOT NULL: nama berkas dan waktu unggah.
 */

/** `margin` 16 · `marginXS` 8 — token AntD sebagai angka (berkas ini server). */
const CONTROL_GAP = 8;
const SECTION_GAP = 16;
/** Lebar nyaman kotak pencarian (`max-w-md` lama = 28rem). */
const SEARCH_MAX_WIDTH = 448;
const EMPTY_ICON_SIZE = 48;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

const MUTED: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };

/**
 * Kunci kolom yang bisa diurutkan → `orderBy` Prisma-nya (issue #265).
 * `id` sebagai pemutus seri — lihat catatan urutan bawaan di bawah.
 */
const SORTABLE: SortSpec<Prisma.DocumentOrderByWithRelationInput[]> = {
  filename: (dir) => [{ filename: dir }, { id: dir }],
  uploadedAt: (dir) => [{ createdAt: dir }, { id: dir }],
};

/** Satu baris daftar, diratakan dari Prisma supaya kolomnya bertipe penuh. */
interface DocumentRow {
  id: number;
  filename: string;
  filepath: string;
  type: string | null;
  contractNo: string | null;
  uploadedAt: string;
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ search?: string; page?: string; sort?: string; dir?: string }>;
}) {
  await requirePagePermission("document.read", params);
  const t = await getT();
  const typeLabels = documentTypeLabels(await getDictionary(await getLocale()));
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 10;

  // Pencarian menutup tiga kolom pengenal yang tampil di daftar: nama berkas,
  // jenis dokumen, dan nomor kontrak yang tertaut (pola /contracts).
  const where: Record<string, unknown> = {};
  if (filters.search) {
    where.OR = [
      { filename: { contains: filters.search } },
      { type: { contains: filters.search } },
      { contract: { contractNo: { contains: filters.search } } },
    ];
  }

  // Tanpa `?sort=` urutannya persis seperti sebelum #265.
  const sort = parseSort(filters, SORTABLE);

  const [documents, totalCount] = await Promise.all([
    prisma.document.findMany({
      where,
      // `id` sebagai pemutus seri — beberapa unggahan bisa berbagi detik
      // `createdAt` yang sama, dan tanpa urutan total baris bisa berpindah
      // halaman antar permintaan (paginasi jadi tampak "loncat").
      orderBy: sortOrderBy(sort, SORTABLE, [{ createdAt: "desc" }, { id: "desc" }]),
      include: { contract: true },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.document.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const rows: DocumentRow[] = documents.map((doc) => ({
    id: doc.id,
    filename: doc.filename,
    filepath: doc.filepath,
    type: doc.type,
    contractNo: doc.contract ? doc.contract.contractNo : null,
    uploadedAt: formatDate(doc.createdAt),
  }));

  const columns: SaiColumns<DocumentRow> = [
    {
      key: "filename",
      dataIndex: "filename",
      title: t("documents.colFilename"),
      align: "left",
      sorter: true,
      // Berkas yang diunggah dibuka di tab baru — tautan KELUAR dari aplikasi,
      // jadi ia `<a>` biasa dan bukan `Link` bertenant.
      render: (_v, row) => (
        <a
          href={row.filepath}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--ant-color-link)", fontWeight: STRONG }}
        >
          {row.filename}
        </a>
      ),
    },
    {
      key: "type",
      dataIndex: "type",
      title: t("suppliers.colType"),
      align: "left",
      render: (_v, row) => (
        <span style={MUTED}>
          {row.type ? typeLabels[row.type as DocumentType] ?? row.type : "-"}
        </span>
      ),
    },
    {
      key: "contract",
      dataIndex: "contractNo",
      title: t("nav.items.contracts"),
      align: "left",
      render: (_v, row) => <span style={MUTED}>{row.contractNo ?? "-"}</span>,
    },
    {
      key: "uploadedAt",
      dataIndex: "uploadedAt",
      title: t("documents.colUploadedAt"),
      align: "left",
      sorter: true,
      render: (_v, row) => <span style={MUTED}>{row.uploadedAt}</span>,
    },
    {
      key: "actions",
      title: t("common.actions"),
      align: "right",
      render: (_v, row) => (
        <DocumentPreviewButton filename={row.filename} filepath={row.filepath} />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("nav.items.documents")}
        actions={
          <Link href="/documents/upload">
            {/* Aksi utama layar ini (#267). CTA keadaan-kosong menunjuk tempat
                yang sama dan sengaja `secondary` — lihat `ui/empty-state.tsx`. */}
            <Button variant="primary">{t("documents.addNew")}</Button>
          </Link>
        }
      />

      {/* Search — GET form (pola /contracts); saringan baru = kembali ke hal. 1. */}
      <form
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: CONTROL_GAP,
          marginBottom: SECTION_GAP,
        }}
      >
        <TextInput
          type="text"
          name="search"
          placeholder={t("common.search")}
          defaultValue={filters.search}
          style={{ flex: `1 1 ${SEARCH_MAX_WIDTH}px`, maxWidth: SEARCH_MAX_WIDTH }}
        />
        {/* Kirim yang hanya MENYARING — `outline` (#267), preseden "Saring" di
            `/operator` dan `shared/ledger-filter.tsx`. */}
        <Button type="submit" variant="outline">
          {t("common.search")}
        </Button>
      </form>

      <Card>
        <div
          style={{
            padding: "var(--ant-padding-lg)",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "var(--ant-font-size-lg)", fontWeight: STRONG }}>
            {t("documents.listTitle", { count: totalCount })}
          </h2>
        </div>
        <StaticTable<DocumentRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          sort={{
            basePath: "/documents",
            // Kata kunci pencarian dan nomor halaman ikut di tautan sortir.
            params: filters,
            keys: sortableKeys(SORTABLE),
            active: sort,
          }}
          empty={
            <EmptyState
              icon={<FileTextOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("documents.emptyTitle")}
              description={t("documents.emptyDescription")}
              actionLabel={t("documents.addNew")}
              actionHref="/documents/upload"
            />
          }
        />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/documents" searchParams={filters} />
      </Card>
    </div>
  );
}
