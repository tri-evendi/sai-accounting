import { notFound } from "next/navigation";
import { Link } from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Sejajar dengan halaman daftarnya — tanpa ini, ptg bisa membaca detail
  // pelanggan lewat URL langsung (temuan audit RBAC fase 0).
  await requirePagePermission("customer.read");
  const t = await getT();
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id: parseInt(id) },
  });

  if (!customer) notFound();

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[{ label: t("customers.breadcrumb"), href: "/customers" }, { label: customer.name }]}
        title={customer.name}
        actions={
          <>
            <Link href={`/customers/${customer.id}/edit`}>
              <Button variant="secondary">{t("common.edit")}</Button>
            </Link>
            <Link href="/customers">
              <Button variant="ghost">{t("common.back")}</Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardHeader><CardTitle>{t("customers.infoTitle")}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.name")}</dt>
              <dd className="text-sm text-foreground">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("customers.pic")}</dt>
              <dd className="text-sm text-foreground">{customer.pic || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.address")}</dt>
              <dd className="text-sm text-foreground">{customer.address || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.phone")}</dt>
              <dd className="text-sm text-foreground">{customer.phone || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.email")}</dt>
              <dd className="text-sm text-foreground">{customer.email || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.vat")}</dt>
              <dd className="text-sm text-foreground">
                {customer.taxExempt ? t("customers.taxExemptLabel") : t("customers.taxable")}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.createdAt")}</dt>
              <dd className="text-sm text-foreground">{formatDate(customer.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
