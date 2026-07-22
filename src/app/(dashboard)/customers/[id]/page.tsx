import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id: parseInt(id) },
  });

  if (!customer) notFound();

  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "Customers", href: "/customers" }, { label: customer.name }]} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
        <div className="flex gap-2">
          <Link href={`/customers/${customer.id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <Link href="/customers">
            <Button variant="ghost">Back</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Customer Information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Name</dt>
              <dd className="text-sm text-foreground">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Person In Charge</dt>
              <dd className="text-sm text-foreground">{customer.pic || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Address</dt>
              <dd className="text-sm text-foreground">{customer.address || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Phone</dt>
              <dd className="text-sm text-foreground">{customer.phone || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Email</dt>
              <dd className="text-sm text-foreground">{customer.email || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">PPN</dt>
              <dd className="text-sm text-foreground">
                {customer.taxExempt ? "Bebas PPN (ekspor / non-PKP)" : "Kena PPN (standar)"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Created</dt>
              <dd className="text-sm text-foreground">{formatDate(customer.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
