/**
 * Aset Tetap — register + depreciation run (issue #28).
 *
 * The register lists every asset with its running book value (nilai buku), the
 * number the Neraca reflects. Depreciation is posted monthly through the run
 * control (D: Beban Penyusutan / K: Akumulasi Penyusutan); disposal and location
 * moves live on each asset's detail page.
 *
 * ── Konversi ke token Ant Design (issue #197, fase C5) ─────────────────────
 * **Tetap server component**: registernya dibaca Prisma dan dirender sebagai
 * HTML. Karena itu `antd` tidak diimpor di sini dan warna hanya datang dari
 * primitif yang mewarnai dirinya sendiri (`Card`, `Badge`, `Money`, `Button`)
 * dan dari variabel `--ant-…` DI DALAM `<Card>`. Catatan kaki di bawah berdiri
 * di luar kartu, jadi ia memakai ikon + kata, bukan warna.
 */
import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import {
  getFixedAssets,
  summarizeFixedAssets,
  getCategories,
  type FixedAssetRow,
} from "@/lib/fixed-assets";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort } from "@/lib/utils";
import { EnvironmentOutlined, GoldOutlined, InfoCircleOutlined, PlusOutlined, TagsOutlined } from "@ant-design/icons";
import { RunDepreciation } from "./run-depreciation";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `margin` 16 · `marginXS` 8 — token AntD sebagai angka,
 *  karena berkas ini tak boleh memanggil `theme.useToken()`. */
const SECTION_GAP = 24;
const CARD_GAP = 16;
const CONTROL_GAP = 8;
const EMPTY_ICON_SIZE = 48;
/** Lebar dasar satu kartu angka: empat berjajar di 1440px, satu di 375px. */
const STAT_BASIS = 220;

const statGrid: React.CSSProperties = {
  display: "grid",
  gap: CARD_GAP,
  gridTemplateColumns: `repeat(auto-fit, minmax(${STAT_BASIS}px, 1fr))`,
  marginBottom: SECTION_GAP,
};

