/**
 * Tutup Buku — pembungkus server, dikonversi ke token Ant Design pada
 * issue #196. Isinya `PeriodManager`, komponen client; halaman ini hanya
 * membaca daftar periode di server dan menegakkan izinnya.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { listPeriods } from "@/lib/period-close";
import { PeriodManager } from "./period-manager";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PeriodsPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("period.manage", params);
  const t = await getT();

  const periods = await listPeriods();

  return (
    <div>
      <PageHeader
        title={t("periods.title")}
        // Panjang BARIS, bukan lebar kotak: kalimat penjelas yang membentang
        // selebar 1440px berhenti terbaca sebagai kalimat.
        description={
          <span style={{ display: "block", maxWidth: "72ch" }}>{t("periods.description")}</span>
        }
      />

      <PeriodManager periods={periods} />
    </div>
  );
}
