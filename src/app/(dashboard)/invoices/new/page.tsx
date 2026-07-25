import Link from "next/link";
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
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string }>;
}) {
  await requirePagePermission("invoice.write");
  const t = await getT();

  const { contractId } = await searchParams;
  const [contracts, closedPeriods] = await Promise.all([
    prisma.contract.findMany({
      where: { status: { not: "canceled" } },
      orderBy: { date: "desc" },
      take: 300,
      select: { id: true, contractNo: true, buyer: true, currency: true },
    }),
    listClosedPeriods(),
  ]);

  const preselected = Number(contractId);

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
        contracts={contracts.map((c) => ({
          id: c.id,
          contractNo: c.contractNo,
          buyer: c.buyer,
          currency: c.currency || "IDR",
        }))}
        initialContractId={Number.isFinite(preselected) && preselected > 0 ? preselected : null}
        closedPeriods={closedPeriods}
      />
    </div>
  );
}
