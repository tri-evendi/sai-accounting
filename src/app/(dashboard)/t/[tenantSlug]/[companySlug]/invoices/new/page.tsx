import { Link } from "@/components/ui/app-link";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { listClosedPeriods } from "@/lib/period";
import { PageHeader } from "@/components/ui/page-header";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { getT } from "@/lib/i18n/server";
import { NewInvoiceForm } from "./invoice-form";

export const dynamic = "force-dynamic";

/**
 * Buat Faktur — server shell (issue #15).
 *
 * Split from the form the way `/delivery-orders/new` is: the page reads the
 * contract list on the server, the client form owns the "Ambil" interaction. A
 * `?contractId=` query pre-selects the contract, which is how the "Buat Faktur"
 * button on a contract detail page hands the chain over.
 */
export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ contractId?: string }>;
}) {
  await requirePagePermission("invoice.write", params);
  const t = await getT();

  const { contractId } = await searchParams;
  const preselectedRaw = Number(contractId);
  const preselected =
    Number.isFinite(preselectedRaw) && preselectedRaw > 0 ? preselectedRaw : null;

  // Daftar kontrak TIDAK lagi dipreload `take: 300` — daftar terpotong membuat
  // kontrak lama mustahil dipilih (audit). Pemilihnya mencari ke server
  // (`/api/contracts?picker=1`); yang dibaca di sini hanya kontrak yang sudah
  // terpilih lewat `?contractId=`, supaya labelnya langsung tampil.
  const [preselectedContract, closedPeriods] = await Promise.all([
    preselected != null
      ? prisma.contract.findUnique({
          where: { id: preselected },
          select: { id: true, contractNo: true, buyer: true, currency: true },
        })
      : Promise.resolve(null),
    listClosedPeriods(),
  ]);

  return (
    <div className="w-full">
      <PageHeader
        className="mb-1"
        breadcrumbs={[
          { label: t("invoices.breadcrumb"), href: "/invoices" },
          { label: t("invoices.createTitle") },
        ]}
        title={<TermTooltip term="faktur">{t("invoices.createTitle")}</TermTooltip>}
        description={
          <>
            {t("invoices.createDescriptionBefore")}{" "}
            <Link href="/sales/new" className="font-medium text-primary hover:underline">
              {t("invoices.createDescriptionLink")}
            </Link>
            {t("common.fullStop")}
          </>
        }
      />
      <LearnMore term="faktur" className="mt-1 mb-6" label={t("invoices.learnMore")} />
      <NewInvoiceForm
        initialContract={
          preselectedContract
            ? {
                value: String(preselectedContract.id),
                label: preselectedContract.contractNo,
                hint: `${preselectedContract.buyer} · ${preselectedContract.currency || "IDR"}`,
              }
            : null
        }
        closedPeriods={closedPeriods}
      />
    </div>
  );
}
