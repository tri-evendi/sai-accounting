import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { listClosedPeriods } from "@/lib/period";
import { PageHeader } from "@/components/ui/page-header";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
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
    <div className="max-w-4xl">
      <PageHeader
        className="mb-1"
        breadcrumbs={[{ label: "Tagihan Penjualan", href: "/invoices" }, { label: "Buat Tagihan" }]}
        title={<TermTooltip term="faktur">Buat Tagihan</TermTooltip>}
        description={
          <>
            Bisa diketik manual, atau ditarik (&quot;Ambil&quot;) dari kontrak agar barang, sisa
            jumlah, dan harganya terisi sendiri. Setelah disimpan, sisanya masuk ke daftar
            &ldquo;Pelanggan Belum Bayar&rdquo; sampai dilunasi. Baru pertama kali? Lebih enak
            lewat alur terpandu{" "}
            <Link href="/sales/new" className="font-medium text-primary hover:underline">
              Catat Penjualan
            </Link>
            .
          </>
        }
      />
      <LearnMore
        term="faktur"
        className="mt-1 mb-6"
        label="Pelajari ini: apa itu tagihan penjualan"
      />
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
