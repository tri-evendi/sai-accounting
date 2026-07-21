import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
  await requirePageSession(["bos", "core"]);

  const { contractId } = await searchParams;
  const contracts = await prisma.contract.findMany({
    where: { status: { not: "canceled" } },
    orderBy: { date: "desc" },
    take: 300,
    select: { id: true, contractNo: true, buyer: true, currency: true },
  });

  const preselected = Number(contractId);

  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "Faktur", href: "/invoices" }, { label: "Buat" }]} />
      <h1 className="text-2xl font-bold text-gray-900">Buat Faktur</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Bisa diketik manual, atau ditarik (&quot;Ambil&quot;) dari kontrak agar barang, sisa
        jumlah, dan harganya terisi sendiri.
      </p>
      <NewInvoiceForm
        contracts={contracts.map((c) => ({
          id: c.id,
          contractNo: c.contractNo,
          buyer: c.buyer,
          currency: c.currency || "IDR",
        }))}
        initialContractId={Number.isFinite(preselected) && preselected > 0 ? preselected : null}
      />
    </div>
  );
}