export default async function FixedAssetsPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePagePermission("fixed_asset.read", params);
  const t = await getT();
  const sp = await searchParams;
  const status = sp.status === "active" || sp.status === "disposed" ? sp.status : undefined;

  // Satu ambilan tanpa saring untuk ringkasan; tabelnya disaring di memori —
  // dulu register + join kategorinya dibaca DUA KALI per permintaan.
  const [allRows, categories] = await Promise.all([getFixedAssets({}), getCategories()]);
  const rows = status ? allRows.filter((r) => r.status === status) : allRows;
  const summary = summarizeFixedAssets(allRows);
  const hasCategories = categories.length > 0;

  /** Kartu angka: keterangan kecil di atas, nominal besar di bawah. */
  const statCard = (label: string, value: React.ReactNode) => (
    <Card>
      <div style={{ padding: "var(--ant-padding)" }}>
        <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>{label}</p>
        <p
          style={{
            margin: 0,
            marginTop: "var(--ant-margin-xxs)",
            fontSize: "var(--ant-font-size-heading-3)",
            fontWeight: "var(--ant-font-weight-strong)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </p>
      </div>
    </Card>
  );

  const columns: SaiColumns<FixedAssetRow> = [
    {
      key: "assetNo",
      dataIndex: "assetNo",
      title: t("fixedAssets.colNumber"),
      align: "left",
      render: (_v, r) => (
        <Link
          href={`/fixed-assets/${r.id}`}
          style={{
            color: "var(--ant-color-link)",
            fontWeight: "var(--ant-font-weight-strong)",
          }}
        >
          {r.assetNo}
        </Link>
      ),
    },
    { key: "name", dataIndex: "name", title: t("fixedAssets.colName"), align: "left" },
    {
      key: "categoryName",
      dataIndex: "categoryName",
      title: t("fixedAssets.colCategory"),
      align: "left",
    },
    {
      key: "location",
      dataIndex: "location",
      title: t("fixedAssets.colLocation"),
      align: "left",
      // Lokasi kosong = belum dicatat, bukan "tanpa lokasi" — em dash, bukan teks.
      render: (_v, r) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{r.location ?? "—"}</span>
      ),
    },
    {
      key: "acquisitionDate",
      dataIndex: "acquisitionDate",
      title: t("fixedAssets.colAcquired"),
      align: "left",
      render: (_v, r) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatDateShort(r.acquisitionDate)}
        </span>
      ),
    },
    moneyColumn<FixedAssetRow>({
      dataIndex: "acquisitionCost",
      title: t("fixedAssets.colCost"),
      sorter: false,
    }),
    moneyColumn<FixedAssetRow>({
      dataIndex: "accumulatedDepreciation",
      title: t("fixedAssets.colAccumulated"),
      sorter: false,
    }),
    {
      key: "bookValue",
      dataIndex: "bookValue",
      title: t("fixedAssets.colBookValue"),
      align: "right",
      render: (_v, r) => (
        <Money
          value={r.bookValue}
          currency="IDR"
          style={{ fontWeight: "var(--ant-font-weight-strong)" }}
        />
      ),
    },
    {
      key: "status",
      dataIndex: "status",
      title: t("common.status"),
      align: "left",
      render: (_v, r) =>
        r.status === "disposed" ? (
          <Badge variant="default">{t("fixedAssets.statusDisposed")}</Badge>
        ) : r.isFullyDepreciated ? (
          <Badge variant="warning">{t("fixedAssets.statusFullyDepreciated")}</Badge>
        ) : (
          <Badge variant="success">{t("common.active")}</Badge>
        ),
    },
  ];

  const filters = [
    { key: "all", label: t("fixedAssets.filterAll"), href: "/fixed-assets", active: !status },
    {
      key: "active",
      label: t("fixedAssets.filterActive"),
      href: "/fixed-assets?status=active",
      active: status === "active",
    },
    {
      key: "disposed",
      label: t("fixedAssets.filterDisposed"),
      href: "/fixed-assets?status=disposed",
      active: status === "disposed",
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("fixedAssets.title")}
        description={t("fixedAssets.descriptionBefore")}
        actions={
          <>
            <ButtonLink href="/fixed-assets/by-location" variant="secondary">
              <EnvironmentOutlined aria-hidden="true" />
              {t("fixedAssets.byLocation")}
            </ButtonLink>
            <ButtonLink href="/fixed-assets/categories" variant="secondary">
              <TagsOutlined aria-hidden="true" />
              {t("fixedAssets.categories")}
            </ButtonLink>
            {/* Aksi utama layar ini (#267) — dua tombol di sebelahnya sudah
                `secondary` sejak semula, jadi ini satu-satunya di kepala.
                Tabrakan dengan `RunDepreciation` di bawah DISELESAIKAN di
                potongan 4: kartu itu turun ke `secondary`, alasannya di kepala
                `run-depreciation.tsx`. */}
            <ButtonLink href="/fixed-assets/new" variant="primary">
              <PlusOutlined aria-hidden="true" />
              {t("fixedAssets.addNew")}
            </ButtonLink>
          </>
        }
      />

      <div style={statGrid}>
        {statCard(t("fixedAssets.activeCount"), summary.activeCount)}
        {statCard(t("fixedAssets.cost"), <Money value={summary.cost} currency="IDR" />)}
        {statCard(
          t("fixedAssets.accumulated"),
          <Money value={summary.accumulated} currency="IDR" />
        )}
        {statCard(t("fixedAssets.bookValue"), <Money value={summary.book} currency="IDR" />)}
      </div>

      {hasCategories && <RunDepreciation />}

      {/* Saringan status — tautan GET; tiga keadaan tidak butuh JavaScript. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: CONTROL_GAP,
          marginBlock: SECTION_GAP,
        }}
      >
        {/* Chip saringan: aktif `secondary` (berbingkai), sisanya `ghost`.
            Menyaring tidak mengikat (§Aksi utama per layar); isian penuh di
            sini bersaing dengan "Tambah Aset" di kepala halaman. */}
        {filters.map((f) => (
          /* `key` pindah ke elemen terluar yang tersisa — dan sekarang hanya ada
             SATU elemen, jadi tidak ada lagi tempat salah untuk menaruhnya. */
          <ButtonLink
            key={f.key}
            href={f.href}
            variant={f.active ? "secondary" : "ghost"}
            size="sm"
          >
            {f.label}
          </ButtonLink>
        ))}
      </div>

      {!hasCategories ? (
        <EmptyState
          icon={<TagsOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={t("fixedAssets.noCategoryTitle")}
          description={t("fixedAssets.noCategoryDescription")}
          actionLabel={t("fixedAssets.createCategory")}
          actionHref="/fixed-assets/categories"
        />
      ) : (
        <Card>
          <StaticTable<FixedAssetRow>
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                icon={<GoldOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
                title={t("fixedAssets.emptyTitle")}
                description={t("fixedAssets.emptyDescription")}
                actionLabel={t("fixedAssets.addNew")}
                actionHref="/fixed-assets/new"
              />
            }
          />
        </Card>
      )}

      {/* Catatan di LUAR kartu: ikon + kata, tanpa warna token (lihat kepala). */}
      <p
        style={{
          margin: 0,
          marginTop: SECTION_GAP,
          display: "flex",
          alignItems: "flex-start",
          gap: CONTROL_GAP,
        }}
      >
        <InfoCircleOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <small>
          {t("fixedAssets.footnoteBefore")} <strong>{t("fixedAssets.footnoteEntry")}</strong>
          {t("fixedAssets.footnoteAfter")}
        </small>
      </p>
    </div>
  );
}
