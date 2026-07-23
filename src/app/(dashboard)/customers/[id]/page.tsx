import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Sejajar dengan halaman daftarnya — tanpa ini, ptg bisa membaca detail
  // pelanggan lewat URL langsung (temuan audit RBAC fase 0).
  await requirePagePermission("customer.read");
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id: parseInt(id) },
  });

  if (!customer) notFound();

  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumbs={[{ label: "Pelanggan", href: "/customers" }, { label: customer.name }]}
        title={customer.name}
        actions={
          <>
            <Link href={`/customers/${customer.id}/edit`}>
              <Button variant="secondary">Ubah</Button>
            </Link>
            <Link href="/customers">
              <Button variant="ghost">Kembali</Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardHeader><CardTitle>Informasi Pelanggan</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Nama</dt>
              <dd className="text-sm text-foreground">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Narahubung (PIC)</dt>
              <dd className="text-sm text-foreground">{customer.pic || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Alamat</dt>
              <dd className="text-sm text-foreground">{customer.address || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Telepon</dt>
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
              <dt className="text-sm font-medium text-muted-foreground">Dibuat</dt>
              <dd className="text-sm text-foreground">{formatDate(customer.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
