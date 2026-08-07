import { prisma } from "@/lib/prisma";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import {
  countStockHealth,
  stockLevelsFromTotals,
  toLowStockAlerts,
} from "@/lib/inventory";
import { StockAlertBanner } from "@/components/dashboard/stock-alert-banner";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Link } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ContainerOutlined } from "@ant-design/icons";
import { OpnameForm } from "./opname-form";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Stok Opname — dikonversi ke token Ant Design (issue #198). **Tetap server
 * component**; formulir hitung fisiknya (`OpnameForm`) yang menjadi pulau
 * client, seperti sebelumnya.
 */

/** `marginLG` 24 · `margin` 16 — token AntD sebagai angka (berkas ini server). */
const SECTION_GAP = 24;
const CARD_GAP = 16;
const STAT_BASIS = 160;
const EMPTY_ICON_SIZE = 48;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

/** Kartu angka ringkas: keterangan kecil di atas, angkanya besar di bawah. */
function statCard(label: string, value: number, color?: string) {
  return (
    <Card>
      <div style={{ padding: "var(--ant-padding)" }}>
        <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>{label}</p>
        <p
          style={{
            margin: 0,
            marginTop: "var(--ant-margin-xxs)",
            fontSize: "var(--ant-font-size-heading-3)",
            fontWeight: STRONG,
            fontVariantNumeric: "tabular-nums",
            color,
          }}
        >
          {value}
        </p>
      </div>
    </Card>
  );
}

export default async function StockOpnamePage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  // Sama seperti /inventory: semua peran boleh, tapi wajib login (audit RBAC fase 0).
  await requirePagePermission("inventory.write", params);
  const t = await getT();
  /*
   * RINGKASAN, BUKAN SELURUH GERAKAN STOK — pola yang sama dengan Beranda.
   *
   * Sebelumnya baris ini memuat SETIAP barang beserta SELURUH riwayat gerakannya
   * (semua kolom), lalu `summarizeInventory` menghitung biaya rata-rata
   * tertimbang, nilai persediaan, dan gerakan terakhir untuk tiap barang —
   * padahal halaman ini memakai SATU angka saja: saldo saat ini. Pekerjaannya
   * tumbuh seumur perusahaan dan diulang tiap kali halaman dibuka.
   *
   * Penjumlahannya kini dilakukan basis data, lalu `stockLevelsFromTotals`
   * menerapkan aturan saldo yang sama persis dengan `calculateStockTotals`
   * (dibuktikan tests/inventory-value.test.ts). Angkanya identik; yang hilang
   * hanya pekerjaannya.
   */
  const [allItems, movementTotals] = await Promise.all([
    prisma.item.findMany({
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.groupBy({ by: ["itemId", "type"], _sum: { quantity: true } }),
  ]);

  const opnameItems = stockLevelsFromTotals(
    allItems,
    movementTotals.map((row) => ({
      itemId: row.itemId,
      type: row.type,
      quantity: Number(row._sum.quantity ?? 0),
    }))
  );

  const stockHealth = countStockHealth(opnameItems);
  const lowStockAlerts = toLowStockAlerts(opnameItems);
  const totalCount = stockHealth.totalItems;

  return (
    <div>
      {/* `mb-1` lama tidak pernah berlaku: `PageHeader` menulis `marginBottom`
          sebaris, dan gaya sebaris selalu menang atas kelas. */}
      <PageHeader
        // Sub-halaman Stok tanpa remah roti memaksa pengguna kembali lewat menu
        // samping — satu-satunya jalan pulang sebelum ini.
        breadcrumbs={[
          { label: t("nav.items.inventory"), href: "/inventory" },
          { label: t("nav.items.inventoryOpname") },
        ]}
        title={<TermTooltip term="stok_opname">{t("nav.items.inventoryOpname")}</TermTooltip>}
        description={t("inventory.opnameDescription", { threshold: LOW_STOCK_THRESHOLD })}
        actions={
          <>
            {/* Hitung ulang yang SUDAH terjadi punya halamannya sendiri: layar
                ini adalah formulir untuk menghitung HARI INI, dan menyaringnya
                per minggu/bulan/tahun tidak punya arti — yang disaring per
                periode adalah riwayatnya (issue #129). */}
            <Link href="/inventory/opname/history">
              <Button variant="secondary">{t("opnameHistory.linkLabel")}</Button>
            </Link>
            <Link href="/inventory/update">
              <Button>{t("common.addRemoveStock")}</Button>
            </Link>
          </>
        }
      />
      <div style={{ marginBottom: SECTION_GAP }}>
        <LearnMore term="stok_opname" />
      </div>

      <div style={{ marginBottom: SECTION_GAP }}>
        <StockAlertBanner items={lowStockAlerts} />
      </div>

      {/* Summary */}
      <div
        style={{
          display: "grid",
          gap: CARD_GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${STAT_BASIS}px, 1fr))`,
          marginBottom: SECTION_GAP,
        }}
      >
        {statCard(t("dashboard.statItems"), stockHealth.totalItems)}
        {statCard(
          t("dashboard.statHealthy"),
          stockHealth.healthy,
          "var(--ant-color-money-positive)"
        )}
        {statCard(t("dashboard.statLow"), stockHealth.lowStock, "var(--ant-color-money-pending)")}
        {statCard(t("dashboard.statEmpty"), stockHealth.empty, "var(--ant-color-money-negative)")}
      </div>

      {/* Formulir hitung fisik → penyesuaian (issue #57) */}
      <Card>
        <div
          style={{
            padding: "var(--ant-padding-lg)",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "var(--ant-font-size-lg)", fontWeight: STRONG }}>
            {t("inventory.opnameFormTitle", { count: totalCount })}
          </h2>
        </div>
        <div style={{ padding: "var(--ant-padding-lg)" }}>
          {opnameItems.length === 0 ? (
            <EmptyState
              icon={<ContainerOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("inventory.emptyTitle")}
              description={t("inventory.opnameEmptyDescription")}
              actionLabel={t("common.addRemoveStock")}
              actionHref="/inventory/update"
            />
          ) : (
            <OpnameForm items={opnameItems} />
          )}
        </div>
      </Card>
    </div>
  );
}
