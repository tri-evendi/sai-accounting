import { canOpenPage, requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { listClosedPeriods } from "@/lib/period";
import { calculateStockTotals } from "@/lib/inventory";
import { PageHeader } from "@/components/ui/page-header";
import { LearnMore } from "@/components/ui/learn-more";
import { getT } from "@/lib/i18n/server";
import { SalesWizard } from "./sales-wizard";

export const dynamic = "force-dynamic";

/**
 * Wizard "Penjualan Baru" — server shell (issue #5).
 *
 * Sama seperti `/invoices/new` dan `/delivery-orders/new`: halaman ini hanya
 * MEMBACA daftar yang dibutuhkan wizard, dan seluruh interaksinya milik komponen
 * klien. Tidak ada satu pun tulisan ke database yang berasal dari halaman ini —
 * itu baru terjadi pada satu panggilan `POST /api/wizard/sales` di langkah
 * terakhir.
 */
export default async function NewSaleWizardPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  const session = await requirePagePermission("invoice.write", params);
  /*
   * issue #103 — empty state stok mengajak ke /inventory/update, milik modul
   * `inventory`. Halaman ini milik modul lain, dan preset "Jasa" (sales tanpa
   * stok) memang mematikan `inventory` — ajakannya jadi tautan yang memantul.
   * Komponen kliennya tidak bisa memeriksa modul sendiri (tidak ada konteks
   * modul di sisi client), jadi jawabannya dihitung di server dan dioper.
   */
  const canUpdateStock = await canOpenPage(session.user, "inventory.write");
  const t = await getT();

  // Pelanggan / kontrak / penerima TIDAK lagi dipreload `take: 500/300/300` —
  // daftar terpotong membuat baris lama mustahil dipilih (audit). Pemilihnya
  // kini mencari ke server (`ServerSearchableSelect` → `?picker=1`); filter
  // `active=1` issue #104 ikut lewat query string endpoint-nya.
  const [items, closedPeriods] = await Promise.all([
    prisma.item.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        unit: true,
        stockMovements: { select: { quantity: true, type: true, date: true } },
      },
    }),
    listClosedPeriods(),
  ]);

  return (
    <div className="w-full">
      <PageHeader
        className="mb-1"
        breadcrumbs={[
          { label: t("invoices.breadcrumb"), href: "/invoices" },
          { label: t("sales.title") },
        ]}
        title={t("sales.title")}
        description={
          <>
            {t("sales.descriptionA")} <strong>{t("sales.descriptionStrong")}</strong>{" "}
            {t("sales.descriptionB")}
          </>
        }
      />
      <LearnMore term="faktur" className="mt-1 mb-6" label={t("invoices.learnMore")} />

      <SalesWizard
        canUpdateStock={canUpdateStock}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentStock: calculateStockTotals(i.stockMovements).currentStock,
        }))}
        closedPeriods={closedPeriods}
      />
    </div>
  );
}
