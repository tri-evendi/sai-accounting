import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { listClosedPeriods } from "@/lib/period";
import { PageHeader } from "@/components/ui/page-header";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { getT } from "@/lib/i18n/server";
import { NewContractForm } from "./contract-form";

export const dynamic = "force-dynamic";

/**
 * Buat Kontrak — server shell (issue #4/#6).
 *
 * Dipecah mengikuti pola `/invoices/new` dan `/delivery-orders/new`: halaman ini
 * membaca bulan-bulan yang sudah ditutup di server, formulir kliennya yang
 * memakai daftar itu untuk menolak tanggal di periode terkunci SEBELUM dikirim.
 * Penjaganya tetap `assertPeriodOpen` di dalam transaksi penulisan — daftar ini
 * hanya memindahkan kabar buruknya lebih awal.
 */
export default async function NewContractPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("contract.write", params);
  const t = await getT();

  const closedPeriods = await listClosedPeriods();

  return (
    <div className="w-full">
      <PageHeader
        className="mb-1"
        breadcrumbs={[
          { label: t("contracts.breadcrumb"), href: "/contracts" },
          { label: t("contracts.createTitle") },
        ]}
        title={<TermTooltip term="kontrak">{t("contracts.createTitle")}</TermTooltip>}
        description={t("contracts.createDescription")}
      />
      <LearnMore term="kontrak" className="mt-1 mb-6" label={t("contracts.learnMoreNew")} />
      <NewContractForm closedPeriods={closedPeriods} />
    </div>
  );
}
